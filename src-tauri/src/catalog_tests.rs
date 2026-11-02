use super::*;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
async fn fixture() -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    p
}
async fn count(p: &Pool<Sqlite>, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(p)
        .await
        .unwrap()
}
fn row(sku: &str, number: &str) -> Value {
    json!({"sourceRow":2,"product":{"sku":sku,"name":format!("Medicine {sku}"),"genericName":"Generic","barcode":format!("000{sku}"),"category":"Tablets","manufacturer":"Synthetic maker","retailPrice":10.25,"wholesalePrice":null,"costPrice":5,"packSize":10,"sellLoose":true,"controlled":false,"drap":null,"reorderLevel":20},"batch":{"number":number,"expiry":"2099-12-31","received":chrono::Local::now().format("%Y-%m-%d").to_string(),"quantity":17,"cost":5}})
}
fn request(rows: Vec<Value>) -> ImportRequest {
    serde_json::from_value(
        json!({"requestId":Uuid::new_v4().to_string(),"createLookups":true,"rows":rows}),
    )
    .unwrap()
}
#[tokio::test]
async fn preview_has_no_writes_and_requires_lookup_creation_choice() {
    let p = fixture().await;
    let mut r = request(vec![row("A", "B1")]);
    r.create_lookups = false;
    let v = preview(&p, ADMIN, r).await.unwrap();
    assert!(!v.valid);
    assert!(v.rows[0].errors.iter().any(|s| s.contains("Category")));
    assert_eq!(count(&p, "products").await, 0);
    assert_eq!(count(&p, "categories").await, 0);
    assert_eq!(count(&p, "stock_movements").await, 0);
    let v = preview(&p, ADMIN, request(vec![row("A", "B1")]))
        .await
        .unwrap();
    assert!(v.valid);
    assert_eq!(
        (v.products, v.batches, v.new_categories, v.new_manufacturers),
        (1, 1, 1, 1)
    );
}
#[tokio::test]
async fn catalog_import_is_atomic_idempotent_and_initializes_open_units() {
    let p = fixture().await;
    let first = row("A", "B1");
    let mut second = first.clone();
    second["batch"]["number"] = json!("B2");
    second["batch"]["quantity"] = json!(20);
    let r = request(vec![first, second]);
    let same = serde_json::to_value(&r).unwrap();
    let result = import(&p, ADMIN, r).await.unwrap();
    assert_eq!((result.products, result.batches), (1, 2));
    assert_eq!(count(&p, "categories").await, 1);
    assert_eq!(count(&p, "manufacturers").await, 1);
    let (stock, open): (i64, i64) = sqlx::query_as(
        "SELECT SUM(quantity_in_stock),SUM(loose_open_remaining) FROM product_batches",
    )
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!((stock, open), (37, 7));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT SUM(quantity) FROM stock_movements")
            .fetch_one(&p)
            .await
            .unwrap(),
        37
    );
    let repeated = import(&p, ADMIN, serde_json::from_value(same.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(repeated.operation_id, result.operation_id);
    assert_eq!(count(&p, "products").await, 1);
    assert_eq!(count(&p, "product_batches").await, 2);
    assert_eq!(count(&p, "catalog_operations").await, 1);
    assert_eq!(count(&p, "audit_events").await, 1);
    let mut different = same;
    different["rows"][0]["batch"]["quantity"] = json!(18);
    assert!(
        import(&p, ADMIN, serde_json::from_value(different).unwrap())
            .await
            .is_err()
    );
}
#[tokio::test]
async fn later_batch_failure_rolls_back_products_lookups_stock_journal_and_audit() {
    let p = fixture().await;
    sqlx::raw_sql("CREATE TRIGGER fail_import BEFORE INSERT ON product_batches WHEN NEW.batch_number='FAIL' BEGIN SELECT RAISE(ABORT,'Synthetic disk failure'); END;").execute(&p).await.unwrap();
    assert!(
        import(&p, ADMIN, request(vec![row("A", "B1"), row("B", "FAIL")]))
            .await
            .is_err()
    );
    for table in [
        "products",
        "categories",
        "manufacturers",
        "product_batches",
        "stock_movements",
        "catalog_operations",
        "audit_events",
    ] {
        assert_eq!(count(&p, table).await, 0, "{table} was not rolled back")
    }
}
#[tokio::test]
async fn import_revalidates_conflicts_at_commit_and_preserves_existing_catalog() {
    let p = fixture().await;
    let r = request(vec![row("A", "B1")]);
    assert!(
        preview(
            &p,
            ADMIN,
            serde_json::from_value(serde_json::to_value(&r).unwrap()).unwrap()
        )
        .await
        .unwrap()
        .valid
    );
    sqlx::query("INSERT INTO products(id,sku,name,barcode,unit_price,cost_price,created_at,updated_at,deleted_at) VALUES('old','OTHER','Archived','000A',12,5,'now','now','now')").execute(&p).await.unwrap();
    assert!(import(&p, ADMIN, r).await.unwrap_err().contains("Barcode"));
    assert_eq!(count(&p, "products").await, 1);
    assert_eq!(count(&p, "product_batches").await, 0);
    assert_eq!(count(&p, "categories").await, 0);
    let mut duplicate = row("A", "B");
    duplicate["product"]["sku"] = json!("other");
    assert!(
        !preview(&p, ADMIN, request(vec![duplicate]))
            .await
            .unwrap()
            .valid
    );
}
#[tokio::test]
async fn invalid_dates_prices_quantities_and_inconsistent_duplicate_skus_reject_without_writes() {
    let p = fixture().await;
    for (path, value) in [
        ("expiry", json!("2026-02-30")),
        ("quantity", json!(0)),
        ("cost", json!(-1)),
    ] {
        let mut r = row("A", "B");
        r["batch"][path] = value;
        assert!(!preview(&p, ADMIN, request(vec![r])).await.unwrap().valid)
    }
    let mut r = row("A", "B");
    r["product"]["retailPrice"] = json!(1.005);
    assert!(!preview(&p, ADMIN, request(vec![r])).await.unwrap().valid);
    let mut r = row("A", "B");
    r["product"]["sellLoose"] = json!(false);
    assert!(!preview(&p, ADMIN, request(vec![r])).await.unwrap().valid);
    let first = row("A", "B1");
    let mut second = row("A", "B2");
    second["product"]["packSize"] = json!(20);
    assert!(
        !preview(&p, ADMIN, request(vec![first, second]))
            .await
            .unwrap()
            .valid
    );
    assert_eq!(count(&p, "products").await, 0);
}
#[tokio::test]
async fn bulk_guards_history_stale_edits_and_duplicate_retries_atomically() {
    let p = fixture().await;
    sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,reorder_level,created_at,updated_at) VALUES('new','NEW','Unused',10,5,10,5,'now','now'),('used','USED','Used',10,5,10,5,'now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','used','B','2099-12-31',0,5,'now','now','now')").execute(&p).await.unwrap();
    let payload = json!({"requestId":Uuid::new_v4().to_string(),"products":[{"id":"new","updatedAt":"now"},{"id":"used","updatedAt":"now"}],"category":null,"reorderLevel":20,"packSize":20});
    assert!(
        bulk(&p, ADMIN, serde_json::from_value(payload.clone()).unwrap())
            .await
            .unwrap_err()
            .contains("history")
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT reorder_level FROM products WHERE id='new'")
            .fetch_one(&p)
            .await
            .unwrap(),
        5
    );
    let mut payload = payload;
    payload["packSize"] = Value::Null;
    let r = bulk(&p, ADMIN, serde_json::from_value(payload.clone()).unwrap())
        .await
        .unwrap();
    assert_eq!(r.products, 2);
    assert!(
        bulk(&p, ADMIN, serde_json::from_value(payload.clone()).unwrap())
            .await
            .is_ok()
    );
    assert_eq!(count(&p, "catalog_operations").await, 1);
    payload["requestId"] = json!(Uuid::new_v4().to_string());
    assert!(bulk(&p, ADMIN, serde_json::from_value(payload).unwrap())
        .await
        .unwrap_err()
        .contains("Catalog changed"));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT quantity_in_stock FROM product_batches")
            .fetch_one(&p)
            .await
            .unwrap(),
        0
    );
}
#[tokio::test]
async fn cashier_and_accountant_cannot_preview_import_or_bulk_edit() {
    let p = fixture().await;
    for role in ["cashier", "accountant"] {
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES(?,?,'x',?,?,'now','now')").bind(role).bind(role).bind(role).bind(role).execute(&p).await.unwrap();
        assert!(preview(&p, role, request(vec![row("A", "B")]))
            .await
            .is_err());
        assert!(import(&p, role, request(vec![row("A", "B")]))
            .await
            .is_err());
        let r=serde_json::from_value(json!({"requestId":Uuid::new_v4().to_string(),"products":[{"id":"x","updatedAt":"now"}],"category":null,"packSize":null,"reorderLevel":10})).unwrap();
        assert!(bulk(&p, role, r).await.is_err());
    }
    assert_eq!(count(&p, "products").await, 0);
}

