# UI surface softening audit

The loaded token stylesheet is `src/assets/styles/index.css`; this repository has no `src/style.css`. The requested banner tokens were added to its existing root/dark blocks. Existing palette values were preserved. The three requested radius tokens now use 6px, 10px, and 14px.

## Applied rules

- Cards, metrics and panels: neutral `surface-card`, neutral borders, 10px corners.
- Dialogs, modal panels and popovers: 14px corners, with panel children clipped to the rounded outline.
- Buttons, chips, badges and fields: 6px corners.
- Metric icons: 40px circular chips, role-50 background and role-600 monochrome SVG. Semantic roles without an existing numbered scale alias their existing tint/base tokens; no existing color value was changed.
- Status banners, toasts and filled role indicators: banner background/border tokens. Dark text uses existing light semantic colors for contrast; existing color tokens remain unchanged.
- One strong accent per card or row. Prefer an icon accent on a neutral card. Reserve extra emphasis for active alerts. Keep primary/secondary action fills solid.

`src/assets/styles/soft-surfaces.css` is the shared surface policy, including compact workspaces and teleported dialogs. Printed invoice/receipt markup is unchanged.

## Remaining matches for review

No remaining hard-coded `border-radius: 0` or 1–5px declarations were found on cards/panels. No solid success/warning/danger/info banner fill remains in the audited views.

The remaining strong-fill source matches are intentional:

| Location                                                              | Remaining treatment                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/assets/styles/soft-surfaces.css`, `src/components/ui/Button.vue` | Solid primary/secondary and destructive action fills                                          |
| `src/components/pos/pos-terminal.css`                                 | Checkout, payment selection, and product-add actions                                          |
| `src/assets/styles/workspaces.css`                                    | Receive/save/void actions and active commercial tabs                                          |
| `src/components/purchases/PurchaseOrders.css`                         | Selected purchase-status tab                                                                  |
| `src/components/DesktopNav.vue`                                       | Active navigation item and account avatar                                                     |
| `src/components/ui/LanguageToggle.vue`                                | Selected language control                                                                     |
| `src/views/LoginView.vue`, `BackupView.vue`, `SupplierLedgerView.vue` | Submit/action buttons                                                                         |
| `src/components/purchases/PurchaseOrderLines.vue`                     | Legacy line-number fill; the rendered compact line-number chip uses the neutral panel surface |
| `src/components/ui/Badge.vue`                                         | Small status dots, not banner/card fills                                                      |

Other intentionally unchanged geometry: circular avatar/radio/status dots, chart shapes, table cells and printed document rules. The accessibility skip link keeps its edge-attached corner shape. Skeleton shimmer and subtle table-hover gradients are neutral/tinted, not saturated banners.

## Validation

- Build and lint pass.
- 71 page/dialog states fit at 1024 × 600 with no overflow.
- Compact UI checks cover light/dark metric surfaces, exact 40px chips, and preserved keyboard/paging behavior.
- Automated accessibility: eight routes and four dialogs, no critical/serious findings.
- Light/dark dashboard screenshots and the product-dialog screenshot were visually inspected.
