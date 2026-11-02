use crate::database_api::{require_matching_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

const DATABASE_KEY: &str = "sqlite:pharmacy.db";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItem {
    product_id: String,
    batch_id: String,
    quantity: i64,
    #[serde(default)]
    bonus_quantity: i64,
    is_loose_sale: bool,
    discount_percent: f64,
    #[serde(default)]
    confirm_break: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutRequest {
    cashier_id: String,
    #[serde(default)]
    source_document_id: Option<String>,
    customer_id: Option<String>,
    #[serde(default)]
    patient_name: Option<String>,
    #[serde(default)]
    doctor_name: Option<String>,
    #[serde(default)]
    prescription_note: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    received_amount: Option<f64>,
    payment_method: String,
    order_discount: f64,
    expected_subtotal: f64,
    expected_tax_amount: f64,
    expected_net_amount: f64,
    timestamp: String,
    items: Vec<SaleItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutReceipt {
    invoice_id: String,
    invoice_number: String,
    subtotal: f64,
    tax_amount: f64,
    discount_amount: f64,
    net_amount: f64,
    received_amount: f64,
    change_amount: f64,
}

struct PricedItem {
    product_id: String,
    batch_id: String,
    units: i64,
    sale_quantity: i64,
    bonus_quantity: i64,
    bonus_units: i64,
    cost_price: f64,
    is_loose_sale: bool,
    unit_price: f64,
    discount_percent: f64,
    line_total: f64,
    loose_remaining_after: i64,
    strips_opened: i64,
    pack_size: i64,
}

fn money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[tauri::command]
pub async fn checkout_sale(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: CheckoutRequest,
) -> Result<CheckoutReceipt, String> {
    require_matching_actor(&session, &request.cashier_id).await?;
    let pool = {
        let databases = instances.0.read().await;
        match databases.get(DATABASE_KEY) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("The pharmacy database is not ready".to_string()),
        }
    };
    record_sale(&pool, request).await
}

pub(crate) async fn record_sale(
    pool: &Pool<Sqlite>,
    request: CheckoutRequest,
) -> Result<CheckoutReceipt, String> {
    if request.items.is_empty() {
        return Err("The cart is empty".to_string());
    }
    if !matches!(request.payment_method.as_str(), "cash" | "card" | "mobile" | "credit") {
        return Err("Invalid payment method".to_string());
    }
    if !request.order_discount.is_finite() || request.order_discount < 0.0 {
        return Err("Invalid order discount".to_string());
    }
    if request.notes.as_deref().is_some_and(|value| value.chars().count() > 500) {
        return Err("Sale remarks must be at most 500 characters".into());
    }
    if request.received_amount.is_some_and(|value| !value.is_finite() || value < 0.0) {
        return Err("Invalid received amount".into());
    }
    if !request.expected_subtotal.is_finite()
        || request.expected_subtotal < 0.0
        || !request.expected_tax_amount.is_finite()
        || request.expected_tax_amount < 0.0
        || !request.expected_net_amount.is_finite()
        || request.expected_net_amount < 0.0
    {
        return Err("Invalid displayed sale total".to_string());
    }

    if request.prescription_note.as_deref().is_some_and(|v|v.chars().count()>500){return Err("Prescription note must be at most 500 characters".into())}
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let shift_id: String = sqlx::query_scalar(
        "SELECT id FROM cashier_shifts WHERE cashier_id = ? AND status = 'open'",
    )
    .bind(&request.cashier_id).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?
    .ok_or("Open your shift before completing a sale")?;
    for name in [&request.patient_name, &request.doctor_name] {
        if name.as_deref().is_some_and(|value| value.trim().len() > 100) {
            return Err("Patient and doctor names must be at most 100 characters".into());
        }
    }

    let cashier =
        sqlx::query("SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL")
            .bind(&request.cashier_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Cashier account is unavailable")?;
    let role: String = cashier.get("role");
    if !matches!(role.as_str(), "admin" | "manager" | "cashier") {
        return Err("This account cannot complete sales".to_string());
    }

    if request.payment_method=="credit" && request.customer_id.is_none(){return Err("Credit / Udhar requires a registered customer".into())}
    let mut wholesale=false;
    let mut previous_balance = 0.0;
    if let Some(customer_id) = &request.customer_id {
        let customer = sqlx::query(
            "SELECT id, current_balance, customer_type FROM customers WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
        )
        .bind(customer_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        let customer = customer.ok_or("Selected customer is unavailable")?;
        previous_balance = customer.get("current_balance");
        wholesale=customer.get::<String,_>("customer_type")=="wholesale";
    }

    let mut priced: Vec<PricedItem> = Vec::with_capacity(request.items.len());
    let mut subtotal = 0.0;
    for item in &request.items {
        if item.quantity <= 0 || item.bonus_quantity < 0
            || !item.discount_percent.is_finite()
            || !(0.0..=100.0).contains(&item.discount_percent)
        {
            return Err("Invalid sale quantity or discount".to_string());
        }
        let row = sqlx::query(
            "SELECT p.unit_price, p.wholesale_price, p.pack_size, p.sell_by_loose_unit, p.controlled_substance, b.cost_price_at_batch, \
             b.quantity_in_stock, b.loose_open_remaining, b.expiry_date < date('now', 'localtime') AS expired \
             FROM products p JOIN product_batches b ON b.product_id = p.id \
             WHERE p.id = ? AND b.id = ? AND p.is_active = 1 AND p.deleted_at IS NULL",
        )
        .bind(&item.product_id)
        .bind(&item.batch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("A product or batch is no longer available")?;

        if row.get::<i64,_>("controlled_substance")==1 && !(request.patient_name.as_deref().is_some_and(|v|!v.trim().is_empty())&&request.doctor_name.as_deref().is_some_and(|v|!v.trim().is_empty())) && !request.prescription_note.as_deref().is_some_and(|v|!v.trim().is_empty()) {return Err("Controlled product requires both patient and doctor names, or a prescription note/reference".into())}
        if row.get::<i64, _>("expired") != 0 {
            return Err("An item has expired".to_string());
        }
        if item.is_loose_sale && row.get::<i64, _>("sell_by_loose_unit") == 0 {
            return Err("This product cannot be sold as a loose unit".to_string());
        }
        let pack_size: i64 = row.get("pack_size");
        let charged_units = item.quantity.checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units > 0).ok_or("Invalid sale quantity")?;
        let bonus_units = item.bonus_quantity.checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units >= 0).ok_or("Invalid bonus quantity")?;
        let units = item
            .quantity
            .checked_add(item.bonus_quantity).ok_or("Invalid total quantity")?
            .checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units > 0)
            .ok_or("Invalid sale quantity")?;
        let already_reserved: i64 = priced.iter().filter(|prior| prior.batch_id == item.batch_id).map(|prior| prior.units).sum();
        let available = row.get::<i64, _>("quantity_in_stock") - already_reserved;
        if units > available {
            return Err("Insufficient batch stock".to_string());
        }
        let first_available: Vec<(String, i64)> = sqlx::query_as(
            "SELECT id, quantity_in_stock FROM product_batches WHERE product_id = ? AND quantity_in_stock > 0 AND expiry_date >= date('now', 'localtime') ORDER BY expiry_date, id",
        ).bind(&item.product_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        let earliest = first_available.iter().find(|(id, quantity)| {
            let used: i64 = priced.iter().filter(|prior| &prior.batch_id == id).map(|prior| prior.units).sum();
            quantity - used > 0
        });
        if earliest.is_some_and(|(id, _)| id != &item.batch_id) {
            return Err("Sell the earliest-expiring batch first".into());
        }
        let open_before = priced.iter().rev().find(|prior| prior.batch_id == item.batch_id)
            .map(|prior| prior.loose_remaining_after)
            .unwrap_or(row.get::<i64, _>("loose_open_remaining"));
        let (strips_opened, loose_remaining_after) = if item.is_loose_sale && pack_size > 1 {
            if units <= open_before { (0, open_before - units) }
            else {
                let needed = units - open_before;
                let strips = (needed + pack_size - 1) / pack_size;
                if !item.confirm_break { return Err("Confirm the batch before opening a new strip".into()); }
                let leftover = (strips * pack_size - needed).min(available - units);
                (strips, leftover)
            }
        } else {
            if !item.is_loose_sale && units > available - open_before {
                return Err("Only opened loose units remain in this batch; choose another batch or sell loose units".into());
            }
            (0, open_before)
        };
        let unit_price: f64 = if wholesale {row.get::<Option<f64>,_>("wholesale_price").unwrap_or(row.get("unit_price"))}else{row.get("unit_price")};
        if !unit_price.is_finite()||unit_price<0.0{return Err("Invalid product price".into())}
        let cost_price: f64 = row.get("cost_price_at_batch");
        if !cost_price.is_finite() || cost_price < 0.0 { return Err("Invalid batch cost".into()); }
        let line_total = money(unit_price * charged_units as f64 * (1.0 - item.discount_percent / 100.0));
        if !line_total.is_finite() || line_total < 0.0 {
            return Err("Invalid sale amount".to_string());
        }
        subtotal += line_total;
        priced.push(PricedItem {
            product_id: item.product_id.clone(),
            batch_id: item.batch_id.clone(),
            units,
            sale_quantity: item.quantity,
            bonus_quantity: item.bonus_quantity,
            bonus_units,
            cost_price,
            is_loose_sale: item.is_loose_sale,
            unit_price,
            discount_percent: item.discount_percent,
            line_total,
            loose_remaining_after,
            strips_opened,
            pack_size,
        });
    }
    subtotal = money(subtotal);

    let tax_rate: f64 = sqlx::query("SELECT tax_rate FROM app_settings LIMIT 1")
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .map(|row| row.get("tax_rate"))
        .unwrap_or(0.0);
    if !tax_rate.is_finite() || !(0.0..=100.0).contains(&tax_rate) {
        return Err("Invalid configured tax rate".to_string());
    }
    let tax_amount = money(subtotal * tax_rate / 100.0);
    let order_discount = money(request.order_discount);
    if order_discount > subtotal + tax_amount {
        return Err("Order discount exceeds sale amount".to_string());
    }
    let net_amount = money(subtotal + tax_amount - order_discount);
    // Legacy callers without a tender amount mean exact payment. The POS sends it explicitly.
    let received_amount = if request.payment_method == "cash" {
        money(request.received_amount.unwrap_or(net_amount))
    } else if request.payment_method=="credit" { 0.0 } else { net_amount };
    if !received_amount.is_finite() { return Err("Invalid received amount".into()); }
    if request.payment_method!="credit" && received_amount < net_amount { return Err("Cash received is less than the sale total".into()); }
    let change_amount = if request.payment_method=="credit" {0.0}else{money(received_amount - net_amount)};
    if money(request.expected_subtotal) != subtotal
        || money(request.expected_tax_amount) != tax_amount
        || money(request.expected_net_amount) != net_amount
    {
        return Err("Sale total changed; refresh the cart before checkout".to_string());
    }
    let invoice_id = Uuid::new_v4().to_string();
    let invoice_number = format!("INV-{}", Uuid::new_v4());

    if request.payment_method=="credit" {
        let id=request.customer_id.as_deref().ok_or("Select a registered customer")?;
        let changed=sqlx::query("UPDATE customers SET current_balance=ROUND(current_balance+?,2),updated_at=? WHERE id=? AND is_active=1 AND deleted_at IS NULL AND CAST(ROUND(current_balance*100) AS INTEGER)+?<=CAST(ROUND(credit_limit*100) AS INTEGER)").bind(net_amount).bind(&request.timestamp).bind(id).bind((net_amount*100.0).round() as i64).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected()!=1{return Err("Credit limit exceeded or customer unavailable. Collect a payment or ask a manager to review the limit.".into())}
        crate::credit::append(&mut tx,id,"credit_sale",&invoice_id,(net_amount*100.0).round() as i64,&request.cashier_id,&invoice_number).await?;
    }
    sqlx::query(
        "INSERT INTO sales_invoices (id, invoice_number, customer_id, cashier_id, shift_id, patient_name, doctor_name, prescription_note, invoice_date, \
         total_amount, tax_amount, discount_amount, net_amount, payment_method, notes, received_amount, change_amount, previous_balance, status, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)",
    )
    .bind(&invoice_id)
    .bind(&invoice_number)
    .bind(&request.customer_id)
    .bind(&request.cashier_id)
    .bind(&shift_id)
    .bind(request.patient_name.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(request.doctor_name.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(request.prescription_note.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(&request.timestamp)
    .bind(subtotal)
    .bind(tax_amount)
    .bind(order_discount)
    .bind(net_amount)
    .bind(&request.payment_method)
    .bind(request.notes.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .bind(received_amount)
    .bind(change_amount)
    .bind(previous_balance)
    .bind(&request.timestamp)
    .bind(&request.timestamp)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(source)=&request.source_document_id {
        let doc=sqlx::query("SELECT customer_id,kind,due_date FROM commercial_documents WHERE id=? AND status='open'").bind(source).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("Source estimate or pre-order is no longer open")?;
        if doc.get::<Option<String>,_>("customer_id") != request.customer_id { return Err("The sale customer must match the source document".into()); }
        if doc.get::<String,_>("kind")=="estimate" { if let Some(due)=doc.get::<Option<String>,_>("due_date") { if due < chrono::Local::now().format("%Y-%m-%d").to_string() { return Err("Estimate has expired; update its validity date before checkout".into()); } } }
        let source_lines=sqlx::query("SELECT product_id,quantity FROM commercial_document_items WHERE document_id=?").bind(source).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
        let mut units=std::collections::HashMap::<String,i64>::new();
        for line in &priced { *units.entry(line.product_id.clone()).or_default()+=line.units; }
        if units.len()!=source_lines.len() || source_lines.iter().any(|l|units.get(&l.get::<String,_>("product_id")).copied()!=Some(l.get::<i64,_>("quantity"))) { return Err("Sale quantities must match the source document; edit the document first".into()); }
        let changed=sqlx::query("UPDATE commercial_documents SET status='converted',invoice_id=?,updated_at=? WHERE id=? AND status='open'").bind(&invoice_id).bind(&request.timestamp).bind(source).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected()!=1 { return Err("Source document was already converted".into()); }
    }

    for item in priced {
        let stock_change = sqlx::query(
            "UPDATE product_batches SET quantity_in_stock = quantity_in_stock - ?, loose_open_remaining = ?, updated_at = ? \
             WHERE id = ? AND quantity_in_stock >= ? AND expiry_date >= date('now', 'localtime')",
        )
        .bind(item.units)
        .bind(item.loose_remaining_after)
        .bind(&request.timestamp)
        .bind(&item.batch_id)
        .bind(item.units)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if stock_change.rows_affected() != 1 {
            return Err("Insufficient or expired batch stock".to_string());
        }
        if item.strips_opened > 0 {
            sqlx::query("INSERT INTO loose_break_events (id, invoice_id, product_id, batch_id, cashier_id, strips_opened, pack_size, units_requested, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string()).bind(&invoice_id).bind(&item.product_id).bind(&item.batch_id)
                .bind(&request.cashier_id).bind(item.strips_opened).bind(item.pack_size).bind(item.units)
                .bind(&request.timestamp).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }

        sqlx::query(
            "INSERT INTO sales_invoice_items (id, invoice_id, product_id, batch_id, quantity, \
             sale_quantity, is_loose_sale, unit_price, discount_percent, line_total, bonus_quantity, bonus_units, cost_price, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&invoice_id)
        .bind(&item.product_id)
        .bind(&item.batch_id)
        .bind(item.units)
        .bind(item.sale_quantity)
        .bind(if item.is_loose_sale { 1 } else { 0 })
        .bind(item.unit_price)
        .bind(item.discount_percent)
        .bind(item.line_total)
        .bind(item.bonus_quantity)
        .bind(item.bonus_units)
        .bind(item.cost_price)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, \
             reference_type, reference_id, user_id, movement_date, created_at) \
             VALUES (?, ?, ?, 'out', ?, 'sale', ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&item.product_id)
        .bind(&item.batch_id)
        .bind(-item.units)
        .bind(&invoice_id)
        .bind(&request.cashier_id)
        .bind(&request.timestamp)
        .bind(&request.timestamp)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query("UPDATE sales_invoices SET customer_name_snapshot=COALESCE((SELECT first_name||' '||last_name FROM customers WHERE id=customer_id),'Walk-in'),customer_phone_snapshot=(SELECT phone_number FROM customers WHERE id=customer_id),cashier_name_snapshot=(SELECT full_name FROM users WHERE id=cashier_id) WHERE id=?").bind(&invoice_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    sqlx::query("UPDATE sales_invoice_items SET product_name_snapshot=(SELECT name FROM products WHERE id=product_id),batch_number_snapshot=(SELECT batch_number FROM product_batches WHERE id=batch_id),controlled_snapshot=COALESCE((SELECT controlled_substance FROM products WHERE id=product_id),0),drap_snapshot=(SELECT drap_registration_number FROM products WHERE id=product_id),regulatory_snapshot=1 WHERE invoice_id=?").bind(&invoice_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    let controlled_count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id=? AND controlled_snapshot=1").bind(&invoice_id).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
    if controlled_count>0 {sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,'controlled_sale',?,?,'sales_invoice',?,?,?)").bind(Uuid::new_v4().to_string()).bind(&request.cashier_id).bind(&request.timestamp).bind(&invoice_id).bind(&invoice_number).bind(format!("{controlled_count} controlled sale lines; prescription evidence saved on invoice")).execute(&mut *tx).await.map_err(|e|e.to_string())?;}
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(CheckoutReceipt {
        invoice_id,
        invoice_number,
        subtotal,
        tax_amount,
        discount_amount: order_discount,
        net_amount,
        received_amount,
        change_amount,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::time::Duration;

    async fn setup_operations(pool: &Pool<Sqlite>) {
        sqlx::raw_sql(include_str!("../migrations/004_phase5_inventory.sql"))
            .execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/007_desktop_operations.sql"))
            .execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/008_supplier_drawer.sql"))
            .execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/009_pos_sale_details.sql"))
            .execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/010_commercial_operations.sql")).execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/011_credit_and_expiry.sql")).execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/012_pricing_and_audit.sql")).execute(pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/013_catalog_and_controlled.sql")).execute(pool).await.unwrap();
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
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql")).execute(&pool).await.unwrap();
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
        assert_eq!((receipt.net_amount, receipt.received_amount, receipt.change_amount), (43.0, 50.0, 7.0));
        let line = sqlx::query("SELECT quantity, sale_quantity, bonus_quantity, bonus_units, cost_price, line_total FROM sales_invoice_items WHERE invoice_id = ?")
            .bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
        assert_eq!((line.get::<i64, _>("quantity"), line.get::<i64, _>("sale_quantity"), line.get::<i64, _>("bonus_quantity"), line.get::<i64, _>("bonus_units")), (30, 2, 1, 10));
        assert_eq!((line.get::<f64, _>("cost_price"), line.get::<f64, _>("line_total")), (1.5, 45.0));
        let saved = sqlx::query("SELECT notes, previous_balance, received_amount, change_amount FROM sales_invoices WHERE id = ?")
            .bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
        assert_eq!(saved.get::<String, _>("notes"), "Deliver together");
        assert_eq!((saved.get::<f64, _>("previous_balance"), saved.get::<f64, _>("received_amount"), saved.get::<f64, _>("change_amount")), (125.0, 50.0, 7.0));
        let stock: i64 = sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'").fetch_one(&pool).await.unwrap();
        assert_eq!(stock, 70);
        let balance: f64 = sqlx::query_scalar("SELECT current_balance FROM customers WHERE id = 'client'").fetch_one(&pool).await.unwrap();
        assert_eq!(balance, 125.0);
    }

    #[tokio::test]
    async fn invalid_bonus_and_tender_roll_back_stock_and_invoice() {
        let pool = sale_details_fixture().await;
        let mut sale = request(&[2]);
        sale.items[0].bonus_quantity = 99;
        assert!(record_sale(&pool, sale.clone()).await.unwrap_err().contains("stock"));
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
        let stock: i64 = sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'").fetch_one(&pool).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices").fetch_one(&pool).await.unwrap();
        assert_eq!((stock, count), (100, 0));
        sale.notes = None;
        sale.payment_method = "card".into();
        sale.received_amount = Some(100.0);
        let receipt = record_sale(&pool, sale).await.unwrap();
        assert_eq!((receipt.received_amount, receipt.change_amount), (5.0, 0.0));
    }

    #[tokio::test]
    async fn loose_break_requires_confirmation_and_fefo_with_audit() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql")).execute(&pool).await.unwrap();
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
        let remaining: i64 = sqlx::query_scalar("SELECT loose_open_remaining FROM product_batches WHERE id = 'early'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!((count, remaining), (1, 9));
    }

    #[tokio::test]
    async fn sale_rolls_back_every_write_when_a_later_item_cannot_be_filled() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
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
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        )
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
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        )
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
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
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
        let linked: String =
            sqlx::query_scalar("SELECT customer_id FROM sales_invoices WHERE id = ?")
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
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
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
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        )
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
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(stock, 18);
    }

    #[tokio::test]
    async fn payment_methods_history_and_expiry_preserve_stock_movements() {
        let pool = SqlitePoolOptions::new().max_connections(1)
            .connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
            .execute(&pool).await.unwrap();
        setup_operations(&pool).await;
        sqlx::query("INSERT INTO products (id, sku, name, barcode, unit_price, cost_price, pack_size, sell_by_loose_unit, created_at, updated_at) VALUES ('test-product', 'TEST', 'Test medicine', '123456789', 2.5, 1.5, 1, 1, 'now', 'now')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO product_batches (id, product_id, batch_number, expiry_date, quantity_in_stock, cost_price_at_batch, received_date, created_at, updated_at) VALUES ('test-batch', 'test-product', 'B1', '2099-12-31', 4, 1.5, 'now', 'now', 'now')")
            .execute(&pool).await.unwrap();

        for method in ["cash", "card", "mobile"] {
            let mut sale = request(&[1]);
            sale.payment_method = method.into();
            let receipt = record_sale(&pool, sale).await.unwrap();
            let saved: (String, f64) = sqlx::query_as(
                "SELECT payment_method, net_amount FROM sales_invoices WHERE id = ?",
            ).bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
            assert_eq!(saved, (method.into(), 2.5));
            let line_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id = ?",
            ).bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();
            assert_eq!(line_count, 1);
        }
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        ).fetch_one(&pool).await.unwrap();
        let movement: i64 = sqlx::query_scalar(
            "SELECT SUM(quantity) FROM stock_movements WHERE reference_type = 'sale'",
        ).fetch_one(&pool).await.unwrap();
        assert_eq!((stock, movement), (1, -3));
        assert!(record_sale(&pool, request(&[2])).await.is_err());
        sqlx::query("UPDATE product_batches SET expiry_date = '2000-01-01' WHERE id = 'test-batch'")
            .execute(&pool).await.unwrap();
        assert!(record_sale(&pool, request(&[1])).await.is_err());
        let history_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sales_invoices WHERE status = 'completed'",
        ).fetch_one(&pool).await.unwrap();
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
        sqlx::raw_sql(include_str!("../migrations/001_initial_schema.sql"))
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
        let stock: i64 = sqlx::query_scalar(
            "SELECT quantity_in_stock FROM product_batches WHERE id = 'test-batch'",
        )
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
        let pool=sale_details_fixture().await;
        let actor="00000000-0000-0000-0000-000000000001";
        sqlx::query("INSERT INTO commercial_documents(id,number,kind,customer_name,document_date,subtotal_cents,created_by,created_at,updated_at) VALUES('doc','PRE1','estimate','Guest','2020-01-01',500,?,'now','now')").bind(actor).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO commercial_document_items(id,document_id,product_id,quantity,unit_price_cents) VALUES('l','doc','test-product',2,250)").execute(&pool).await.unwrap();
        let mut wrong=request(&[1]);wrong.source_document_id=Some("doc".into());assert!(record_sale(&pool,wrong).await.is_err());
        let remaining:i64=sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='test-batch'").fetch_one(&pool).await.unwrap();assert_eq!(remaining,100);
        let mut sale=request(&[2]);sale.source_document_id=Some("doc".into());let receipt=record_sale(&pool,sale.clone()).await.unwrap();
        assert!(record_sale(&pool,sale).await.is_err());let linked:String=sqlx::query_scalar("SELECT invoice_id FROM commercial_documents WHERE id='doc' AND status='converted'").fetch_one(&pool).await.unwrap();assert_eq!(linked,receipt.invoice_id);
        let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices").fetch_one(&pool).await.unwrap();assert_eq!(count,1);
    }

    #[tokio::test]
    async fn udhar_limit_and_walk_in_guards_are_atomic_and_snapshots_survive_catalog_edits(){
      let pool=sale_details_fixture().await;
      sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,credit_limit,current_balance,created_at,updated_at) VALUES('credit','CR','Credit','Customer','retail',5,0,'now','now')").execute(&pool).await.unwrap();
      let mut walkin=request(&[1]);walkin.payment_method="credit".into();assert!(record_sale(&pool,walkin).await.is_err());
      let mut credit=request(&[2]);credit.customer_id=Some("credit".into());credit.payment_method="credit".into();let (first,second)=tokio::join!(record_sale(&pool,credit.clone()),record_sale(&pool,credit));assert_eq!(first.is_ok() as u8+second.is_ok() as u8,1);
      let balance:f64=sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='credit'").fetch_one(&pool).await.unwrap();let ledger:i64=sqlx::query_scalar("SELECT SUM(amount_cents) FROM customer_ledger WHERE customer_id='credit'").fetch_one(&pool).await.unwrap();let stock:i64=sqlx::query_scalar("SELECT quantity_in_stock FROM product_batches WHERE id='test-batch'").fetch_one(&pool).await.unwrap();assert_eq!((balance,ledger,stock),(5.0,500,98));
      let payment:(f64,f64)=sqlx::query_as("SELECT received_amount,change_amount FROM sales_invoices").fetch_one(&pool).await.unwrap();assert_eq!(payment,(0.0,0.0));
      sqlx::query("UPDATE products SET name='Changed medicine',unit_price=999 WHERE id='test-product'").execute(&pool).await.unwrap();let snapshot:(String,f64)=sqlx::query_as("SELECT product_name_snapshot,line_total FROM sales_invoice_items LIMIT 1").fetch_one(&pool).await.unwrap();assert_eq!(snapshot,("Test medicine".into(),5.0));
    }

    #[tokio::test]
    async fn checkout_cannot_sell_quarantined_units(){let pool=sale_details_fixture().await;let actor="00000000-0000-0000-0000-000000000001";let hold=serde_json::from_value(serde_json::json!({"requestId":Uuid::new_v4().to_string(),"batchId":"test-batch","quantity":100,"reason":"Safety hold"})).unwrap();crate::expiry::hold(&pool,actor,hold).await.unwrap();assert!(record_sale(&pool,request(&[1])).await.is_err());let n:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices").fetch_one(&pool).await.unwrap();assert_eq!(n,0);}

    #[tokio::test]
    async fn wholesale_customer_price_is_authoritative_and_saved_with_credit_sale(){let pool=sale_details_fixture().await;sqlx::query("UPDATE products SET wholesale_price=1.75 WHERE id='test-product'").execute(&pool).await.unwrap();sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,credit_limit,created_at,updated_at) VALUES('wh','WH','Wholesale','Customer','wholesale',100,'now','now')").execute(&pool).await.unwrap();let mut stale=request(&[2]);stale.customer_id=Some("wh".into());assert!(record_sale(&pool,stale).await.is_err());let mut sale=request(&[2]);sale.customer_id=Some("wh".into());sale.payment_method="credit".into();sale.expected_subtotal=3.5;sale.expected_net_amount=3.5;let receipt=record_sale(&pool,sale).await.unwrap();let line:(f64,f64)=sqlx::query_as("SELECT unit_price,line_total FROM sales_invoice_items WHERE invoice_id=?").bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();assert_eq!(line,(1.75,3.5));let balance:f64=sqlx::query_scalar("SELECT current_balance FROM customers WHERE id='wh'").fetch_one(&pool).await.unwrap();assert_eq!(balance,3.5);sqlx::query("UPDATE products SET wholesale_price=9 WHERE id='test-product'").execute(&pool).await.unwrap();let saved:f64=sqlx::query_scalar("SELECT unit_price FROM sales_invoice_items WHERE invoice_id=?").bind(&receipt.invoice_id).fetch_one(&pool).await.unwrap();assert_eq!(saved,1.75);}
    #[tokio::test]
    async fn retail_and_null_fallback_keep_retail_while_zero_wholesale_is_explicit(){let pool=sale_details_fixture().await;sqlx::query("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,created_at,updated_at) VALUES('wh','WH','Wholesale','Customer','wholesale','now','now')").execute(&pool).await.unwrap();let mut fallback=request(&[2]);fallback.customer_id=Some("wh".into());assert_eq!(record_sale(&pool,fallback).await.unwrap().net_amount,5.0);sqlx::query("UPDATE products SET wholesale_price=0 WHERE id='test-product'").execute(&pool).await.unwrap();let mut zero=request(&[2]);zero.customer_id=Some("wh".into());zero.expected_subtotal=0.0;zero.expected_net_amount=0.0;assert_eq!(record_sale(&pool,zero).await.unwrap().net_amount,0.0);assert_eq!(record_sale(&pool,request(&[2])).await.unwrap().net_amount,5.0);}

    #[tokio::test]
    async fn controlled_sale_requires_evidence_and_preserves_classification_drap_and_report(){
      let pool=sale_details_fixture().await;
      sqlx::query("UPDATE products SET controlled_substance=1,drap_registration_number='TEST-DRAP' WHERE id='test-product'").execute(&pool).await.unwrap();
      let stock:i64=sqlx::query_scalar("SELECT SUM(quantity_in_stock) FROM product_batches").fetch_one(&pool).await.unwrap();
      let mut sale=request(&[2]);sale.patient_name=Some("Patient only".into());
      assert!(record_sale(&pool,sale.clone()).await.unwrap_err().contains("Controlled product"));
      assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM sales_invoices").fetch_one(&pool).await.unwrap(),0);
      assert_eq!(sqlx::query_scalar::<_,i64>("SELECT SUM(quantity_in_stock) FROM product_batches").fetch_one(&pool).await.unwrap(),stock);
      sale.prescription_note=Some("Reviewed synthetic Rx REF-123".into());let invoice=record_sale(&pool,sale).await.unwrap();
      sqlx::query("UPDATE products SET controlled_substance=0,drap_registration_number='CHANGED',name='Changed catalog' WHERE id='test-product'").execute(&pool).await.unwrap();
      let saved:(i64,String,i64)=sqlx::query_as("SELECT controlled_snapshot,drap_snapshot,regulatory_snapshot FROM sales_invoice_items WHERE invoice_id=?").bind(&invoice.invoice_id).fetch_one(&pool).await.unwrap();assert_eq!(saved,(1,"TEST-DRAP".into(),1));
      let request=serde_json::from_value(serde_json::json!({"start":"2000-01-01T00:00:00Z","end":"2099-01-01T00:00:00Z","offset":0})).unwrap();
      let report=serde_json::to_value(crate::controlled::read(&pool,"00000000-0000-0000-0000-000000000001",request).await.unwrap()).unwrap();assert_eq!(report["total"],1);assert_eq!(report["units"],2);assert_eq!(report["rows"][0]["drap"],"TEST-DRAP");assert_eq!(report["rows"][0]["prescription_note"],"Reviewed synthetic Rx REF-123");
      let saved=serde_json::to_value(crate::recovery::get_saved(&pool,"00000000-0000-0000-0000-000000000001",Some(invoice.invoice_id)).await.unwrap()).unwrap();assert_eq!(saved["items"][0]["drap_registration_number"],"TEST-DRAP");assert_eq!(saved["items"][0]["controlled_substance"],1);
    }
    #[tokio::test]
    async fn controlled_pair_of_names_is_valid_and_report_denies_cashier(){
      let pool=sale_details_fixture().await;sqlx::query("UPDATE products SET controlled_substance=1 WHERE id='test-product'").execute(&pool).await.unwrap();
      let mut sale=request(&[1]);sale.patient_name=Some("Synthetic patient".into());sale.doctor_name=Some("Synthetic doctor".into());assert!(record_sale(&pool,sale).await.is_ok());
      sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('cashier','cashier-report','x','Cashier','cashier','now','now')").execute(&pool).await.unwrap();
      let r=serde_json::from_value(serde_json::json!({"start":"2000-01-01T00:00:00Z","end":"2099-01-01T00:00:00Z","offset":0})).unwrap();assert!(crate::controlled::read(&pool,"cashier",r).await.is_err());
    }

}
