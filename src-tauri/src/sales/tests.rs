use super::*;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::time::Duration;

async fn setup_operations(pool: &Pool<Sqlite>) {
    sqlx::raw_sql(include_str!("../../migrations/004_phase5_inventory.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/007_desktop_operations.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/008_supplier_drawer.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/009_pos_sale_details.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/010_commercial_operations.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/011_credit_and_expiry.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/012_pricing_and_audit.sql"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/013_catalog_and_controlled.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_cash_cents, status) VALUES ('shift', '00000000-0000-0000-0000-000000000001', '2026-10-25T00:00:00Z', 10000, 'open')")
        .execute(pool).await.unwrap();
}

fn request(quantities: &[i64]) -> CheckoutRequest {
    CheckoutRequest {
        cashier_id: "00000000-0000-0000-0000-000000000001".to_string(),
        source_document_id: None,
        customer_id: None,
        patient_name: None,
        doctor_name: None,
        prescription_note: None,
        notes: None,
        received_amount: None,
        payment_method: "cash".to_string(),
        order_discount: 0.0,
        expected_subtotal: quantities.iter().sum::<i64>() as f64 * 2.5,
        expected_tax_amount: 0.0,
        expected_net_amount: quantities.iter().sum::<i64>() as f64 * 2.5,
        timestamp: "2026-10-25T12:00:00Z".to_string(),
        items: quantities
            .iter()
            .map(|quantity| SaleItem {
                product_id: "test-product".to_string(),
                batch_id: "test-batch".to_string(),
                quantity: *quantity,
                bonus_quantity: 0,
                is_loose_sale: true,
                discount_percent: 0.0,
                confirm_break: true,
            })
            .collect(),
    }
}

async fn sale_details_fixture() -> Pool<Sqlite> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test medicine', 2.5, 99, 10, 1, 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 100, 1.5, 'now', 'now', 'now')")
        .execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn bonus_cash_and_remarks_persist_without_charging_for_free_stock() {
    let pool = sale_details_fixture().await;
    sqlx::query("INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, current_balance, created_at, updated_at) VALUES ('client', 'C1', 'Test', 'Client', 'retail', 125, 'now', 'now')")
        .execute(&pool).await.unwrap();
    let mut sale = request(&[2]);
    sale.customer_id = Some("client".into());
    sale.items[0].is_loose_sale = false;
    sale.items[0].bonus_quantity = 1;
    sale.items[0].discount_percent = 10.0;
    sale.expected_subtotal = 45.0; // 2 packs x 10 units x 2.5, less 10%.
    sale.expected_net_amount = 43.0;
    sale.order_discount = 2.0;
    sale.received_amount = Some(50.0);
    sale.notes = Some("  Deliver together  ".into());
    let receipt = record_sale(&pool, sale).await.unwrap();
    assert_eq!(
        (
            receipt.net_amount,
            receipt.received_amount,
            receipt.change_amount
        ),
        (43.0, 50.0, 7.0)
    );
    let line = sqlx::query("SELECT quantity, sale_quantity, bonus_quantity, bonus_units, cost_price, line_total FROM sales_invoice_items WHERE invoice_id = ?")
        .bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
    assert_eq!(
        (
            line.get::<i64, _>("quantity"),
            line.get::<i64, _>("sale_quantity"),
            line.get::<i64, _>("bonus_quantity"),
            line.get::<i64, _>("bonus_units")
        ),
        (30, 2, 1, 10)
    );
    assert_eq!(
        (
            line.get::<f64, _>("cost_price"),
            line.get::<f64, _>("line_total")
        ),
        (1.5, 45.0)
    );
    let saved = sqlx::query("SELECT notes, previous_balance, received_amount, change_amount FROM sales_invoices WHERE id = ?")
        .bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
    assert_eq!(saved.get::<String, _>("notes"), "Deliver together");
    assert_eq!(
        (
            saved.get::<f64, _>("previous_balance"),
            saved.get::<f64, _>("received_amount"),
            saved.get::<f64, _>("change_amount")
        ),
        (125.0, 50.0, 7.0)
    );
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stock, 70);
    let balance: f64 =
        sqlx::query_scalar("SELECT current_balance FROM customers WHERE id = 'client'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(balance, 125.0);
}

#[tokio::test]
async fn invalid_bonus_and_tender_roll_back_stock_and_invoice() {
    let pool = sale_details_fixture().await;
    let mut sale = request(&[2]);
    sale.items[0].bonus_quantity = 99;
    assert!(record_sale(&pool, sale.clone())
        .await
        .unwrap_err()
        .contains("stock"));
    sale.items[0].bonus_quantity = -1;
    assert!(record_sale(&pool, sale.clone()).await.is_err());
    sale.items[0].bonus_quantity = i64::MAX;
    assert!(record_sale(&pool, sale.clone()).await.is_err());
    sale.items[0].bonus_quantity = 1;
    for amount in [-1.0, 4.99, f64::NAN, f64::INFINITY, f64::MAX] {
        sale.received_amount = Some(amount);
        assert!(record_sale(&pool, sale.clone()).await.is_err());
    }
    sale.received_amount = Some(5.0);
    sale.notes = Some("x".repeat(501));
    assert!(record_sale(&pool, sale.clone()).await.is_err());
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((stock, count), (100, 0));
    sale.notes = None;
    sale.payment_method = "card".into();
    sale.received_amount = Some(100.0);
    let receipt = record_sale(&pool, sale).await.unwrap();
    assert_eq!((receipt.received_amount, receipt.change_amount), (5.0, 0.0));
}

#[tokio::test]
async fn loose_break_requires_confirmation_and_fefo_with_audit() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test', 2.5, 1, 10, 1, 'now', 'now')")
        .execute(&pool).await.unwrap();
    for (id, expiry) in [("early", "2098-12-31"), ("test-batch", "2099-12-31")] {
        sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES (?, 'test-product', ?, ?, 10, 1, 'now', 'now', 'now')")
            .bind(id).bind(id).bind(expiry).execute(&pool).await.unwrap();
    }
    assert!(record_sale(&pool, request(&[1])).await.is_err());
    let mut sale = request(&[1]);
    sale.items[0].batch_id = "early".into();
    sale.items[0].confirm_break = false;
    assert!(record_sale(&pool, sale.clone()).await.is_err());
    sale.items[0].confirm_break = true;
    let receipt = record_sale(&pool, sale).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM loose_break_events WHERE invoice_id = ? AND batch_id = 'early' AND strips_opened = 1")
        .bind(receipt.invoice_id).fetch_one(&pool).await.unwrap();
    let remaining: i64 =
        sqlx::query_scalar("SELECT loose_open_remaining FROM product_batches WHERE id = 'early'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((count, remaining), (1, 9));
}

#[tokio::test]
async fn sale_rolls_back_every_write_when_a_later_item_cannot_be_filled() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query(
        "INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, \
         sell_by_loose_unit, created_at, updated_at) \
         VALUES ('test-product', 'TEST', 'Test medicine', 2.5, 1.5, 10, 1, 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, \
         cost_price_at_batch, received_date, created_at, updated_at) \
         VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 10, 1.5, '2026-01-01', 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    assert!(record_sale(&pool, request(&[6, 6])).await.is_err());
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let invoices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
        .fetch_one(&pool)
        .await
        .unwrap();
    let invoice_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoice_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((stock, invoices, invoice_items, movements), (10, 0, 0, 0));

    let receipt = record_sale(&pool, request(&[2])).await.unwrap();
    assert_eq!(receipt.net_amount, 5.0);
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let invoices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
        .fetch_one(&pool)
        .await
        .unwrap();
    let invoice_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoice_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((stock, invoices, invoice_items, movements), (8, 1, 1, 1));
}

#[tokio::test]
async fn checkout_links_active_customer_and_rejects_inactive_customer() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test medicine', 2.5, 1.5, 1, 1, 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 5, 1.5, 'now', 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, created_at, updated_at) VALUES ('customer', 'C-TEST', 'Test', 'Customer', 'retail', 'now', 'now')")
        .execute(&pool).await.unwrap();
    let mut sale = request(&[1]);
    sale.customer_id = Some("customer".into());
    let receipt = record_sale(&pool, sale).await.unwrap();
    let linked: String = sqlx::query_scalar("SELECT customer_id FROM sales_invoices WHERE id = ?")
        .bind(receipt.invoice_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(linked, "customer");
    sqlx::query("UPDATE customers SET is_active = 0 WHERE id = 'customer'")
        .execute(&pool)
        .await
        .unwrap();
    let mut second = request(&[1]);
    second.customer_id = Some("customer".into());
    assert!(record_sale(&pool, second).await.is_err());
    let invoice_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(invoice_count, 1);
}

#[tokio::test]
async fn mixed_pack_and_loose_sale_preserves_quantities_discounts_and_total() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query("INSERT INTO app_settings (id, company_name, tax_rate, created_at, updated_at) VALUES ('settings', 'Test', 5, 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test medicine', 2.5, 1.5, 10, 1, 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 30, 1.5, 'now', 'now', 'now')")
        .execute(&pool).await.unwrap();
    let mut sale = request(&[1, 2]);
    sale.items[0].is_loose_sale = false;
    sale.items[0].discount_percent = 10.0;
    sale.items[1].discount_percent = 20.0;
    sale.order_discount = 2.0;
    sale.expected_subtotal = 26.5;
    sale.expected_tax_amount = 1.33;
    sale.expected_net_amount = 25.82;
    assert!(record_sale(&pool, sale.clone()).await.is_err());
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stock, 30);
    sale.expected_net_amount = 25.83;
    let receipt = record_sale(&pool, sale).await.unwrap();
    assert_eq!(
        (
            receipt.subtotal,
            receipt.tax_amount,
            receipt.discount_amount,
            receipt.net_amount
        ),
        (26.5, 1.33, 2.0, 25.83)
    );
    let lines = sqlx::query("SELECT quantity, sale_quantity, is_loose_sale, discount_percent, line_total FROM sales_invoice_items WHERE invoice_id = ? ORDER BY is_loose_sale")
        .bind(&receipt.invoice_id).fetch_all(&pool).await.unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(
        (
            lines[0].get::<i64, _>("quantity"),
            lines[0].get::<i64, _>("sale_quantity"),
            lines[0].get::<i64, _>("is_loose_sale"),
            lines[0].get::<f64, _>("discount_percent"),
            lines[0].get::<f64, _>("line_total")
        ),
        (10, 1, 0, 10.0, 22.5)
    );
    assert_eq!(
        (
            lines[1].get::<i64, _>("quantity"),
            lines[1].get::<i64, _>("sale_quantity"),
            lines[1].get::<i64, _>("is_loose_sale"),
            lines[1].get::<f64, _>("discount_percent"),
            lines[1].get::<f64, _>("line_total")
        ),
        (2, 2, 1, 20.0, 4.0)
    );
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stock, 18);
}

