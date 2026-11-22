# SQLx SQLite security backport

`sqlx-sqlite` is based on the published 0.8.6 crate source with these changes:

- `Cargo.toml`: `libsqlite3-sys` is changed from 0.30.1 to 0.39.1.
- `Cargo.toml`: the minimum `time` version is 0.3.55, matching the format APIs
  used by the driver and the version already pinned in the application lockfile.
- `src/types/time.rs`: deprecated byte literals and year/month/hour components
  use their current equivalents. Calendar years retain the extended range,
  months remain numeric, and hours retain the 24-hour clock. Parser regression
  tests cover the supported SQLite timestamp forms.
Original manifest, VCS provenance and both upstream licenses are included.

Reason: RUSTSEC-2026-0459 affects the bundled SQLite engine. Version 0.39.1
bundles patched SQLite 3.54.1. Stable tauri-plugin-sql 2.6.0 requires SQLx 0.8;
upgrading only the application's SQLx would create incompatible pool types.
The local Cargo patch preserves the stable SQLx interface without adopting
Tauri SQL 3 alpha. The time compatibility patch also removes deprecation warnings
without suppressing diagnostics.

The Cargo lockfile pins the replacement and registry checksums. Validate with
Clippy, all native transaction/migration tests and the desktop acceptance run.
Remove this directory and the `[patch.crates-io]` entry when a compatible stable
SQLx/Tauri release includes libsqlite3-sys >=0.39.0, then repeat those checks.

References:
- https://rustsec.org/advisories/RUSTSEC-2026-0459.html
- https://crates.io/crates/sqlx-sqlite/0.8.6
- https://crates.io/crates/libsqlite3-sys/0.39.1
