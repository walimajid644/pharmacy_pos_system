use crate::models::enhanced_purchase_receipt::{
    ReceivePurchaseRequest, PurchaseReceiptResponse,
};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;

fn money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

async fn database_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let databases = instances.0.read().await;
    match databases.get("sqlite:pharmacy.db") {
        Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("The pharmacy database is not ready".to_string()),
    }
}

#[tauri::command]
pub async fn receive_purchase_with_details(
    request: ReceivePurchaseRequest,
    db: State<'_, DbInstances>,
) -> Result<PurchaseReceiptResponse, String> {
    let pool = database_pool(&db).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    match process_enhanced_receipt(&mut tx, request).await {
        Ok(response) => {
            tx.commit().await.map_err(|e| e.to_string())?;
            Ok(response)
        }
        Err(e) => {
            let _ = tx.rollback().await;
            Err(format!("Receipt processing error: {}", e))
        }
    }
}

async fn process_enhanced_receipt(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    request: ReceivePurchaseRequest,
) -> Result<PurchaseReceiptResponse, String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 1. Get PO details
    let po = sqlx::query(
        "SELECT supplier_id, status FROM purchase_orders WHERE id = ?"
    )
    .bind(&request.po_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| format!("PO not found: {}", e))?;

    let _supplier_id: String = po.get("supplier_id");
    let po_status: String = po.get("status");

    // Validate PO status
    if po_status != "sent" && po_status != "partial" && po_status != "draft" {
        return Err("Purchase order cannot be received in current status".to_string());
    }

    // 2. Calculate invoice totals
    let subtotal = request.items.iter()
        .map(|item| money(item.quantity as f64 * item.unit_cost))
        .sum::<f64>();
    
    let discount_amount = money(subtotal * request.invoice_discount_percent / 100.0);
    let after_discount = money(subtotal - discount_amount);
    let tax_amount = money(after_discount * request.invoice_advance_tax_percent / 100.0);
    let net_payable = money(after_discount + tax_amount);
    let balance = money(net_payable - request.payment_amount);

    // 3. Create purchase receipt record
    let receipt_id = uuid::Uuid::new_v4().to_string();
    
    sqlx::query(
        "INSERT INTO purchase_receipts (
            id, po_id, received_by, received_date, supplier_bill_number,
            invoice_number, payment_method, invoice_discount_percent,
            invoice_discount_amount, invoice_advance_tax_percent,
            invoice_advance_tax_amount, payment_amount, balance,
            net_payable, total_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&receipt_id)
    .bind(&request.po_id)
    .bind(&request.user_id)
    .bind(&now)
    .bind(&request.supplier_bill_number)
    .bind(&request.invoice_number)
    .bind(&request.payment_method)
    .bind(request.invoice_discount_percent)
    .bind(discount_amount)
    .bind(request.invoice_advance_tax_percent)
    .bind(tax_amount)
    .bind(request.payment_amount)
    .bind(balance)
    .bind(net_payable)
    .bind(subtotal)
    .bind(&now)
    .bind(&now)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Failed to create receipt: {}", e))?;

    // 4. Process each line item
    for item in &request.items {
        let item_id = uuid::Uuid::new_v4().to_string();
        
        // Calculate line totals
        let line_base = money(item.quantity as f64 * item.unit_cost);
        let line_discount = money(line_base * item.discount_percent / 100.0);
        let line_after_discount = money(line_base - line_discount);
        let line_tax = money(line_after_discount * item.advance_tax_percent / 100.0);
        let line_total = money(line_after_discount + line_tax);
        
        // Calculate margin
        let margin_percent = if item.unit_cost > 0.0 {
            money(((item.sale_price - item.unit_cost) / item.unit_cost) * 100.0)
        } else {
            0.0
        };

        // Insert receipt item
        sqlx::query(
            "INSERT INTO purchase_receipt_items (
                id, receipt_id, po_item_id, product_id, quantity, bonus_quantity,
                unit_cost, discount_percent, discount_amount, advance_tax_percent,
                advance_tax_amount, sale_price, margin_percent, line_total,
                batch_number, expiry_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item_id)
        .bind(&receipt_id)
        .bind(&item.po_item_id)
        .bind(&item.product_id)
        .bind(item.quantity)
        .bind(item.bonus_quantity)
        .bind(item.unit_cost)
        .bind(item.discount_percent)
        .bind(line_discount)
        .bind(item.advance_tax_percent)
        .bind(line_tax)
        .bind(item.sale_price)
        .bind(margin_percent)
        .bind(line_total)
        .bind(&item.batch_number)
        .bind(&item.expiry_date)
        .bind(&now)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to insert item: {}", e))?;

        // Update inventory with received quantity + bonus
        let total_received = item.quantity + item.bonus_quantity;
        
        sqlx::query(
            "INSERT INTO inventory (product_id, batch_number, expiry_date, quantity_on_hand,
                unit_cost, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(product_id, batch_number, expiry_date) DO UPDATE SET
                quantity_on_hand = quantity_on_hand + excluded.quantity_on_hand,
                unit_cost = excluded.unit_cost,
                updated_at = excluded.updated_at"
        )
        .bind(&item.product_id)
        .bind(&item.batch_number)
        .bind(&item.expiry_date)
        .bind(total_received)
        .bind(item.unit_cost)
        .bind(&now)
        .bind(&now)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to update inventory: {}", e))?;

        // Update product sale price if changed
        sqlx::query("UPDATE products SET sale_price = ?, updated_at = ? WHERE id = ?")
            .bind(item.sale_price)
            .bind(&now)
            .bind(&item.product_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| format!("Failed to update product: {}", e))?;

        // Update PO item received quantity
        sqlx::query(
            "UPDATE purchase_order_items SET 
                quantity_received = quantity_received + ?,
                updated_at = ?
            WHERE id = ?"
        )
        .bind(item.quantity)
        .bind(&now)
        .bind(&item.po_item_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to update PO item: {}", e))?;
    }

    // 5. Update PO status based on completion
    let items_status = sqlx::query(
        "SELECT COUNT(*) as total,
                SUM(CASE WHEN quantity_received >= quantity_ordered THEN 1 ELSE 0 END) as completed
        FROM purchase_order_items WHERE po_id = ?"
    )
    .bind(&request.po_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| format!("Failed to check PO status: {}", e))?;

    let total: i64 = items_status.get("total");
    let completed: i64 = items_status.get("completed");

    let new_status = if completed == total {
        "received"
    } else {
        "partial"
    };

    sqlx::query("UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?")
        .bind(new_status)
        .bind(&now)
        .bind(&request.po_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("Failed to update PO status: {}", e))?;

    Ok(PurchaseReceiptResponse {
        id: receipt_id,
        invoice_number: request.invoice_number,
        net_payable,
        balance,
    })
}

