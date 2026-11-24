# UI workflow and palette update

Implemented on 2026-11-25. Existing compact font sizes, field heights, row heights,
pagination and keyboard shortcuts are preserved.

- Navigation: Sales, Inventory, Purchases, Finance, Reports, Admin and General
  Settings. All 44 previous menu destinations plus POS and Products are reachable;
  existing route permission checks remain in place. Long menus scroll within the
  viewport. Navigation and dashboard shortcuts share SVG icons.
- Colors: legacy brand and surface names and Tailwind primary/card utilities
  follow the shared teal and neutral tokens. Light primary is `#0F6E56`, hover
  `#085041`, selection `#E1F5EE`, page `#F7F6F2`, card `#FFFFFF`. Dark action fills
  remain deep enough for white labels; standalone accent text uses a lighter tint.
- Checkout: distinct total panel, accented tender input and change amount, quieter
  payment selection, and a solid primary Complete Sale action.
- Tables: restrained striping, hover and focus/selection states, sticky column
  headings, aligned POS numeric headings and stronger medicine-name hierarchy.
  Near-expiry and low-stock states use amber; expired stock uses red, with labels.
- Forms: fewer internal product-form dividers, consistent shared input styling,
  inline SKU/name errors with focus on the first invalid field, and an accessible
  registration-date label. Existing domain validation still runs on save.

## Verification

- Production build, TypeScript, ESLint and changed-file Prettier checks passed.
- Compact browser suite passed: 46 unique navigation destinations, long-menu
  access, Escape behavior, inline required fields, paged registers and dialogs.
- UI polish browser suite passed: 96 locale/theme layouts at 1024 x 600, Urdu RTL,
  keyboard entry, save/report shortcuts and permission denial.
- Accessibility suite passed: eight routes and four dialogs in English/light,
  with no critical or serious automated findings. This is not a full accessibility
  certification.
- Light/dark dashboard, checkout and product/error-dialog screenshots were
  inspected. Evidence is in ignored `test-results/compact/`.

Two broader checks remain failing outside this UI change: the older `phase1`
browser suite expects five dashboard shortcuts despite the current seven; the
unit runner's opening-balances storage fixture lacks `purchase_receipts`.

## Last-priority backlog

Readability/density options are deferred at the user's request. Do not increase
the current operational font sizes or control heights as part of this update.
