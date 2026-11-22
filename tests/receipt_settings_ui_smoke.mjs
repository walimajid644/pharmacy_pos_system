// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/receipt-settings');
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-phase1-'));
const edge = spawn(
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
edge.stderr.on('data', (data) => process.stderr.write(data));
edge.on('error', (error) => console.error('Browser launch failed:', error));
let socket;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
try {
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      if (targets.length) break;
    } catch {}
    await delay(100);
  }
  assert(targets?.length, 'Headless browser did not start');
  socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      console.error(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
      );
    if (m.id) {
      const task = pending.get(m.id);
      pending.delete(m.id);
      m.error ? task?.reject(new Error(JSON.stringify(m.error))) : task?.resolve(m.result);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  async function until(expression) {
    for (let i = 0; i < 600; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  async function open(view, role = 'admin') {
    await cdp('Page.navigate', {
      url:
        'http://127.0.0.1:1422/tests/ui/phase1.html?view=' +
        encodeURIComponent(view) +
        '&compact=1&role=' +
        role,
    });
    await until('window.fixtureReady===true');
    await delay(250);
  }
  async function shot(name) {
    const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(out, name + '.png'), Buffer.from(r.data, 'base64'));
  }

  await open('/products');
  await evaluate(`(async () => {
    window.settingsRow = { id: 'settings', company_name: 'Test Pharmacy', tax_rate: 0, near_expiry_days: 60 };
    window.settingsWrites = [];
    const original = __TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'database_select' && args.query.includes('FROM app_settings')) return settingsRow ? [{...settingsRow}] : [];
      if (command === 'database_execute' && args.query.includes('app_settings')) {
        const fields = args.query.trim().startsWith('UPDATE')
          ? args.query.split('SET')[1].split('WHERE')[0].split(',').map(value => value.split('=')[0].trim())
          : args.query.slice(args.query.indexOf('(') + 1, args.query.indexOf(')')).split(',').map(value => value.trim());
        window.settingsRow ||= {};
        fields.forEach((field,index) => settingsRow[field] = args.values[index]);
        settingsWrites.push(args);
        return 1;
      }
      return original(command, args);
    };
    await testRouter.push('/settings');
  })()`);
  const receiptTab = async () => {
    await until(
      `[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith('Receipt'))`,
    );
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Receipt')).click()`,
    );
    await until(`!!document.querySelector('#field-receiptsettings-logo')`);
  };
  const upload = async () => {
    await evaluate(`(() => {
      const input = document.querySelector('#field-receiptsettings-logo');
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
      const files = new DataTransfer();
      files.items.add(new File([bytes], 'logo.png', {type:'image/png'}));
      input.files = files.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await until(`document.body.textContent.includes('Uploaded image')`);
  };
  const save = async (count) => {
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Settings')).click()`,
    );
    await until(`settingsWrites.length === ${count}`);
    await until(
      `![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Settings'))?.disabled`,
    );
  };
  const reopen = async () => {
    await evaluate(
      `(async()=>{await testRouter.push('/products');await testRouter.push('/settings');})()`,
    );
    await receiptTab();
  };
  await receiptTab();
  await upload();
  await save(1);
  assert((await evaluate('settingsRow.receipt_logo_path')).startsWith('data:image/png;base64,'));
  await reopen();
  assert(await evaluate(`document.body.textContent.includes('Uploaded image')`));
  await shot('saved-logo');
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Remove')).click()`,
  );
  await save(2);
  assert.equal(await evaluate('settingsRow.receipt_logo_path'), null);
  await reopen();
  assert.equal(await evaluate(`document.body.textContent.includes('Uploaded image')`), false);
  // Also cover the first save when no settings row exists.
  await evaluate('window.settingsRow=null');
  await reopen();
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Company Info')).click()`,
  );
  await until(`!!document.querySelector('#field-companysettings-1')`);
  await evaluate(
    `(() => {const input = document.querySelector('#field-companysettings-1'); input.value='New Pharmacy'; input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await receiptTab();
  await upload();
  await save(3);
  assert((await evaluate('settingsRow.receipt_logo_path')).startsWith('data:image/png;base64,'));
  assert((await evaluate('settingsWrites[2].query')).trim().startsWith('INSERT'));
  await reopen();
  assert(await evaluate(`document.body.textContent.includes('Uploaded image')`));
  results.push('Receipt logo upload, update, reload, removal and first settings insert passed');
  console.log(results.join('\n'));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
  if (socket?.readyState === 1) {
    try {
      const id = 900000;
      socket.send(
        JSON.stringify({
          id,
          method: 'Page.captureScreenshot',
          params: { format: 'png', captureBeyondViewport: false },
        }),
      );
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        socket.addEventListener('message', async (m) => {
          const r = JSON.parse(m.data);
          if (r.id === id && r.result?.data) {
            await writeFile(path.join(out, 'failure.png'), Buffer.from(r.result.data, 'base64'));
            clearTimeout(timer);
            resolve();
          }
        });
      });
    } catch {}
  }
} finally {
  if (socket?.readyState === 1)
    socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  socket?.close();
  edge.kill();
}
