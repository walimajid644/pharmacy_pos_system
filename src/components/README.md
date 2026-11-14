# Feature components

Keep shared controls in `ui/` and screen-specific components in their feature folder.

| Folder           | Responsibilities                                                                |
| ---------------- | ------------------------------------------------------------------------------- |
| `products/`      | Product table/actions, product form, barcode preview and print lifecycle        |
| `dashboard/`     | Metrics, hourly sales chart, recent bills and inventory alert tables            |
| `purchases/`     | Order information, editable lines and order totals                              |
| `pos/`           | Cart table, sale summary, prescription fields and payment methods               |
| `sales-history/` | Filters, invoice register, detail dialog and saved invoice print document       |
| `reports/`       | Daily sales, product sales, low stock, near expiry and stock valuation displays |
| `settings/`      | Appearance, company, tax, inventory and receipt settings                        |
| `suppliers/`     | Supplier cards and create/edit dialog                                           |
| `users/`         | User register and create/edit dialog                                            |

Views coordinate routing, role checks and feature components. Feature workflows live in `src/composables/`; the POS coordinator delegates customer lookup, barcode search, cart-line rules and source documents to separate composables. Form and result contracts live in `src/lib/`, including `productForm.ts`, `dashboardTypes.ts`, `purchaseOrderForm.ts`, `pos.ts` and `reportTypes.ts`.

Use typed props for input data, named events or typed command callbacks for actions, and explicit `v-model` contracts for editable drafts. Keep filtering and temporary UI state with the component that uses them. Keep native save commands and request construction in the workflow composable; stock and money transactions remain native Rust operations. Props derived from workflow refs unwrap only the outer ref, preserving router and Pinia object contracts.

Move scoped styles with the markup they style. Parent views own page layout; feature components own their internal presentation. Terminal-wide styles live in a namespaced feature stylesheet so theme and responsive rules work across child boundaries. Saved invoice print styles live with its teleported print document. A component that changes document-level print state must clean it up when printing ends or the component unmounts.

Extract meaningful UI sections and workflows. File length alone is not a reason to add a component. Preserve existing keyboard behavior, role restrictions, translations, theme styles and native request shapes during extraction.

Relevant checks: `npm run build`, `tests/phase1_ui_smoke.mjs` and `tests/phase3_ui_smoke.mjs`. Browser checks use the isolated mocked Tauri fixture and a local Vite server on port 1422; they do not replace native transaction or printer acceptance tests.