#[tokio::test]
async fn payment_methods_history_and_expiry_preserve_stock_movements() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query("INSERT INTO products (id, sku, name, barcode, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test medicine', '123456789', 2.5, 1.5, 1, 1, 'now', 'now')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 4, 1.5, 'now', 'now', 'now')")
        .execute(&pool).await.unwrap();

    for method in ["cash", "card", "mobile"] {
        let mut sale = request(&[1]);
        sale.payment_method = method.into();
        let receipt = record_sale(&pool, sale).await.unwrap();
        let saved: (String, f64) =
            sqlx::query_as("SELECT payment_method, net_amount FROM sales_invoices WHERE id = ?")
                .bind(&receipt.invoice_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(saved, (method.into(), 2.5));
        let line_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id = ?")
                .bind(&receipt.invoice_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(line_count, 1);
    }
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let movement: i64 = sqlx::query_scalar(
        "SELECT SUM(quantity) FROM stock_movements WHERE reference_type = 'sale'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((stock, movement), (1, -3));
    assert!(record_sale(&pool, request(&[2])).await.is_err());
    sqlx::query("UPDATE product_batches SET expiry_date = '2000-01-01' WHERE id = 'test-batch'")
        .execute(&pool)
        .await
        .unwrap();
    assert!(record_sale(&pool, request(&[1])).await.is_err());
    let history_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices WHERE status = 'completed'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(history_count, 3);
}

#[tokio::test]
async fn concurrent_sales_cannot_make_batch_stock_negative() {
    let path = std::env::temp_dir().join(format!("pharmacy-pos-test-{}.db", Uuid::new_v4()));
    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .busy_timeout(Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(options)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    setup_operations(&pool).await;
    sqlx::query(
        "INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, \
         sell_by_loose_unit, created_at, updated_at) \
         VALUES ('test-product', 'TEST', 'Test medicine', 2.5, 1.5, 10, 1, 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, \
         cost_price_at_batch, received_date, created_at, updated_at) \
         VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 10, 1.5, '2026-01-01', 'now', 'now')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (first, second) = tokio::join!(
        record_sale(&pool, request(&[7])),
        record_sale(&pool, request(&[7]))
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let invoices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((stock, invoices), (3, 1));
    pool.close().await;
    // Windows can briefly retain SQLite's file handle after the pool closes.
    for _ in 0..10 {
        if std::fs::remove_file(&path).is_ok() || !path.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
#[tokio::test]
async fn document_checkout_rolls_back_mismatches_and_can_only_convert_once() {
    let pool = sale_details_fixture().await;
    let actor = "00000000-0000-0000-0000-000000000001";
    sqlx::query("INSERT INTO commercial_documents(id,number,kind,customer_name,document_date,subtotal_cents,created_by,created_at,updated_at) VALUES('doc','PRE1','estimate','Guest','2020-01-01',500,?,'now','now')").bind(actor).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO commercial_document_items(id,document_id,product_id,quantity,unit_price_cents) VALUES('l','doc','test-product',2,250)").execute(&pool).await.unwrap();
    let mut wrong = request(&[1]);
    wrong.source_document_id = Some("doc".into());
    assert!(record_sale(&pool, wrong).await.is_err());
    let remaining: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 100);
    let mut sale = request(&[2]);
    sale.source_document_id = Some("doc".into());
    let receipt = record_sale(&pool, sale.clone()).await.unwrap();
    assert!(record_sale(&pool, sale).await.is_err());
    let linked: String = sqlx::query_scalar(
        "SELECT invoice_id FROM commercial_documents WHERE id='doc' AND status='converted'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(linked, receipt.invoice_id);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn udhar_limit_and_walk_in_guards_are_atomic_and_snapshots_survive_catalog_edits() {
    let pool = sale_details_fixture().await;
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,credit_limit,current_balance,created_at,updated_at) VALUES('credit','CR','Credit','Customer','retail',5,0,'now','now')").execute(&pool).await.unwrap();
    let mut walkin = request(&[1]);
    walkin.payment_method = "credit".into();
    assert!(record_sale(&pool, walkin).await.is_err());
    let mut credit = request(&[2]);
    credit.customer_id = Some("credit".into());
    credit.payment_method = "credit".into();
    let (first, second) = tokio::join!(
        record_sale(&pool, credit.clone()),
        record_sale(&pool, credit)
    );
    assert_eq!(first.is_ok() as u8 + second.is_ok() as u8, 1);
    let balance: f64 =
        sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='credit'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let ledger: i64 = sqlx::query_scalar(
        "SELECT SUM(amount_cents) FROM customer_ledger WHERE customer_id='credit'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='test-batch'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((balance, ledger, stock), (5.0, 500, 98));
    let payment: (f64, f64) =
        sqlx::query_as("SELECT received_amount,change_amount FROM sales_invoices")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(payment, (0.0, 0.0));
    sqlx::query(
        "UPDATE products SET name='Changed medicine',unit_price=999 WHERE id='test-product'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let snapshot: (String, f64) =
        sqlx::query_as("SELECT product_name_snapshot,line_total FROM sales_invoice_items LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(snapshot, ("Test medicine".into(), 5.0));
}

#[tokio::test]
async fn checkout_cannot_sell_quarantined_units() {
    let pool = sale_details_fixture().await;
    let actor = "00000000-0000-0000-0000-000000000001";
    let hold=serde_json::from_value(serde_json::json!({"requestId":Uuid::new_v4().to_string(),"batchId":"test-batch","quantity":100,"reason":"Safety hold"})).unwrap();
    crate::expiry::hold(&pool, actor, hold).await.unwrap();
    assert!(record_sale(&pool, request(&[1])).await.is_err());
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn wholesale_customer_price_is_authoritative_and_saved_with_credit_sale() {
    let pool = sale_details_fixture().await;
    sqlx::query("UPDATE products SET wholesale_price=1.75 WHERE id='test-product'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,credit_limit,created_at,updated_at) VALUES('wh','WH','Wholesale','Customer','wholesale',100,'now','now')").execute(&pool).await.unwrap();
    let mut stale = request(&[2]);
    stale.customer_id = Some("wh".into());
    assert!(record_sale(&pool, stale).await.is_err());
    let mut sale = request(&[2]);
    sale.customer_id = Some("wh".into());
    sale.payment_method = "credit".into();
    sale.expected_subtotal = 3.5;
    sale.expected_net_amount = 3.5;
    let receipt = record_sale(&pool, sale).await.unwrap();
    let line: (f64, f64) =
        sqlx::query_as("SELECT unit_price,line_total FROM sales_invoice_items WHERE invoice_id=?")
            .bind(&receipt.invoice_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(line, (1.75, 3.5));
    let balance: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='wh'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(balance, 3.5);
    sqlx::query("UPDATE products SET wholesale_price=9 WHERE id='test-product'")
        .execute(&pool)
        .await
        .unwrap();
    let saved: f64 =
        sqlx::query_scalar("SELECT unit_price FROM sales_invoice_items WHERE invoice_id=?")
            .bind(&receipt.invoice_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved, 1.75);
}
#[tokio::test]
async fn retail_and_null_fallback_keep_retail_while_zero_wholesale_is_explicit() {
    let pool = sale_details_fixture().await;
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,created_at,updated_at) VALUES('wh','WH','Wholesale','Customer','wholesale','now','now')").execute(&pool).await.unwrap();
    let mut fallback = request(&[2]);
    fallback.customer_id = Some("wh".into());
    assert_eq!(record_sale(&pool, fallback).await.unwrap().net_amount, 5.0);
    sqlx::query("UPDATE products SET wholesale_price=0 WHERE id='test-product'")
        .execute(&pool)
        .await
        .unwrap();
    let mut zero = request(&[2]);
    zero.customer_id = Some("wh".into());
    zero.expected_subtotal = 0.0;
    zero.expected_net_amount = 0.0;
    assert_eq!(record_sale(&pool, zero).await.unwrap().net_amount, 0.0);
    assert_eq!(
        record_sale(&pool, request(&[2])).await.unwrap().net_amount,
        5.0
    );
}

#[tokio::test]
async fn controlled_sale_requires_evidence_and_preserves_classification_drap_and_report() {
    let pool = sale_details_fixture().await;
    sqlx::query("UPDATE products SET controlled_substance=1,drap_registration_number='TEST-DRAP' WHERE id='test-product'").execute(&pool).await.unwrap();
    let stock: i64 = sqlx::query_scalar("SELECT SUM(quantity_in_stock) FROM product_batches")
        .fetch_one(&pool)
        .await
        .unwrap();
    let mut sale = request(&[2]);
    sale.patient_name = Some("Patient only".into());
    assert!(record_sale(&pool, sale.clone())
        .await
        .unwrap_err()
        .contains("Controlled product"));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sales_invoices")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT SUM(quantity_in_stock) FROM product_batches")
            .fetch_one(&pool)
            .await
            .unwrap(),
        stock
    );
    sale.prescription_note = Some("Reviewed synthetic Rx REF-123".into());
    let invoice = record_sale(&pool, sale).await.unwrap();
    sqlx::query("UPDATE products SET controlled_substance=0,drap_registration_number='CHANGED',name='Changed catalog' WHERE id='test-product'").execute(&pool).await.unwrap();
    let saved:(i64,String,i64)=sqlx::query_as("SELECT controlled_snapshot,drap_snapshot,regulatory_snapshot FROM sales_invoice_items WHERE invoice_id=?").bind(&invoice.invoice_id).fetch_one(&pool).await.unwrap();
    assert_eq!(saved, (1, "TEST-DRAP".into(), 1));
    let request = serde_json::from_value(
        serde_json::json!({"start":"2000-01-01T00:00:00Z","end":"2099-01-01T00:00:00Z","offset":0}),
    )
    .unwrap();
    let report = serde_json::to_value(
        crate::controlled::read(&pool, "00000000-0000-0000-0000-000000000001", request)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(report["total"], 1);
    assert_eq!(report["units"], 2);
    assert_eq!(report["rows"][0]["drap"], "TEST-DRAP");
    assert_eq!(
        report["rows"][0]["prescription_note"],
        "Reviewed synthetic Rx REF-123"
    );
    let saved = serde_json::to_value(
        crate::recovery::get_saved(
            &pool,
            "00000000-0000-0000-0000-000000000001",
            Some(invoice.invoice_id),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(saved["items"][0]["drap_registration_number"], "TEST-DRAP");
    assert_eq!(saved["items"][0]["controlled_substance"], 1);
}
#[tokio::test]
async fn controlled_pair_of_names_is_valid_and_report_denies_cashier() {
    let pool = sale_details_fixture().await;
    sqlx::query("UPDATE products SET controlled_substance=1 WHERE id='test-product'")
        .execute(&pool)
        .await
        .unwrap();
    let mut sale = request(&[1]);
    sale.patient_name = Some("Synthetic patient".into());
    sale.doctor_name = Some("Synthetic doctor".into());
    assert!(record_sale(&pool, sale).await.is_ok());
    sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('cashier','cashier-report','x','Cashier','cashier','now','now')").execute(&pool).await.unwrap();
    let r = serde_json::from_value(
        serde_json::json!({"start":"2000-01-01T00:00:00Z","end":"2099-01-01T00:00:00Z","offset":0}),
    )
    .unwrap();
    assert!(crate::controlled::read(&pool, "cashier", r).await.is_err());
}
