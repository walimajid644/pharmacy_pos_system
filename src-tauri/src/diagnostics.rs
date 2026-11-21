//! Bounded operational diagnostics. No free-form text, SQL, credentials or patient data.
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 1024 * 1024;
const MAX_EVENTS_PER_MINUTE: u16 = 120;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Event {
    OperationFailed,
    FrontendUnhandled,
    PromiseUnhandled,
    BackupFailed,
    BackupRetentionFailed,
    StartupFailed,
    NativePanic,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    App,
    Auth,
    Database,
    Pos,
    Catalog,
    Reports,
    Settings,
    Workspace,
    Backup,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiagnosticRequest {
    event: Event,
    source: Source,
    #[serde(default)]
    context: Option<Context>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    General,
    ProductLoad,
    ProductSave,
    RegisterLoad,
    RegisterSave,
    DashboardRefresh,
    FrontendRender,
    FrontendEvent,
    FrontendWatch,
    AsyncTask,
    WindowError,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    Unknown,
    ConstraintViolation,
    DatabaseUnavailable,
    SchemaMismatch,
    PermissionDenied,
    SessionExpired,
    TypeError,
    ReferenceError,
    RangeError,
    ModuleLoad,
    ResizeObserver,
    Network,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    operation: Operation,
    reason: Reason,
    #[serde(deserialize_with = "support_id")]
    support_id: String,
}

fn support_id<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.len() != 16
        || !value.starts_with("ERR-")
        || !value[4..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(serde::de::Error::custom("Invalid diagnostic support code"));
    }
    Ok(value)
}

#[derive(Serialize)]
struct Entry {
    timestamp: String,
    version: &'static str,
    event: Event,
    source: Source,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<Context>,
}

#[derive(Default)]
struct Window {
    started: Option<Instant>,
    count: u16,
}

impl Window {
    fn admit(&mut self, now: Instant) -> bool {
        if self
            .started
            .is_none_or(|start| now.duration_since(start) >= Duration::from_secs(60))
        {
            self.started = Some(now);
            self.count = 0;
        }
        if self.count >= MAX_EVENTS_PER_MINUTE {
            return false;
        }
        self.count += 1;
        true
    }
}

#[derive(Default)]
pub struct Diagnostics(Mutex<Window>);

fn append(dir: &Path, entry: &Entry, limit: u64) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(dir)?;
    let log = dir.join("diagnostics.log");
    let previous = dir.join("diagnostics.1.log");
    let oldest = dir.join("diagnostics.2.log");
    let mut line = serde_json::to_vec(entry)?;
    line.push(b'\n');
    if log.metadata().map(|m| m.len()).unwrap_or(0) + line.len() as u64 > limit {
        if oldest.exists() {
            std::fs::remove_file(&oldest)?;
        }
        if previous.exists() {
            std::fs::rename(&previous, &oldest)?;
        }
        if log.exists() {
            std::fs::rename(&log, &previous)?;
        }
    }
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log)?
        .write_all(&line)
}

pub fn record(app: &AppHandle, event: Event, source: Source) {
    record_context(app, event, source, None);
}

fn record_context(app: &AppHandle, event: Event, source: Source, context: Option<Context>) {
    let Some(state) = app.try_state::<Diagnostics>() else {
        return;
    };
    // Diagnostics must never stall checkout or recurse after a logger failure.
    let Ok(mut window) = state.0.try_lock() else {
        return;
    };
    if !window.admit(Instant::now()) {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let entry = Entry {
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION"),
        event,
        source,
        context,
    };
    let _ = append(&dir.join("logs"), &entry, MAX_BYTES);
}

#[tauri::command]
pub fn record_diagnostic(app: AppHandle, request: DiagnosticRequest) {
    record_context(&app, request.event, request.source, request.context);
}

pub fn install_panic_hook(app: AppHandle) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(&app, Event::NativePanic, Source::App);
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_reject_free_form_payloads_and_unknown_codes() {
        assert!(serde_json::from_str::<DiagnosticRequest>(
            r#"{"event":"operation_failed","source":"pos","message":"patient/password/token"}"#
        )
        .is_err());
        assert!(serde_json::from_str::<DiagnosticRequest>(
            r#"{"event":"arbitrary text","source":"pos"}"#
        )
        .is_err());
        let entry = Entry {
            timestamp: "synthetic".into(),
            version: "test",
            event: Event::OperationFailed,
            source: Source::Pos,
            context: None,
        };
        let json = serde_json::to_value(entry).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 4);
        assert_eq!(json["event"], "operation_failed");
    }

    #[test]
    fn diagnostics_rate_limit_resets_after_one_minute() {
        let mut window = Window::default();
        let start = Instant::now();
        for _ in 0..MAX_EVENTS_PER_MINUTE {
            assert!(window.admit(start));
        }
        assert!(!window.admit(start));
        assert!(window.admit(start + Duration::from_secs(61)));
    }

    #[test]
    fn diagnostics_accept_bounded_context_and_reject_private_text() {
        let valid = r#"{"event":"operation_failed","source":"catalog","context":{"operation":"product_save","reason":"constraint_violation","supportId":"ERR-012345ABCDEF"}}"#;
        let request: DiagnosticRequest = serde_json::from_str(valid).unwrap();
        let entry = Entry {
            timestamp: "synthetic".into(),
            version: "test",
            event: request.event,
            source: request.source,
            context: request.context,
        };
        let json = serde_json::to_value(entry).unwrap();
        assert_eq!(json["context"]["operation"], "product_save");
        assert_eq!(json["context"]["supportId"], "ERR-012345ABCDEF");
        for invalid in [
            valid.replace("constraint_violation", "patient/password/SQL"),
            valid.replace("ERR-012345ABCDEF", "SYNTHETIC_SECRET"),
            valid.replace("product_save", "arbitrary operation"),
            valid.replace("\"reason\":", "\"message\":\"secret\",\"reason\":"),
        ] {
            assert!(serde_json::from_str::<DiagnosticRequest>(&invalid).is_err());
        }
    }

    #[test]
    fn diagnostics_rotate_only_owned_log_files() {
        let dir =
            std::env::temp_dir().join(format!("pharmacy-diagnostics-{}", uuid::Uuid::new_v4()));
        let entry = Entry {
            timestamp: "synthetic".into(),
            version: "test",
            event: Event::OperationFailed,
            source: Source::Database,
            context: None,
        };
        let limit = (serde_json::to_vec(&entry).unwrap().len() + 1) as u64 * 2;
        for _ in 0..7 {
            append(&dir, &entry, limit).unwrap();
        }
        let entries = std::fs::read_dir(&dir)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(entries.len(), 3);
        for file in entries {
            assert!(file.metadata().unwrap().len() <= limit);
            for line in std::fs::read_to_string(file.path()).unwrap().lines() {
                assert_eq!(
                    serde_json::from_str::<serde_json::Value>(line).unwrap()["source"],
                    "database"
                );
            }
            std::fs::remove_file(file.path()).unwrap();
        }
        std::fs::remove_dir(dir).unwrap();
    }
}
