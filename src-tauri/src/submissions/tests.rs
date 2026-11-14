use super::*;
use crate::decisions::{decide_adjustment, decide_return, DecisionRequest};
use sqlx::sqlite::SqlitePoolOptions;

const ADMIN: &str = "00000000-0000-0000-0000-000000000001";

async fn fixture() -> Pool<Sqlite> {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/001_initial_schema.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/004_phase5_inventory.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/007_desktop_operations.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/008_supplier_drawer.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("ALTER TABLE sales_returns ADD COLUMN refunded_by TEXT")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/005_approval_guards.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/006_inventory_triggers.sql"))
        .execute(&pool)
        .await
        .unwrap();
    for (id, sku) in [("p1", "P1"), ("p2", "P2")] {
        sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, created_at, updated_at) VALUES (?, ?, ?, 10, 5, 'now', 'now')")
            .bind(id).bind(sku).bind(sku).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES (?, ?, ?, '2099-12-31', 10, 5, 'now', 'now', 'now')")
            .bind(format!("b{id}")).bind(id).bind(format!("B{id}"))
            .execute(&pool).await.unwrap();
    }
    pool
}

fn decision(record_id: &str, action: &str) -> DecisionRequest {
    DecisionRequest {
        record_id: record_id.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        action: action.into(),
    }
}

#[tokio::test]
async fn adjustment_lifecycle_updates_stock_once_and_rejects_overdraw() {
    let pool = fixture().await;
    let request = |quantity: i64| AdjustmentRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        adjustment_type: "decrease".into(),
        reason: "damaged".into(),
        notes: None,
        items: vec![AdjustmentLine {
            batch_id: "bp1".into(),
            quantity,
        }],
    };
    let mut duplicate = request(4);
    duplicate.items.push(AdjustmentLine {
        batch_id: "bp1".into(),
        quantity: 3,
    });
    let id = submit_adjustment(&pool, duplicate).await.unwrap();
    let lines: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let reserved: i64 = sqlx::query_scalar(
        "SELECT quantity_adjusted FROM stock_adjustment_items WHERE adjustment_id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let pending_stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((lines, reserved, pending_stock), (1, 7, 10));

    decide_adjustment(&pool, ADMIN, decision(&id, "approved"))
        .await
        .unwrap();
    assert!(decide_adjustment(&pool, ADMIN, decision(&id, "approved"))
        .await
        .is_err());
    let approved_stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let movement: i64 = sqlx::query_scalar(
        "SELECT quantity FROM stock_movements WHERE reference_type = 'stock_adjustment' AND reference_id = ?",
    ).bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!((approved_stock, movement), (3, -7));
    assert!(submit_adjustment(&pool, request(4)).await.is_err());

    let rejected = submit_adjustment(&pool, request(2)).await.unwrap();
    decide_adjustment(&pool, ADMIN, decision(&rejected, "rejected"))
        .await
        .unwrap();
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let movements: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_id = ?")
            .bind(&rejected)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((stock, movements), (3, 0));
}

