use crate::database_api::{current_actor, SessionState};
use serde::Serialize;
use sqlx::{Connection, Pool, Sqlite};
use sqlx::sqlite::{SqliteConnection, SqliteConnectOptions};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult { path: String, created: bool }

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("Backups"))
}

pub(crate) async fn save(pool: &Pool<Sqlite>, dir: &Path, daily: bool) -> Result<BackupResult, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let name = if daily { format!("pharmacy-{date}.db") } else { format!("pharmacy-{date}-{}.db", Uuid::new_v4().simple()) };
    let final_path = dir.join(name);
    if daily && final_path.exists() {
        if verify(&final_path).await.is_ok() {
            return Ok(BackupResult { path: final_path.display().to_string(), created: false });
        }
        std::fs::remove_file(&final_path).map_err(|e| e.to_string())?;
    }
    let source: String = sqlx::query_scalar("SELECT file FROM pragma_database_list WHERE name = 'main'")
        .fetch_one(pool).await.map_err(|e| e.to_string())?;
    if source.is_empty() { return Err("Backup source must be an on-disk SQLite database".into()); }
    let options = SqliteConnectOptions::new().filename(source).read_only(true);
    let mut connection = SqliteConnection::connect_with(&options).await.map_err(|e| e.to_string())?;
    let escaped = final_path.to_string_lossy().replace('\'', "''");
    let statement = format!("VACUUM INTO '{escaped}'");
    let result = sqlx::query(&statement).execute(&mut connection).await;
    connection.close().await.map_err(|e| e.to_string())?;
    if let Err(e) = result { let _ = std::fs::remove_file(&final_path); return Err(e.to_string()); }
    if !final_path.is_file() { return Err("SQLite did not create the backup file".into()); }
    verify(&final_path).await?;
    Ok(BackupResult { path: final_path.display().to_string(), created: true })
}

async fn verify(path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut connection = SqliteConnection::connect_with(&options).await.map_err(|e| e.to_string())?;
    let result: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut connection).await.map_err(|e| e.to_string())?;
    connection.close().await.map_err(|e| e.to_string())?;
    if result != "ok" { return Err(format!("Backup integrity check failed: {result}")); }
    Ok(())
}

fn prune_old_daily(dir: &Path) -> Result<(), String> {
    let cutoff = chrono::Local::now().date_naive() - chrono::Duration::days(6);
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(date) = name.strip_prefix("pharmacy-").and_then(|n| n.strip_suffix(".db")) {
            if let Ok(day) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") {
                if day < cutoff && entry.file_type().map_err(|e| e.to_string())?.is_file() {
                    std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

pub fn start_daily(app: &AppHandle, pool: Pool<Sqlite>) {
    let dir = match backup_dir(app) { Ok(dir) => dir, Err(_) => return };
    tauri::async_runtime::spawn(async move {
        loop {
            match save(&pool, &dir, true).await {
                Ok(_) => { if let Err(e) = prune_old_daily(&dir) { eprintln!("Backup retention error: {e}"); } },
                Err(e) => eprintln!("Daily backup error: {e}"),
            }
            tokio::time::sleep(std::time::Duration::from_secs(60 * 60)).await;
        }
    });
}

#[tauri::command]
pub async fn create_backup(instances: State<'_, DbInstances>, session: State<'_, SessionState>, app: AppHandle, destination_dir: Option<String>) -> Result<BackupResult, String> {
    let actor = current_actor(&session).await?;
    let pool = crate::database_api::pool(&instances).await?;
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL")
        .bind(actor).fetch_optional(&pool).await.map_err(|e| e.to_string())?;
    if !matches!(role.as_deref(), Some("admin" | "manager")) { return Err("Only managers can export a backup".into()); }
    let dir = match destination_dir {
        Some(path) if !path.trim().is_empty() => {
            let path = PathBuf::from(path.trim());
            if !path.is_dir() { return Err("Choose an existing folder or USB drive".into()); }
            path.canonicalize().map_err(|e| e.to_string())?
        },
        _ => backup_dir(&app)?,
    };
    save(&pool, &dir, false).await
}

#[tauri::command]
pub async fn backup_status(session: State<'_, SessionState>, app: AppHandle) -> Result<BackupResult, String> {
    current_actor(&session).await?;
    let dir = backup_dir(&app)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let daily = dir.join(format!("pharmacy-{today}.db"));
    let valid = daily.is_file() && verify(&daily).await.is_ok();
    Ok(BackupResult { path: dir.display().to_string(), created: valid })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn backup_is_a_readable_sqlite_snapshot() {
        let dir = std::env::temp_dir().join(format!("pharmacy-backup-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.db");
        let pool = SqlitePoolOptions::new().max_connections(1).connect(&format!("sqlite:{}?mode=rwc", source.display())).await.unwrap();
        sqlx::query("CREATE TABLE proof (value TEXT NOT NULL)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO proof VALUES ('saved')").execute(&pool).await.unwrap();
        let result = save(&pool, &dir, false).await.unwrap();
        let backup = SqlitePoolOptions::new().max_connections(1).connect(&format!("sqlite:{}", result.path)).await.unwrap();
        let value: String = sqlx::query_scalar("SELECT value FROM proof").fetch_one(&backup).await.unwrap();
        assert_eq!(value, "saved");
        backup.close().await;
        pool.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }
}
