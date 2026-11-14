# Component and module refactor

Updated November 14, 2026 (Asia/Karachi).

The reviewed large mixed-responsibility screens have been separated into views, feature components and workflow composables. The earlier Products/Home/purchase-form batch is included in this completed structural pass.

- 35 feature components across Products, Dashboard, POS, Purchases/Receiving, Sales History, Reports, Settings, Suppliers and Users.
- Workflow logic extracted from 21 additional views: POS, Sales History, Reports, Suppliers, Settings, Daily Closing, Users, Customers, Sales Returns, Purchase Orders, Purchase Receiving, Commercial Documents, Finance, Supplier Ledger, Expiry Actions, Dashboard workspace, Advanced Search, Customer Ledger, Purchase Suggestions, Catalog Import and the Sales Return form.
- POS logic separated further into customer lookup, product/barcode search, cart-line rules and source-document loading; the terminal composable coordinates checkout and payment state.
- Explicit draft models, typed command/data props and typed report rows preserve the existing native command interfaces.
- Terminal styles are namespaced per feature; invoice print markup and print styles share a component. Browser regressions caught and verified the POS dark-theme ancestor selectors after extraction.
- Inline Rust tests moved out of `sales.rs`, `database_api.rs`, `purchase_orders.rs`, `submissions.rs` and `commercial.rs` into their corresponding `*/tests.rs` files. Their module names and migration includes are preserved.

Atomic Rust transaction bodies, authorization enforcement, database schema and financial calculation rules remain together. Larger files with one coherent transaction or shared design-system responsibility are intentional; the goal is clear ownership, not an arbitrary maximum line count.

Verification: production TypeScript/Vite and Tauri/NSIS builds, 79 Rust library tests, all six browser suites (59 scenarios), and the real SQLite commercial/expiry/valuation checks pass. SQL tests read the relocated workflow source. Targeted save checks exercise Products, Purchase Orders, Suppliers, Users and Settings through component boundaries. The isolated native test build passed the counter day, role restrictions, backup export and 90 route/locale/theme/viewport checks; two process restarts and exported-snapshot integrity also passed. Its result and limitations are recorded in `test-results/native-acceptance/latest.json` and `persistence.json`.

Original source snapshots for this pass are retained under `test-results/component-refactor/baseline/`. One-off extraction scripts have been removed. See `src/components/README.md` for ownership and extension conventions. Clean-machine, physical hardware, real-shop and FBR acceptance gates are separate from this source refactor.

The extraction line counts above were recorded before the November 14 standard-formatting pass. Formatting expands compressed source without changing the feature/component boundaries.