#[tokio::test]
async fn partial_returns_refund_with_optional_restock_and_block_over_return() {
    let pool = fixture().await;
    sqlx::query("INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_cash_cents, status) VALUES ('test-shift', ?, '2026-10-25T00:00:00Z', 0, 'open')")
        .bind(ADMIN).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('invoice', 'INV-LIFECYCLE', ?, '2026-10-25', 20, 0, 0, 20, 'cash', 'completed', 'now', 'now')")
        .bind(ADMIN).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoice_items (id, invoice_id, product_id, batch_id, quantity, unit_price, line_total, created_at) VALUES ('item', 'invoice', 'p1', 'bp1', 2, 10, 20, 'now')")
        .execute(&pool).await.unwrap();
    let request = |restock: bool| ReturnRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        invoice_id: "invoice".into(),
        reason: "defective".into(),
        notes: None,
        refund_method: "cash".into(),
        items: vec![ReturnLine {
            invoice_item_id: "item".into(),
            quantity: 1,
            restock,
        }],
    };
    let first = submit_return(&pool, request(false)).await.unwrap();
    let refund: f64 = sqlx::query_scalar("SELECT refund_amount FROM sales_returns WHERE id = ?")
        .bind(&first)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(refund, 10.0);
    decide_return(&pool, ADMIN, decision(&first, "approved"))
        .await
        .unwrap();
    decide_return(&pool, ADMIN, decision(&first, "refunded"))
        .await
        .unwrap();
    let first_stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let first_movements: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_id = ?")
            .bind(&first)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((first_stock, first_movements), (10, 0));

    let second = submit_return(&pool, request(true)).await.unwrap();
    decide_return(&pool, ADMIN, decision(&second, "approved"))
        .await
        .unwrap();
    decide_return(&pool, ADMIN, decision(&second, "refunded"))
        .await
        .unwrap();
    let stock: i64 =
        sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    let movement: i64 = sqlx::query_scalar(
        "SELECT quantity FROM stock_movements WHERE reference_type = 'sales_return' AND reference_id = ?",
    ).bind(&second).fetch_one(&pool).await.unwrap();
    let reference: String =
        sqlx::query_scalar("SELECT refund_reference FROM sales_returns WHERE id = ?")
            .bind(&second)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((stock, movement), (11, 1));
    assert!(reference.starts_with("RF-"));
    assert!(submit_return(&pool, request(true)).await.is_err());
}

#[tokio::test]
async fn adjustment_later_line_failure_rolls_back_parent_and_items() {
    let pool = fixture().await;
    sqlx::raw_sql("CREATE TRIGGER fail_second_adjustment BEFORE INSERT ON stock_adjustment_items WHEN NEW.batch_id = 'bp2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;")
        .execute(&pool).await.unwrap();
    let request = AdjustmentRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        adjustment_type: "decrease".into(),
        reason: "damaged".into(),
        notes: None,
        items: vec![
            AdjustmentLine {
                batch_id: "bp1".into(),
                quantity: 2,
            },
            AdjustmentLine {
                batch_id: "bp2".into(),
                quantity: 3,
            },
        ],
    };
    assert!(submit_adjustment(&pool, request.clone()).await.is_err());
    let parents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_adjustments")
        .fetch_one(&pool)
        .await
        .unwrap();
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_adjustment_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((parents, items), (0, 0));
    sqlx::query("DROP TRIGGER fail_second_adjustment")
        .execute(&pool)
        .await
        .unwrap();
    assert!(submit_adjustment(&pool, request).await.is_ok());
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_adjustment_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(items, 2);
}

#[tokio::test]
async fn return_later_line_failure_rolls_back_parent_and_items() {
    let pool = fixture().await;
    sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('invoice', 'INV-TEST', ?, '2026-10-25', 20, 0, 0, 20, 'cash', 'completed', 'now', 'now')")
        .bind(ADMIN).execute(&pool).await.unwrap();
    for (id, product, batch) in [("i1", "p1", "bp1"), ("i2", "p2", "bp2")] {
        sqlx::query("INSERT INTO sales_invoice_items (id, invoice_id, product_id, batch_id, quantity, unit_price, line_total, created_at) VALUES (?, 'invoice', ?, ?, 2, 5, 10, 'now')")
            .bind(id).bind(product).bind(batch).execute(&pool).await.unwrap();
    }
    sqlx::raw_sql("CREATE TRIGGER fail_second_return BEFORE INSERT ON sales_return_items WHEN NEW.invoice_item_id = 'i2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;")
        .execute(&pool).await.unwrap();
    let request = ReturnRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        invoice_id: "invoice".into(),
        reason: "defective".into(),
        notes: None,
        refund_method: "cash".into(),
        items: vec![
            ReturnLine {
                invoice_item_id: "i1".into(),
                quantity: 1,
                restock: false,
            },
            ReturnLine {
                invoice_item_id: "i2".into(),
                quantity: 1,
                restock: true,
            },
        ],
    };
    assert!(submit_return(&pool, request.clone()).await.is_err());
    let parents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_returns")
        .fetch_one(&pool)
        .await
        .unwrap();
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_return_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((parents, items), (0, 0));
    sqlx::query("DROP TRIGGER fail_second_return")
        .execute(&pool)
        .await
        .unwrap();
    assert!(submit_return(&pool, request).await.is_ok());
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_return_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(items, 2);
}

