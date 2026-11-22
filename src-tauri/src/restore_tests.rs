use super::*;
use std::sync::Arc;
const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
const PASSWORD: &str = "Current test password";
async fn database(path: &Path, company: &str) -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true)
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal),
        )
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    sqlx::query("UPDATE app_settings SET company_name=?")
        .bind(company)
        .execute(&p)
        .await
        .unwrap();
    sqlx::query("UPDATE users SET password_hash=? WHERE id=?")
        .bind(PASSWORD)
        .bind(ADMIN)
        .execute(&p)
        .await
        .unwrap();
    p
}
async fn fixture() -> (PathBuf, PathBuf, PathBuf, PathBuf, Pool<Sqlite>) {
    let root = std::env::temp_dir().join(format!("pharmacy-restore-test-{}", Uuid::new_v4()));
    let config = root.join("config");
    let dir = root.join("Restore");
    std::fs::create_dir_all(&config).unwrap();
    let live = database(&config.join("pharmacy.db"), "LIVE").await;
    let source = root.join("backup.db");
    let b = database(&source, "BACKUP").await;
    b.close().await;
    (root, config, dir, source, live)
}
async fn cleanup(root: &Path) {
    let resolved = root.canonicalize().unwrap();
    assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(root
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("pharmacy-restore-test-"));
    // SQLx's worker can release the final Windows file handle just after pool shutdown.
    for attempt in 0..40 {
        match std::fs::remove_dir_all(&resolved) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(error) if attempt < 39 && matches!(error.raw_os_error(), Some(5 | 32)) => {
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
            Err(error) => panic!("Could not remove the disposable restore fixture: {error}"),
        }
    }
}
#[tokio::test]
async fn restore_drains_writes_preserves_safety_and_applies_only_during_restart() {
    let (root, config, dir, source, pool) = fixture().await;
    let state = Arc::new(RestoreState::default());
    let before = digest(&source).unwrap();
    let plan = prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .unwrap();
    assert_eq!(before, digest(&source).unwrap());
    assert_eq!(plan.summary["company"], "BACKUP");
    state
        .plans
        .lock()
        .await
        .insert(plan.id.clone(), plan.clone());
    assert!(
        schedule(&pool, &state, &config, &dir, ADMIN, &plan.id, "wrong", "RESTORE")
            .await
            .is_err()
    );
    assert!(!state.maintenance.load(Ordering::Acquire));
    assert!(
        schedule(&pool, &state, &config, &dir, ADMIN, &plan.id, PASSWORD, "WRONG")
            .await
            .is_err()
    );
    let mut in_flight = pool.begin().await.unwrap();
    sqlx::query("UPDATE app_settings SET company_name='LIVE-FINAL'")
        .execute(&mut *in_flight)
        .await
        .unwrap();
    let task_pool = pool.clone();
    let task_state = state.clone();
    let task_config = config.clone();
    let task_dir = dir.clone();
    let id = plan.id.clone();
    let task = tokio::spawn(async move {
        schedule(
            &task_pool,
            &task_state,
            &task_config,
            &task_dir,
            ADMIN,
            &id,
            PASSWORD,
            "RESTORE",
        )
        .await
    });
    for _ in 0..100 {
        if state.maintenance.load(Ordering::Acquire) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    assert!(state.maintenance.load(Ordering::Acquire));
    assert!(!task.is_finished());
    in_flight.commit().await.unwrap();
    let result = task.await.unwrap().unwrap();
    assert!(result["scheduled"].as_bool().unwrap());
    assert!(pool.is_closed());
    assert_eq!(
        verify_database(&config.join("pharmacy.db")).await.unwrap()["company"],
        "LIVE-FINAL"
    );
    let safety = PathBuf::from(result["safetyBackup"].as_str().unwrap());
    assert_eq!(
        verify_database(&safety).await.unwrap()["company"],
        "LIVE-FINAL"
    );
    let manifest = std::fs::read(dir.join("pending.json")).unwrap();
    apply_pending(&config, &dir).await.unwrap();
    assert_eq!(
        verify_database(&config.join("pharmacy.db")).await.unwrap()["company"],
        "BACKUP"
    );
    assert!(!dir.join("pending.json").exists());
    assert!(config
        .join(format!("pharmacy-before-restore-{}.db", plan.id))
        .is_file());
    // A crash after the swap/audit but before deleting the manifest must be recoverable.
    std::fs::write(dir.join("pending.json"), manifest).unwrap();
    apply_pending(&config, &dir).await.unwrap();
    let db = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(config.join("pharmacy.db"))
            .read_only(true),
    )
    .await
    .unwrap();
    db.close().await.unwrap();
    assert!(dir.join("last-result.json").is_file());
    assert_eq!(before, digest(&source).unwrap());
    cleanup(&root).await;
}
#[tokio::test]
async fn invalid_newer_and_changed_backups_never_replace_the_current_database() {
    let (root, config, dir, source, pool) = fixture().await;
    let not_db = root.join("invalid.db");
    std::fs::write(&not_db, b"not a database").unwrap();
    assert!(prepare(&not_db, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .is_err());
    assert!(prepare(
        &config.join("pharmacy.db"),
        &config.join("pharmacy.db"),
        &dir,
        ADMIN
    )
    .await
    .is_err());
    let future = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(&source))
        .await
        .unwrap();
    sqlx::query("INSERT INTO schema_migrations(version) VALUES('022_future_schema')")
        .execute(&future)
        .await
        .unwrap();
    future.close().await;
    assert!(prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .is_err());
    let future = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(&source))
        .await
        .unwrap();
    sqlx::query("DELETE FROM schema_migrations WHERE version='022_future_schema'")
        .execute(&future)
        .await
        .unwrap();
    future.close().await;
    let plan = prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .unwrap();
    let stage = stage_path(&dir, &plan.id).unwrap();
    use std::io::Write;
    std::fs::OpenOptions::new()
        .append(true)
        .open(stage)
        .unwrap()
        .write_all(b"changed")
        .unwrap();
    let state = RestoreState::default();
    let id = plan.id.clone();
    state.plans.lock().await.insert(id.clone(), plan);
    assert!(
        schedule(&pool, &state, &config, &dir, ADMIN, &id, PASSWORD, "RESTORE")
            .await
            .is_err()
    );
    assert!(!state.maintenance.load(Ordering::Acquire));
    assert!(!dir.join("pending.json").exists());
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT company_name FROM app_settings")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "LIVE"
    );
    pool.close().await;
    cleanup(&root).await;
}
#[tokio::test]
async fn open_drawers_and_unauthorized_operators_cannot_schedule_restore() {
    let (root, config, dir, source, pool) = fixture().await;
    let state = RestoreState::default();
    let plan = prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .unwrap();
    let id = plan.id.clone();
    state.plans.lock().await.insert(id.clone(), plan);
    crate::shifts::open(&pool, ADMIN, 0).await.unwrap();
    assert!(
        schedule(&pool, &state, &config, &dir, ADMIN, &id, PASSWORD, "RESTORE")
            .await
            .is_err()
    );
    assert!(!state.maintenance.load(Ordering::Acquire));
    sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('manager','restore-manager','x','Manager','manager','now','now')").execute(&pool).await.unwrap();
    assert!(
        schedule(&pool, &state, &config, &dir, "manager", &id, PASSWORD, "RESTORE")
            .await
            .is_err()
    );
    pool.close().await;
    cleanup(&root).await;
}
#[tokio::test]
async fn startup_stops_on_sidecars_or_changed_safety_snapshot_without_swapping() {
    let (root, config, dir, source, pool) = fixture().await;
    let state = RestoreState::default();
    let plan = prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .unwrap();
    let id = plan.id.clone();
    state.plans.lock().await.insert(id.clone(), plan);
    let result = schedule(
        &pool, &state, &config, &dir, ADMIN, &id, PASSWORD, "RESTORE",
    )
    .await
    .unwrap();
    let sidecar = config.join("pharmacy.db-wal");
    std::fs::write(&sidecar, b"another connection").unwrap();
    assert!(apply_pending(&config, &dir).await.is_err());
    assert!(dir.join("pending.json").is_file());
    std::fs::remove_file(sidecar).unwrap();
    assert_eq!(
        verify_database(&config.join("pharmacy.db")).await.unwrap()["company"],
        "LIVE"
    );
    use std::io::Write;
    std::fs::OpenOptions::new()
        .append(true)
        .open(result["safetyBackup"].as_str().unwrap())
        .unwrap()
        .write_all(b"changed")
        .unwrap();
    assert!(apply_pending(&config, &dir).await.is_err());
    assert_eq!(
        verify_database(&config.join("pharmacy.db")).await.unwrap()["company"],
        "LIVE"
    );
    cleanup(&root).await;
}

