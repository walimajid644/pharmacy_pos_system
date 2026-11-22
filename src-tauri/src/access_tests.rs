use super::*;
use sqlx::sqlite::SqlitePoolOptions;
const ADMIN: &str = "00000000-0000-0000-0000-000000000001";
async fn fixture() -> Pool<Sqlite> {
    let p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    crate::database_api::initialize(&p).await.unwrap();
    for role in ["manager", "cashier", "accountant"] {
        sqlx::query("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES(?,?,'x',?,?,'now','now')").bind(role).bind(format!("access-{role}")).bind(role).bind(role).execute(&p).await.unwrap();
    }
    p
}
fn request(user: &str, revision: i64, denied: &[&str]) -> RightsRequest {
    serde_json::from_value(
        json!({"userId":user,"expectedRevision":revision,"deniedPermissions":denied}),
    )
    .unwrap()
}
#[tokio::test]
async fn user_rights_restrict_within_role_and_revocations_apply_to_live_commands() {
    let p = fixture().await;
    require(&p, "manager", "banking.post").await.unwrap();
    assert!(require(&p, "cashier", "banking.post").await.is_err());
    save_rights(
        &p,
        ADMIN,
        request("manager", 0, &["banking.post", "catalog.write"]),
    )
    .await
    .unwrap();
    assert!(require(
        &p,
        "manager",
        permission("record_bank_transaction", &json!({}))
            .unwrap()
            .unwrap()
    )
    .await
    .is_err());
    assert!(require(&p, "manager", "catalog.write").await.is_err());
    require(&p, "manager", "banking.view").await.unwrap();
    let view = read_rights(&p, ADMIN, "manager").await.unwrap();
    assert_eq!(view["revision"], 1);
    assert!(save_rights(&p, ADMIN, request("manager", 0, &[]))
        .await
        .is_err());
    save_rights(&p, ADMIN, request("manager", 1, &[]))
        .await
        .unwrap();
    require(&p, "manager", "banking.post").await.unwrap();
    assert!(save_rights(&p, "manager", request("cashier", 0, &[]))
        .await
        .is_err());
    assert!(
        save_rights(&p, ADMIN, request("cashier", 0, &["backup.restore"]))
            .await
            .is_err()
    );
    assert!(save_rights(&p, ADMIN, request(ADMIN, 0, &["users.manage"]))
        .await
        .is_err());
    sqlx::query("INSERT INTO user_permissions(user_id,permission,allowed) VALUES('cashier','backup.restore',1)").execute(&p).await.unwrap();
    assert!(require(&p, "cashier", "backup.restore").await.is_err());
    let audit: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_events WHERE event_type='user_rights_changed'",
    )
    .fetch_one(&p)
    .await
    .unwrap();
    assert_eq!(audit, 2);
}
#[tokio::test]
async fn account_changes_prevent_stale_rights_and_preserve_last_administrator() {
    let p = fixture().await;
    let old = read_rights(&p, ADMIN, "manager").await.unwrap();
    sqlx::query("UPDATE users SET role='accountant' WHERE id='manager'")
        .execute(&p)
        .await
        .unwrap();
    assert!(save_rights(
        &p,
        ADMIN,
        request("manager", old["revision"].as_i64().unwrap(), &[])
    )
    .await
    .is_err());
    sqlx::query("UPDATE users SET is_active=0 WHERE id='accountant'")
        .execute(&p)
        .await
        .unwrap();
    assert!(require(&p, "accountant", "banking.view").await.is_err());
    assert!(authorize_query(&p, "accountant", "select 1").await.is_err());
    for query in [
        "UPDATE users SET role='cashier' WHERE id=?",
        "UPDATE users SET is_active=0 WHERE id=?",
        "UPDATE users SET deleted_at='now' WHERE id=?",
        "DELETE FROM users WHERE id=?",
    ] {
        assert!(sqlx::query(query).bind(ADMIN).execute(&p).await.is_err());
    }
}
#[tokio::test]
async fn query_permissions_and_all_custom_commands_are_covered() {
    let p = fixture().await;
    save_rights(
        &p,
        ADMIN,
        request("manager", 0, &["income.view", "audit.view"]),
    )
    .await
    .unwrap();
    assert!(
        authorize_query(&p, "manager", "select * from income_entries")
            .await
            .is_err()
    );
    assert!(authorize_query(&p, "manager", "select * from audit_events")
        .await
        .is_err());
    assert!(authorize_query(&p, "cashier", "select * from login_events")
        .await
        .is_err());
    let source = include_str!("lib.rs");
    let commands = source
        .split("tauri::generate_handler![")
        .nth(1)
        .unwrap()
        .split(']')
        .next()
        .unwrap();
    for command in commands.split(',').map(str::trim).filter(|v| !v.is_empty()) {
        let name = command.split("::").last().unwrap();
        assert!(
            permission(name, &json!({})).is_ok(),
            "Unmapped command: {name}"
        );
    }
    assert!(permission("unregistered_mutation", &json!({})).is_err());
    assert_eq!(
        permission(
            "record_account_entry",
            &json!({"request":{"kind":"expense"}})
        )
        .unwrap(),
        Some("finance.expenses")
    );
    assert_eq!(
        permission("void_finance_posting", &json!({"source":"income"})).unwrap(),
        Some("income.void")
    );
}
#[tokio::test]
async fn login_history_is_immutable_and_contains_no_password_fields() {
    let p = fixture().await;
    record_login(
        &p,
        None,
        Some("  unknown\nuser  "),
        "failed_sign_in",
        "invalid_credentials",
    )
    .await
    .unwrap();
    record_login(&p, Some("manager"), None, "sign_out", "user_request")
        .await
        .unwrap();
    let rows = crate::database_api::json_rows(
        sqlx::query("SELECT * FROM login_events ORDER BY occurred_at")
            .fetch_all(&p)
            .await
            .unwrap(),
    )
    .unwrap();
    let text = serde_json::to_string(&rows).unwrap();
    assert!(!text.contains("password"));
    assert!(text.contains("unknownuser"));
    assert!(sqlx::query("DELETE FROM login_events")
        .execute(&p)
        .await
        .is_err());
    assert!(sqlx::query("UPDATE login_events SET reason='changed'")
        .execute(&p)
        .await
        .is_err());
}