#[tokio::test]
async fn partial_refunds_allocate_tax_and_discount_without_losing_cents() {
    let pool = fixture().await;
    sqlx::query("INSERT INTO sales_invoices (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount, discount_amount, net_amount, payment_method, status, created_at, updated_at) VALUES ('invoice', 'INV-PARTIAL', ?, '2026-10-25', 10, 1, 0.99, 10.01, 'cash', 'completed', 'now', 'now')")
        .bind(ADMIN).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoice_items (id, invoice_id, product_id, batch_id, quantity, unit_price, line_total, created_at) VALUES ('item', 'invoice', 'p1', 'bp1', 3, 3.333333333333, 10, 'now')")
        .execute(&pool).await.unwrap();
    let request = || ReturnRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-25T12:00:00Z".into(),
        invoice_id: "invoice".into(),
        reason: "defective".into(),
        notes: None,
        refund_method: "cash".into(),
        items: vec![ReturnLine {
            invoice_item_id: "item".into(),
            quantity: 1,
            restock: false,
        }],
    };
    let mut refunds = Vec::new();
    let mut taxes = Vec::new();
    for _ in 0..3 {
        let id = submit_return(&pool, request()).await.unwrap();
        let row = sqlx::query("SELECT refund_amount, tax_amount FROM sales_returns WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        refunds.push(row.get::<f64, _>("refund_amount"));
        taxes.push(row.get::<f64, _>("tax_amount"));
    }
    assert_eq!(refunds, vec![3.34, 3.33, 3.34]);
    assert_eq!(taxes, vec![0.33, 0.34, 0.33]);
    assert!(submit_return(&pool, request()).await.is_err());
}
#[tokio::test]
async fn credit_return_reduces_ledger_once_and_cannot_pay_uncollected_cash() {
    let pool = fixture().await;
    sqlx::raw_sql(include_str!("../../migrations/009_pos_sale_details.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../migrations/011_credit_and_expiry.sql"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('credit','CR','Credit','Customer','retail',10,'now','now')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoices(id,invoice_number,customer_id,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at) VALUES('ci','CI','credit',?,'2026-10-31T12:00:00Z',10,0,0,10,'credit','completed','now','now')").bind(ADMIN).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,unit_price,discount_percent,line_total,is_loose_sale,created_at) VALUES('cl','ci','p1','bp1',1,10,0,10,0,'now')").execute(&pool).await.unwrap();
    let make = |method: &str| ReturnRequest {
        user_id: ADMIN.into(),
        timestamp: "2026-10-31T13:00:00Z".into(),
        invoice_id: "ci".into(),
        reason: "expired".into(),
        notes: None,
        refund_method: method.into(),
        items: vec![ReturnLine {
            invoice_item_id: "cl".into(),
            quantity: 1,
            restock: false,
        }],
    };
    assert!(submit_return(&pool, make("cash")).await.is_err());
    let id = submit_return(&pool, make("credit_note")).await.unwrap();
    decide_return(&pool, ADMIN, decision(&id, "approved"))
        .await
        .unwrap();
    decide_return(&pool, ADMIN, decision(&id, "refunded"))
        .await
        .unwrap();
    assert!(decide_return(&pool, ADMIN, decision(&id, "refunded"))
        .await
        .is_err());
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
    assert_eq!((balance, ledger), (0.0, 0));
}
