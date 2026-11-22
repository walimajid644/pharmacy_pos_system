use crate::database_api::{require_matching_actor, SessionState};
use crate::models::enhanced_purchase_receipt::{PurchaseReceiptResponse, ReceivePurchaseRequest};
use crate::purchase_orders::{receive_order_in_transaction, ReceiptLine, ReceiveOrderRequest};
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
        _ => Err("The pharmacy database is not ready".into()),
    }
}

#[tauri::command]
pub async fn receive_purchase_with_details(
    request: ReceivePurchaseRequest,
    db: State<'_, DbInstances>,
    session: State<'_, SessionState>,
) -> Result<PurchaseReceiptResponse, String> {
    require_matching_actor(&session, &request.user_id).await?;
    let pool = database_pool(&db).await?;
    receive_detailed(&pool, request).await
}

pub(crate) async fn receive_detailed(
    pool: &Pool<Sqlite>,
    mut request: ReceivePurchaseRequest,
) -> Result<PurchaseReceiptResponse, String> {
    let percent = |value: f64| value.is_finite() && (0.0..=100.0).contains(&value);
    if request.supplier_bill_number.trim().is_empty()
        || !percent(request.invoice_discount_percent)
        || !percent(request.invoice_advance_tax_percent)
        || !request.invoice_discount_flat.is_finite()
        || request.invoice_discount_flat < 0.0
        || request.payment_amount != 0.0
    {
        return Err("Enter valid invoice details. Record payments in Supplier Ledger.".into());
    }
    if request.items.is_empty()
        || request.items.iter().any(|item| {
            item.quantity <= 0
                || item.bonus_quantity < 0
                || !item.unit_cost.is_finite()
                || item.unit_cost < 0.0
                || !item.sale_price.is_finite()
                || item.sale_price < 0.0
                || !percent(item.discount_percent)
                || !percent(item.advance_tax_percent)
        })
    {
        return Err("Invalid purchase receipt prices, bonus or taxes".into());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let received_date = request
        .receive_date
        .clone()
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let valid_date: i64 = sqlx::query_scalar("SELECT CASE WHEN length(?) = 10 AND date(?) = ? AND date(?) <= date('now', 'localtime') THEN 1 ELSE 0 END")
        .bind(&received_date).bind(&received_date).bind(&received_date).bind(&received_date)
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    if valid_date != 1 {
        return Err("Enter a valid receipt date that is not in the future".into());
    }
    let mut subtotal = 0.0;
    let mut lines = Vec::new();
    for item in &request.items {
        let base = money(item.quantity as f64 * item.unit_cost);
        let discount = money(base * item.discount_percent / 100.0);
        let tax = money((base - discount) * item.advance_tax_percent / 100.0);
        let total = money(base - discount + tax);
        if !total.is_finite() {
            return Err("Invalid receipt total".into());
        }
        subtotal += total;
        lines.push((discount, tax, total));
    }
    subtotal = money(subtotal);
    let discount = if request.invoice_discount_flat > 0.0 {
        money(request.invoice_discount_flat)
    } else {
        money(subtotal * request.invoice_discount_percent / 100.0)
    };
    if discount > subtotal {
        return Err("Invoice discount exceeds subtotal".into());
    }
    let tax = money((subtotal - discount) * request.invoice_advance_tax_percent / 100.0);
    let net = money(subtotal - discount + tax);
    if !net.is_finite() {
        return Err("Invalid invoice total".into());
    }
    let direct_invoice = request.po_id.is_empty();
    // A direct invoice creates its backing order and stock receipt in this same transaction.
    // No draft or sent order is exposed if any later invoice or batch validation fails.
    if request.po_id.is_empty() {
        crate::purchase_orders::authorized_user(&mut tx, &request.user_id).await?;
        let supplier_id = request
            .supplier_id
            .as_deref()
            .ok_or("Select a distributor")?;
        let supplier: Option<String> = sqlx::query_scalar(
            "SELECT id FROM suppliers WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
        )
        .bind(supplier_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if supplier.is_none() {
            return Err("The selected distributor is unavailable".into());
        }
        let submission_id = request
            .submission_id
            .as_deref()
            .ok_or("Refresh before saving this invoice")?;
        let invoice_id = uuid::Uuid::parse_str(submission_id)
            .map_err(|_| "Invalid invoice submission identifier")?;
        let id = invoice_id.to_string();
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders WHERE id = ?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        if exists != 0 {
            return Err(
                "This invoice was already saved. Open Purchase Register to review it.".into(),
            );
        }
        let reference = format!("PUR-{}", invoice_id.simple());
        sqlx::query("INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, status, subtotal, tax_amount, discount_amount, shipping_cost, total_amount, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, 0, ?, 'Direct distributor invoice', ?, ?, ?)")
            .bind(&id).bind(&reference).bind(supplier_id).bind(&received_date)
            .bind(subtotal).bind(tax).bind(discount).bind(net).bind(&request.user_id).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        request.po_id = id;
        for (item, (_, _, total)) in request.items.iter_mut().zip(&lines) {
            let active: Option<String> = sqlx::query_scalar(
                "SELECT id FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
            )
            .bind(&item.product_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
            if active.is_none() {
                return Err("A selected product is unavailable".into());
            }
            item.po_item_id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO purchase_order_items (id, po_id, product_id, quantity_ordered, quantity_received, unit_cost, tax_rate, discount_percent, line_total, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)")
                .bind(&item.po_item_id).bind(&request.po_id).bind(&item.product_id).bind(item.quantity)
                .bind(item.unit_cost).bind(item.advance_tax_percent).bind(item.discount_percent).bind(total).bind(&now)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }
    let receipt = ReceiveOrderRequest {
        po_id: request.po_id.clone(),
        user_id: request.user_id.clone(),
        timestamp: now.clone(),
        items: request
            .items
            .iter()
            .map(|item| ReceiptLine {
                po_item_id: item.po_item_id.clone(),
                quantity: item.quantity,
                batch_number: item.batch_number.clone(),
                expiry_date: item.expiry_date.clone(),
            })
            .collect(),
    };
    receive_order_in_transaction(&mut tx, &receipt, Some(&request.items)).await?;
    let sequence: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(CAST(SUBSTR(invoice_number, 4) AS INTEGER)), 0) + 1 FROM purchase_receipts WHERE invoice_number LIKE 'PI-%'")
        .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    let invoice = format!("PI-{:06}", sequence);
    if direct_invoice {
        sqlx::query("UPDATE purchase_orders SET po_number = ? WHERE id = ?")
            .bind(&invoice)
            .bind(&request.po_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO purchase_receipts (id, po_id, received_by, received_date, supplier_bill_number, invoice_number, payment_method, invoice_discount_percent, invoice_discount_amount, invoice_advance_tax_percent, invoice_advance_tax_amount, payment_amount, balance, net_payable, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'credit', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&request.po_id).bind(&request.user_id).bind(&received_date)
        .bind(request.supplier_bill_number.trim()).bind(&invoice)
        .bind(request.invoice_discount_percent).bind(discount).bind(request.invoice_advance_tax_percent).bind(tax)
        .bind(net).bind(net).bind(subtotal).bind(&now).bind(&now)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    for (item, (discount, tax, total)) in request.items.iter().zip(lines) {
        let margin = if item.unit_cost > 0.0 {
            money((item.sale_price - item.unit_cost) / item.unit_cost * 100.0)
        } else {
            0.0
        };
        sqlx::query("INSERT INTO purchase_receipt_items (id, receipt_id, po_item_id, product_id, quantity, bonus_quantity, unit_cost, discount_percent, discount_amount, advance_tax_percent, advance_tax_amount, sale_price, margin_percent, line_total, batch_number, expiry_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(uuid::Uuid::new_v4().to_string()).bind(&id).bind(&item.po_item_id).bind(&item.product_id)
            .bind(item.quantity).bind(item.bonus_quantity).bind(item.unit_cost).bind(item.discount_percent)
            .bind(discount).bind(item.advance_tax_percent).bind(tax).bind(item.sale_price).bind(margin).bind(total)
            .bind(item.batch_number.trim()).bind(&item.expiry_date).bind(&now)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(PurchaseReceiptResponse {
        id,
        invoice_number: invoice,
        net_payable: net,
        balance: net,
    })
}

#[tauri::command]
pub async fn get_next_purchase_invoice_number(
    db: State<'_, DbInstances>,
) -> Result<String, String> {
    let pool = database_pool(&db).await?;

    let next: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(CAST(SUBSTR(invoice_number, 4) AS INTEGER)), 0) + 1 FROM purchase_receipts WHERE invoice_number LIKE 'PI-%'")
        .fetch_one(&pool).await.map_err(|e| e.to_string())?;
    Ok(format!("PI-{:06}", next))
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
            m.name AS manufacturer,
            p.unit_price AS sale_price,
            COALESCE(SUM(i.quantity_in_stock), 0) as current_stock,
            (SELECT pri.unit_cost 
             FROM purchase_receipt_items pri
             JOIN purchase_receipts pr ON pri.receipt_id = pr.id
             WHERE pri.product_id = p.id
             ORDER BY pr.received_date DESC LIMIT 1) as last_purchase_price
        FROM products p
        LEFT JOIN product_batches i ON p.id = i.product_id
        LEFT JOIN manufacturers m ON p.manufacturer_id = m.id
        WHERE p.is_active = 1 AND p.deleted_at IS NULL AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode LIKE ?)
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
