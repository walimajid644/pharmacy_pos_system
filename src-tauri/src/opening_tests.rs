use super::*;
use serde_json::json;
use sqlx::sqlite::SqlitePoolOptions;
const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
async fn fixture() -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,created_at,updated_at) VALUES('op-c','OP-C','Opening','Customer','retail','now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO suppliers(id,supplier_code,name,created_at,updated_at) VALUES('op-s','OP-S','Opening Supplier','now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO bank_accounts(id,name,created_at,updated_at) VALUES('op-b','Opening Bank','now','now')").execute(&p).await.unwrap();
    p
}
fn request(kind: &str, entity: &str, cents: i64) -> OpeningRequest {
    serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":kind,"entityId":entity,"amountCents":cents,"entryDate":"2020-01-01","reference":"Brought forward","notes":"Reviewed old book"})).unwrap()
}
#[tokio::test]
async fn opening_balances_are_atomic_idempotent_signed_and_audited() {
    let p = fixture().await;
    let r = request("customer", "op-c", 12345);
    let id = r.request_id.clone();
    record(&p, ADMIN, r).await.unwrap();
    let mut replay = request("customer", "op-c", 12345);
    replay.request_id = id.clone();
    record(&p, ADMIN, replay).await.unwrap();
    let balance: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='op-c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(balance, 123.45);
    let ledger: i64 = sqlx::query_scalar(
        "SELECT SUM(amount_cents) FROM customer_ledger WHERE customer_id='op-c'",
    )
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!(ledger, 12345);
    assert!(record(&p, ADMIN, request("customer", "op-c", 100))
        .await
        .is_err());
    let mut changed = request("customer", "op-c", 54321);
    changed.request_id = id.clone();
    assert!(record(&p, ADMIN, changed).await.is_err());
    record(&p, ADMIN, request("supplier", "op-s", 15000))
        .await
        .unwrap();
    record(&p, ADMIN, request("bank", "op-b", -7500))
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM audit_events WHERE event_type='opening_balance'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(count, 3);
    let sales: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(sales, 0);
    assert!(
        sqlx::query("UPDATE opening_balances SET amount_cents=1 WHERE id=?")
            .bind(&id)
            .execute(&p)
            .await
            .is_err()
    );
    assert!(sqlx::query("DELETE FROM opening_balances WHERE id=?")
        .bind(&id)
        .execute(&p)
        .await
        .is_err());
    // Customer collections use the normal balance and ledger after opening.
    let payment=serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"kind":"receipt","customerId":"op-c","category":"Collection","description":"Collection of opening","amountCents":2345,"method":"bank","reference":"RC","entryDate":"2020-01-02"})).unwrap();
    crate::commercial::record_entry(&p, ADMIN, payment)
        .await
        .unwrap();
    let balance: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='op-c'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(balance, 100.0);
}
#[tokio::test]
async fn opening_guards_roles_invalid_values_and_legacy_openings() {
    let p = fixture().await;
    sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('opening-cashier','opening-cashier','x','Cashier','cashier','now','now')").execute(&p).await.unwrap();
    assert!(record(&p, "opening-cashier", request("bank", "op-b", 100))
        .await
        .is_err());
    for cents in [0, i64::MIN, i64::MAX] {
        assert!(record(&p, ADMIN, request("bank", "op-b", cents))
            .await
            .is_err());
    }
    for date in ["2026-02-30", "2999-01-01", "bad"] {
        let mut r = request("bank", "op-b", 100);
        r.entry_date = date.into();
        assert!(record(&p, ADMIN, r).await.is_err());
    }
    assert!(record(&p, ADMIN, request("bank", "missing", 100))
        .await
        .is_err());
    sqlx::query("UPDATE bank_accounts SET is_active=0 WHERE id='op-b'")
        .execute(&p)
        .await
        .unwrap();
    assert!(record(&p, ADMIN, request("bank", "op-b", 100))
        .await
        .is_err());
    sqlx::query("INSERT INTO customer_ledger(id,customer_id,kind,source_id,amount_cents,occurred_at,description) VALUES('legacy-opening','op-c','opening','op-c',100,'now','Legacy')").execute(&p).await.unwrap();
    assert!(record(&p, ADMIN, request("customer", "op-c", 200))
        .await
        .is_err());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
#[tokio::test]
async fn supplier_opening_payment_reconciles_drawer_and_blocks_overpayment() {
    let p = fixture().await;
    let id = record(&p, ADMIN, request("supplier", "op-s", 10000))
        .await
        .unwrap();
    let shift = crate::shifts::open(&p, ADMIN, 20000).await.unwrap();
    let payment = |cents| {
        serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"poId":id,"amountCents":cents,"method":"cash","reference":"Opening settlement","notes":null})).unwrap()
    };
    assert!(crate::supplier_ledger::record(&p, ADMIN, payment(10001))
        .await
        .is_err());
    crate::supplier_ledger::record(&p, ADMIN, payment(2500))
        .await
        .unwrap();
    let saved_id: String =
        sqlx::query_scalar("SELECT id FROM supplier_opening_payments WHERE opening_id=?")
            .bind(&id)
            .fetch_one(&p)
            .await
            .unwrap();
    let replay = || {
        serde_json::from_value(json!({"requestId":saved_id,"poId":id,"amountCents":2500,"method":"cash","reference":"Opening settlement","notes":null})).unwrap()
    };
    crate::supplier_ledger::record(&p, ADMIN, replay())
        .await
        .unwrap();
    assert!(
        sqlx::query("UPDATE suppliers SET deleted_at='now' WHERE id='op-s'")
            .execute(&p)
            .await
            .is_err()
    );
    let remaining: i64 = sqlx::query_scalar(
        "SELECT amount_cents-paid_cents FROM supplier_opening_outstanding WHERE id=?",
    )
    .bind(&id)
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!(remaining, 7500);
    let request =
        serde_json::from_value(json!({"shiftId":shift,"countedCashCents":17500,"notes":null}))
            .unwrap();
    let summary =
        serde_json::to_value(crate::shifts::close(&p, ADMIN, request).await.unwrap()).unwrap();
    assert_eq!(summary["expectedCashCents"], 17500);
    assert_eq!(summary["varianceCents"], 0);
    crate::supplier_ledger::record(&p, ADMIN, replay())
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM supplier_opening_payments")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(count, 1);

    assert!(crate::supplier_ledger::record(&p, ADMIN, payment(100))
        .await
        .is_err());
}
#[tokio::test]
async fn expense_heads_preserve_history_and_block_inactive_new_expenses() {
    let p = fixture().await;
    let request = |id: String| {
        serde_json::from_value(json!({"requestId":id,"kind":"expense","customerId":null,"category":"General","description":"Office supplies","amountCents":100,"method":"bank","reference":"EX","entryDate":"2020-01-01"})).unwrap()
    };
    let id = Uuid::new_v4().to_string();
    crate::commercial::record_entry(&p, ADMIN, request(id.clone()))
        .await
        .unwrap();
    let head: String = sqlx::query_scalar("SELECT expense_head_id FROM account_entries WHERE id=?")
        .bind(&id)
        .fetch_one(&p)
        .await
        .unwrap();
    sqlx::query("UPDATE expense_heads SET name='Office',is_active=0 WHERE id=?")
        .bind(&head)
        .execute(&p)
        .await
        .unwrap();
    // Existing saved category is a voucher snapshot, independent of later register edits.
    let category: String = sqlx::query_scalar("SELECT category FROM account_entries WHERE id=?")
        .bind(&id)
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(category, "General");
    crate::commercial::record_entry(&p, ADMIN, request(id))
        .await
        .unwrap();
    assert!(
        crate::commercial::record_entry(&p, ADMIN, request(Uuid::new_v4().to_string()))
            .await
            .is_err()
    );
}
