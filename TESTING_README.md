# Desktop testing

Use [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md) as the acceptance record. A successful build or database unit test does not prove that a signed-in workflow works in the installed app.

## Safe test data

Use a disposable Windows account or isolated Tauri test identity for fresh-install testing. Back up any existing database before testing an upgrade. Never delete the pharmacy database to reset a test. The data location and backup procedure are in [PHARMACY_OPERATIONS.md](PHARMACY_OPERATIONS.md).

## Automated checks

Run from the repository folder:

```powershell
npm ci
npm audit
npm run build
node --experimental-strip-types tests/business_day_smoke.mjs
python tests/test_inventory_schema.py
cd src-tauri
cargo test --lib --offline -q
cd ..
npx tauri build --ci
```

Some Python fixture scripts require a prepared isolated database or an explicit path; read their headers before running them. The backup/restore smoke test uses a separate test identity and must never target the production application directory.

## Manual desktop checks

On a fresh database, sign in, change the initial password, and verify navigation and all screens at 1024 × 600, 1280 × 800, and a larger desktop size. Test each role, English/Urdu/mixed labels, light/dark themes, empty/loading/error states, keyboard operation, sales, receiving, adjustments, returns, daily closing, reports, and Settings. Use real receipt and barcode printers for print acceptance.

Repeat the critical workflows against a copy of an older database and confirm records survive the migration. Finally, install the release candidate on a clean Windows machine without Node.js, Rust, or Visual Studio and repeat the critical workflows. Record the installer filename, checksum, Windows version, test date, and results in the checklist.
