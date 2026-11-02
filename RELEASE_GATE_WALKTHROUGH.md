# Release gate — disposable counter-day walkthrough

Status: **not executed through the native desktop UI**. Use only a disposable Windows account/VM or separately isolated application identifier/data directory. Installing this candidate on the same Windows account uses the existing application identifier and may open its existing pharmacy database; that is not a fresh-install test.

Record operator, date, OS/build, WebView2 version, application artifact SHA-256 and database variant (fresh/upgraded). Run once on fresh data and once on a backup copy of older synthetic data. Keep screenshots, error text and stock/drawer totals at each step. Do not mark a step passed from automated unit-test evidence alone.

## Deterministic counter day

1. Install on clean Windows 10/11 x64 with no Node, Rust or Visual Studio. Verify the installer hash against the artifact manifest. Confirm WebView2 bootstrap if needed and that the desktop shortcut works without the repository or a dev server. A developer-PC launch cannot close this check.
2. On a fresh database, confirm empty catalogs and forced administrator password change. Sign out and back in using the changed test password. On an upgraded synthetic database, confirm its original products/customers/balances and migrations survive a second restart.
3. Set tax to zero for this fixture. Create a synthetic supplier with 30-day terms and a product with retail unit price Rs 10, cost Rs 5, pack size 10 and loose sales enabled. Use a unique test SKU/barcode. Open the cashier shift with Rs 100.
4. Create/send a PO for 20 base units at Rs 5, then receive 20 into a future-dated batch. Expect received value Rs 100, stock 20 and an incoming stock movement of +20. Inspect partial/final and invalid receipt paths separately as listed in NEXT_STEPS_CHECKLIST.md.
5. Sell one pack and two loose units from that batch. First decline/omit the required strip confirmation and verify no invoice/stock write. Confirm the strip and complete the cash sale: net Rs 120, received Rs 150, change Rs 30, stock 8. Verify the “Strip opened” line badge, saved invoice lines and outgoing movements totalling -12.
6. Pay supplier Rs 40 cash against the received PO. Expect outstanding Rs 60, a saved printable voucher and Rs 40 drawer outflow. Attempt Rs 60.01: reject with attempted/outstanding amounts and no extra payment. Check payment-term aging and voucher contents.
7. Record a Rs 10 cash expense. Return one of the loose units for Rs 10 cash, approve and complete with restock: stock 9 and a refund reference. Submit a damaged-stock decrease of one unit, approve: stock 8. Confirm a repeated approval/refund does not apply twice; exercise reject, over-return and insufficient-stock paths separately.
8. Before closing, confirm expected drawer cash is hidden in the blind-count form. Count Rs 160: opening 100 + sale 120 - supplier 40 - expense 10 - refund 10. Close and expect zero variance. Attempt to void the earlier cash expense; expect a closed-drawer explanation and no ledger change.
9. Daily Closing and sales reports show one completed invoice and gross invoiced/cash sales Rs 120. Physical drawer cash is Rs 160; sales summaries do not include opening float or the other cash movements. Check the refund/shift reports separately and verify final stock/movement net 8.
10. Close/reopen and verify persistence. Confirm today's valid automatic snapshot. Export to an existing test folder/USB location; inspect the path and backup ownership. Following PHARMACY_OPERATIONS.md, restore that snapshot only into disposable test data and verify invoice, stock, drawer and migration integrity after two restarts. Verify seven-day retention and the missing-backup close prompt without deleting the only good recovery copy.

## Counter UX, security and hardware

