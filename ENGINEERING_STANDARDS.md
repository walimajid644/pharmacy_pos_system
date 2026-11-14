# Engineering hardening

This is a maintainability and release-quality baseline, not a certification of
every industry standard. External acceptance gates remain in
`RELEASE_GATE_STATUS.md`.

## Repeatable checks

- `npm ci` installs the committed frontend lockfile. Rust is pinned in
  `rust-toolchain.toml`; Cargo's application lockfile is committed too.
- `npm run check` runs ESLint, Prettier, strict Vue/TypeScript checks, frontend
  logic and migrated-schema tests, Rust formatting, Clippy and native tests.
- `npm run verify` adds the production frontend build, six browser acceptance
  suites, automated accessibility/keyboard checks and a synthetic SQL baseline.
- `npm audit --audit-level=moderate` and `npm run audit:rust` check dependencies.
  Install `cargo-audit` 0.22.2 before the latter command.
- `.github/workflows/quality.yml` runs these checks on Windows, then builds and
  exercises an isolated native application, restarts it, verifies its backup and
  checks effective CSP. Action revisions are pinned; permissions are read-only.
  The workflow must run on the hosting service after these changes are pushed.

The browser fixture tests use synthetic records and mocked native commands.
Native acceptance uses real commands in a separate application data directory;
it never connects to the normal shop database. Generated evidence is stored in
ignored `test-results/`, retained as CI artifacts for 14 days. Installed
`node_modules/` is also ignored; both directories remain available locally.
Sanitized summaries belong in `docs/verification/`.

## Security and diagnostics

The desktop Content Security Policy restricts scripts to application assets and
browser network access to Tauri IPC. Development additionally permits the local
Vite websocket. Runtime styles remain available for existing themes and receipts.
Native security acceptance verifies both rejection and permitted styling.

Operational diagnostic files contain only a UTC timestamp, application version,
event code and source code. The command rejects extra fields and arbitrary event
text. It does not accept exceptions, SQL, names, passwords or transaction payloads.
The logger retains three files of at most 1 MiB each, admits at most 120 events
per minute, and treats failures as best effort. These diagnostic files supplement
the existing business audit history; they do not replace it.

Vue errors and unhandled promises produce a bounded notification and redacted
event. A failed operation never automatically retries a sale. Native tests also
assert that expected workflows emit no unexpected frontend diagnostic events.

The SQLite security backport is documented in `src-tauri/vendor/README.md`.
It upgrades the bundled engine while retaining stable SQLx/Tauri pool types.
The Rust audit gate compares findings to the actual Windows dependency graph;
it reports inactive optional/other-platform dependencies rather than silently
ignoring their advisory IDs. Adding a vulnerable driver to the Windows build
causes the gate to fail.

## UI quality

Shared input fields generate unique IDs and associate labels, hints and errors.
Existing adjacent labels have explicit control associations. Product, customer,
user and supplier forms have named dialog semantics, focus entry, Tab trapping,
Escape handling and trigger-focus restoration. The accessibility scan covers
eight routes and those four dialogs at 1024×600 in English/light mode. It gates
critical and serious findings and records incomplete checks for manual review.
This does not establish full WCAG conformance or screen-reader acceptance.

The performance baseline executes the actual POS search SQL against 20,000
synthetic products and 40,000 batches. It records median and 95th-percentile
timings and catches severe regressions. Python SQLite, native IPC, rendering,
production transaction volume and real hardware have different performance
characteristics; the baseline explicitly identifies its scope.

## Signing and remaining release work

Run `powershell -File scripts/check-signatures.ps1` to inspect the release
application and NSIS installer. Adding `-RequireSigned` fails unless both have
valid trusted Authenticode signatures. This check does not create a certificate
or sign a binary. A real publisher certificate or managed signing service and
its protected credentials are still required before signed distribution.

Clean Windows installation, physical receipt/label printers, barcode scanner,
real shop acceptance, and confirmed FBR onboarding/network validation remain
external release gates. Do not infer completion from automated development-PC
tests. Full Urdu/dark accessibility and assistive-technology review remain
separate acceptance work.
