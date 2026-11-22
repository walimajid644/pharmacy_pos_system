use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Pool, Row, Sqlite, Transaction};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

async fn finance(pool: &Pool<Sqlite>, actor: &str) -> Result<(), String> {
    crate::credit::require_role(pool, actor, &["admin", "manager", "accountant"])
        .await
        .map(|_| ())
}
pub(crate) fn date(value: &str) -> Result<(), String> {
    let d =
        chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Enter a valid date")?;
    if d.to_string() != value || d > chrono::Local::now().date_naive() {
        return Err("Enter a date no later than today".into());
    }
    Ok(())
}
pub(crate) async fn period_open(
    tx: &mut Transaction<'_, Sqlite>,
    account: &str,
    day: &str,
) -> Result<(), String> {
    let closed: Option<String> = sqlx::query_scalar(
        "SELECT MAX(statement_date) FROM bank_reconciliations WHERE account_id=?",
    )
    .bind(account)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    if closed.as_deref().is_some_and(|last| day <= last) {
        return Err(
            "This bank period is reconciled. Record a correction in the current period".into(),
        );
    }
    Ok(())
}
pub(crate) async fn require_bank(
    tx: &mut Transaction<'_, Sqlite>,
    account: &str,
    day: &str,
) -> Result<(), String> {
    let active: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bank_accounts WHERE id=? AND is_active=1 AND deleted_at IS NULL",
    )
    .bind(account)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    if active != 1 {
        return Err("Choose an active bank account".into());
    }
    period_open(tx, account, day).await?;
    let opening: Option<String> = sqlx::query_scalar(
        "SELECT entry_date FROM opening_balances WHERE kind='bank' AND entity_id=?",
    )
    .bind(account)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    if opening.as_deref().is_some_and(|start| day < start) {
        return Err("Bank entries cannot predate the opening balance".into());
    }
    Ok(())
}
fn details(cents: i64, reference: &str, notes: &str) -> Result<(), String> {
    if !(1..=10_000_000_000).contains(&cents)
        || reference.trim().is_empty()
        || reference.chars().count() > 100
        || notes.chars().count() > 500
        || reference.chars().any(char::is_control)
    {
        return Err("Enter a positive amount, a reference (up to 100 characters), and notes up to 500 characters".into());
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BankRequest {
    request_id: String,
    kind: String,
    account_id: String,
    to_account_id: Option<String>,
    amount_cents: i64,
    entry_date: String,
    reference: String,
    notes: String,
    cash_drawer: bool,
}
async fn record_bank(pool: &Pool<Sqlite>, actor: &str, r: BankRequest) -> Result<String, String> {
    finance(pool, actor).await?;
    date(&r.entry_date)?;
    details(r.amount_cents, &r.reference, &r.notes)?;
    let request_uuid =
        Uuid::parse_str(&r.request_id).map_err(|_| "Invalid transaction request identifier")?;
    if !matches!(r.kind.as_str(), "deposit" | "withdrawal" | "transfer")
        || (r.kind == "transfer"
            && (r.to_account_id.is_none()
                || r.to_account_id.as_deref() == Some(&r.account_id)
                || r.cash_drawer))
        || (r.kind != "transfer" && r.to_account_id.is_some())
    {
        return Err("Choose valid accounts and a movement type".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(old) = sqlx::query("SELECT * FROM bank_transactions WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        if old.get::<String, _>("kind") == r.kind
            && old.get::<String, _>("account_id") == r.account_id
            && old.get::<Option<String>, _>("to_account_id") == r.to_account_id
            && old.get::<i64, _>("amount_cents") == r.amount_cents
            && old.get::<String, _>("entry_date") == r.entry_date
            && old.get::<String, _>("reference") == r.reference.trim()
            && old.get::<String, _>("notes") == r.notes.trim()
            && old.get::<Option<String>, _>("shift_id").is_some() == r.cash_drawer
            && old.get::<String, _>("recorded_by") == actor
            && old.get::<String, _>("status") == "posted"
        {
            return Ok(old.get("number"));
        }
        return Err("This bank request was already used. Refresh before trying again".into());
    }
    require_bank(&mut tx, &r.account_id, &r.entry_date).await?;
    if let Some(target) = &r.to_account_id {
        require_bank(&mut tx, target, &r.entry_date).await?;
    }
    let shift: Option<String> = if r.cash_drawer {
        Some(
            sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status='open'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Open a cash drawer before moving drawer cash")?,
        )
    } else {
        None
    };
    let number = format!(
        "BT-{}",
        request_uuid.simple().to_string()[..12].to_uppercase()
    );
    sqlx::query("INSERT INTO bank_transactions(id,number,kind,account_id,to_account_id,amount_cents,entry_date,reference,notes,shift_id,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&r.request_id).bind(&number).bind(&r.kind).bind(&r.account_id).bind(&r.to_account_id).bind(r.amount_cents).bind(&r.entry_date).bind(r.reference.trim()).bind(r.notes.trim()).bind(shift).bind(actor).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(number)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncomeRequest {
    request_id: String,
    head_id: String,
    description: String,
    amount_cents: i64,
    method: String,
    bank_account_id: Option<String>,
    entry_date: String,
    reference: String,
}
async fn record_income(
    pool: &Pool<Sqlite>,
    actor: &str,
    r: IncomeRequest,
) -> Result<String, String> {
    finance(pool, actor).await?;
    date(&r.entry_date)?;
    details(r.amount_cents, &r.reference, &r.description)?;
    let request_uuid =
        Uuid::parse_str(&r.request_id).map_err(|_| "Invalid income request identifier")?;
    if r.description.trim().is_empty()
        || !matches!(r.method.as_str(), "cash" | "bank" | "mobile")
        || (r.method == "bank") != r.bank_account_id.is_some()
    {
        return Err(
            "Enter an income description, method and the bank account for bank income".into(),
        );
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(old) = sqlx::query("SELECT * FROM income_entries WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        if old.get::<String, _>("head_id") == r.head_id
            && old.get::<String, _>("description") == r.description.trim()
            && old.get::<i64, _>("amount_cents") == r.amount_cents
            && old.get::<String, _>("method") == r.method
            && old.get::<Option<String>, _>("bank_account_id") == r.bank_account_id
            && old.get::<String, _>("entry_date") == r.entry_date
            && old.get::<String, _>("reference") == r.reference.trim()
            && old.get::<String, _>("recorded_by") == actor
            && old.get::<String, _>("status") == "posted"
        {
            return Ok(old.get("number"));
        }
        return Err("This income request was already used. Refresh before trying again".into());
    }
    let head: String = sqlx::query_scalar(
        "SELECT name FROM income_heads WHERE id=? AND is_active=1 AND deleted_at IS NULL",
    )
    .bind(&r.head_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Choose an active income head")?;
    if let Some(bank) = &r.bank_account_id {
        require_bank(&mut tx, bank, &r.entry_date).await?;
    }
    let shift: Option<String> = if r.method == "cash" {
        Some(
            sqlx::query_scalar("SELECT id FROM cashier_shifts WHERE status='open'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or("Open a cash drawer before recording cash income")?,
        )
    } else {
        None
    };
    let number = format!(
        "IN-{}",
        request_uuid.simple().to_string()[..12].to_uppercase()
    );
    sqlx::query("INSERT INTO income_entries(id,number,head_id,head_name,description,amount_cents,method,bank_account_id,entry_date,reference,shift_id,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&r.request_id).bind(&number).bind(&r.head_id).bind(head).bind(r.description.trim()).bind(r.amount_cents).bind(&r.method).bind(&r.bank_account_id).bind(&r.entry_date).bind(r.reference.trim()).bind(shift).bind(actor).bind(chrono::Utc::now().to_rfc3339()).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(number)
}
async fn void_posting(
    pool: &Pool<Sqlite>,
    actor: &str,
    source: &str,
    id: &str,
    reason: &str,
) -> Result<(), String> {
    finance(pool, actor).await?;
    if reason.trim().is_empty() || reason.chars().count() > 500 {
        return Err("Enter a void reason up to 500 characters".into());
    }
    let table = match source {
        "bank" => "bank_transactions",
        "income" => "income_entries",
        _ => return Err("Open the original voucher to void this entry".into()),
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let old = sqlx::query(&format!("SELECT * FROM {table} WHERE id=?"))
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Entry was not found")?;
    if old.get::<String, _>("status") == "void" {
        return Ok(());
    }
    if let Some(shift) = old.get::<Option<String>, _>("shift_id") {
        let n: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM cashier_shifts WHERE id=? AND status='open'")
                .bind(shift)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        if n != 1 {
            return Err("The drawer is closed. Record a correction in the current period".into());
        }
    }
    let banks =
        sqlx::query("SELECT account_id,entry_date FROM bank_ledger WHERE source=? AND source_id=?")
            .bind(source)
            .bind(id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    for row in banks {
        period_open(
            &mut tx,
            &row.get::<String, _>("account_id"),
            &row.get::<String, _>("entry_date"),
        )
        .await?;
    }
    sqlx::query(&format!("UPDATE {table} SET status='void',void_reason=?,voided_by=?,voided_at=? WHERE id=? AND status='posted'"))
        .bind(reason.trim()).bind(actor).bind(chrono::Utc::now().to_rfc3339()).bind(id).execute(&mut *tx).await.map_err(|_|"Reconciled entries cannot be voided")?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
async fn statement(
    pool: &Pool<Sqlite>,
    actor: &str,
    account: &str,
    from: &str,
    to: &str,
) -> Result<Value, String> {
    finance(pool, actor).await?;
    date(to)?;
    if !from.is_empty() {
        date(from)?;
        if from > to {
            return Err("From date must be no later than to date".into());
        }
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let accounts=crate::database_api::json_rows(sqlx::query("SELECT id,name,is_active FROM bank_accounts WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    let rows=crate::database_api::json_rows(sqlx::query("SELECT l.*,CASE WHEN l.source='opening' OR c.entry_key IS NOT NULL THEN 1 ELSE 0 END AS cleared FROM bank_ledger l LEFT JOIN bank_clearances c ON c.entry_key=l.entry_key WHERE l.account_id=? AND l.entry_date>=? AND l.entry_date<=? ORDER BY l.entry_date,CASE WHEN l.source='opening' THEN 0 ELSE 1 END,l.entry_key LIMIT 2001").bind(account).bind(from).bind(to).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    let totals=sqlx::query("SELECT COALESCE(SUM(CASE WHEN entry_date<? THEN amount_cents ELSE 0 END),0) AS before_cents,COALESCE(SUM(amount_cents),0) AS closing_cents,COALESCE(SUM(CASE WHEN source='opening' OR EXISTS(SELECT 1 FROM bank_clearances c WHERE c.entry_key=l.entry_key) THEN amount_cents ELSE 0 END),0) AS cleared_cents FROM bank_ledger l WHERE l.account_id=? AND l.entry_date<=?").bind(from).bind(account).bind(to).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
    let unassigned=crate::database_api::json_rows(sqlx::query("SELECT * FROM unassigned_bank_entries WHERE entry_date<=? ORDER BY entry_date,id LIMIT 201").bind(to).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    let reconciliations=crate::database_api::json_rows(sqlx::query("SELECT * FROM bank_reconciliations WHERE account_id=? ORDER BY statement_date DESC LIMIT 30").bind(account).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?)?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(
        json!({"accounts":accounts,"entries":rows.iter().take(2000).collect::<Vec<_>>(),"truncated":rows.len()>2000,"beforeCents":totals.get::<i64,_>("before_cents"),"closingCents":totals.get::<i64,_>("closing_cents"),"clearedCents":totals.get::<i64,_>("cleared_cents"),"unassigned":unassigned.iter().take(200).collect::<Vec<_>>(),"unassignedTruncated":unassigned.len()>200,"reconciliations":reconciliations}),
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReconcileRequest {
    request_id: String,
    account_id: String,
    statement_date: String,
    statement_balance_cents: i64,
    reference: String,
    entry_keys: Vec<String>,
}
async fn reconcile(pool: &Pool<Sqlite>, actor: &str, r: ReconcileRequest) -> Result<(), String> {
    finance(pool, actor).await?;
    date(&r.statement_date)?;
    Uuid::parse_str(&r.request_id).map_err(|_| "Invalid reconciliation request identifier")?;
    if r.reference.trim().is_empty()
        || r.reference.chars().count() > 100
        || r.entry_keys.len() > 5000
        || !(-1_000_000_000_000..=1_000_000_000_000).contains(&r.statement_balance_cents)
    {
        return Err("Check statement reference, balance and selected entries".into());
    }
    let mut keys = r.entry_keys.clone();
    keys.sort();
    keys.dedup();
    if keys.len() != r.entry_keys.len() {
        return Err("An entry was selected more than once".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    if let Some(old) = sqlx::query("SELECT * FROM bank_reconciliations WHERE id=?")
        .bind(&r.request_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    {
        let saved: Vec<String> = sqlx::query_scalar(
            "SELECT entry_key FROM bank_clearances WHERE reconciliation_id=? ORDER BY entry_key",
        )
        .bind(&r.request_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        if old.get::<String, _>("account_id") == r.account_id
            && old.get::<String, _>("statement_date") == r.statement_date
            && old.get::<i64, _>("statement_balance_cents") == r.statement_balance_cents
            && old.get::<String, _>("reference") == r.reference.trim()
            && old.get::<String, _>("recorded_by") == actor
            && saved == keys
        {
            return Ok(());
        }
        return Err("This reconciliation request was already used".into());
    }
    require_bank(&mut tx, &r.account_id, &r.statement_date).await?;
    let rows=sqlx::query("SELECT l.*,CASE WHEN l.source='opening' OR c.entry_key IS NOT NULL THEN 1 ELSE 0 END AS cleared FROM bank_ledger l LEFT JOIN bank_clearances c ON c.entry_key=l.entry_key WHERE l.account_id=? AND l.entry_date<=?").bind(&r.account_id).bind(&r.statement_date).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
    let mut cleared = 0i64;
    let mut book = 0i64;
    let mut found = 0usize;
    for row in &rows {
        let amount = row.get::<i64, _>("amount_cents");
        book += amount;
        let is_cleared = row.get::<i64, _>("cleared") == 1;
        let selected = keys
            .binary_search(&row.get::<String, _>("entry_key"))
            .is_ok();
        if selected {
            if is_cleared {
                return Err("An entry is already cleared. Refresh the statement".into());
            }
            found += 1;
        }
        if is_cleared || selected {
            cleared += amount;
        }
    }
    if found != keys.len() {
        return Err("A selected entry changed or is outside this account/date. Refresh".into());
    }
    if cleared != r.statement_balance_cents {
        return Err(format!(
            "Statement difference is Rs {:.2}. Check the balance and cleared entries",
            (r.statement_balance_cents - cleared) as f64 / 100.0
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO bank_reconciliations(id,account_id,statement_date,statement_balance_cents,book_balance_cents,reference,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(&r.request_id).bind(&r.account_id).bind(&r.statement_date).bind(r.statement_balance_cents).bind(book).bind(r.reference.trim()).bind(actor).bind(&now).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    for row in rows {
        let key = row.get::<String, _>("entry_key");
        if keys.binary_search(&key).is_ok() {
            sqlx::query("INSERT INTO bank_clearances(entry_key,reconciliation_id,account_id,amount_cents) VALUES(?,?,?,?)").bind(key).bind(&r.request_id).bind(&r.account_id).bind(row.get::<i64,_>("amount_cents")).execute(&mut *tx).await.map_err(|e|e.to_string())?;
        }
    }
    sqlx::query("INSERT INTO audit_events VALUES(?,'bank_reconciled',?,?,'bank_account',?,?,?,0)")
        .bind(Uuid::new_v4().to_string())
        .bind(actor)
        .bind(now)
        .bind(&r.account_id)
        .bind(r.reference.trim())
        .bind(format!(
            "As of {}; statement cents={}; book cents={book}",
            r.statement_date, r.statement_balance_cents
        ))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
async fn assign(
    pool: &Pool<Sqlite>,
    actor: &str,
    source: &str,
    id: &str,
    account: &str,
) -> Result<(), String> {
    finance(pool, actor).await?;
    let table = match source {
        "account" => "account_entries",
        "supplier" => "supplier_payments",
        "supplier_opening" => "supplier_opening_payments",
        _ => return Err("Invalid bank voucher source".into()),
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let day: Option<String> = sqlx::query_scalar(
        "SELECT entry_date FROM unassigned_bank_entries WHERE source=? AND id=?",
    )
    .bind(source)
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let Some(day) = day else {
        let assigned: Option<String> =
            sqlx::query_scalar(&format!("SELECT bank_account_id FROM {table} WHERE id=?"))
                .bind(id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .flatten();
        if assigned.as_deref() == Some(account) {
            return Ok(());
        }
        return Err("This voucher is already assigned or unavailable".into());
    };
    require_bank(&mut tx, account, &day).await?;
    sqlx::query(&format!("UPDATE {table} SET bank_account_id=? WHERE id=? AND bank_account_id IS NULL AND method='bank'"))
        .bind(account).bind(id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    sqlx::query(
        "INSERT INTO audit_events VALUES(?,'bank_voucher_assigned',?,?,'bank_account',?,?,?,0)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(actor)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(account)
    .bind(id)
    .bind(source)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn record_bank_transaction(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: BankRequest,
) -> Result<String, String> {
    record_bank(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn record_income_entry(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: IncomeRequest,
) -> Result<String, String> {
    record_income(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn void_finance_posting(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    source: String,
    id: String,
    reason: String,
) -> Result<(), String> {
    void_posting(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &source,
        &id,
        &reason,
    )
    .await
}
#[tauri::command]
pub async fn bank_statement(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    account_id: String,
    from_date: String,
    to_date: String,
) -> Result<Value, String> {
    statement(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &account_id,
        &from_date,
        &to_date,
    )
    .await
}
#[tauri::command]
pub async fn reconcile_bank_statement(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: ReconcileRequest,
) -> Result<(), String> {
    reconcile(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
#[tauri::command]
pub async fn assign_bank_voucher(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    source: String,
    id: String,
    account_id: String,
) -> Result<(), String> {
    assign(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &source,
        &id,
        &account_id,
    )
    .await
}
#[cfg(test)]
#[path = "banking_tests.rs"]
mod tests;
