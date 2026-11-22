use crate::database_api::{current_actor, SessionState};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Pool, Row, Sqlite};
use std::collections::{HashMap, HashSet};
use tauri::{Manager, State};
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

const A: u8 = 1;
const M: u8 = 2;
const C: u8 = 4;
const F: u8 = 8;
// Existing roles remain the maximum authority. Per-user overrides can restrict them.
pub const CATALOG: &[(&str, &str, u8)] = &[
    ("catalog.read", "View items and stock", A | M | C | F),
    ("catalog.write", "Add/edit products", A | M),
    ("catalog.import", "Import and bulk catalog setup", A | M),
    ("registers.manage", "Manage registers", A | M),
    (
        "customers.read",
        "View customers and balances",
        A | M | C | F,
    ),
    ("customers.write", "Add/edit customers", A | M | C),
    ("suppliers.write", "Add/edit suppliers", A | M),
    ("sales.create", "Complete sales", A | M | C),
    ("sales.history", "View sales history", A | M | F),
    (
        "sales.receipts",
        "Recover/print own saved sales",
        A | M | C | F,
    ),
    ("sales.returns", "Create sales returns", A | M),
    ("sales.approve_returns", "Approve/refund returns", A | M),
    (
        "purchases.read",
        "View purchases and supplier balances",
        A | M | F,
    ),
    (
        "purchases.write",
        "Create/edit/cancel purchase orders",
        A | M,
    ),
    ("purchases.receive", "Receive purchases", A | M),
    ("stock.adjust", "Request stock adjustments", A | M),
    ("stock.approve", "Approve stock adjustments", A | M),
    ("stock.batches", "Add product batches", A | M),
    (
        "stock.quarantine",
        "Quarantine and resolve held stock",
        A | M,
    ),
    ("documents.write", "Estimates and sale orders", A | M | C),
    ("finance.view", "View receipts/expenses", A | M | F),
    ("finance.receipts", "Collect customer balances", A | M | F),
    ("finance.expenses", "Record expenses", A | M | F),
    ("finance.void", "Void receipts/expenses", A | M | F),
    ("supplier.pay", "Pay suppliers", A | M | F),
    ("banking.view", "View bank statements", A | M | F),
    ("banking.post", "Post bank movements", A | M | F),
    ("banking.assign", "Assign old bank vouchers", A | M | F),
    ("banking.reconcile", "Reconcile bank statements", A | M | F),
    ("banking.void", "Void bank movements", A | M | F),
    ("income.view", "View income vouchers", A | M | F),
    ("income.post", "Record non-sales income", A | M | F),
    ("income.void", "Void income vouchers", A | M | F),
    ("opening.write", "Record opening balances", A | M),
    ("shifts.open", "Open cash drawer", A | M | C),
    ("shifts.close", "Close cash drawer", A | M | C),
    ("reports.view", "View reports and analysis", A | M | F),
    ("reports.close", "Record daily sales closing", A | M),
    ("audit.view", "View audit history", A | M),
    ("settings.manage", "Change business settings", A | M),
    ("backup.export", "Export full database backups", A | M),
    ("backup.restore", "Restore database", A),
    ("security.history", "View login history", A | M),
    ("users.manage", "Manage users and permissions", A),
];
fn mask(role: &str) -> u8 {
    match role {
        "admin" => A,
        "manager" => M,
        "cashier" => C,
        "accountant" => F,
        _ => 0,
    }
}
pub(crate) async fn effective(pool: &Pool<Sqlite>, actor: &str) -> Result<Vec<String>, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let role: String = sqlx::query_scalar(
        "SELECT role FROM users WHERE id=? AND is_active=1 AND deleted_at IS NULL",
    )
    .bind(actor)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Account is unavailable. Sign in again")?;
    let overrides: HashMap<String, i64> =
        sqlx::query("SELECT permission,allowed FROM user_permissions WHERE user_id=?")
            .bind(actor)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|r| (r.get("permission"), r.get("allowed")))
            .collect();
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(CATALOG
        .iter()
        .filter(|(key, _, roles)| {
            mask(&role) & roles != 0 && (role == "admin" || overrides.get(*key) != Some(&0))
        })
        .map(|(key, _, _)| key.to_string())
        .collect())
}
pub(crate) async fn require(
    pool: &Pool<Sqlite>,
    actor: &str,
    permission: &str,
) -> Result<(), String> {
    if effective(pool, actor)
        .await?
        .iter()
        .any(|p| p == permission)
    {
        Ok(())
    } else {
        Err(format!(
            "Permission denied: {permission}. Ask an administrator to review your user rights"
        ))
    }
}
pub(crate) async fn authorize_query(
    pool: &Pool<Sqlite>,
    actor: &str,
    q: &str,
) -> Result<(), String> {
    let allowed = effective(pool, actor).await?;
    for (tables, permission) in [
        (
            &["user_permissions", "user_access_revisions"][..],
            "users.manage",
        ),
        (&["login_events"][..], "security.history"),
        (
            &[
                "products",
                "product_batches",
                "categories",
                "manufacturers",
                "shelf_locations",
            ][..],
            "catalog.read",
        ),
        (&["customer_ledger", "customers"][..], "customers.read"),
        (
            &["sales_invoices", "sales_invoice_items"][..],
            "sales.history",
        ),
        (
            &[
                "bank_ledger",
                "bank_transactions",
                "bank_accounts",
                "bank_reconciliations",
                "bank_clearances",
                "unassigned_bank_entries",
            ][..],
            "banking.view",
        ),
        (&["income_entries"][..], "income.view"),
        (&["account_entries"][..], "finance.view"),
        (
            &[
                "purchase_orders",
                "purchase_order_items",
                "supplier_payments",
                "supplier_opening_payments",
                "supplier_opening_outstanding",
            ][..],
            "purchases.read",
        ),
        (&["audit_events"][..], "audit.view"),
        (
            &["commercial_documents", "commercial_document_items"][..],
            "documents.write",
        ),
    ] {
        if tables.iter().any(|name| q.contains(name)) {
            if !allowed.iter().any(|key| key == permission) {
                return Err(format!("Permission denied: {permission}. Ask an administrator to review your user rights"));
            }
        }
    }
    Ok(())
}
fn permission(command: &str, p: &Value) -> Result<Option<&'static str>, String> {
    Ok(Some(match command {
        "record_diagnostic"
        | "login_user"
        | "logout_user"
        | "touch_session"
        | "change_password"
        | "current_permissions"
        | "database_select"
        | "database_execute"
        | "restart_for_restore"
        | "restore_status" => return Ok(None),
        "checkout_sale" | "next_invoice_number" => "sales.create",
        "saved_sale" | "open_whatsapp_receipt" => "sales.receipts",
        "save_customer" | "archive_customer" => "customers.write",
        "customer_statement" => "customers.read",
        "read_audit_log" => "audit.view",
        "controlled_sales_report" | "cashier_performance" => "reports.view",
        "validate_fbr_sandbox" => "settings.manage",
        "preview_catalog_import" | "import_catalog" | "bulk_update_catalog" => "catalog.import",
        "list_catalog_register" | "save_catalog_register" => "registers.manage",
        "record_opening_balance" => "opening.write",
        "record_bank_transaction" => "banking.post",
        "bank_statement" => "banking.view",
        "reconcile_bank_statement" => "banking.reconcile",
        "assign_bank_voucher" => "banking.assign",
        "record_income_entry" => "income.post",
        "void_finance_posting" => {
            if p["source"] == "income" {
                "income.void"
            } else {
                "banking.void"
            }
        }
        "record_account_entry" => {
            if p["request"]["kind"] == "expense" {
                "finance.expenses"
            } else {
                "finance.receipts"
            }
        }
        "void_account_entry" => "finance.void",
        "record_supplier_payment" => "supplier.pay",
        "purchase_suggestions" => "purchases.read",
        "save_purchase_order" | "cancel_purchase_order" => "purchases.write",
        "receive_purchase_order" | "receive_purchase_with_details" => "purchases.receive",
        "get_next_purchase_invoice_number" | "search_products_for_purchase" => "purchases.read",
        "hold_batch" | "resolve_batch_hold" => "stock.quarantine",
        "submit_stock_adjustment" => "stock.adjust",
        "decide_stock_adjustment" => "stock.approve",
        "add_product_batch" => "stock.batches",
        "submit_sales_return" => "sales.returns",
        "decide_sales_return" => "sales.approve_returns",
        "save_commercial_document" | "cancel_commercial_document" => "documents.write",
        "open_shift" => "shifts.open",
        "close_shift" => "shifts.close",
        "current_shift" => return Ok(None),
        "create_backup" | "backup_status" => "backup.export",
        "read_user_rights" | "save_user_rights" => "users.manage",
        "read_login_history" => "security.history",
        "prepare_restore" | "queue_restore" => "backup.restore",
        _ => return Err("Unknown application command".into()),
    }))
}
pub fn handle(invoke: tauri::ipc::Invoke) -> bool {
    let command = invoke.message.command().to_string();
    let payload = match invoke.message.payload() {
        tauri::ipc::InvokeBody::Json(value) => value.clone(),
        _ => json!({}),
    };
    let app = invoke.message.webview().app_handle().clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            if app
                .state::<crate::restores::RestoreState>()
                .maintenance
                .load(std::sync::atomic::Ordering::Acquire)
                && !matches!(
                    command.as_str(),
                    "record_diagnostic" | "restart_for_restore" | "restore_status" | "logout_user"
                )
            {
                return Err(
                    "Database maintenance is in progress. Restart the app to continue".to_string(),
                );
            }
            if let Some(key) = permission(&command, &payload)? {
                let actor = current_actor(&app.state::<SessionState>()).await?;
                require(
                    &crate::database_api::pool(&app.state::<DbInstances>()).await?,
                    &actor,
                    key,
                )
                .await?;
            }
            if command == "current_shift" {
                let actor = current_actor(&app.state::<SessionState>()).await?;
                effective(
                    &crate::database_api::pool(&app.state::<DbInstances>()).await?,
                    &actor,
                )
                .await?;
            }
            Ok(())
        }
        .await;
        match result {
            Ok(()) => {
                crate::dispatch(invoke);
            }
            Err(error) => invoke.resolver.reject(error),
        }
    });
    true
}
#[tauri::command]
pub async fn current_permissions(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
) -> Result<Value, String> {
    let actor = current_actor(&session).await?;
    let pool = crate::database_api::pool(&instances).await?;
    let permissions = effective(&pool, &actor).await?;
    let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id=?")
        .bind(actor)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({"role":role,"permissions":permissions}))
}
#[tauri::command]
pub async fn read_user_rights(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    user_id: String,
) -> Result<Value, String> {
    read_rights(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        &user_id,
    )
    .await
}
async fn read_rights(pool: &Pool<Sqlite>, actor: &str, user: &str) -> Result<Value, String> {
    require(pool, actor, "users.manage").await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let row =
        sqlx::query("SELECT role,full_name,username FROM users WHERE id=? AND deleted_at IS NULL")
            .bind(user)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("User not found")?;
    let role: String = row.get("role");
    let revision: i64 = sqlx::query_scalar(
        "SELECT COALESCE((SELECT revision FROM user_access_revisions WHERE user_id=?),0)",
    )
    .bind(user)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let denied: HashSet<String> =
        sqlx::query_scalar("SELECT permission FROM user_permissions WHERE user_id=? AND allowed=0")
            .bind(user)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .collect();
    tx.commit().await.map_err(|e| e.to_string())?;
    let entries:Vec<Value>=CATALOG.iter().map(|(key,label,roles)|json!({"key":key,"label":label,"eligible":mask(&role)&roles!=0,"allowed":mask(&role)&roles!=0&&(role=="admin"||!denied.contains(*key))})).collect();
    Ok(
        json!({"userId":user,"name":row.get::<String,_>("full_name"),"username":row.get::<String,_>("username"),"role":role,"revision":revision,"entries":entries}),
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RightsRequest {
    user_id: String,
    expected_revision: i64,
    denied_permissions: Vec<String>,
}
async fn save_rights(pool: &Pool<Sqlite>, actor: &str, r: RightsRequest) -> Result<(), String> {
    require(pool, actor, "users.manage").await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let role: String =
        sqlx::query_scalar("SELECT role FROM users WHERE id=? AND deleted_at IS NULL")
            .bind(&r.user_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("User not found")?;
    if role == "admin" {
        return Err("Administrator rights are fixed to preserve recovery access".into());
    }
    let revision: i64 = sqlx::query_scalar(
        "SELECT COALESCE((SELECT revision FROM user_access_revisions WHERE user_id=?),0)",
    )
    .bind(&r.user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if revision != r.expected_revision {
        return Err("This account changed. Reload its rights before saving".into());
    }
    let denied: HashSet<_> = r.denied_permissions.iter().collect();
    if denied.len() != r.denied_permissions.len()
        || denied.iter().any(|key| {
            !CATALOG
                .iter()
                .any(|(k, _, roles)| *k == key.as_str() && mask(&role) & roles != 0)
        })
    {
        return Err("Choose valid permissions within this user's role".into());
    }
    sqlx::query("DELETE FROM user_permissions WHERE user_id=?")
        .bind(&r.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for key in &r.denied_permissions {
        sqlx::query("INSERT INTO user_permissions(user_id,permission,allowed) VALUES(?,?,0)")
            .bind(&r.user_id)
            .bind(key)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    sqlx::query("INSERT INTO user_access_revisions(user_id,revision) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1").bind(&r.user_id).execute(&mut *tx).await.map_err(|e|e.to_string())?;
    sqlx::query("INSERT INTO audit_events VALUES(?,'user_rights_changed',?,?,'user',?,?,?,0)")
        .bind(Uuid::new_v4().to_string())
        .bind(actor)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&r.user_id)
        .bind(&r.user_id)
        .bind(format!(
            "Disabled actions: {}",
            r.denied_permissions.join(", ")
        ))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn save_user_rights(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: RightsRequest,
) -> Result<(), String> {
    save_rights(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
pub(crate) async fn record_login(
    pool: &Pool<Sqlite>,
    user: Option<&str>,
    username: Option<&str>,
    event: &str,
    reason: &str,
) -> Result<(), String> {
    let name = if let Some(name) = username {
        name.to_string()
    } else if let Some(id) = user {
        sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id=?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "Unavailable account".into())
    } else {
        String::new()
    };
    let name: String = name
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(80)
        .collect();
    sqlx::query("INSERT INTO login_events(id,occurred_at,event,user_id,username,reason) VALUES(?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(chrono::Utc::now().to_rfc3339()).bind(event).bind(user).bind(name).bind(reason).execute(pool).await.map_err(|_|"Could not record login history".to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn read_login_history(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    from_date: String,
    to_date: String,
    query: String,
    event: String,
) -> Result<Value, String> {
    let pool = crate::database_api::pool(&instances).await?;
    require(&pool, &current_actor(&session).await?, "security.history").await?;
    crate::banking::date(&to_date)?;
    if !from_date.is_empty() {
        crate::banking::date(&from_date)?;
        if from_date > to_date {
            return Err("Check the date range".into());
        }
    }
    let term = format!(
        "%{}%",
        query
            .trim()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let rows=sqlx::query("SELECT * FROM login_events WHERE date(occurred_at,'localtime')>=? AND date(occurred_at,'localtime')<=? AND username LIKE ? ESCAPE '\\' AND (?='' OR event=?) ORDER BY occurred_at DESC,id DESC LIMIT 1001")
  .bind(from_date).bind(to_date).bind(term).bind(&event).bind(&event).fetch_all(&pool).await.map_err(|e|e.to_string())?;
    let truncated = rows.len() > 1000;
    let mut rows = crate::database_api::json_rows(rows)?;
    rows.truncate(1000);
    Ok(json!({"entries":rows,"truncated":truncated}))
}
#[cfg(test)]
#[path = "access_tests.rs"]
mod tests;
