use crate::database_api::{require_matching_actor, SessionState};
use serde::Deserialize;
use sqlx::{Pool, Row, Sqlite};
use std::collections::BTreeMap;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustmentLine {
    batch_id: String,
    quantity: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustmentRequest {
    user_id: String,
    timestamp: String,
    adjustment_type: String,
    reason: String,
    notes: Option<String>,
    items: Vec<AdjustmentLine>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnLine {
    invoice_item_id: String,
    quantity: i64,
    restock: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnRequest {
    user_id: String,
    timestamp: String,
    invoice_id: String,
    reason: String,
    notes: Option<String>,
    refund_method: String,
    items: Vec<ReturnLine>,
}

async fn database_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let databases = instances.0.read().await;
    match databases.get("sqlite:pharmacy.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("The pharmacy database is not ready".to_string()),
    }
}

async fn active_user(tx: &mut sqlx::Transaction<'_, Sqlite>, id: &str) -> Result<(), String> {
    let role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("User account is unavailable")?;
    if !matches!(role.as_str(), "admin" | "manager") {
        return Err("This account cannot submit adjustments or returns".to_string());
    }
    Ok(())
}

fn date(timestamp: &str) -> Result<&str, String> {
    let value = timestamp.get(..10).ok_or("Invalid submission date")?;
    if value.bytes().enumerate().all(|(index, byte)| {
        if index == 4 || index == 7 {
            byte == b'-'
        } else {
            byte.is_ascii_digit()
        }
    }) {
        Ok(value)
    } else {
        Err("Invalid submission date".to_string())
    }
}

fn money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[tauri::command]
pub async fn submit_stock_adjustment(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: AdjustmentRequest,
) -> Result<String, String> {
    require_matching_actor(&session, &request.user_id).await?;
    submit_adjustment(&database_pool(&instances).await?, request).await
}

pub(crate) async fn submit_adjustment(
    pool: &Pool<Sqlite>,
    request: AdjustmentRequest,
) -> Result<String, String> {
    let adjustment_date = date(&request.timestamp)?;
    if !matches!(request.adjustment_type.as_str(), "increase" | "decrease")
        || !matches!(
            request.reason.as_str(),
            "damaged"
                | "expired"
                | "stolen"
                | "lost"
                | "found"
                | "count_error"
                | "return_to_supplier"
                | "other"
        )
        || request.items.is_empty()
    {
        return Err("Invalid adjustment details".to_string());
    }
    let mut quantities: BTreeMap<String, i64> = BTreeMap::new();
    for line in &request.items {
        if line.quantity <= 0 {
            return Err("Adjustment quantities must be positive".to_string());
        }
        let entry = quantities.entry(line.batch_id.clone()).or_default();
        *entry = entry
            .checked_add(line.quantity)
            .ok_or("Adjustment quantity is too large")?;
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    active_user(&mut tx, &request.user_id).await?;
    let mut priced = Vec::new();
    let mut total = 0.0;
    for (batch_id, quantity) in quantities {
        let batch = sqlx::query(
            "SELECT pb.product_id, pb.quantity_in_stock, pb.cost_price_at_batch \
             FROM product_batches pb JOIN products p ON p.id = pb.product_id \
             WHERE pb.id = ? AND p.deleted_at IS NULL",
        )
        .bind(&batch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Batch is unavailable")?;
        let stock: i64 = batch.get("quantity_in_stock");
        if request.adjustment_type == "decrease" && quantity > stock {
            return Err("An adjustment exceeds available batch stock".to_string());
        }
        let cost: f64 = batch.get("cost_price_at_batch");
        let line_value = money(quantity as f64 * cost);
        if !line_value.is_finite() || line_value < 0.0 {
            return Err("Invalid adjustment value".to_string());
        }
        total += line_value;
        priced.push((
            batch_id,
            batch.get::<String, _>("product_id"),
            quantity,
            cost,
            line_value,
        ));
    }
    if !total.is_finite() {
        return Err("Invalid adjustment total".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let number = format!("ADJ-{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO stock_adjustments (id, adjustment_number, adjustment_date, \
         adjustment_type, reason, reason_notes, total_value, status, created_by, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
    )
    .bind(&id).bind(&number).bind(adjustment_date).bind(&request.adjustment_type)
    .bind(&request.reason).bind(&request.notes).bind(money(total)).bind(&request.user_id)
    .bind(&request.timestamp).bind(&request.timestamp)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    for (batch_id, product_id, quantity, cost, line_value) in priced {
        sqlx::query(
            "INSERT INTO stock_adjustment_items (id, adjustment_id, product_id, batch_id, \
             quantity_adjusted, unit_cost, line_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&id)
        .bind(product_id)
        .bind(batch_id)
        .bind(quantity)
        .bind(cost)
        .bind(line_value)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn submit_sales_return(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ReturnRequest,
) -> Result<String, String> {
    require_matching_actor(&session, &request.user_id).await?;
    submit_return(&database_pool(&instances).await?, request).await
}

pub(crate) async fn submit_return(pool: &Pool<Sqlite>, request: ReturnRequest) -> Result<String, String> {
    let return_date = date(&request.timestamp)?;
    if !matches!(
        request.reason.as_str(),
        "defective"
            | "wrong_item"
            | "expired"
            | "customer_changed_mind"
            | "duplicate_purchase"
            | "other"
    ) || !matches!(
        request.refund_method.as_str(),
        "cash" | "card" | "credit_note"
    ) || request.items.is_empty()
    {
        return Err("Invalid return details".to_string());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    active_user(&mut tx, &request.user_id).await?;
    let invoice = sqlx::query(
        "SELECT net_amount, tax_amount, customer_id, payment_method FROM sales_invoices WHERE id = ? AND status = 'completed'",
    )
    .bind(&request.invoice_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Completed invoice not found")?;
    if invoice.get::<String,_>("payment_method")=="credit" && request.refund_method!="credit_note"{return Err("Credit-sale returns must use a credit note to adjust the customer's account".into())}
    if request.refund_method=="credit_note" && invoice.get::<Option<String>,_>("customer_id").is_none(){return Err("A credit note requires a registered customer".into())}
    let invoice_line_total: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(line_total), 0) FROM sales_invoice_items WHERE invoice_id = ?",
    )
    .bind(&request.invoice_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if !invoice_line_total.is_finite() || invoice_line_total <= 0.0 {
        return Err("Invoice has no returnable value".to_string());
    }
    let prior_subtotal: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(sii.line_total * sri.quantity_returned / sii.quantity), 0.0) \
         FROM sales_return_items sri \
         JOIN sales_returns sr ON sr.id = sri.return_id \
         JOIN sales_invoice_items sii ON sii.id = sri.invoice_item_id \
         WHERE sii.invoice_id = ? AND sr.status != 'rejected'",
    )
    .bind(&request.invoice_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let mut seen = std::collections::HashSet::new();
    let mut priced = Vec::new();
    let mut subtotal = 0.0;
    for line in &request.items {
        if line.quantity <= 0 || !seen.insert(&line.invoice_item_id) {
            return Err("Invalid or duplicate return line".to_string());
        }
        let original = sqlx::query(
            "SELECT product_id, batch_id, quantity, line_total FROM sales_invoice_items \
             WHERE id = ? AND invoice_id = ?",
        )
        .bind(&line.invoice_item_id)
        .bind(&request.invoice_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Invoice line not found")?;
        let sold: i64 = original.get("quantity");
        let returned: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(sri.quantity_returned), 0) FROM sales_return_items sri \
             JOIN sales_returns sr ON sr.id = sri.return_id \
             WHERE sri.invoice_item_id = ? AND sr.status != 'rejected'",
        )
        .bind(&line.invoice_item_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if sold <= 0 || line.quantity > sold - returned {
            return Err("Return quantity exceeds the remaining sold amount".to_string());
        }
        let original_total: f64 = original.get("line_total");
        let unit_price = original_total / sold as f64;
        let line_total = original_total * line.quantity as f64 / sold as f64;
        if !unit_price.is_finite() || !line_total.is_finite() || line_total < 0.0 {
            return Err("Invalid invoice line value".to_string());
        }
        subtotal += line_total;
        priced.push((
            line,
            original.get::<String, _>("product_id"),
            original.get::<String, _>("batch_id"),
            unit_price,
            line_total,
        ));
    }
    // Round cumulative allocations, then subtract what earlier non-rejected returns
    // reserved. This gives the final unit any rounding remainder from partial returns.
    let allocated = |amount: f64, through: f64| money(through * amount / invoice_line_total);
    let through = prior_subtotal + subtotal;
    let tax_amount: f64 = invoice.get("tax_amount");
    let net_amount: f64 = invoice.get("net_amount");
    let tax = allocated(tax_amount, through) - allocated(tax_amount, prior_subtotal);
    let refund = allocated(net_amount, through) - allocated(net_amount, prior_subtotal);
    if !subtotal.is_finite() || !tax.is_finite() || !refund.is_finite() || refund < 0.0 {
        return Err("Invalid refund value".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let number = format!("RET-{}", Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO sales_returns (id, return_number, original_invoice_id, return_date, \
         return_reason, reason_notes, subtotal, tax_amount, refund_amount, refund_method, \
         status, processed_by, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
    )
    .bind(&id)
    .bind(&number)
    .bind(&request.invoice_id)
    .bind(return_date)
    .bind(&request.reason)
    .bind(&request.notes)
    .bind(money(subtotal))
    .bind(money(tax))
    .bind(money(refund))
    .bind(&request.refund_method)
    .bind(&request.user_id)
    .bind(&request.timestamp)
    .bind(&request.timestamp)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    for (line, product_id, batch_id, unit_price, line_total) in priced {
        sqlx::query(
            "INSERT INTO sales_return_items (id, return_id, invoice_item_id, product_id, \
             batch_id, quantity_returned, unit_price, line_total, restock, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&id)
        .bind(&line.invoice_item_id)
        .bind(product_id)
        .bind(batch_id)
        .bind(line.quantity)
        .bind(unit_price)
        .bind(line_total)
        .bind(line.restock)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg(test)]
mod tests {
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
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/004_phase5_inventory.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/007_desktop_operations.sql"))
            .execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/008_supplier_drawer.sql"))
            .execute(&pool).await.unwrap();
        sqlx::query("ALTER TABLE sales_returns ADD COLUMN refunded_by TEXT").execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/005_approval_guards.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/006_inventory_triggers.sql"))
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
            items: vec![AdjustmentLine { batch_id: "bp1".into(), quantity }],
        };
        let mut duplicate = request(4);
        duplicate.items.push(AdjustmentLine { batch_id: "bp1".into(), quantity: 3 });
        let id = submit_adjustment(&pool, duplicate).await.unwrap();
        let lines: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM stock_adjustment_items WHERE adjustment_id = ?",
        ).bind(&id).fetch_one(&pool).await.unwrap();
        let reserved: i64 = sqlx::query_scalar(
            "SELECT quantity_adjusted FROM stock_adjustment_items WHERE adjustment_id = ?",
        ).bind(&id).fetch_one(&pool).await.unwrap();
        let pending_stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!((lines, reserved, pending_stock), (1, 7, 10));

        decide_adjustment(&pool, ADMIN, decision(&id, "approved")).await.unwrap();
        assert!(decide_adjustment(&pool, ADMIN, decision(&id, "approved")).await.is_err());
        let approved_stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'",
        ).fetch_one(&pool).await.unwrap();
        let movement: i64 = sqlx::query_scalar(
            "SELECT quantity FROM stock_movements WHERE reference_type = 'stock_adjustment' AND reference_id = ?",
        ).bind(&id).fetch_one(&pool).await.unwrap();
        assert_eq!((approved_stock, movement), (3, -7));
        assert!(submit_adjustment(&pool, request(4)).await.is_err());

        let rejected = submit_adjustment(&pool, request(2)).await.unwrap();
        decide_adjustment(&pool, ADMIN, decision(&rejected, "rejected")).await.unwrap();
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'",
        ).fetch_one(&pool).await.unwrap();
        let movements: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM stock_movements WHERE reference_id = ?",
        ).bind(&rejected).fetch_one(&pool).await.unwrap();
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
            items: vec![ReturnLine { invoice_item_id: "item".into(), quantity: 1, restock }],
        };
        let first = submit_return(&pool, request(false)).await.unwrap();
        let refund: f64 = sqlx::query_scalar("SELECT refund_amount FROM sales_returns WHERE id = ?")
            .bind(&first).fetch_one(&pool).await.unwrap();
        assert_eq!(refund, 10.0);
        decide_return(&pool, ADMIN, decision(&first, "approved")).await.unwrap();
        decide_return(&pool, ADMIN, decision(&first, "refunded")).await.unwrap();
        let first_stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'",
        ).fetch_one(&pool).await.unwrap();
        let first_movements: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM stock_movements WHERE reference_id = ?",
        ).bind(&first).fetch_one(&pool).await.unwrap();
        assert_eq!((first_stock, first_movements), (10, 0));

        let second = submit_return(&pool, request(true)).await.unwrap();
        decide_return(&pool, ADMIN, decision(&second, "approved")).await.unwrap();
        decide_return(&pool, ADMIN, decision(&second, "refunded")).await.unwrap();
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'bp1'",
        ).fetch_one(&pool).await.unwrap();
        let movement: i64 = sqlx::query_scalar(
            "SELECT quantity FROM stock_movements WHERE reference_type = 'sales_return' AND reference_id = ?",
        ).bind(&second).fetch_one(&pool).await.unwrap();
        let reference: String = sqlx::query_scalar(
            "SELECT refund_reference FROM sales_returns WHERE id = ?",
        ).bind(&second).fetch_one(&pool).await.unwrap();
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
            let row =
                sqlx::query("SELECT refund_amount, tax_amount FROM sales_returns WHERE id = ?")
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
    async fn credit_return_reduces_ledger_once_and_cannot_pay_uncollected_cash(){
      let pool=fixture().await;sqlx::raw_sql(include_str!("../migrations/009_pos_sale_details.sql")).execute(&pool).await.unwrap();sqlx::raw_sql(include_str!("../migrations/011_credit_and_expiry.sql")).execute(&pool).await.unwrap();
      sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('credit','CR','Credit','Customer','retail',10,'now','now')").execute(&pool).await.unwrap();
      sqlx::query("INSERT INTO sales_invoices(id,invoice_number,customer_id,cashier_id,invoice_date,total_amount,tax_amount,discount_amount,net_amount,payment_method,status,created_at,updated_at) VALUES('ci','CI','credit',?,'2026-10-31T12:00:00Z',10,0,0,10,'credit','completed','now','now')").bind(ADMIN).execute(&pool).await.unwrap();
      sqlx::query("INSERT INTO sales_invoice_items(id,invoice_id,product_id,batch_id,quantity,unit_price,discount_percent,line_total,is_loose_sale,created_at) VALUES('cl','ci','p1','bp1',1,10,0,10,0,'now')").execute(&pool).await.unwrap();
      let make=|method:&str|ReturnRequest{user_id:ADMIN.into(),timestamp:"2026-10-31T13:00:00Z".into(),invoice_id:"ci".into(),reason:"expired".into(),notes:None,refund_method:method.into(),items:vec![ReturnLine{invoice_item_id:"cl".into(),quantity:1,restock:false}]};
      assert!(submit_return(&pool,make("cash")).await.is_err());let id=submit_return(&pool,make("credit_note")).await.unwrap();decide_return(&pool,ADMIN,decision(&id,"approved")).await.unwrap();decide_return(&pool,ADMIN,decision(&id,"refunded")).await.unwrap();assert!(decide_return(&pool,ADMIN,decision(&id,"refunded")).await.is_err());
      let balance:f64=sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='credit'").fetch_one(&pool).await.unwrap();let ledger:i64=sqlx::query_scalar("SELECT SUM(amount_cents) FROM customer_ledger WHERE customer_id='credit'").fetch_one(&pool).await.unwrap();assert_eq!((balance,ledger),(0.0,0));
    }

}
