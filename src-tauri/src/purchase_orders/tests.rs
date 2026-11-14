use super::*;
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
    sqlx::query("INSERT INTO suppliers (id, supplier_code, name, created_at, updated_at) VALUES ('sup-1', 'SUP-TEST', 'Test Supplier', 'now', 'now')")
        .execute(&pool)
        .await
        .unwrap();
    for (id, sku) in [("p1", "P1"), ("p2", "P2")] {
        sqlx::query(
            "INSERT INTO products (id, sku, name, unit_price, cost_price, created_at, updated_at) \
             VALUES (?, ?, ?, 10, 5, 'now', 'now')",
        )
        .bind(id)
        .bind(sku)
        .bind(sku)
        .execute(&pool)
        .await
        .unwrap();
    }
    pool
}

fn order_request(po_id: Option<String>) -> SaveOrderRequest {
    SaveOrderRequest {
        po_id,
        supplier_id: "sup-1".to_string(),
        order_date: "2026-10-25".to_string(),
        expected_delivery_date: Some("2026-11-01".to_string()),
        notes: Some("Original notes".to_string()),
        discount_amount: 0.0,
        shipping_cost: 0.0,
        status: "sent".to_string(),
        user_id: ADMIN.to_string(),
        timestamp: "2026-10-25T12:00:00Z".to_string(),
        items: ["p1", "p2"]
            .iter()
            .map(|product_id| OrderLine {
                product_id: product_id.to_string(),
                quantity_ordered: 5,
                unit_cost: 5.0,
                tax_rate: 0.0,
                discount_percent: 0.0,
            })
            .collect(),
    }
}

