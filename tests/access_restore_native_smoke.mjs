// Runs the real Vue application inside an isolated Tauri/WebView2 test build.
// Authentication setup uses native APIs with a synthetic account, never user credentials.
// This is automated integration evidence, not clean-Windows/hardware/manual acceptance.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const out = path.resolve('test-results/access-restore/native');
await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile('tests/tauri-native.conf.json', 'utf8'));
assert(config.identifier.startsWith('com.pharmacypos.codex.acceptance'));
assert.notEqual(config.identifier, 'com.pharmacypos.app');
const exe = path.resolve('src-tauri/target/debug/pharmacy-pos.exe');
const hash = createHash('sha256')
  .update(await readFile(exe))
  .digest('hex');
const allocator = net.createServer();
const configuredPort = Number(
  config.app.windows[0].additionalBrowserArgs.match(/--remote-debugging-port=(\d+)/)[1],
);
await new Promise((r, j) => {
  allocator.once('error', j);
  allocator.listen(configuredPort, '127.0.0.1', r);
});
const port = allocator.address().port;
await new Promise((r) => allocator.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
  },
});
let processError;
child.on('error', (e) => {
  processError = e;
});
const logs = [];
child.stderr.on('data', (d) => logs.push(String(d)));
let socket, cdp, evaluate;
const results = [],
  consoleErrors = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const password = 'Synthetic acceptance 2026 only!';
