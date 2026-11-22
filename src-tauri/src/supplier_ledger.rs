use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequest {
    bank_account_id: Option<String>,
    request_id: Option<String>,
    po_id: String,
    amount_cents: i64,
    method: String,
    reference: Option<String>,
    notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentReceipt {
    id: String,
    voucher_number: String,
    amount_cents: i64,
    balance_cents: i64,
}

pub(crate) async fn record(
    pool: &Pool<Sqlite>,
    actor: &str,
    request: PaymentRequest,
) -> Result<PaymentReceipt, String> {
    if request.amount_cents <= 0 || request.amount_cents > 10_000_000_000 {
        return Err("Enter a valid payment amount".into());
    }
    if !matches!(request.method.as_str(), "cash" | "bank" | "mobile") {
        return Err("Select a valid payment method".into());
    }
    if request.reference.as_deref().unwrap_or("").len() > 100
        || request.notes.as_deref().unwrap_or("").len() > 500
    {
        return Err("Reference or notes are too long".into());
    }
    if request.bank_account_id.is_some() && request.method != "bank" {
        return Err("Only bank payments can be assigned to a bank account".into());
    }
    if let Some(id) = &request.request_id {
        Uuid::parse_str(id).map_err(|_| "Invalid payment request identifier")?;
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if !matches!(role.as_deref(), Some("admin" | "manager" | "accountant")) {
        return Err("Only managers and accountants can record supplier payments".into());
    }
    if let Some(opening) = sqlx::query("SELECT o.*,s.is_active,s.deleted_at FROM supplier_opening_outstanding o JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=?")
        .bind(&request.po_id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())? {
        let id = request.request_id.clone().ok_or("Refresh before paying an opening balance")?;
        Uuid::parse_str(&id).map_err(|_| "Invalid payment request identifier")?;
        if let Some(prior) = sqlx::query("SELECT * FROM supplier_opening_payments WHERE id=?")
            .bind(&id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())? {
            if prior.get::<String,_>("opening_id") == request.po_id && prior.get::<i64,_>("amount_cents") == request.amount_cents
                && prior.get::<String,_>("method") == request.method && prior.get::<Option<String>,_>("reference") == request.reference
                && prior.get::<Option<String>,_>("notes") == request.notes && prior.get::<String,_>("recorded_by") == actor && prior.get::<Option<String>,_>("bank_account_id") == request.bank_account_id {
                return Ok(PaymentReceipt {id,voucher_number:prior.get("voucher_number"),amount_cents:request.amount_cents,balance_cents:opening.get::<i64,_>("amount_cents")-opening.get::<i64,_>("paid_cents")});
            }
            return Err("This payment request was already used. Refresh before trying again".into());
        }
        let due = opening.get::<i64,_>("amount_cents") - opening.get::<i64,_>("paid_cents");
        if request.amount_cents > due || opening.get::<i64,_>("is_active") != 1 || opening.get::<Option<String>,_>("deleted_at").is_some() {
            return Err("Payment exceeds the opening balance or supplier is inactive".into());
        }
        if let Some(bank)=&request.bank_account_id {crate::banking::require_bank(&mut tx,bank,&chrono::Local::now().format("%Y-%m-%d").to_string()).await?;}
        let shift: Option<String> = if request.method == "cash" {
            Some(sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status='open'").fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("Open a cash drawer before paying a supplier in cash")?)
        } else {None};
        let voucher = format!("SP-{}", &Uuid::new_v4().simple().to_string()[..12].to_uppercase());
        sqlx::query("INSERT INTO supplier_opening_payments(id,voucher_number,opening_id,supplier_id,amount_cents,method,reference,notes,paid_at,recorded_by,shift_id,bank_account_id,bank_entry_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(&id).bind(&voucher).bind(&request.po_id).bind(opening.get::<String,_>("supplier_id"))
            .bind(request.amount_cents).bind(&request.method).bind(&request.reference).bind(&request.notes)
            .bind(chrono::Utc::now().to_rfc3339()).bind(actor).bind(shift).bind(&request.bank_account_id).bind(chrono::Local::now().format("%Y-%m-%d").to_string()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        tx.commit().await.map_err(|e|e.to_string())?;
        return Ok(PaymentReceipt {id,voucher_number:voucher,amount_cents:request.amount_cents,balance_cents:due-request.amount_cents});
    }
    let po =
        sqlx::query("SELECT supplier_id, status, total_amount FROM purchase_orders WHERE id = ?")
            .bind(&request.po_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("Purchase order was not found")?;
    if !matches!(
        po.get::<String, _>("status").as_str(),
        "partial" | "received"
    ) {
        return Err("Receive goods before paying this purchase order".into());
    }
    let lines = sqlx::query("SELECT quantity_ordered, quantity_received, line_total FROM purchase_order_items WHERE po_id = ?")
        .bind(&request.po_id).fetch_all(&mut *tx).await.map_err(|e| e.to_string())?;
    let ordered: f64 = lines.iter().map(|r| r.get::<f64, _>("line_total")).sum();
    let received: f64 = lines
        .iter()
        .map(|r| {
            let qty: i64 = r.get("quantity_ordered");
            if qty <= 0 {
                0.0
            } else {
                r.get::<f64, _>("line_total") * r.get::<i64, _>("quantity_received") as f64
                    / qty as f64
            }
        })
        .sum();
    let ratio = if ordered > 0.0 {
        (received / ordered).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let accrued_cents = (po.get::<f64, _>("total_amount") * ratio * 100.0).round() as i64;
    let paid_cents: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM supplier_payments WHERE po_id = ?",
    )
    .bind(&request.po_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if let Some(id) = &request.request_id {
        if let Some(prior) = sqlx::query("SELECT * FROM supplier_payments WHERE id=?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
        {
            if prior.get::<String, _>("po_id") == request.po_id
                && prior.get::<i64, _>("amount_cents") == request.amount_cents
                && prior.get::<String, _>("method") == request.method
                && prior.get::<Option<String>, _>("bank_account_id") == request.bank_account_id
                && prior.get::<Option<String>, _>("reference")
                    == request
                        .reference
                        .as_deref()
                        .map(str::trim)
                        .map(String::from)
                && prior.get::<Option<String>, _>("notes")
                    == request.notes.as_deref().map(str::trim).map(String::from)
                && prior.get::<String, _>("recorded_by") == actor
            {
                return Ok(PaymentReceipt {
                    id: id.clone(),
                    voucher_number: prior.get("voucher_number"),
                    amount_cents: request.amount_cents,
                    balance_cents: accrued_cents - paid_cents,
                });
            }
            return Err("This payment request was already used".into());
        }
    }
    if let Some(bank) = &request.bank_account_id {
        crate::banking::require_bank(
            &mut tx,
            bank,
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
        )
        .await?;
    }
    if request.amount_cents > accrued_cents - paid_cents {
        return Err(format!("Payment of Rs {:.2} exceeds the outstanding received-goods balance of Rs {:.2}. Overpayment is not allowed. Reduce the amount or receive the remaining goods first.", request.amount_cents as f64 / 100.0, (accrued_cents - paid_cents).max(0) as f64 / 100.0));
    }
    let shift_id: Option<String> = if request.method == "cash" {
        Some(
            sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status = 'open' LIMIT 1")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Open a cash drawer before paying a supplier in cash")?,
        )
    } else {
        None
    };
    let id = request
        .request_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let voucher_number = format!(
        "SP-{}",
        Uuid::new_v4().simple().to_string()[..12].to_uppercase()
    );
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO supplier_payments (id, voucher_number, supplier_id, po_id, amount_cents, method, reference, notes, paid_at, recorded_by, shift_id, bank_account_id, bank_entry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&voucher_number).bind(po.get::<String, _>("supplier_id"))
        .bind(&request.po_id).bind(request.amount_cents).bind(&request.method)
        .bind(request.reference.as_deref().map(str::trim)).bind(request.notes.as_deref().map(str::trim))
        .bind(now).bind(actor).bind(shift_id).bind(&request.bank_account_id).bind(chrono::Local::now().format("%Y-%m-%d").to_string()).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(PaymentReceipt {
        id,
        voucher_number,
        amount_cents: request.amount_cents,
        balance_cents: accrued_cents - paid_cents - request.amount_cents,
    })
}

#[tauri::command]
pub async fn record_supplier_payment(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: PaymentRequest,
) -> Result<PaymentReceipt, String> {
    record(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn payment_is_limited_to_received_goods_and_audited() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::database_api::initialize(&pool).await.unwrap();
        let actor = "00000000-0000-0000-0000-000000000001";
        sqlx::query("INSERT INTO suppliers (id, supplier_code, name, created_at, updated_at) VALUES ('sup', 'S1', 'Supplier', 'now', 'now')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO products (id, sku, name, unit_price, cost_price, created_at, updated_at) VALUES ('p', 'P1', 'Product', 10, 5, 'now', 'now')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, status, total_amount, created_by, created_at, updated_at) VALUES ('po', 'PO1', 'sup', '2026-10-29', 'partial', 100, ?, 'now', 'now')")
            .bind(actor).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO purchase_order_items (id, po_id, product_id, quantity_ordered, quantity_received, unit_cost, line_total, created_at) VALUES ('line', 'po', 'p', 10, 5, 10, 100, 'now')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cashier_shifts (id, cashier_id, opened_at, opening_cash_cents, status) VALUES ('drawer', ?, '2026-10-29', 10000, 'open')")
            .bind(actor).execute(&pool).await.unwrap();
        let request = |cents| PaymentRequest {
            bank_account_id: None,
            request_id: None,
            po_id: "po".into(),
            amount_cents: cents,
            method: "cash".into(),
            reference: None,
            notes: None,
        };
        assert!(record(&pool, actor, request(5001)).await.is_err());
        let receipt = record(&pool, actor, request(3000)).await.unwrap();
        assert_eq!(receipt.balance_cents, 2000);
        assert!(record(&pool, actor, request(2001)).await.is_err());
        let stored: i64 = sqlx::query_scalar(
            "SELECT SUM(amount_cents) FROM supplier_payments WHERE po_id = 'po'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(stored, 3000);
        let shift: String =
            sqlx::query_scalar("SELECT shift_id FROM supplier_payments WHERE po_id = 'po'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(shift, "drawer");
    }
}
