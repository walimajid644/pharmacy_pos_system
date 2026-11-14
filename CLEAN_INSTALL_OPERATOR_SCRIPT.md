# Clean Windows operator script

Use a clean Windows 10/11 x64 PC or VM without Node, Rust or Visual Studio. The development PC does not satisfy this gate. Use synthetic data only.

1. Copy the candidate NSIS installer and `RELEASE_NOTES.md`. Calculate its SHA-256 with `Get-FileHash` and compare it to the recorded candidate. Record Windows and WebView2 versions, date, operator and installer hash in `CLEAN_INSTALL_TEST.md`.
2. Install and launch from the shortcut without the repository or development server. Complete the first administrator password change manually, sign out and sign in again. Record any installation/runtime errors verbatim.
3. Follow the deterministic ten-step counter day in `RELEASE_GATE_WALKTHROUGH.md`. Expected checkpoints: received stock 20; sale Rs120, received Rs150/change Rs30, remaining stock8; supplier outstanding Rs60 after Rs40 payment; final stock8 after return/adjustment; blind drawer count Rs160 with zero variance.
4. Perform its Phase 2 additions: registered-customer credit/limit/collection/return, statement customer switching, held-only expiry inventory and cashier report roles. Verify amounts and stock in the installed screens.
5. Perform its Phase 3 additions: reviewed CSV/Excel import, rejected invalid rows, bulk history/stale-edit guards, controlled-sale evidence and saved DRAP/classification. Use an owner-reviewed real pharmacy sample separately and record the time required for setup.
6. Print A4 and 80 mm saved receipts, supplier voucher, customer statement and barcode label on intended equipment. Verify Urdu shaping, margins and scans; measure a multi-item keyboard/scanner sale. A PDF preview is not a printer/scanner pass.
7. Verify English/Urdu/mixed, light/dark, keyboard focus, Enter/Escape and visible checkout/totals at 1024×600, 1280×800 and a larger window. Leave an unsaved cart idle for five real minutes and confirm it clears and requires sign-in.
8. Export a backup, close the app, and restore only the disposable test database following `PHARMACY_OPERATIONS.md`. Reopen twice and verify invoices, drawer totals, balances and stock. Repeat core checks on an isolated backup of an older synthetic database; retain the original backup.
9. Run the master prompt's eight-step demo continuously. Record failures with the exact action, screen/error, expected/actual values and a screenshot. Retest a repaired step before marking it passed.
10. Keep FBR separate: route is still unconfirmed. Enter credentials only locally after onboarding/scenarios are available. A local sale, mocked test or manual sandbox validation is not proof of accepted fiscal invoice submission.

Mark unexecuted checks **Pending**. The isolated debug/native automated suite supplies useful integration evidence; it does not close the clean installer or physical hardware gates.
