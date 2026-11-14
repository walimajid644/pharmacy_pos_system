import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const target = 'x86_64-pc-windows-msvc';
const audit = spawnSync('cargo', ['audit', '--json', '--file', 'src-tauri/Cargo.lock'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (audit.error) throw audit.error;
const report = JSON.parse(audit.stdout.replace(/^\uFEFF/, ''));
if (!report.database || !report.vulnerabilities) throw new Error('Incomplete RustSec audit');
const tree = spawnSync(
  'cargo',
  [
    'tree',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--locked',
    '--offline',
    '--target',
    target,
    '--prefix',
    'none',
    '--format',
    '{p}',
  ],
  { encoding: 'utf8', windowsHide: true },
);
if (tree.error) throw tree.error;
if (tree.status !== 0) throw new Error(tree.stderr);
const active = new Set(
  tree.stdout
    .split(/\r?\n/)
    .map((line) =>
      line
        .match(/^(\S+) v(\S+)/)
        ?.slice(1)
        .join('@'),
    )
    .filter(Boolean),
);
// No global advisory ignores: classify every finding against the actual Windows
// build graph. A newly activated optional driver immediately fails this gate.
const findings = [
  ...(report.vulnerabilities.list || []),
  ...Object.values(report.warnings || {}).flat(),
];
const classified = findings.map((finding) => ({
  id: finding.advisory.id,
  package: finding.package.name,
  version: finding.package.version,
  active: active.has(`${finding.package.name}@${finding.package.version}`),
  informational: finding.advisory.informational || null,
}));
const blockers = classified.filter(
  (finding) => finding.active && (!finding.informational || finding.informational === 'unsound'),
);
mkdirSync('test-results/security', { recursive: true });
writeFileSync('test-results/security/rust-audit.json', JSON.stringify(report, null, 2));
writeFileSync('test-results/security/windows-dependencies.txt', tree.stdout);
const summary = {
  date: new Date().toISOString(),
  target,
  advisoryDatabase: report.database,
  findings: classified,
  blockers,
};
writeFileSync('test-results/security/rust-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (blockers.length) process.exitCode = 1;
