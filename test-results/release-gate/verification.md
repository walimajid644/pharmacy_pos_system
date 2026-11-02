# Single-store Phase 1 release-gate evidence

User-facing date: November 1, 2026 (Asia/Karachi).

## Passed automated checks

- 63 native Rust tests, including the integrated counter day on separate fresh and populated pre-inventory on-disk databases.
- Native counter day: first-password gate/change, initialize twice, preserved old balance/opening ledger, receive 20, pack+loose sale consumes 12 with confirmation, saved sale Rs 120/change Rs 30, supplier payment Rs 40/outstanding Rs 60, overpayment blocked, expense Rs 10, cash return Rs 10/restock 1, approved adjustment -1, final stock/movement sum 8, blind close expected/count Rs 160, zero variance, post-close expense void blocked, sensitive audit facts, actual view queries, gated daily-closing write, native VACUUM snapshot, restore and reopen twice, integrity/foreign keys.
- Production frontend TypeScript/Vite build.
- Real SQLite inventory triggers and commercial queries/migrations/quarantine valuation.
- Cart pricing/bonus/discounts, Asia/Karachi business-day and saved receipt smoke checks.
- 32 browser scenarios: {"phase1": 11, "phase2": 7, "phase3": 6, "release-gate": 8}. Screenshots and JSON results are in their respective output directories.

## Important evidence limits

Browser fixtures mount real Vue screens; the release-gate fixture also mounts real App.vue, auth/cart/purchase-draft stores. Tauri calls are mocked and the fixture alone advances Date.now to simulate five minutes. This tests frontend lock behavior with normal, failed and stalled logout, keyboard renewal and the first resumed click. Native session timeout is covered separately. No timeout shortening or test bridge is added to production.

No installed pharmacy data was read or modified. The native counter-day tests use uniquely named temporary synthetic databases, then delete only their own successful test directories. The restore is into a separate synthetic file.

Native desktop automation was attempted using the computer-use runtime; initialization failed repeatedly, including after reset, with: failed to write kernel assets: The system cannot find the path specified. The alternate available desktop runtime failed the same way. No signed-in native desktop test is claimed.

User confirmed development PC only. Clean Windows PC/VM, printer/scanner tests and signed-in native desktop walkthrough remain pending. CLEAN_INSTALL_TEST.md manual rows remain unchecked. No later-phase feature work is started.

Windows installer/executable hashes and sizes are recorded separately in artifacts.json after the current bundle succeeds. Build success is not installation acceptance.

Final optimized Windows executable and NSIS x64 installer build passed. SHA-256/sizes recorded in artifacts.json and CLEAN_INSTALL_TEST.md. No installer was launched and no installation acceptance was marked passed.
