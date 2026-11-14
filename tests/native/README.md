# Native desktop integration checks

This test build mounts the real App, router and Pinia stores inside Tauri/WebView2. It does **not** mock the native bridge, SQLite, authentication, checkout, stock, credit, approvals or backups. The test entry exposes test controls only in a separate frontend output; the normal release uses `src/main.ts` and never includes them.

Build from the repository root:

```powershell
node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --config tests/tauri-native.conf.json -- --offline
node tests/native_desktop_smoke.mjs
node tests/native_desktop_smoke.mjs --verify-persistence
node tests/native_desktop_smoke.mjs --verify-persistence
python tests/native_snapshot_smoke.py
```

The executable is the debug binary, not the installed release. Its application identifier is `com.pharmacypos.codex.acceptance20261108b`, separate from `com.pharmacypos.app`. The driver verifies the test entry and backup directory before writing test transactions. Only synthetic accounts/data are supported. Test authentication and first-password setup call the real native APIs; this does not count as manual testing of login/password dialogs. Local WebView2 debugging listens on port 9224 only in this test configuration. Do not add this setting or the test frontend to production configuration.

Each full run creates uniquely named synthetic records. If a prior failed run left a drawer containing transactions, the driver stops for review. It can close an unused test drawer only after confirming that no sales, receipts, expenses, supplier payments or refunds reference it, using its known opening amount. Existing test databases are retained for diagnosis; no database is silently deleted/reset.

`test-results/native-acceptance/latest.json` records completed scenarios, binary SHA-256, snapshot path and expected persistence facts. A failed full run records its failure instead of reporting a pass. Separate process restart checks require a successful full run with the same binary and append evidence to `persistence.json`. Screenshots use a unique run prefix.

Coverage includes actual file-import review, opening/closing shift UI, purchase receipt, keyboard POS pack/loose sale, declined strip confirmation, native payments/refunds/adjustments, Udhar/wholesale/collection idempotency, controlled-sale snapshots, quarantine, protected native reads, backup export and 90 route/locale/theme/viewport combinations.

Still separate: clean Windows/NSIS installation, old-schema migration through the installed desktop, manual authentication/printing, intended physical printers/scanner, real pharmacy imports/onboarding timing and real FBR sandbox/production acceptance. Native unit tests cover old-schema upgrades independently.

## Hardening verification

After the counter-day run and persistence check, run `node tests/native_desktop_smoke.mjs --verify-security`. It verifies the patched SQLite engine, effective inline-script/network blocking, dynamic receipt styles, and enum-only diagnostic logging. Expected CSP violations belong to this separate security run and do not mask counter-day errors. Results are in ignored `test-results/native-acceptance/security.json`.

The normal counter-day run also asserts that no unexpected frontend diagnostic events occurred, so the global error handler cannot silently turn an application exception into a passing test.
