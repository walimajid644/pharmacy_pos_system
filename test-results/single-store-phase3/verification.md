# Single-store Phase 3 verification

Date: November 1, 2026 (Asia/Karachi).

- 77 native Rust library tests passed. New cases cover reviewed import validation, conflicts introduced after preview, full rollback after later batch failure, repeated-request stock idempotency, open loose-unit initialization, bulk stale/history/role guards, historical migration preservation, controlled evidence/rollback, saved classification and DRAP, report roles and prescription-table privacy. Core checkout, credit, shifts, returns, purchasing, supplier payments and backup regressions remain green.
- 52 browser scenarios across six suites: {"phase1": 11, "phase2": 7, "phase3": 6, "release-gate": 8, "single-store-phase2": 10, "single-store-phase3": 10}. Ten new cases cover real browser CSV/file parsing, review/acknowledgement and retry nonce, keyboard modal behavior, row failures, exact bulk selection/revisions, pack-history failure UX, controlled POS evidence/receipt, generic search, report paging/roles and the mocked FBR credential gate.
- Parser smoke: actual synthetic .xlsx ZIP workbook and UTF-8 CSV, quoted cells, Urdu text, leading-zero identifiers, explicit zero wholesale price, numeric identifier rejection, formula rejection, older format/encoding errors, expanded-archive limit and CSV formula neutralization.
- Actual UI SQL against migrated SQLite: commercial/stock/expiry reports, quarantine valuation and populated upgrade checks passed. Cart, local-day and saved-receipt smoke tests passed.
- TypeScript/production Vite build and optimized Tauri executable + NSIS x64 installer build passed. Artifact hashes/sizes are in artifacts.json and CLEAN_INSTALL_TEST.md.

## Evidence limits

Only synthetic local/temporary data was used. No installed pharmacy database was opened, no installer launched, no live FBR request sent and no real token used. Browser Tauri/FBR commands are mocked; native unit tests exercise actual transactions/validation logic without network.

FBR DI validation is a real implemented HTTP connector, but live connectivity/onboarding is untested. The route is not confirmed, credentials and assigned scenarios are unavailable, and production posting/reconciliation/receipt integration is not implemented. See FBR_INTEGRATION_STATUS.md. Sandbox validation alone is not invoice submission or fiscal compliance.

Real pharmacy sample import, one-day onboarding benchmark, signed-in native desktop, clean Windows and physical printer/scanner acceptance remain open. Older classification is copied from catalog state at upgrade and marked as imported; no missing prescription history is invented. There is no bundled verified starter medicine database or narcotics-register certification.

Dependency review: npm audit reports the existing three moderate development-toolchain findings through vue-tsc/language-core/minimatch. Cached RustSec audit retains rsa and non-Windows informational findings; target-specific tree checks are recorded in DEPENDENCY_AUDIT.md. No blanket clean-security certification is claimed.
