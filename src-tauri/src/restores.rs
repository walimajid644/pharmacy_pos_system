use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Connection, Pool, Sqlite};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::DbInstances;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Default)]
pub struct RestoreState {
    pub maintenance: AtomicBool,
    plans: Mutex<HashMap<String, Plan>>,
    owner: Mutex<Option<String>>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Plan {
    id: String,
    owner: String,
    hash: String,
    prepared_at: i64,
    summary: Value,
}
#[derive(Serialize, Deserialize)]
struct Pending {
    plan: Plan,
    safety_file: String,
    safety_hash: String,
}
fn digest(path: &Path) -> Result<String, String> {
    let mut input = std::fs::File::open(path).map_err(|_| "Could not read the restore file")?;
    let mut hash = Sha256::new();
    let mut chunk = [0u8; 65536];
    loop {
        let n = input
            .read(&mut chunk)
            .map_err(|_| "Could not verify the restore file")?;
        if n == 0 {
            break;
        }
        hash.update(&chunk[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    Ok((
        app.path().app_config_dir().map_err(|e| e.to_string())?,
        app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("Restore"),
    ))
}
fn stage_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid restore plan")?;
    if parsed.to_string() != id {
        return Err("Invalid restore plan".into());
    }
    Ok(dir.join(format!("stage-{id}.db")))
}
async fn verify_database(path: &Path) -> Result<Value, String> {
    let mut db =
        SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(path).read_only(true))
            .await
            .map_err(|_| "This file is not a readable SQLite backup")?;
    let result=async{
  let check:Vec<String>=sqlx::query_scalar("PRAGMA integrity_check").fetch_all(&mut db).await.map_err(|_|"Backup integrity check could not finish")?;
  if check!=["ok"]{return Err("Backup integrity check failed".into());}
  for table in ["users","products","product_batches","customers","sales_invoices","app_settings"]{
   let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?").bind(table).fetch_one(&mut db).await.map_err(|_|"Could not inspect backup schema")?;
   if count!=1{return Err("This is not a supported Pharmacy POS backup".into());}
  }
  let has_versions:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'").fetch_one(&mut db).await.map_err(|e|e.to_string())?;
  if has_versions==1{let versions:Vec<String>=sqlx::query_scalar("SELECT version FROM schema_migrations").fetch_all(&mut db).await.map_err(|e|e.to_string())?;if versions.iter().any(|v|v.get(..3).and_then(|s|s.parse::<u16>().ok()).is_none_or(|n|n>21)){return Err("This backup uses an unsupported or newer database version".into());}}
  let violations=sqlx::query("PRAGMA foreign_key_check").fetch_all(&mut db).await.map_err(|_|"Could not check backup references")?;if !violations.is_empty(){return Err("Backup contains broken database references. Choose a different verified backup".into());}
  let admins:Vec<String>=sqlx::query_scalar("SELECT username FROM users WHERE role='admin' AND is_active=1 AND deleted_at IS NULL AND length(password_hash)>0 ORDER BY username").fetch_all(&mut db).await.map_err(|_|"Backup user accounts are unsupported")?;
  if admins.is_empty(){return Err("Backup must contain an active administrator account with a password".into());}
  let products:i64=sqlx::query_scalar("SELECT COUNT(*) FROM products").fetch_one(&mut db).await.map_err(|e|e.to_string())?;
  let invoices:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sales_invoices").fetch_one(&mut db).await.map_err(|e|e.to_string())?;
  let latest:Option<String>=sqlx::query_scalar("SELECT invoice_number FROM sales_invoices ORDER BY invoice_date DESC,id DESC LIMIT 1").fetch_optional(&mut db).await.map_err(|e|e.to_string())?;
  let latest_date:Option<String>=sqlx::query_scalar("SELECT invoice_date FROM sales_invoices ORDER BY invoice_date DESC,id DESC LIMIT 1").fetch_optional(&mut db).await.map_err(|e|e.to_string())?;
  let company:Option<String>=sqlx::query_scalar("SELECT company_name FROM app_settings LIMIT 1").fetch_optional(&mut db).await.map_err(|e|e.to_string())?;
  let has_shifts:i64=sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='cashier_shifts'").fetch_one(&mut db).await.map_err(|e|e.to_string())?;
  let open_shifts:i64=if has_shifts==1{sqlx::query_scalar("SELECT COUNT(*) FROM cashier_shifts WHERE status='open'").fetch_one(&mut db).await.map_err(|e|e.to_string())?}else{0};
  Ok(json!({"company":company.unwrap_or_default(),"products":products,"invoices":invoices,"latestInvoice":latest,"latestInvoiceDate":latest_date,"administrators":admins,"openDrawers":open_shifts}))
 }.await;
    db.close().await.map_err(|e| e.to_string())?;
    result
}
async fn prepare(source: &Path, live: &Path, dir: &Path, owner: &str) -> Result<Plan, String> {
    let source = source
        .canonicalize()
        .map_err(|_| "Choose an existing backup file")?;
    if !source.is_file() || live.canonicalize().ok().as_ref() == Some(&source) {
        return Err("Choose a backup file, not the live database".into());
    }
    verify_database(&source).await?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let stage = stage_path(dir, &id)?;
    let mut connection = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(&source)
            .read_only(true),
    )
    .await
    .map_err(|_| "Could not open backup")?;
    let escaped = stage.to_string_lossy().replace('\'', "''");
    let copy = sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&mut connection)
        .await;
    connection.close().await.map_err(|e| e.to_string())?;
    copy.map_err(|_| "Could not stage a consistent backup copy")?;
    let staged = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&stage)
                .journal_mode(SqliteJournalMode::Delete)
                .foreign_keys(true),
        )
        .await
        .map_err(|_| "Could not open staged backup")?;
    let migration = crate::database_api::initialize(&staged).await;
    staged.close().await;
    migration.map_err(|_| "Backup schema cannot be upgraded by this app")?;
    let mut summary = verify_database(&stage).await?;
    summary["sourceFile"] = json!(source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default());
    Ok(Plan {
        id,
        owner: owner.into(),
        hash: digest(&stage)?,
        prepared_at: chrono::Utc::now().timestamp(),
        summary,
    })
}
async fn confirm_password(pool: &Pool<Sqlite>, actor: &str, password: &str) -> Result<(), String> {
    let hash:String=sqlx::query_scalar("SELECT password_hash FROM users WHERE id=? AND role='admin' AND is_active=1 AND deleted_at IS NULL").bind(actor).fetch_optional(pool).await.map_err(|e|e.to_string())?.ok_or("An active administrator is required")?;
    let valid = if hash.starts_with("$2") {
        bcrypt::verify(password, &hash).unwrap_or(false)
    } else {
        password == hash
    };
    if !valid {
        return Err("Administrator password is incorrect".into());
    }
    Ok(())
}
async fn schedule(
    pool: &Pool<Sqlite>,
    state: &RestoreState,
    config: &Path,
    dir: &Path,
    actor: &str,
    id: &str,
    password: &str,
    confirmation: &str,
) -> Result<Value, String> {
    crate::access::require(pool, actor, "backup.restore").await?;
    confirm_password(pool, actor, password).await?;
    if confirmation != "RESTORE" {
        return Err("Type RESTORE to confirm the reviewed database replacement".into());
    }
    let plan = state
        .plans
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or("Inspect the backup again before restoring")?;
    if plan.owner != actor || chrono::Utc::now().timestamp() - plan.prepared_at > 3600 {
        return Err("Restore review expired. Inspect the backup again".into());
    }
    let stage = stage_path(dir, id)?;
    if digest(&stage)? != plan.hash {
        return Err("Staged backup changed. Inspect the backup again".into());
    }
    let open: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cashier_shifts WHERE status='open'")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    if open != 0 {
        return Err("Close the current cash drawer before restoring a backup".into());
    }
    if state
        .maintenance
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("Database maintenance is already in progress".into());
    }
    *state.owner.lock().await = Some(actor.into());
    // Closing drains acquired connections and cancels queued acquisitions. No live writes can
    // finish after the safety snapshot, including commands already dispatched by the UI.
    pool.close().await;
    let result = async {
        let live = config.join("pharmacy.db");
        let safety_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(&live).read_only(true))
            .await
            .map_err(|_| "Could not reopen the database for its safety backup")?;
        let saved = crate::backups::save(&safety_pool, dir, false).await;
        safety_pool.close().await;
        let saved = saved?;
        let safety = PathBuf::from(saved.path);
        let closed = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&live)
                .journal_mode(SqliteJournalMode::Delete),
        )
        .await
        .map_err(|_| "Another database connection is still active; restart and retry restore")?;
        closed.close().await.map_err(|e| e.to_string())?;

        let pending = Pending {
            plan: plan.clone(),
            safety_file: safety
                .file_name()
                .ok_or("Invalid safety backup path")?
                .to_string_lossy()
                .to_string(),
            safety_hash: digest(&safety)?,
        };
        let temporary = dir.join(format!("pending-{id}.json"));
        std::fs::write(
            &temporary,
            serde_json::to_vec(&pending).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if dir.join("pending.json").exists() {
            return Err("Another restore is already scheduled".into());
        }
        std::fs::rename(temporary, dir.join("pending.json")).map_err(|e| e.to_string())?;
        Ok(json!({"scheduled":true,"safetyBackup":safety.to_string_lossy(),"planId":id}))
    }
    .await;
    result.map_err(|cause:String|format!("Restore was not scheduled: {cause}. The current database was not replaced. Restart the app to resume work"))
}
pub(crate) async fn apply_pending(config: &Path, dir: &Path) -> Result<(), String> {
    let manifest = dir.join("pending.json");
    if !manifest.exists() {
        return Ok(());
    }
    let pending: Pending =
        serde_json::from_slice(&std::fs::read(&manifest).map_err(|e| e.to_string())?)
            .map_err(|_| "Restore manifest is invalid; no database was replaced")?;
    let id = &pending.plan.id;
    let stage = stage_path(dir, id)?;
    // Manifest paths are file names in private application folders, never arbitrary destinations.
    if Path::new(&pending.safety_file).components().count() != 1
        || !pending.safety_file.starts_with("pharmacy-")
        || !pending.safety_file.ends_with(".db")
    {
        return Err("Invalid safety backup path".into());
    }
    let safety = dir.join(&pending.safety_file);
    if digest(&safety)? != pending.safety_hash {
        return Err("Safety backup changed; restore stopped".into());
    }
    verify_database(&safety).await?;
    if digest(&stage)? != pending.plan.hash {
        return Err("Staged backup changed; restore stopped".into());
    }
    verify_database(&stage).await?;
    std::fs::create_dir_all(config).map_err(|e| e.to_string())?;
    let live = config.join("pharmacy.db");
    let archived = config.join(format!("pharmacy-before-restore-{id}.db"));
    let incoming = config.join(format!("pharmacy-restore-incoming-{id}.db"));
    for suffix in ["-wal", "-shm"] {
        if PathBuf::from(format!("{}{suffix}", live.display())).exists() {
            return Err("Database sidecar files are still present. Close all Pharmacy POS instances before restore".into());
        }
    }
    let mut already_applied =
        archived.exists() && live.exists() && digest(&live)? == pending.plan.hash;
    if !already_applied && archived.exists() && live.exists() {
        let mut check = SqliteConnection::connect_with(
            &SqliteConnectOptions::new().filename(&live).read_only(true),
        )
        .await
        .map_err(|e| e.to_string())?;
        let marker: Result<i64, _> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM audit_events WHERE id=? AND event_type='database_restored'",
        )
        .bind(format!("restore:{id}"))
        .fetch_one(&mut check)
        .await;
        check.close().await.map_err(|e| e.to_string())?;
        already_applied = marker.unwrap_or(0) == 1;
    }
    if !already_applied {
        std::fs::copy(&stage, &incoming)
            .map_err(|_| "Could not copy the staged database into place")?;
        if digest(&incoming)? != pending.plan.hash {
            return Err("Restore copy verification failed".into());
        }
        if live.exists() {
            if archived.exists() {
                return Err(
                    "A previous restore swap needs review; database was not replaced".into(),
                );
            }
            std::fs::rename(&live, &archived).map_err(|_| {
                "Could not close the live database. Close other Pharmacy POS instances and retry"
            })?;
        } else if !archived.exists() {
            return Err("The current database is missing; restore stopped".into());
        }
        if let Err(error) = std::fs::rename(&incoming, &live) {
            if !live.exists() {
                std::fs::rename(&archived,&live).map_err(|_|"Restore swap and rollback failed. The preserved database and safety backup remain available")?;
            }
            return Err(format!(
                "Restore swap failed; original database preserved: {error}"
            ));
        }
    }
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&live)
                .journal_mode(SqliteJournalMode::Delete),
        )
        .await
        .map_err(|e| e.to_string())?;
    let audit=sqlx::query("INSERT OR IGNORE INTO audit_events VALUES(?,'database_restored',NULL,?,'database','pharmacy',?,?,0)")
  .bind(format!("restore:{id}")).bind(chrono::Utc::now().to_rfc3339()).bind(id).bind(format!("Safety backup: {}; original initiator id: {}",pending.safety_file,pending.plan.owner)).execute(&db).await;
    db.close().await;
    audit.map_err(|e| e.to_string())?;
    std::fs::write(dir.join("last-result.json"),serde_json::to_vec(&json!({"restoredAt":chrono::Utc::now().to_rfc3339(),"planId":id,"safetyBackup":safety.to_string_lossy(),"preservedDatabase":archived.to_string_lossy(),"summary":pending.plan.summary})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    std::fs::remove_file(manifest).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn prepare_restore(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    state: State<'_, RestoreState>,
    app: AppHandle,
    source_path: String,
) -> Result<Value, String> {
    let actor = current_actor(&session).await?;
    crate::access::require(
        &crate::database_api::pool(&instances).await?,
        &actor,
        "backup.restore",
    )
    .await?;
    let (config, dir) = paths(&app)?;
    let source = PathBuf::from(source_path.trim());
    let live = config.join("pharmacy.db");
    let owner = actor.clone();
    let plan = tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(prepare(&source, &live, &dir, &owner))
    })
    .await
    .map_err(|_| "Backup inspection could not finish")??;
    let response = json!({"planId":plan.id,"sha256":plan.hash,"summary":plan.summary,"preparedAt":plan.prepared_at});
    state.plans.lock().await.insert(plan.id.clone(), plan);
    Ok(response)
}
#[tauri::command]
pub async fn queue_restore(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    state: State<'_, RestoreState>,
    app: AppHandle,
    plan_id: String,
    password: String,
    confirmation: String,
) -> Result<Value, String> {
    let actor = current_actor(&session).await?;
    let (config, dir) = paths(&app)?;
    schedule(
        &crate::database_api::pool(&instances).await?,
        &state,
        &config,
        &dir,
        &actor,
        &plan_id,
        &password,
        &confirmation,
    )
    .await
}
#[tauri::command]
pub async fn restart_for_restore(
    session: State<'_, SessionState>,
    state: State<'_, RestoreState>,
    app: AppHandle,
) -> Result<(), String> {
    let actor = current_actor(&session).await?;
    if !state.maintenance.load(Ordering::Acquire)
        || state.owner.lock().await.as_deref() != Some(&actor)
    {
        return Err("No restore restart is pending for this user".into());
    }
    app.restart()
}
#[tauri::command]
pub async fn restore_status(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    state: State<'_, RestoreState>,
    app: AppHandle,
) -> Result<Value, String> {
    let actor = current_actor(&session).await?;
    if state.maintenance.load(Ordering::Acquire) {
        if state.owner.lock().await.as_deref() != Some(&actor) {
            return Err("Database maintenance is in progress".into());
        }
    } else {
        crate::access::require(
            &crate::database_api::pool(&instances).await?,
            &actor,
            "backup.restore",
        )
        .await?;
    }
    let (_, dir) = paths(&app)?;
    let last = std::fs::read(dir.join("last-result.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    Ok(
        json!({"maintenance":state.maintenance.load(Ordering::Acquire),"pending":dir.join("pending.json").exists(),"lastRestore":last}),
    )
}
#[cfg(test)]
#[path = "restore_tests.rs"]
mod tests;