#[tokio::test]
async fn draft_edit_send_and_cancel_respect_order_state() {
    let pool = fixture().await;
    let mut draft = order_request(None);
    draft.status = "draft".into();
    let saved = save_order(&pool, draft).await.unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "draft");

    let mut edit = order_request(Some(saved.id.clone()));
    edit.status = "draft".into();
    edit.notes = Some("Edited draft".into());
    save_order(&pool, edit).await.unwrap();
    let notes: String = sqlx::query_scalar("SELECT notes FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(notes, "Edited draft");

    save_order(&pool, order_request(Some(saved.id.clone())))
        .await
        .unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "sent");
    cancel_order(&pool, ADMIN, &saved.id).await.unwrap();
    assert!(cancel_order(&pool, ADMIN, &saved.id).await.is_err());
    assert!(save_order(&pool, order_request(Some(saved.id.clone())))
        .await
        .is_err());
    let status: String = sqlx::query_scalar("SELECT status FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(status, "cancelled");
    let item_id: String =
        sqlx::query_scalar("SELECT id FROM purchase_order_items WHERE po_id = ? LIMIT 1")
            .bind(&saved.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(receive_order(
        &pool,
        ReceiveOrderRequest {
            po_id: saved.id,
            user_id: ADMIN.into(),
            timestamp: "2026-10-25T12:00:00Z".into(),
            items: vec![ReceiptLine {
                po_item_id: item_id,
                quantity: 1,
                batch_number: "CANCELLED".into(),
                expiry_date: "2099-12-31".into()
            }],
        }
    )
    .await
    .is_err());
    let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(movements, 0);
}

#[tokio::test]
async fn order_discount_and_shipping_are_saved_on_create_and_edit() {
    let pool = fixture().await;
    let mut request = order_request(None);
    request.discount_amount = 5.0;
    request.shipping_cost = 2.5;
    let saved = save_order(&pool, request).await.unwrap();
    assert_eq!(saved.total_amount, 47.5);
    let row = sqlx::query(
        "SELECT discount_amount, shipping_cost, total_amount FROM purchase_orders WHERE id = ?",
    )
    .bind(&saved.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        (
            row.get::<f64, _>("discount_amount"),
            row.get::<f64, _>("shipping_cost"),
            row.get::<f64, _>("total_amount")
        ),
        (5.0, 2.5, 47.5)
    );

    let mut edit = order_request(Some(saved.id.clone()));
    edit.discount_amount = 10.0;
    edit.shipping_cost = 3.0;
    assert_eq!(save_order(&pool, edit).await.unwrap().total_amount, 43.0);

    let mut invalid = order_request(Some(saved.id.clone()));
    invalid.discount_amount = 51.0;
    assert!(save_order(&pool, invalid).await.is_err());
    let total: f64 = sqlx::query_scalar("SELECT total_amount FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(total, 43.0);
}

#[tokio::test]
async fn creation_and_edit_roll_back_when_a_later_line_fails() {
    let pool = fixture().await;
    sqlx::raw_sql(
        "CREATE TRIGGER fail_p2 BEFORE INSERT ON purchase_order_items \
         WHEN NEW.product_id = 'p2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(save_order(&pool, order_request(None)).await.is_err());
    let orders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
        .fetch_one(&pool)
        .await
        .unwrap();
    let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_order_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((orders, items), (0, 0));

    sqlx::query("DROP TRIGGER fail_p2")
        .execute(&pool)
        .await
        .unwrap();
    let saved = save_order(&pool, order_request(None)).await.unwrap();
    assert_eq!(saved.total_amount, 50.0);
    sqlx::raw_sql(
        "CREATE TRIGGER fail_p2 BEFORE INSERT ON purchase_order_items \
         WHEN NEW.product_id = 'p2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    )
    .execute(&pool)
    .await
    .unwrap();
    let mut edit = order_request(Some(saved.id.clone()));
    edit.notes = Some("Changed notes".to_string());
    assert!(save_order(&pool, edit).await.is_err());
    let row = sqlx::query("SELECT notes FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let items: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM purchase_order_items WHERE po_id = ?")
            .bind(&saved.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.get::<String, _>("notes"), "Original notes");
    assert_eq!(items, 2);
}

#[tokio::test]
async fn receipt_failure_rolls_back_batches_movements_and_quantities() {
    let pool = fixture().await;
    let saved = save_order(&pool, order_request(None)).await.unwrap();
    let rows = sqlx::query(
        "SELECT id, product_id FROM purchase_order_items WHERE po_id = ? ORDER BY product_id",
    )
    .bind(&saved.id)
    .fetch_all(&pool)
    .await
    .unwrap();
    let first: String = rows[0].get("id");
    let second: String = rows[1].get("id");
    let line = |po_item_id: &str, quantity: i64, batch_number: &str| ReceiptLine {
        po_item_id: po_item_id.to_string(),
        quantity,
        batch_number: batch_number.to_string(),
        expiry_date: "2099-12-31".to_string(),
    };
    let request = |items: Vec<ReceiptLine>| ReceiveOrderRequest {
        po_id: saved.id.clone(),
        user_id: ADMIN.to_string(),
        timestamp: "2026-10-25T12:00:00Z".to_string(),
        items,
    };

    assert!(receive_order(
        &pool,
        request(vec![line(&first, 2, "B1"), line(&second, 6, "B2")])
    )
    .await
    .is_err());
    let batches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM product_batches")
        .fetch_one(&pool)
        .await
        .unwrap();
    let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
        .fetch_one(&pool)
        .await
        .unwrap();
    let received: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(quantity_received), 0) FROM purchase_order_items WHERE po_id = ?",
    )
    .bind(&saved.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM purchase_orders WHERE id = ?")
        .bind(&saved.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        (batches, movements, received, status.as_str()),
        (0, 0, 0, "sent")
    );

    let partial = receive_order(&pool, request(vec![line(&first, 2, "B1")]))
        .await
        .unwrap();
    assert_eq!(partial, "partial");
    assert!(cancel_order(&pool, ADMIN, &saved.id).await.is_err());
    assert!(receive_order(
        &pool,
        request(vec![line(&first, 1, "B1"), line(&first, 1, "B1")])
    )
    .await
    .is_err());
    let partial_stock: i64 = sqlx::query_scalar(
        "SELECT quantity_in_stock FROM product_batches WHERE batch_number = 'B1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let partial_movements: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_id = ?")
            .bind(&saved.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((partial_stock, partial_movements), (2, 1));
    let complete = receive_order(
        &pool,
        request(vec![line(&first, 3, "B1"), line(&second, 5, "B2")]),
    )
    .await
    .unwrap();
    assert_eq!(complete, "received");
    let stock: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(quantity_in_stock), 0) FROM product_batches")
            .fetch_one(&pool)
            .await
            .unwrap();
    let movements: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((stock, movements), (10, 3));
    let movement_quantity: i64 = sqlx::query_scalar(
        "SELECT SUM(quantity) FROM stock_movements WHERE reference_id = ? AND reference_type = 'purchase_order'",
    ).bind(&saved.id).fetch_one(&pool).await.unwrap();
    assert_eq!(movement_quantity, 10);
    assert!(receive_order(&pool, request(vec![line(&first, 1, "B1")]))
        .await
        .is_err());
}