- Repeat POS with keyboard, scanner and mouse at 1024×600 in English, Urdu/mixed and light/dark. Confirm dock, total and checkout remain reachable; focus/Tab/Escape operate correctly.
- Leave a nonempty unsaved cart idle for five real minutes. It must clear and require sign-in; returning after suspension must not revive it. Reload/sign back in and check the old cart is absent.
- Print saved A4/80 mm receipts, a barcode label and the supplier voucher on intended printers. Verify header/footer, patient/doctor fields, controlled-product DRAP number where configured, margins, Urdu shaping and barcode scans.
- Last-sale reprint must use saved invoice data after clearing the cart. Copy SMS text and inspect a WhatsApp draft only with an operator-controlled test number; sending messages is not required to pass the saved-data check.
- Test all allowed and denied roles using synthetic users. Recheck expense void and estimate conversion messages, current-price changes, expiry, stock shortage, cancelled/converted document rejection, and explicit no-reservation wording for pre-orders.

Attach results to CLEAN_INSTALL_TEST.md and NEXT_STEPS_CHECKLIST.md. Failed or unexecuted steps remain pending. No FBR/DRAP integration claim follows from receipt fields or this walkthrough.

## Phase 2 acceptance additions — still pending native desktop execution

- Verify customer badges for debt, over-limit debt, account credit and settled balance. Load one statement, switch customer and confirm prior totals/actions clear before the new load. Print only after the correct customer loads; verify the collection form uses that same customer. Customers in credit or at zero balance must have no collect-debt action.
- Run the registered-customer Udhar sale/limit, collection/void and credit-note return flows. Check saved ledger, aging, invoice totals, balance and drawer effects; walk-in credit and overpayment stay blocked. Print the statement on the intended equipment.
- Set expiry warning to 14 days. Use synthetic batches at +10, +30 and -1 calendar days. The default expiry workspace includes +10 and -1, excludes +30; All batches still shows +30. An expired quarantined batch must show both states.
- Quarantine every unit of a near-expiry batch. Its report row must remain visible with zero outside-quarantine quantity and a positive held quantity; retail value includes those held units. The manager report link and product batch row action must open the exact batch. Confirm held-only stock cannot take the available-stock adjustment path; resolve it through Quarantine audit.
- From a batch with units outside quarantine, open write-off/supplier-return actions and verify batch/reason are prefilled, stock remains unchanged before approval, and native approval/hold rules still apply. An accountant may inspect the report but cannot open the manager workspace or perform stock actions.
- Run Cashier Performance as accountant and manager for a local date range. Inspect invoice count, net sales, refunds, average bill, rate and separate credit payment mix; verify visible footer totals at 1024×600.

## Phase 3 acceptance additions — not yet executed in the native desktop

- Back up disposable data. Import representative owner-reviewed CSV and `.xlsx` files using Text-formatted identifiers, Urdu/English names, category/manufacturer names, wholesale fallback/zero, multiple batches and loose opening stock. Preview alone must not write. Confirm base quantities, prices, open units, movements, new lookups and audit after explicit approval.
- Exercise duplicate/archived SKU, barcode, formula, malformed date, missing batch field, invalid decimal and pack-only partial-quantity failures. Verify nothing is partially saved and repeated requests cannot duplicate opening stock. Test real-data scale; synthetic automated evidence does not establish the one-day onboarding target.
- Bulk-review exact selected products. Verify category/reorder changes preserve stock/prices, unused pack changes work, and any used/stale product blocks the whole operation.
- Sell a controlled product with no evidence: reject without invoice/stock/credit changes. Complete with a patient+doctor pair, and separately with a dedicated prescription note. Change catalog name/controlled/DRAP after a saved synthetic sale; report, last-sale print and Sales History must retain saved facts. Check generic search and minimum-size/dark layouts.
- Verify cashier own receipt recovery still works, another cashier's receipt remains blocked, and raw prescription tables/import journal are inaccessible to cashier while the dashboard remains usable. Check report roles, date boundaries, paging and legacy-classification labels.
- Treat FBR as a separate open gate. Follow FBR_INTEGRATION_STATUS.md only after the correct onboarding route and assigned sandbox data are available. The mocked browser test is not an FBR test, and sandbox validation is not invoice submission or production acceptance.
