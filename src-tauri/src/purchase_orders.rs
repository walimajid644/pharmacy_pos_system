use crate::database_api::{current_actor, require_matching_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use std::collections::HashSet;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderLine {
    product_id: String,
    quantity_ordered: i64,
    unit_cost: f64,
    tax_rate: f64,
    discount_percent: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOrderRequest {
    po_id: Option<String>,
    supplier_id: String,
    order_date: String,
    expected_delivery_date: Option<String>,
    notes: Option<String>,
    discount_amount: f64,
    shipping_cost: f64,
    status: String,
    user_id: String,
    timestamp: String,
    items: Vec<OrderLine>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderReceipt {
    id: String,
    po_number: String,
    total_amount: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptLine {
    po_item_id: String,
    quantity: i64,
    batch_number: String,
    expiry_date: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveOrderRequest {
    po_id: String,
    user_id: String,
    timestamp: String,
    items: Vec<ReceiptLine>,
}

fn money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

async fn database_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let databases = instances.0.read().await;
    match databases.get("sqlite:pharmacy.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("The pharmacy database is not ready".to_string()),
    }
}

async fn authorized_user(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    user_id: &str,
) -> Result<(), String> {
    let user =
        sqlx::query("SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL")
            .bind(user_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("User account is unavailable")?;
    let role: String = user.get("role");
    if !matches!(role.as_str(), "admin" | "manager") {
        return Err("This account cannot manage purchase orders".to_string());
    }
    Ok(())
}

fn valid_date(value: &str) -> bool {
    value.len() == 10
        && value.bytes().enumerate().all(|(index, byte)| {
            if index == 4 || index == 7 {
                byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

#[tauri::command]
pub async fn cancel_purchase_order(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    po_id: String,
) -> Result<(), String> {
    let pool = database_pool(&instances).await?;
    let actor = current_actor(&session).await?;
    cancel_order(&pool, &actor, &po_id).await
}

async fn cancel_order(pool: &Pool<Sqlite>, actor: &str, po_id: &str) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    authorized_user(&mut tx, actor).await?;
    let changed = sqlx::query(
        "UPDATE purchase_orders SET status = 'cancelled', updated_at = datetime('now') \
         WHERE id = ? AND status IN ('draft', 'sent') AND NOT EXISTS \
         (SELECT 1 FROM purchase_order_items WHERE po_id = ? AND quantity_received > 0)",
    )
    .bind(po_id)
    .bind(po_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if changed.rows_affected() != 1 {
        return Err("Purchase order cannot be cancelled".to_string());
    }
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_purchase_order(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: SaveOrderRequest,
) -> Result<OrderReceipt, String> {
    require_matching_actor(&session, &request.user_id).await?;
    let pool = database_pool(&instances).await?;
    save_order(&pool, request).await
}

pub(crate) async fn save_order(
    pool: &Pool<Sqlite>,
    request: SaveOrderRequest,
) -> Result<OrderReceipt, String> {
    if !matches!(request.status.as_str(), "draft" | "sent")
        || !valid_date(&request.order_date)
        || request.items.is_empty()
    {
        return Err("Invalid purchase order details".to_string());
    }
    if let Some(expected) = &request.expected_delivery_date {
        if !valid_date(expected) {
            return Err("Invalid expected delivery date".to_string());
        }
    }
    if !request.discount_amount.is_finite()
        || request.discount_amount < 0.0
        || !request.shipping_cost.is_finite()
        || request.shipping_cost < 0.0
        || money(request.discount_amount) != request.discount_amount
        || money(request.shipping_cost) != request.shipping_cost
    {
        return Err("Invalid order discount or shipping cost".to_string());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    authorized_user(&mut tx, &request.user_id).await?;
    let supplier = sqlx::query(
        "SELECT id FROM suppliers WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(&request.supplier_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if supplier.is_none() {
        return Err("Supplier is unavailable".to_string());
    }

    let mut subtotal = 0.0;
    let mut tax_amount = 0.0;
    let mut priced_lines = Vec::with_capacity(request.items.len());
    for line in &request.items {
        if line.quantity_ordered <= 0
            || !line.unit_cost.is_finite()
            || line.unit_cost < 0.0
            || !line.tax_rate.is_finite()
            || !(0.0..=100.0).contains(&line.tax_rate)
            || !line.discount_percent.is_finite()
            || !(0.0..=100.0).contains(&line.discount_percent)
        {
            return Err("Invalid purchase order line".to_string());
        }
        let product = sqlx::query(
            "SELECT id FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
        )
        .bind(&line.product_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if product.is_none() {
            return Err("A product is unavailable".to_string());
        }
        let base = money(line.quantity_ordered as f64 * line.unit_cost);
        let discounted = money(base * (1.0 - line.discount_percent / 100.0));
        let tax = money(discounted * line.tax_rate / 100.0);
        if !discounted.is_finite() || !tax.is_finite() {
            return Err("Invalid purchase order total".to_string());
        }
        subtotal += discounted;
        tax_amount += tax;
        priced_lines.push(money(discounted + tax));
    }
    subtotal = money(subtotal);
    tax_amount = money(tax_amount);
    if request.discount_amount > subtotal {
        return Err("Order discount cannot exceed subtotal".to_string());
    }
    let total_amount =
        money(subtotal + tax_amount - request.discount_amount + request.shipping_cost);
    if !total_amount.is_finite() || total_amount < 0.0 {
        return Err("Invalid purchase order total".to_string());
    }

    let (id, po_number) = if let Some(id) = &request.po_id {
        let current = sqlx::query("SELECT po_number, status FROM purchase_orders WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Purchase order not found")?;
        let status: String = current.get("status");
        if !matches!(status.as_str(), "draft" | "sent") {
            return Err("A received or cancelled order cannot be edited".to_string());
        }
        let received: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(quantity_received), 0) FROM purchase_order_items WHERE po_id = ?",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if received > 0 {
            return Err("An order with received stock cannot be edited".to_string());
        }
        sqlx::query(
            "UPDATE purchase_orders SET supplier_id = ?, order_date = ?, expected_delivery_date = ?, \
             status = ?, subtotal = ?, tax_amount = ?, discount_amount = ?, shipping_cost = ?, total_amount = ?, notes = ?, updated_at = ? WHERE id = ?",
        )
        .bind(&request.supplier_id)
        .bind(&request.order_date)
        .bind(&request.expected_delivery_date)
        .bind(&request.status)
        .bind(subtotal)
        .bind(tax_amount)
        .bind(request.discount_amount)
        .bind(request.shipping_cost)
        .bind(total_amount)
        .bind(&request.notes)
        .bind(&request.timestamp)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM purchase_order_items WHERE po_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        (id.clone(), current.get::<String, _>("po_number"))
    } else {
        let id = Uuid::new_v4().to_string();
        let po_number = format!("PO{}-{}", &request.order_date[..4], Uuid::new_v4().simple());
        sqlx::query(
            "INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, expected_delivery_date, \
             status, subtotal, tax_amount, discount_amount, shipping_cost, total_amount, notes, \
             created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&po_number)
        .bind(&request.supplier_id)
        .bind(&request.order_date)
        .bind(&request.expected_delivery_date)
        .bind(&request.status)
        .bind(subtotal)
        .bind(tax_amount)
        .bind(request.discount_amount)
        .bind(request.shipping_cost)
        .bind(total_amount)
        .bind(&request.notes)
        .bind(&request.user_id)
        .bind(&request.timestamp)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        (id, po_number)
    };

    for (line, line_total) in request.items.iter().zip(priced_lines) {
        sqlx::query(
            "INSERT INTO purchase_order_items (id, po_id, product_id, quantity_ordered, quantity_received, \
             unit_cost, tax_rate, discount_percent, line_total, created_at) \
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&id)
        .bind(&line.product_id)
        .bind(line.quantity_ordered)
        .bind(line.unit_cost)
        .bind(line.tax_rate)
        .bind(line.discount_percent)
        .bind(line_total)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(OrderReceipt {
        id,
        po_number,
        total_amount,
    })
}

#[tauri::command]
pub async fn receive_purchase_order(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ReceiveOrderRequest,
) -> Result<String, String> {
    require_matching_actor(&session, &request.user_id).await?;
    let pool = database_pool(&instances).await?;
    receive_order(&pool, request).await
}

pub(crate) async fn receive_order(
    pool: &Pool<Sqlite>,
    request: ReceiveOrderRequest,
) -> Result<String, String> {
    if request.items.is_empty() {
        return Err("Enter a quantity to receive".to_string());
    }
    let mut seen = HashSet::new();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    authorized_user(&mut tx, &request.user_id).await?;
    let order = sqlx::query("SELECT status FROM purchase_orders WHERE id = ?")
        .bind(&request.po_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Purchase order not found")?;
    let current_status: String = order.get("status");
    if !matches!(current_status.as_str(), "sent" | "partial") {
        return Err("Only sent or partial orders can receive stock".to_string());
    }

    for line in &request.items {
        if line.quantity <= 0
            || line.batch_number.trim().is_empty()
            || !seen.insert(&line.po_item_id)
        {
            return Err("Invalid or duplicate receipt line".to_string());
        }
        if !valid_date(&line.expiry_date) {
            return Err("Invalid expiry date".to_string());
        }
        let future: i64 = sqlx::query_scalar(
            "SELECT CASE WHEN date(?) IS NOT NULL AND date(?) > date('now') THEN 1 ELSE 0 END",
        )
        .bind(&line.expiry_date)
        .bind(&line.expiry_date)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if future == 0 {
            return Err("Expiry date must be in the future".to_string());
        }
        let item = sqlx::query(
            "SELECT product_id, quantity_ordered, quantity_received, unit_cost \
             FROM purchase_order_items WHERE id = ? AND po_id = ?",
        )
        .bind(&line.po_item_id)
        .bind(&request.po_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Purchase order item not found")?;
        let ordered: i64 = item.get("quantity_ordered");
        let received: i64 = item.get("quantity_received");
        if line.quantity > ordered - received {
            return Err("Receipt quantity exceeds remaining order quantity".to_string());
        }
        let product_id: String = item.get("product_id");
        let unit_cost: f64 = item.get("unit_cost");
        let existing_batch = sqlx::query(
            "SELECT id, expiry_date FROM product_batches WHERE product_id = ? AND batch_number = ?",
        )
        .bind(&product_id)
        .bind(line.batch_number.trim())
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        let batch_id = if let Some(batch) = existing_batch {
            let expiry: String = batch.get("expiry_date");
            if expiry != line.expiry_date {
                return Err("Existing batch has a different expiry date".to_string());
            }
            let id: String = batch.get("id");
            sqlx::query(
                "UPDATE product_batches SET quantity_in_stock = quantity_in_stock + ?, updated_at = ? WHERE id = ?",
            )
            .bind(line.quantity)
            .bind(&request.timestamp)
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            id
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO product_batches (id, product_id, batch_number, expiry_date, \
                 quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, date('now'), ?, ?)",
            )
            .bind(&id)
            .bind(&product_id)
            .bind(line.batch_number.trim())
            .bind(&line.expiry_date)
            .bind(line.quantity)
            .bind(unit_cost)
            .bind(&request.timestamp)
            .bind(&request.timestamp)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            id
        };
        let changed = sqlx::query(
            "UPDATE purchase_order_items SET quantity_received = quantity_received + ? \
             WHERE id = ? AND po_id = ? AND quantity_received + ? <= quantity_ordered",
        )
        .bind(line.quantity)
        .bind(&line.po_item_id)
        .bind(&request.po_id)
        .bind(line.quantity)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("Receipt quantity exceeds remaining order quantity".to_string());
        }
        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, \
             reference_type, reference_id, user_id, movement_date, created_at) \
             VALUES (?, ?, ?, 'in', ?, 'purchase_order', ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&product_id)
        .bind(&batch_id)
        .bind(line.quantity)
        .bind(&request.po_id)
        .bind(&request.user_id)
        .bind(&request.timestamp)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let totals = sqlx::query(
        "SELECT COALESCE(SUM(quantity_ordered), 0) AS ordered, \
         COALESCE(SUM(quantity_received), 0) AS received \
         FROM purchase_order_items WHERE po_id = ?",
    )
    .bind(&request.po_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let status = if totals.get::<i64, _>("received") == totals.get::<i64, _>("ordered") {
        "received"
    } else {
        "partial"
    };
    sqlx::query(
        "UPDATE purchase_orders SET status = ?, \
         received_date = CASE WHEN ? = 'received' THEN date('now') ELSE received_date END, \
         received_by = ?, updated_at = ? WHERE id = ?",
    )
    .bind(status)
    .bind(status)
    .bind(&request.user_id)
    .bind(&request.timestamp)
    .bind(&request.po_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(status.to_string())
}

#[cfg(test)]
mod tests;
