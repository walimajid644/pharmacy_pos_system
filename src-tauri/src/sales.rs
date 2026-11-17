use crate::database_api::{require_matching_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};
use uuid::Uuid;

const DATABASE_KEY: &str = "sqlite:pharmacy.db";

// Legacy UUID invoice references stay intact and do not advance the numeric sequence.
const NEXT_INVOICE_NUMBER_SQL: &str = "SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)),0)+1 FROM sales_invoices WHERE invoice_number <> '' AND invoice_number NOT GLOB '*[^0-9]*'";

#[tauri::command]
pub async fn next_invoice_number(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
) -> Result<String, String> {
    let actor = crate::database_api::current_actor(&session).await?;
    let pool = crate::database_api::pool(&instances).await?;
    crate::credit::require_role(&pool, &actor, &["admin", "manager", "cashier"]).await?;
    let next: i64 = sqlx::query_scalar(NEXT_INVOICE_NUMBER_SQL)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(next.to_string())
}

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
    if !matches!(
        request.payment_method.as_str(),
        "cash" | "card" | "mobile" | "credit"
    ) {
        return Err("Invalid payment method".to_string());
    }
    if !request.order_discount.is_finite() || request.order_discount < 0.0 {
        return Err("Invalid order discount".to_string());
    }
    if request
        .notes
        .as_deref()
        .is_some_and(|value| value.chars().count() > 500)
    {
        return Err("Sale remarks must be at most 500 characters".into());
    }
    if request
        .received_amount
        .is_some_and(|value| !value.is_finite() || value < 0.0)
    {
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

    if request
        .prescription_note
        .as_deref()
        .is_some_and(|v| v.chars().count() > 500)
    {
        return Err("Prescription note must be at most 500 characters".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let shift_id: String = sqlx::query_scalar(
        "SELECT id FROM cashier_shifts WHERE cashier_id = ? AND status = 'open'",
    )
    .bind(&request.cashier_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Open your shift before completing a sale")?;
    for name in [&request.patient_name, &request.doctor_name] {
        if name
            .as_deref()
            .is_some_and(|value| value.trim().len() > 100)
        {
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

    if request.payment_method == "credit" && request.customer_id.is_none() {
        return Err("Credit / Udhar requires a registered customer".into());
    }
    let mut wholesale = false;
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
        wholesale = customer.get::<String, _>("customer_type") == "wholesale";
    }

    let mut priced: Vec<PricedItem> = Vec::with_capacity(request.items.len());
    let mut subtotal = 0.0;
    for item in &request.items {
        if item.quantity <= 0
            || item.bonus_quantity < 0
            || !item.discount_percent.is_finite()
            || !(0.0..=100.0).contains(&item.discount_percent)
        {
            return Err("Invalid sale quantity or discount".to_string());
        }
        let unallocated = item.batch_id == format!("unallocated-stock:{}", item.product_id);
        if unallocated {
            // No invented receipt or expiry: this row is only an unallocated stock balance.
            sqlx::query(
                "INSERT INTO product_batches (id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) \
                 SELECT ?,id,'Unallocated stock','',0,cost_price,'',?,? FROM products WHERE id=? AND is_active=1 AND deleted_at IS NULL \
                 ON CONFLICT(id) DO NOTHING",
            )
            .bind(&item.batch_id).bind(&request.timestamp).bind(&request.timestamp).bind(&item.product_id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
        let row = sqlx::query(
            "SELECT p.unit_price, p.wholesale_price, p.pack_size, p.sell_by_loose_unit, p.controlled_substance, b.cost_price_at_batch, \
             b.quantity_in_stock, b.loose_open_remaining, CASE WHEN b.id='unallocated-stock:'||p.id THEN 0 ELSE b.expiry_date < date('now', 'localtime') END AS expired, (SELECT COALESCE(SUM(h.quantity),0) FROM batch_holds h WHERE h.batch_id=b.id AND h.status='held') AS held \
             FROM products p JOIN product_batches b ON b.product_id = p.id \
             WHERE p.id = ? AND b.id = ? AND p.is_active = 1 AND p.deleted_at IS NULL",
        )
        .bind(&item.product_id)
        .bind(&item.batch_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("A product or batch is no longer available")?;

        if row.get::<i64, _>("controlled_substance") == 1
            && !(request
                .patient_name
                .as_deref()
                .is_some_and(|v| !v.trim().is_empty())
                && request
                    .doctor_name
                    .as_deref()
                    .is_some_and(|v| !v.trim().is_empty()))
            && !request
                .prescription_note
                .as_deref()
                .is_some_and(|v| !v.trim().is_empty())
        {
            return Err("Controlled product requires both patient and doctor names, or a prescription note/reference".into());
        }
        if row.get::<i64, _>("expired") != 0 {
            return Err("An item has expired".to_string());
        }
        if item.is_loose_sale && row.get::<i64, _>("sell_by_loose_unit") == 0 {
            return Err("This product cannot be sold as a loose unit".to_string());
        }
        let pack_size: i64 = row.get("pack_size");
        let charged_units = item
            .quantity
            .checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units > 0)
            .ok_or("Invalid sale quantity")?;
        let bonus_units = item
            .bonus_quantity
            .checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units >= 0)
            .ok_or("Invalid bonus quantity")?;
        let units = item
            .quantity
            .checked_add(item.bonus_quantity)
            .ok_or("Invalid total quantity")?
            .checked_mul(if item.is_loose_sale { 1 } else { pack_size })
            .filter(|units| *units > 0)
            .ok_or("Invalid sale quantity")?;
        let already_reserved: i64 = priced
            .iter()
            .filter(|prior| prior.batch_id == item.batch_id)
            .map(|prior| prior.units)
            .sum();
        let available = row
            .get::<i64, _>("quantity_in_stock")
            .checked_sub(already_reserved)
            .ok_or("Invalid stock balance")?;
        available
            .checked_sub(units)
            .ok_or("Stock balance is too small")?;
        if units > available && row.get::<i64, _>("held") > 0 {
            return Err("Quarantined batch stock cannot be sold".into());
        }
        let first_available: Vec<(String, i64)> = sqlx::query_as(
            "SELECT id, quantity_in_stock FROM product_batches WHERE product_id = ? AND quantity_in_stock > 0 AND expiry_date >= date('now', 'localtime') ORDER BY expiry_date, id",
        ).bind(&item.product_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
        let earliest = first_available.iter().find(|(id, quantity)| {
            let used: i64 = priced
                .iter()
                .filter(|prior| &prior.batch_id == id)
                .map(|prior| prior.units)
                .sum();
            quantity - used > 0
        });
        if earliest.is_some_and(|(id, _)| id != &item.batch_id) {
            return Err("Sell the earliest-expiring batch first".into());
        }
        let open_before = priced
            .iter()
            .rev()
            .find(|prior| prior.batch_id == item.batch_id)
            .map(|prior| prior.loose_remaining_after)
            .unwrap_or(row.get::<i64, _>("loose_open_remaining"));
        // Strip events describe only recorded physical units, never the negative balance.
        let physical_units = units.min(available.max(0));
        let open_before = open_before.min(available.max(0));
        let (strips_opened, loose_remaining_after) =
            if item.is_loose_sale && pack_size > 1 && !unallocated {
                if physical_units <= open_before {
                    (0, open_before - physical_units)
                } else {
                    let needed = physical_units - open_before;
                    let strips = (needed + pack_size - 1) / pack_size;
                    if !item.confirm_break {
                        return Err("Confirm the batch before opening a new strip".into());
                    }
                    let leftover = (strips * pack_size - needed).min((available - units).max(0));
                    (strips, leftover)
                }
            } else {
                (0, open_before.min((available - units).max(0)))
            };
        let unit_price: f64 = if wholesale {
            row.get::<Option<f64>, _>("wholesale_price")
                .unwrap_or(row.get("unit_price"))
        } else {
            row.get("unit_price")
        };
        if !unit_price.is_finite() || unit_price < 0.0 {
            return Err("Invalid product price".into());
        }
        let cost_price: f64 = row.get("cost_price_at_batch");
        if !cost_price.is_finite() || cost_price < 0.0 {
            return Err("Invalid batch cost".into());
        }
        let line_total =
            money(unit_price * charged_units as f64 * (1.0 - item.discount_percent / 100.0));
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
    } else if request.payment_method == "credit" {
        0.0
    } else {
        net_amount
    };
    if !received_amount.is_finite() {
        return Err("Invalid received amount".into());
    }
    if request.payment_method != "credit" && received_amount < net_amount {
        return Err("Cash received is less than the sale total".into());
    }
    let change_amount = if request.payment_method == "credit" {
        0.0
    } else {
        money(received_amount - net_amount)
    };
    if money(request.expected_subtotal) != subtotal
        || money(request.expected_tax_amount) != tax_amount
        || money(request.expected_net_amount) != net_amount
    {
        return Err("Sale total changed; refresh the cart before checkout".to_string());
    }
    let invoice_id = Uuid::new_v4().to_string();
    // Allocate within the sale transaction, so cancelled/failed sales consume no number.
    let next: i64 = sqlx::query_scalar(NEXT_INVOICE_NUMBER_SQL)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let invoice_number = next.to_string();

    if request.payment_method == "credit" {
        let id = request
            .customer_id
            .as_deref()
            .ok_or("Select a registered customer")?;
        let changed=sqlx::query("UPDATE customers SET current_balance=ROUND(current_balance+?,2),updated_at=? WHERE id=? AND is_active=1 AND deleted_at IS NULL AND CAST(ROUND(current_balance*100) AS INTEGER)+?<=CAST(ROUND(credit_limit*100) AS INTEGER)").bind(net_amount).bind(&request.timestamp).bind(id).bind((net_amount*100.0).round() as i64).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("Credit limit exceeded or customer unavailable. Collect a payment or ask a manager to review the limit.".into());
        }
        crate::credit::append(
            &mut tx,
            id,
            "credit_sale",
            &invoice_id,
            (net_amount * 100.0).round() as i64,
            &request.cashier_id,
            &invoice_number,
        )
        .await?;
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

    if let Some(source) = &request.source_document_id {
        let doc=sqlx::query("SELECT customer_id,kind,due_date FROM commercial_documents WHERE id=? AND status='open'").bind(source).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("Source estimate or pre-order is no longer open")?;
        if doc.get::<Option<String>, _>("customer_id") != request.customer_id {
            return Err("The sale customer must match the source document".into());
        }
        if doc.get::<String, _>("kind") == "estimate" {
            if let Some(due) = doc.get::<Option<String>, _>("due_date") {
                if due < chrono::Local::now().format("%Y-%m-%d").to_string() {
                    return Err(
                        "Estimate has expired; update its validity date before checkout".into(),
                    );
                }
            }
        }
        let source_lines = sqlx::query(
            "SELECT product_id,quantity FROM commercial_document_items WHERE document_id=?",
        )
        .bind(source)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        let mut units = std::collections::HashMap::<String, i64>::new();
        for line in &priced {
            *units.entry(line.product_id.clone()).or_default() += line.units;
        }
        if units.len() != source_lines.len()
            || source_lines.iter().any(|l| {
                units.get(&l.get::<String, _>("product_id")).copied()
                    != Some(l.get::<i64, _>("quantity"))
            })
        {
            return Err(
                "Sale quantities must match the source document; edit the document first".into(),
            );
        }
        let changed=sqlx::query("UPDATE commercial_documents SET status='converted',invoice_id=?,updated_at=? WHERE id=? AND status='open'").bind(&invoice_id).bind(&request.timestamp).bind(source).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("Source document was already converted".into());
        }
    }

    for item in priced {
        let stock_change = sqlx::query(
            "UPDATE product_batches SET quantity_in_stock = quantity_in_stock - ?, loose_open_remaining = ?, updated_at = ? \
             WHERE id = ? AND (expiry_date >= date('now', 'localtime') OR id='unallocated-stock:'||product_id)",
        )
        .bind(item.units)
        .bind(item.loose_remaining_after)
        .bind(&request.timestamp)
        .bind(&item.batch_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if stock_change.rows_affected() != 1 {
            return Err("Unavailable or expired batch".to_string());
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
    let controlled_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sales_invoice_items WHERE invoice_id=? AND controlled_snapshot=1",
    )
    .bind(&invoice_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if controlled_count > 0 {
        sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,'controlled_sale',?,?,'sales_invoice',?,?,?)").bind(Uuid::new_v4().to_string()).bind(&request.cashier_id).bind(&request.timestamp).bind(&invoice_id).bind(&invoice_number).bind(format!("{controlled_count} controlled sale lines; prescription evidence saved on invoice")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
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
mod tests;
