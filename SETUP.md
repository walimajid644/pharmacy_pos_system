# Setup and build

## For staff

Use the Windows installer after the release checklist is complete. Staff do not need Node.js, Rust, or Visual Studio. See [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) for first sign-in and data protection.

## For developers on Windows

Install Node.js 20.19+ or 22.12+, npm, Rust with the MSVC toolchain, Microsoft C++ Build Tools with the Desktop development with C++ workload, and Microsoft Edge WebView2. These are development requirements; see the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

From this folder:

```powershell
npm ci
npm run tauri:dev
```

The app uses a local SQLite database. Development against your normal application identity may access existing records; use an isolated test identity or a backup for testing. Never delete a database to troubleshoot startup failures.

## Build the Windows installer

```powershell
npm run build
cd src-tauri
cargo test --lib --offline -q
cd ..
npx tauri build --ci
```

The configured target is NSIS. The setup executable is written under `src-tauri/target/release/bundle/nsis/`. It is a candidate artifact until a clean-machine install and full signed-in workflow check pass. The installer may need internet access to obtain WebView2 on Windows machines that lack it; see the [Tauri Windows installer guide](https://v2.tauri.app/distribute/windows-installer/). Version values in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` must match before each release.

## Database upgrades

The installer uses the same Tauri application identifier, `com.pharmacypos.app`. On startup, the app applies additive schema changes to an existing database. Back up the database and verify the backup before installing an update. See [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md) for the exact location and restore procedure.

The app also creates a daily SQLite snapshot in `%APPDATA%\com.pharmacypos.app\Backups` and keeps seven daily files. A manager can save an additional copy to an existing folder or USB drive from the **Backups** screen. Test the backup and restore workflow on the target Windows installation before using live records.

## Troubleshooting

- If `npm ci` fails, check the supported Node.js version and registry access.
- If Rust compilation fails, check the MSVC toolchain and C++ build tools.
- If the installed app does not open, record the Windows version, installer name, and visible error, then follow the support procedure. Preserve the database.
- If a database error occurs, close the app and make a copy of the database files before diagnosis. Do not reset or overwrite the only copy.
