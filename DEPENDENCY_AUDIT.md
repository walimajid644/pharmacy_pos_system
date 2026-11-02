# Dependency audit

## November 1, 2026 — Phase 3 additions

Runtime additions: `read-excel-file` 9.3.14 and `fflate` 0.8.3 for local `.xlsx` parsing/inspection; `reqwest` 0.13.5 with default features disabled and `json,native-tls` for the fixed DI sandbox validation call. The Windows TLS path uses Schannel and keeps certificate checks enabled. The failed AWS-LC build path was replaced; it is not the configured TLS provider.

`npm audit --json` reported three moderate development-toolchain findings through `vue-tsc` → `@vue/language-core` → `minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). No finding in that report names either new Excel runtime dependency. A forced major toolchain upgrade was not mixed into the feature change; this is not a blanket clean-security certification.

`cargo audit --no-fetch --json`, run against `src-tauri/Cargo.lock`, reports one `rsa` vulnerability and the existing `glib` / `proc-macro-error` informational findings using the cached advisory database (freshness metadata unavailable). Updated target-specific checks for `rsa`, `glib` and `proc-macro-error` with `cargo tree --target x86_64-pc-windows-msvc -i <crate> --offline` each returned no dependency path. The historical cross-platform findings remain documented below. Re-fetch/review advisories and complete the separate FBR security/onboarding review before live activation.

## Historical review — October 27, 2026

Target: Windows x64 desktop installer, version `0.1.0`.

## npm

The initial audit reported Vite/esbuild development-server advisories and a Zod advisory. Vite and `@vitejs/plugin-vue` were upgraded; Zod was upgraded to 4.6.7 and the old Vee Validate adapter was removed from the login form. `npm audit --audit-level=low` now reports **0 vulnerabilities**. The frontend production build passes.

## Rust

`cargo audit --no-fetch --json` reports one vulnerability in the lockfile: [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html) for `rsa` 0.9.10. RustSec lists no patched version. Cargo metadata places `rsa` below optional `sqlx-mysql`; `cargo tree --target x86_64-pc-windows-msvc -i rsa` shows no dependency path in this Windows build. The app uses SQLite and does not provide a MySQL connection or network RSA private-key operation. This lockfile finding is not an active component of the Windows installer; retain it for review if database features or target platforms change.

The informational `glib` unsoundness and unmaintained `proc-macro-error` findings are in the Linux GTK dependency path. `cargo tree --target x86_64-pc-windows-msvc -i glib` and `-i proc-macro-error` show no Windows dependency path.

The release is still gated by signed-in workflow, printer, language, and clean-machine tests in [NEXT_STEPS_CHECKLIST.md](NEXT_STEPS_CHECKLIST.md). Re-run both audits and review the RustSec exception before a later release.
