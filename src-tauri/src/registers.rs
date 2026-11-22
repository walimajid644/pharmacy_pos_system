use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::State;
use tauri_plugin_sql::DbInstances;
use uuid::Uuid;

#[cfg(test)]
#[path = "register_tests.rs"]
mod tests;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Category,
    Manufacturer,
    Shelf,
    ExpenseHead,
    IncomeHead,
    Bank,
}
impl Kind {
    fn table(self) -> &'static str {
        match self {
            Self::Category => "categories",
            Self::Manufacturer => "manufacturers",
            Self::Shelf => "shelf_locations",
            Self::ExpenseHead => "expense_heads",
            Self::IncomeHead => "income_heads",
            Self::Bank => "bank_accounts",
        }
    }
    fn column(self) -> &'static str {
        match self {
            Self::Category => "category_id",
            Self::Manufacturer => "manufacturer_id",
            Self::Shelf => "shelf_location_id",
            Self::ExpenseHead => "expense_head_id",
            Self::IncomeHead => "head_id",
            Self::Bank => "entity_id",
        }
    }
    fn max_name(self) -> usize {
        if matches!(self, Self::Shelf | Self::ExpenseHead | Self::IncomeHead) {
            80
        } else {
            120
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    id: String,
    name: String,
    description: Option<String>,
    is_active: bool,
    updated_at: String,
    assigned_count: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRequest {
    kind: Kind,
    id: Option<String>,
    name: String,
    description: Option<String>,
    is_active: bool,
    expected_updated_at: Option<String>,
}

async fn list(pool: &Pool<Sqlite>, actor: &str, kind: Kind) -> Result<Vec<Entry>, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    let assigned = match kind {
        Kind::IncomeHead => {
            "SELECT COUNT(*) FROM income_entries p WHERE p.head_id=r.id".to_string()
        }
        Kind::ExpenseHead => {
            "SELECT COUNT(*) FROM account_entries p WHERE p.expense_head_id=r.id".to_string()
        }
        Kind::Bank => {
            "SELECT COUNT(*) FROM opening_balances p WHERE p.kind='bank' AND p.entity_id=r.id"
                .to_string()
        }
        _ => format!(
            "SELECT COUNT(*) FROM products p WHERE p.{}=r.id AND p.deleted_at IS NULL",
            kind.column()
        ),
    };
    let query = format!("SELECT r.id,r.name,r.description,r.is_active,r.updated_at,({assigned}) AS assigned_count FROM {} r WHERE r.deleted_at IS NULL ORDER BY trim(r.name) COLLATE NOCASE,r.id", kind.table());
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|_| "Could not load the register".to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| Entry {
            id: row.get("id"),
            name: row.get("name"),
            description: row.get("description"),
            is_active: row.get::<i64, _>("is_active") != 0,
            updated_at: row.get("updated_at"),
            assigned_count: row.get("assigned_count"),
        })
        .collect())
}

async fn save(pool: &Pool<Sqlite>, actor: &str, request: SaveRequest) -> Result<String, String> {
    crate::credit::require_role(pool, actor, &["admin", "manager"]).await?;
    let name = request.name.trim();
    if name.is_empty()
        || name.chars().count() > request.kind.max_name()
        || name.chars().any(char::is_control)
    {
        return Err(format!(
            "Enter a name of 1–{} characters without control characters",
            request.kind.max_name()
        ));
    }
    let description = request
        .description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if description.is_some_and(|value| {
        value.chars().count() > 1000
            || value
                .chars()
                .any(|c| c.is_control() && c != '\n' && c != '\t')
    }) {
        return Err("Description must be at most 1000 characters".into());
    }
    let table = request.kind.table();
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| "Could not open the register".to_string())?;
    let old = if let Some(id) = &request.id {
        let row = sqlx::query(&format!(
            "SELECT name,updated_at FROM {table} WHERE id=? AND deleted_at IS NULL"
        ))
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| "Could not read the register entry")?
        .ok_or("Register entry was not found")?;
        let updated: String = row.get("updated_at");
        if request.expected_updated_at.as_ref() != Some(&updated) {
            return Err("This entry changed. Refresh the register and try again".into());
        }
        Some(row.get::<String, _>("name"))
    } else {
        None
    };
    // Existing legacy duplicates can still be deactivated; no new duplicates are introduced.
    if old
        .as_ref()
        .is_none_or(|old| old.trim().to_lowercase() != name.to_lowercase())
    {
        let names = sqlx::query(&format!(
            "SELECT name FROM {table} WHERE deleted_at IS NULL"
        ))
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| "Could not check the register name")?;
        if names
            .iter()
            .any(|row| row.get::<String, _>("name").trim().to_lowercase() == name.to_lowercase())
        {
            return Err("This name already exists. Edit or reactivate the existing entry".into());
        }
    }
    let now = chrono::Utc::now().to_rfc3339();
    let id = request
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    if request.id.is_some() {
        let changed = sqlx::query(&format!("UPDATE {table} SET name=?,description=?,is_active=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL"))
            .bind(name).bind(description).bind(request.is_active).bind(&now).bind(&id).bind(&request.expected_updated_at)
            .execute(&mut *tx).await.map_err(|_| "Could not update the register entry")?.rows_affected();
        if changed != 1 {
            return Err("This entry changed. Refresh the register and try again".into());
        }
        if matches!(request.kind, Kind::Shelf) {
            sqlx::query(
                "UPDATE products SET shelf_location=?,updated_at=? WHERE shelf_location_id=?",
            )
            .bind(name)
            .bind(&now)
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|_| "Could not update assigned product locations")?;
        }
    } else {
        sqlx::query(&format!("INSERT INTO {table}(id,name,description,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)"))
            .bind(&id).bind(name).bind(description).bind(request.is_active).bind(&now).bind(&now)
            .execute(&mut *tx).await.map_err(|_| "Could not create the register entry")?;
    }
    sqlx::query("INSERT INTO audit_events(id,event_type,actor_id,occurred_at,entity_type,entity_id,reference,details) VALUES(?,?,?,?,?,?,?,?)")
        .bind(Uuid::new_v4().to_string()).bind(if request.id.is_some() {"register_updated"} else {"register_created"})
        .bind(actor).bind(&now).bind(table).bind(&id).bind(name)
        .bind(format!("active={}; name={name}", request.is_active)).execute(&mut *tx).await.map_err(|_| "Could not record the register change")?;
    tx.commit()
        .await
        .map_err(|_| "Could not save the register change")?;
    Ok(id)
}

#[tauri::command]
pub async fn list_catalog_register(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    kind: Kind,
) -> Result<Vec<Entry>, String> {
    list(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        kind,
    )
    .await
}
#[tauri::command]
pub async fn save_catalog_register(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: SaveRequest,
) -> Result<String, String> {
    save(
        &crate::database_api::pool(&instances).await?,
        &current_actor(&session).await?,
        request,
    )
    .await
}