#[tokio::test]
async fn older_backups_are_upgraded_in_the_staged_copy_only() {
    let (root, config, dir, source, pool) = fixture().await;
    let old = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&source)
                .journal_mode(SqliteJournalMode::Delete),
        )
        .await
        .unwrap();
    sqlx::raw_sql("ALTER TABLE app_settings DROP COLUMN purchase_default_quantity; ALTER TABLE app_settings DROP COLUMN purchase_default_tax; ALTER TABLE app_settings DROP COLUMN purchase_default_discount; ALTER TABLE app_settings DROP COLUMN purchase_show_tax; ALTER TABLE app_settings DROP COLUMN purchase_show_discount; ALTER TABLE app_settings DROP COLUMN purchase_fill_remaining; DELETE FROM schema_migrations WHERE version='021_purchase_preferences';").execute(&old).await.unwrap();
    sqlx::raw_sql("DROP TRIGGER last_admin_update; DROP TRIGGER last_admin_delete; DROP TRIGGER user_access_revision; DROP TRIGGER login_history_no_update; DROP TRIGGER login_history_no_delete; DROP TABLE user_permissions; DROP TABLE user_access_revisions; DROP TABLE login_events; DELETE FROM schema_migrations WHERE version='020_access_and_history';").execute(&old).await.unwrap();
    old.close().await;
    let before = digest(&source).unwrap();
    let plan = prepare(&source, &config.join("pharmacy.db"), &dir, ADMIN)
        .await
        .unwrap();
    assert_eq!(plan.summary["company"], "BACKUP");
    assert_eq!(before, digest(&source).unwrap());
    let mut staged = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(stage_path(&dir, &plan.id).unwrap())
            .read_only(true),
    )
    .await
    .unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schema_migrations WHERE version='020_access_and_history'",
    )
    .fetch_one(&mut staged)
    .await
    .unwrap();
    assert_eq!(count, 1);
    let defaults: (i64, f64, i64) = sqlx::query_as("SELECT purchase_default_quantity,purchase_default_tax,purchase_fill_remaining FROM app_settings LIMIT 1").fetch_one(&mut staged).await.unwrap();
    assert_eq!(defaults, (1,17.0,1));
    let events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM login_events")
        .fetch_one(&mut staged)
        .await
        .unwrap();
    assert_eq!(events, 0);
    staged.close().await.unwrap();
    pool.close().await;
    cleanup(&root).await;
}