#[tokio::test]
async fn regulatory_upgrade_preserves_old_invoice_amounts_and_marks_legacy_classification() {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../migrations/001_app_schema.sql"))
        .execute(&p)
        .await
        .unwrap();
    sqlx::query("INSERT INTO products(id,sku,name,unit_price,cost_price,controlled_substance,drap_registration_number,created_at,updated_at) VALUES('p','P','Old medicine',99,5,1,'OLD-DRAP','now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','B','2099-12-31',10,5,'now','now','now')").execute(&p).await.unwrap();
    sqlx::query("INSERT INTO sales_invoices(id,invoice_number,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at) VALUES('i','OLD',?,'2025-01-01',7,0,0,7,'cash','completed','now','now')").bind(ADMIN).execute(&p).await.unwrap();
    sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,is_loose_sale,unit_price,discount_percent,line_total,created_at) VALUES('l','i','p','b',1,1,7,0,7,'now')").execute(&p).await.unwrap();
    for migration in [
        include_str!("../migrations/004_phase5_inventory.sql"),
        include_str!("../migrations/007_desktop_operations.sql"),
        include_str!("../migrations/008_supplier_drawer.sql"),
        include_str!("../migrations/009_pos_sale_details.sql"),
        include_str!("../migrations/010_commercial_operations.sql"),
        include_str!("../migrations/011_credit_and_expiry.sql"),
        include_str!("../migrations/012_pricing_and_audit.sql"),
        include_str!("../migrations/013_catalog_and_controlled.sql"),
    ] {
        sqlx::raw_sql(migration).execute(&p).await.unwrap();
    }
    let saved:(f64,f64,i64,String,i64)=sqlx::query_as("SELECT unit_price,line_total,controlled_snapshot,drap_snapshot,regulatory_snapshot FROM sales_invoice_items WHERE id='l'").fetch_one(&p).await.unwrap();
    assert_eq!(saved, (7.0, 7.0, 1, "OLD-DRAP".into(), 0));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT quantity_in_stock FROM product_batches WHERE id='b'")
            .fetch_one(&p)
            .await
            .unwrap(),
        10
    );
    assert!(sqlx::query_scalar::<_, Option<String>>(
        "SELECT prescription_note FROM sales_invoices WHERE id='i'"
    )
    .fetch_one(&p)
    .await
    .unwrap()
    .is_none());
}