const run = randomUUID().slice(0, 8);
const stamp = new Date().toISOString();
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
async function until(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(out, `${run}-${name}.png`), Buffer.from(r.data, 'base64'));
}
const invoke = (command, args = {}) =>
  evaluate(`nativeAcceptance.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const query = (query, values = []) => invoke('database_select', { query, values });
const execute = (query, values = []) => invoke('database_execute', { query, values });
const request = (command, request) => invoke(command, { request });
async function route(to) {
  await evaluate(`nativeAcceptance.router.push(${JSON.stringify(to)})`);
  await delay(250);
  assert.equal(await evaluate('location.pathname'), typeof to === 'string' ? to : to.path);
}
async function input(selector, value, event = 'input') {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input: '+${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))})()`,
  );
}
async function scan(barcode, loose = false) {
  await input('#pos-product-search', barcode);
  await evaluate(
    `document.querySelector('#pos-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:${loose},bubbles:true}))`,
  );
  await until("document.querySelector('#pos-modal-product-search')!==null");
  await evaluate(
    `document.querySelector('#pos-modal-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:${loose},bubbles:true}))`,
  );
  await delay(500);
}
async function denied(promise, pattern) {
  await assert.rejects(promise, pattern);
}
try {
  let target;
  for (let i = 0; i < 900; i++) {
    if (processError) throw processError;
    if (child.exitCode !== null)
      throw Error(`Test app exited: ${child.exitCode}: ${logs.join('')}`);
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
      ).json();
      target = targets.find(
        (t) => ['page', 'webview'].includes(t.type) && t.url.startsWith('http://tauri.localhost'),
      );
      if (target) break;
    } catch {}
    await delay(100);
  }
  assert(target, 'Isolated WebView2 debug target did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.addEventListener('open', r, { once: true });
    socket.addEventListener('error', j, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  let acceptDialog = true;
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown')
      consoleErrors.push(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
      );
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening')
      void cdp('Page.handleJavaScriptDialog', { accept: acceptDialog });
  });
  cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`CDP timed out: ${method}`));
      }, 45000);
      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description ||
          r.exceptionDetails.exception?.value ||
          r.exceptionDetails.text,
      );
    return r.result.value;
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await until('!!window.nativeAcceptance');
  assert.equal(
    await evaluate('nativeAcceptance.isolationId'),
    config.identifier,
    'Refusing a production or unrelated app',
  );

  const isolatedPath = await evaluate('nativeAcceptance.appDataDir()');
  assert(
    isolatedPath.includes(config.identifier),
    'Refusing a non-test application data directory',
  );
  let initial = await invoke('login_user', { username: 'admin', password });
  if (!initial) {
    initial = await invoke('login_user', { username: 'admin', password: 'admin123' });
    assert(initial?.must_change_password);
    await invoke('change_password', { currentPassword: 'admin123', newPassword: password });
  }
  assert(await evaluate(`nativeAcceptance.auth.login('admin',${JSON.stringify(password)})`));
  const permissions = await invoke('current_permissions');
  assert(permissions.permissions.includes('backup.restore'));
  const status = await invoke('backup_status');
  assert(status.path.includes(config.identifier));
  const id = randomUUID(),
    username = 'rights-native-' + run;
  await execute(
    'INSERT INTO users (id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)',
    [
      id,
      username,
      await bcrypt.hash(password, 12),
      'Synthetic Rights Manager',
      'manager',
      stamp,
      stamp,
    ],
  );
  const rights = await invoke('read_user_rights', { userId: id });
  await invoke('save_user_rights', {
    request: {
      userId: id,
      expectedRevision: rights.revision,
      deniedPermissions: ['banking.post', 'catalog.write', 'security.history'],
    },
  });
  await evaluate('nativeAcceptance.auth.logout()');
  assert(
    await evaluate(
      `nativeAcceptance.auth.login(${JSON.stringify(username)},${JSON.stringify(password)})`,
    ),
  );
  await denied(
    invoke('record_bank_transaction', {
      request: {
        requestId: randomUUID(),
        kind: 'deposit',
        accountId: 'not-an-account',
        toAccountId: null,
        amountCents: 100,
        entryDate: day,
        reference: 'DENIED',
        notes: '',
        cashDrawer: false,
      },
    }),
    /Permission denied: banking.post/,
  );
  await denied(
    execute("UPDATE products SET unit_price=1 WHERE id='nonexistent'"),
    /Permission denied: catalog.write/,
  );
  await denied(query('SELECT * FROM login_events'), /Permission denied: security.history/);
  await denied(
    invoke('prepare_restore', { sourcePath: 'C:/not-a-backup.db' }),
    /Permission denied: backup.restore/,
  );
  const readonly = await invoke('bank_statement', { accountId: '', fromDate: '', toDate: day });
  assert(Array.isArray(readonly.accounts));
  results.push(
    'Real IPC rejects revoked bank/product/history actions while preserving allowed bank reads',
  );
  await evaluate('nativeAcceptance.auth.logout()');
  assert(await evaluate(`nativeAcceptance.auth.login('admin',${JSON.stringify(password)})`));
  const history = await invoke('read_login_history', {
    fromDate: '',
    toDate: day,
    query: username,
    event: '',
  });
  assert(history.entries.some((e) => e.event === 'sign_in'));
  assert(history.entries.some((e) => e.event === 'sign_out'));
  assert(!JSON.stringify(history).includes(password));
  const invoiceCount = (await query('SELECT COUNT(*) AS count FROM sales_invoices'))[0].count;
  const backup = await invoke('create_backup', { destinationDir: null });
  assert(backup.path.includes(config.identifier));
  const reviewed = await invoke('prepare_restore', { sourcePath: backup.path });
  assert(reviewed.planId);
  assert.equal(reviewed.sha256.length, 64);
  assert.equal(reviewed.summary.invoices, invoiceCount);
  await denied(
    invoke('queue_restore', { planId: reviewed.planId, password, confirmation: 'WRONG' }),
    /Type RESTORE/,
  );
  assert.equal((await invoke('restore_status')).maintenance, false);
  assert.equal(
    (await query('SELECT COUNT(*) AS count FROM sales_invoices'))[0].count,
    invoiceCount,
  );
  await execute('UPDATE users SET is_active=0,updated_at=? WHERE id=?', [stamp, id]);
  results.push(
    'Native backup inspection verifies a staged copy; rejected restore confirmation leaves the live test database open and unchanged',
  );
  await route('/login-history');
  await shot('native-login-history');
  assert.equal(await evaluate('nativeAcceptance.diagnostics.length'), 0);
  await writeFile(
    path.join(out, 'result.json'),
    JSON.stringify(
      { status: 'passed', identifier: config.identifier, sha256: hash, date: stamp, results },
      null,
      2,
    ),
  );
  console.log(results.join('\n'));
} catch (error) {
  await writeFile(
    path.join(out, 'failure.json'),
    JSON.stringify(
      { status: 'failed', error: String(error.stack || error), logs, results },
      null,
      2,
    ),
  );
  if (cdp)
    try {
      await shot('failure');
    } catch {}
  throw error;
} finally {
  socket?.close();
  if (child.exitCode === null) child.kill();
}
