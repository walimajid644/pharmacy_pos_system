import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyNativeSecurity({ evaluate, invoke, query, out, identifier, hash }) {
  const version = (await query('SELECT sqlite_version() AS version'))[0].version;
  const [major, minor] = version.split('.').map(Number);
  assert(
    major > 3 || (major === 3 && minor >= 54),
    'Bundled SQLite must include the 3.54.0 security fix',
  );
  const policy = await evaluate(`(async () => {
    const violations = []
    const listen = event => violations.push(event.effectiveDirective)
    document.addEventListener('securitypolicyviolation', listen)
    window.inlineSecurityProbe = false
    const script = document.createElement('script')
    script.textContent = 'window.inlineSecurityProbe = true'
    document.head.append(script)
    script.remove()
    let networkBlocked = false
    try { await fetch('https://example.invalid/csp-probe', { signal: AbortSignal.timeout(2000) }) }
    catch { networkBlocked = true }
    const style = document.createElement('style')
    style.textContent = '#security-style-probe { width: 37px } @page { margin: 2mm }'
    document.head.append(style)
    const probe = document.createElement('div')
    probe.id = 'security-style-probe'
    document.body.append(probe)
    const dynamicStyle = getComputedStyle(probe).width === '37px'
    probe.remove(); style.remove()
    await new Promise(resolve => setTimeout(resolve, 150))
    document.removeEventListener('securitypolicyviolation', listen)
    return { inlineBlocked: !window.inlineSecurityProbe, networkBlocked, dynamicStyle, violations }
  })()`);
  assert(policy.inlineBlocked, 'CSP must reject injected inline scripts');
  assert(policy.networkBlocked && policy.violations.includes('connect-src'));
  assert(policy.violations.some((value) => value.startsWith('script-src')));
  assert(policy.dynamicStyle, 'Dynamic receipt/page styles must remain usable');
  await assert.rejects(
    invoke('record_diagnostic', {
      request: {
        event: 'operation_failed',
        source: 'pos',
        message: 'SYNTHETIC_SECRET_MUST_NOT_BE_LOGGED',
      },
    }),
    /unknown field|invalid/i,
  );
  await invoke('record_diagnostic', { request: { event: 'operation_failed', source: 'pos' } });
  const dataDir = await evaluate('nativeAcceptance.appDataDir()');
  assert(dataDir.includes(identifier), 'Diagnostics must use the isolated test application');
  const contents = await readFile(path.join(dataDir, 'logs', 'diagnostics.log'), 'utf8');
  assert(!contents.includes('SYNTHETIC_SECRET_MUST_NOT_BE_LOGGED'));
  const records = contents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  for (const record of records)
    assert.deepEqual(Object.keys(record).sort(), ['event', 'source', 'timestamp', 'version']);
  assert(records.some((record) => record.event === 'operation_failed' && record.source === 'pos'));
  const result = {
    date: new Date().toISOString(),
    identifier,
    sha256: hash,
    status: 'passed',
    sqliteVersion: version,
    policy,
    diagnostics:
      'enum-only payload; extra fields rejected; bounded rotation/rate covered by Rust tests',
  };
  await writeFile(path.join(out, 'security.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
