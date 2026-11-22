use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

fn number(prefix: &str) -> String {
    format!(
        "{}-{}",
        prefix,
        Uuid::new_v4().simple().to_string()[..12].to_uppercase()
    )
}
fn date(value: &str) -> Result<(), String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| "Enter a valid date".into())
}
async fn role(pool: &Pool<Sqlite>, actor: &str, finance: bool) -> Result<(), String> {
    let role: String = sqlx::query_scalar(
        "SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_one(pool)
    .await
    .map_err(|_| "Account is unavailable")?;
    if !matches!(role.as_str(), "admin" | "manager")
        && role != if finance { "accountant" } else { "cashier" }
    {
        return Err("This account cannot perform this operation".into());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryRequest {
    bank_account_id: Option<String>,
    request_id: String,
    kind: String,
    customer_id: Option<String>,
    category: String,
    description: String,
    amount_cents: i64,
    method: String,
    reference: String,
    entry_date: String,
}

pub(crate) async fn record_entry(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: EntryRequest,
) -> Result<String, String> {
    role(pool, actor, true).await?;
    date(&r.entry_date)?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid payment request identifier")?;
    if !matches!(r.kind.as_str(), "receipt" | "expense")
        || !matches!(r.method.as_str(), "cash" | "bank" | "mobile")
        || r.amount_cents <= 0
        || r.amount_cents > 10_000_000_000
        || r.description.trim().is_empty()
        || r.description.len() > 500
        || r.category.trim().is_empty()
        || r.category.len() > 80
        || r.reference.len() > 100
    {
        return Err("Enter a description, category, valid amount and payment method".into());
    }
    if r.entry_date > chrono::Local::now().format("%Y-%m-%d").to_string() {
        return Err("Payments and expenses cannot be future dated".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(prior) = sqlx::query("SELECT * FROM account_entries WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        if prior.get::<String, _>("recorded_by") == actor
            && prior.get::<String, _>("kind") == r.kind
            && prior.get::<Option<String>, _>("customer_id") == r.customer_id
            && prior.get::<i64, _>("amount_cents") == r.amount_cents
            && prior.get::<Option<String>, _>("bank_account_id") == r.bank_account_id
            && prior.get::<String, _>("method") == r.method
            && prior.get::<String, _>("category") == r.category.trim()
            && prior.get::<String, _>("description") == r.description.trim()
            && prior.get::<String, _>("reference") == r.reference.trim()
            && prior.get::<String, _>("entry_date") == r.entry_date
            && prior.get::<String, _>("status") == "posted"
        {
            return Ok(prior.get("number"));
        }
        return Err("Payment request was already used; refresh before trying again".into());
    }
    if r.kind == "expense" {
        let valid: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expense_heads WHERE name=trim(?) COLLATE NOCASE AND is_active=1 AND deleted_at IS NULL")
            .bind(&r.category).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
        if valid != 1 {
            return Err("Choose an active expense head".into());
        }
    }
    if let Some(bank) = &r.bank_account_id {
        if r.method != "bank" {
            return Err("Only bank payments can be assigned to a bank account".into());
        }
        crate::banking::require_bank(&mut tx, bank, &r.entry_date).await?;
    }
    let shift: Option<String> = if r.method == "cash" {
        Some(
            sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status='open' LIMIT 1")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Open a cash drawer before recording cash movements")?,
        )
    } else {
        None
    };
    if r.kind == "receipt" {
        let customer = r.customer_id.as_deref().ok_or("Select a customer")?;
        let changed=sqlx::query("UPDATE customers SET current_balance = ROUND(current_balance - ? / 100.0, 2), updated_at = datetime('now') WHERE id=? AND deleted_at IS NULL AND CAST(ROUND(current_balance*100) AS INTEGER)>=?").bind(r.amount_cents).bind(customer).bind(r.amount_cents).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err(
                "Receipt exceeds the customer's outstanding balance or the customer is unavailable"
                    .into(),
            );
        }
    } else if r.customer_id.is_some() {
        return Err("Expenses cannot be linked to a customer".into());
    }
    let n = number(if r.kind == "receipt" { "CR" } else { "EX" });
    sqlx::query("INSERT INTO account_entries (id,number,kind,customer_id,category,description,amount_cents,method,reference,entry_date,shift_id,recorded_by,created_at,bank_account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&r.request_id).bind(&n).bind(&r.kind).bind(&r.customer_id).bind(r.category.trim()).bind(r.description.trim()).bind(r.amount_cents).bind(r.method).bind(r.reference.trim()).bind(r.entry_date).bind(shift).bind(actor).bind(chrono::Utc::now().to_rfc3339()).bind(&r.bank_account_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    if r.kind == "receipt" {
        crate::credit::append(
            &mut tx,
            r.customer_id.as_deref().ok_or("Select customer")?,
            "payment",
            &r.request_id,
            -r.amount_cents,
            actor,
            &n,
        )
        .await?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(n)
}

#[tauri::command]
pub async fn record_account_entry(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: EntryRequest,
) -> Result<String, String> {
    record_entry(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}

pub(crate) async fn void_entry(
    pool: &Pool<Sqlite>,
    actor: &str,
    id: &str,
    reason: &str,
) -> Result<(), String> {
    role(pool, actor, true).await?;
    if reason.trim().is_empty() || reason.len() > 500 {
        return Err("Enter a reason for voiding this entry".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let r = sqlx::query("SELECT * FROM account_entries WHERE id=? AND status='posted'")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Entry is already void or unavailable")?;
    if let Some(bank) = r.get::<Option<String>, _>("bank_account_id") {
        crate::banking::period_open(&mut tx, &bank, &r.get::<String, _>("entry_date")).await?;
    }
    if let Some(shift) = r.get::<Option<String>, _>("shift_id") {
        let open: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM cashier_shifts WHERE id=? AND status='open'")
                .bind(shift)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        if open != 1 {
            return Err("Cannot void this cash voucher because its drawer is closed. Keep the voucher and ask a manager or accountant to reconcile a correction in the current period.".into());
        }
    }
    if r.get::<String, _>("kind") == "receipt" {
        sqlx::query("UPDATE customers SET current_balance=ROUND(current_balance+?/100.0,2),updated_at=datetime('now') WHERE id=?").bind(r.get::<i64,_>("amount_cents")).bind(r.get::<String,_>("customer_id")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    if r.get::<String, _>("kind") == "receipt" {
        crate::credit::append(
            &mut tx,
            &r.get::<String, _>("customer_id"),
            "void_payment",
            id,
            r.get::<i64, _>("amount_cents"),
            actor,
            reason,
        )
        .await?;
    }
    sqlx::query("UPDATE account_entries SET status='void',void_reason=?,voided_by=?,voided_at=? WHERE id=? AND status='posted'").bind(reason.trim()).bind(actor).bind(chrono::Utc::now().to_rfc3339()).bind(id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn void_account_entry(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    id: String,
    reason: String,
) -> Result<(), String> {
    void_entry(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &id,
        &reason,
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLine {
    product_id: String,
    quantity: i64,
    unit_price_cents: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRequest {
    id: Option<String>,
    kind: String,
    customer_id: Option<String>,
    customer_name: String,
    document_date: String,
    due_date: Option<String>,
    notes: String,
    items: Vec<DocumentLine>,
}

async fn save_document(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: DocumentRequest,
) -> Result<String, String> {
    role(pool, actor, false).await?;
    date(&r.document_date)?;
    if let Some(d) = &r.due_date {
        date(d)?;
        if d < &r.document_date {
            return Err("Due / validity date cannot precede the document date".into());
        }
    }
    if !matches!(r.kind.as_str(), "estimate" | "preorder")
        || r.customer_name.trim().is_empty()
        || r.customer_name.len() > 150
        || r.notes.len() > 1000
        || r.items.is_empty()
        || r.items.len() > 100
    {
        return Err("Select items and enter a customer name (maximum 100 lines)".into());
    }
    if r.kind == "preorder" && r.customer_id.is_none() {
        return Err("Select a registered customer for a pre-order".into());
    }
    let mut total = 0i64;
    let mut ids = std::collections::HashSet::new();
    for l in &r.items {
        if l.quantity < 1
            || l.quantity > 1_000_000
            || l.unit_price_cents < 0
            || l.unit_price_cents > 100_000_000
            || !ids.insert(l.product_id.clone())
        {
            return Err("Check quantities, prices and duplicate products".into());
        }
        total = total
            .checked_add(
                l.quantity
                    .checked_mul(l.unit_price_cents)
                    .ok_or("Amount is too large")?,
            )
            .ok_or("Amount is too large")?;
    }
    if total > 10_000_000_000 {
        return Err("Document total is too large".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(id) = &r.customer_id {
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM customers WHERE id=? AND is_active=1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if n != 1 {
            return Err("Customer is unavailable".into());
        }
    }
    for l in &r.items {
        let p=sqlx::query("SELECT pack_size,sell_by_loose_unit FROM products WHERE id=? AND is_active=1 AND deleted_at IS NULL").bind(&l.product_id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())?.ok_or("A selected product is unavailable")?;
        let pack = p.get::<i64, _>("pack_size");
        if pack < 1 || (p.get::<i64, _>("sell_by_loose_unit") == 0 && l.quantity % pack != 0) {
            return Err(
                "For products not sold loose, enter a whole multiple of the pack size".into(),
            );
        }
    }
    let id = r.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();
    if r.id.is_some() {
        let changed=sqlx::query("UPDATE commercial_documents SET customer_id=?,customer_name=?,document_date=?,due_date=?,notes=?,subtotal_cents=?,updated_at=? WHERE id=? AND kind=? AND status='open'").bind(&r.customer_id).bind(r.customer_name.trim()).bind(&r.document_date).bind(&r.due_date).bind(r.notes.trim()).bind(total).bind(&now).bind(&id).bind(&r.kind).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        if changed.rows_affected() != 1 {
            return Err("Document is no longer open for editing".into());
        }
        sqlx::query("DELETE FROM commercial_document_items WHERE document_id=?")
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("INSERT INTO commercial_documents (id,number,kind,customer_id,customer_name,document_date,due_date,notes,subtotal_cents,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(&id).bind(number(if r.kind=="estimate"{"EST"}else{"PRE"})).bind(&r.kind).bind(&r.customer_id).bind(r.customer_name.trim()).bind(&r.document_date).bind(&r.due_date).bind(r.notes.trim()).bind(total).bind(actor).bind(&now).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    for l in r.items {
        sqlx::query("INSERT INTO commercial_document_items (id,document_id,product_id,quantity,unit_price_cents) VALUES (?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(&id).bind(l.product_id).bind(l.quantity).bind(l.unit_price_cents).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(id)
}
#[tauri::command]
pub async fn save_commercial_document(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: DocumentRequest,
) -> Result<String, String> {
    save_document(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn cancel_commercial_document(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    id: String,
) -> Result<(), String> {
    let pool = crate::database_api::pool(&instances).await?;
    let actor = current_actor(&session).await?;
    role(&pool, &actor, false).await?;
    let result=sqlx::query("UPDATE commercial_documents SET status='cancelled',updated_at=?,notes=notes || ? WHERE id=? AND status='open'").bind(chrono::Utc::now().to_rfc3339()).bind(format!("\nCancelled by {}",actor)).bind(id).execute(&pool).await.map_err(|e|e.to_string())?;
    if result.rows_affected() != 1 {
        return Err("Document is no longer open".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests;
