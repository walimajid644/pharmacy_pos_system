use super::*;
use sqlx::sqlite::SqlitePoolOptions;
const ACTOR: &str = "00000000-0000-0000-0000-000000000001";
async fn fixture() -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('c','C','Test','Client','retail',100,'now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,created_at,updated_at) VALUES('p','P','Product',2,1,10,'now','now')").execute(&p).await.unwrap();
    p
}
fn receipt(cents: i64) -> EntryRequest {
    EntryRequest {
        request_id: Uuid::new_v4().to_string(),
        kind: "receipt".into(),
        customer_id: Some("c".into()),
        category: "Collection".into(),
        description: "Balance payment".into(),
        amount_cents: cents,
        method: "bank".into(),
        reference: "REF".into(),
        entry_date: "2020-01-01".into(),
    }
}
fn doc() -> DocumentRequest {
    DocumentRequest {
        id: None,
        kind: "preorder".into(),
        customer_id: Some("c".into()),
        customer_name: "Test Client".into(),
        document_date: "2020-01-01".into(),
        due_date: None,
        notes: "Requested items".into(),
        items: vec![DocumentLine {
            product_id: "p".into(),
            quantity: 20,
            unit_price_cents: 200,
        }],
    }
}
#[tokio::test]
async fn receipts_limit_balances_and_void_exactly_once() {
    let p = fixture().await;
    assert!(record_entry(&p, ACTOR, receipt(10001)).await.is_err());
    assert!(record_entry(&p, ACTOR, receipt(0)).await.is_err());
    let n = record_entry(&p, ACTOR, receipt(3000)).await.unwrap();
    let b: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(b, 70.0);
    let id: String = sqlx::query_scalar("SELECT id FROM account_entries WHERE number=?")
        .bind(n)
        .fetch_one(&p)
        .await
        .unwrap();
    void_entry(&p, ACTOR, &id, "Correction").await.unwrap();
    assert!(void_entry(&p, ACTOR, &id, "Again").await.is_err());
    let b: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(b, 100.0);
    let ledger: i64 =
        sqlx::query_scalar("SELECT SUM(amount_cents) FROM customer_ledger WHERE customer_id='c'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(ledger, 10000);
}
#[tokio::test]
async fn cash_entries_require_open_drawer_and_cannot_be_voided_after_close() {
    let p = fixture().await;
    let mut r = receipt(1000);
    r.method = "cash".into();
    assert!(record_entry(&p, ACTOR, r).await.is_err());
    sqlx::query("INSERT INTO cashier_shifts(id,cashier_id,opened_at,opening_cash_cents,status) VALUES('sh',?,'now',10000,'open')").bind(ACTOR).execute(&p).await.unwrap();
    let mut r = receipt(1000);
    r.method = "cash".into();
    let n = record_entry(&p, ACTOR, r).await.unwrap();
    sqlx::query("UPDATE cashier_shifts SET status='closed',closed_at='2026-10-31T12:00:00Z',closed_by='00000000-0000-0000-0000-000000000001' WHERE id='sh'")
        .execute(&p)
        .await
        .unwrap();
    let id: String = sqlx::query_scalar("SELECT id FROM account_entries WHERE number=?")
        .bind(n)
        .fetch_one(&p)
        .await
        .unwrap();
    assert!(void_entry(&p, ACTOR, &id, "Correction").await.is_err());
    let b: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(b, 90.0);
}
#[tokio::test]
async fn documents_validate_pack_quantities_and_rollback_invalid_edits() {
    let p = fixture().await;
    let mut r = doc();
    r.items[0].quantity = 3;
    assert!(save_document(&p, ACTOR, r).await.is_err());
    let id = save_document(&p, ACTOR, doc()).await.unwrap();
    let mut r = doc();
    r.id = Some(id.clone());
    r.items.push(DocumentLine {
        product_id: "missing".into(),
        quantity: 1,
        unit_price_cents: 100,
    });
    assert!(save_document(&p, ACTOR, r).await.is_err());
    let total: i64 =
        sqlx::query_scalar("SELECT subtotal_cents FROM commercial_documents WHERE id=?")
            .bind(&id)
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(total, 4000);
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM commercial_document_items WHERE document_id=?")
            .bind(&id)
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(count, 1);
    sqlx::query("UPDATE commercial_documents SET status='cancelled' WHERE id=?")
        .bind(&id)
        .execute(&p)
        .await
        .unwrap();
    let mut r = doc();
    r.id = Some(id);
    assert!(save_document(&p, ACTOR, r).await.is_err());
}
#[tokio::test]
async fn finance_operations_reject_unauthorized_staff() {
    let p = fixture().await;
    sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('cashier','cashier','x','Cashier','cashier','now','now')").execute(&p).await.unwrap();
    assert!(record_entry(&p, "cashier", receipt(100)).await.is_err());
    assert!(save_document(&p, "cashier", doc()).await.is_ok());
}
#[tokio::test]
async fn retrying_a_receipt_does_not_collect_twice() {
    let p = fixture().await;
    let id = Uuid::new_v4().to_string();
    let mut first = receipt(3000);
    first.request_id = id.clone();
    let a = record_entry(&p, ACTOR, first).await.unwrap();
    let mut retry = receipt(3000);
    retry.request_id = id;
    let b = record_entry(&p, ACTOR, retry).await.unwrap();
    assert_eq!(a, b);
    let balance: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(balance, 70.0);
}