#[tauri::command]
pub async fn get_next_purchase_invoice_number(
    db: State<'_, DbInstances>,
) -> Result<String, String> {
    let pool = database_pool(&db).await?;

    let last_invoice = sqlx::query(
        "SELECT invoice_number FROM purchase_receipts 
         WHERE invoice_number IS NOT NULL 
         ORDER BY created_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(row) = last_invoice {
        let last_number: String = row.get("invoice_number");
        
        // Extract number from format PI-000001
        if let Some(num_part) = last_number.strip_prefix("PI-") {
            if let Ok(num) = num_part.parse::<i32>() {
                return Ok(format!("PI-{:06}", num + 1));
            }
        }
    }

    // Default start
    Ok("PI-000001".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSearchResult {
    pub id: String,
    pub name: String,
    pub generic_name: Option<String>,
    pub manufacturer: Option<String>,
    pub current_stock: i64,
    pub sale_price: f64,
    pub last_purchase_price: Option<f64>,
}

#[tauri::command]
pub async fn search_products_for_purchase(
    query: String,
    db: State<'_, DbInstances>,
) -> Result<Vec<ProductSearchResult>, String> {
    let pool = database_pool(&db).await?;
    
    let search_term = format!("%{}%", query);

    let products = sqlx::query(
        "SELECT 
            p.id,
            p.name,
            p.generic_name,
            p.manufacturer,
            p.sale_price,
            COALESCE(SUM(i.quantity_on_hand), 0) as current_stock,
            (SELECT pri.unit_cost 
             FROM purchase_receipt_items pri
             JOIN purchase_receipts pr ON pri.receipt_id = pr.id
             WHERE pri.product_id = p.id
             ORDER BY pr.received_date DESC LIMIT 1) as last_purchase_price
        FROM products p
        LEFT JOIN inventory i ON p.id = i.product_id
        WHERE p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode LIKE ?
        GROUP BY p.id
        ORDER BY p.name
        LIMIT 50"
    )
    .bind(&search_term)
    .bind(&search_term)
    .bind(&search_term)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let results = products
        .into_iter()
        .map(|row| ProductSearchResult {
            id: row.get("id"),
            name: row.get("name"),
            generic_name: row.get("generic_name"),
            manufacturer: row.get("manufacturer"),
            current_stock: row.get("current_stock"),
            sale_price: row.get("sale_price"),
            last_purchase_price: row.get("last_purchase_price"),
        })
        .collect();

    Ok(results)
}
