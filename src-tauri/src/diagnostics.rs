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
}

#[derive(Serialize)]
struct Entry {
    timestamp: String,
    version: &'static str,
    event: Event,
    source: Source,
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
    };
    let _ = append(&dir.join("logs"), &entry, MAX_BYTES);
}

#[tauri::command]
pub fn record_diagnostic(app: AppHandle, request: DiagnosticRequest) {
    record(&app, request.event, request.source);
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
    fn diagnostics_rotate_only_owned_log_files() {
        let dir =
            std::env::temp_dir().join(format!("pharmacy-diagnostics-{}", uuid::Uuid::new_v4()));
        let entry = Entry {
            timestamp: "synthetic".into(),
            version: "test",
            event: Event::OperationFailed,
            source: Source::Database,
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
