# Single-store Phase 2 completion-pass verification

Date: November 1, 2026 (Asia/Karachi).

- 63 Rust library tests passed, including the native fresh/upgrade counter day, checkout/credit/quarantine/shift/supplier/backup regressions.
- Production TypeScript/Vite build passed.
- Actual near-expiry report SQL tested against real migrated SQLite: held-only batch retained; separate available/held quantities and correct retail valuation; local-day expiry difference; inclusive configured threshold; resolved hold excluded.
- Existing commercial/valuation/upgrade, cart, business-day and saved-receipt smoke checks passed.
- 42 headless browser scenarios across five suites: {"phase1": 11, "phase2": 7, "phase3": 6, "release-gate": 8, "single-store-phase2": 10}. Ten new scenarios cover four debt badges, dark-mode colors, failed/out-of-order customer statements, correct printed customer and collection target, account-credit collection guard, held-only expiry report/deep link, supplier-return approval routing, accountant restrictions, configured 14-day filtering, independent expired/quarantine badges, exact product-batch action and cashier report mix/totals.

Screenshots/results are alongside this file and in the other suite directories. The dark-mode test waits for CSS transitions and asserts the badge color before capture.

Evidence limits: real Vue views/stores mounted in isolated browser fixtures, with mocked Tauri commands; these are not signed-in native desktop acceptance. Rust tests and SQL checks use temporary/in-memory synthetic databases. The installed pharmacy database was not opened or modified. No schema migrations or native money/stock mutation logic changed in this increment.

Phase 1 clean Windows, signed-in native desktop and intended printer/scanner acceptance remain pending. The user authorized advancing to the Phase 2 completion pass; that authorization is not evidence those gates passed. Catalog import, controlled-drug enforcement/reporting and FBR work are not started.

Current executable and NSIS installer artifact hashes/sizes will be recorded alongside this file when bundling finishes. The build is not installed by this verification run.

Final optimized executable and NSIS x64 installer builds passed. Current hashes/sizes are in artifacts.json and CLEAN_INSTALL_TEST.md. No installer was launched.
