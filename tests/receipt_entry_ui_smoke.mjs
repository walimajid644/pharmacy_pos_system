// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/receipts');
const baseUrl = process.env.RECEIPT_UI_BASE_URL || 'http://localhost:1422';
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-receipts-'));
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
    for (let i = 0; i < 150; i++) {
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
  async function open(view) {
    await cdp('Page.navigate', {
      url: baseUrl + '/tests/ui/phase1.html?view=' + encodeURIComponent(view),
    });
    await until('window.fixtureReady===true');
    await delay(250);
  }
  async function shot(name) {
    const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(out, name + '.png'), Buffer.from(r.data, 'base64'));
  }
  const rect = (selector) =>
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})()`;
  function inside(r, name) {
    assert(r && r.width > 0 && r.height > 0, `${name} missing`);
    assert(
      r.x >= 0 && r.y >= 0 && r.right <= 1025 && r.bottom <= 601,
      `${name} clipped: ${JSON.stringify(r)}`,
    );
  }
  const fill = async (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );

  await open('/payments');
  await until(
    '!!document.querySelector(\'.receipt-entry\') && document.querySelector(\'select[aria-label="Receipt client"] option[value="c1"]\')',
  );
  await evaluate(
    `(()=>{const old=__TAURI_INTERNALS__.invoke;__TAURI_INTERNALS__.invoke=async(command,args={})=>{if(command==='record_account_entry'){fixture.calls.push({command,args});return 'CR-TEST';}if(command==='database_select' && args.query?.includes('SELECT id, invoice_number, net_amount'))return [{id:'receipt-invoice',invoice_number:'INV-REF-1',net_amount:100}];return old(command,args);};})()`,
  );
  await fill('select[aria-label="Receipt client"]', 'c1');
  await fill('input[aria-label="Receipt reference"]', 'REF-1');
  await fill('input[aria-label="Receipt amount"]', '20');
  await fill('input[aria-label="Cheque or draft number"]', 'DRAFT-1');
  await fill('textarea[aria-label="Receipt remarks"]', 'Customer collection');
  await evaluate("document.querySelector('.receipt-type input').click()");
  await until(
    'document.querySelector(\'select[aria-label="Receipt invoice"] option[value="receipt-invoice"]\')',
  );
  await fill('select[aria-label="Receipt invoice"]', 'receipt-invoice');
  assert(
    (
      await evaluate('document.querySelector(\'input[aria-label="Invoice amount"]\').value')
    ).includes('100'),
  );
  inside(await evaluate(rect('.receipt-entry')), 'receipt form');
  inside(await evaluate(rect('.receipt-actions')), 'receipt actions');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.receipt-entry,.receipt-body,.receipt-fields-grid')].every(e=>e.scrollWidth<=e.clientWidth+2 && e.scrollHeight<=e.clientHeight+2)",
    ),
    'Receipt must fit the viewport',
  );
  await shot('receipt-entry-1024x600');
  assert(
    await evaluate(
      "(()=>{const shell=document.querySelector('.workspace-dialog').getBoundingClientRect();const form=document.querySelector('.receipt-entry').getBoundingClientRect();return shell.width<900 && Math.abs(shell.width-form.width)<8;})()",
    ),
    'The outer modal must fit the compact form',
  );
  await evaluate("document.querySelectorAll('.receipt-actions button')[2].click()");
  await until("!!document.querySelector('.receipt-history table')");
  await evaluate("document.querySelector('.commercial-tabs button').click()");
  await until("getComputedStyle(document.querySelector('.receipt-entry')).display!=='none'");
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Cheque or draft number"]\').value'),
    'DRAFT-1',
  );
  assert.equal(
    await evaluate('document.querySelector(\'select[aria-label="Receipt invoice"]\').value'),
    'receipt-invoice',
  );

  await evaluate("document.querySelector('.receipt-actions button[type=submit]').click()");
  await until("fixture.calls.some(c=>c.command==='record_account_entry')");
  const payload = await evaluate(
    "fixture.calls.find(c=>c.command==='record_account_entry').args.request",
  );
  assert.equal(payload.kind, 'receipt');
  assert.equal(payload.customerId, 'c1');
  assert.equal(payload.amountCents, 2000);
  assert.equal(payload.reference, 'REF-1');
  assert.equal(
    payload.description,
    'Invoice: INV-REF-1 · Cheque / Draft: DRAFT-1 · Customer collection',
  );
  await until("document.querySelector('input[aria-label=\"Receipt ID\"]').value==='CR-TEST'");
  await evaluate("document.querySelectorAll('.receipt-actions button')[2].click()");
  await until("!!document.querySelector('.receipt-history table')");
  inside(await evaluate(rect('.receipt-history')), 'receipt history');
  await open('/expenses');
  await until("!!document.querySelector('.expense-entry form')");
  assert(
    (await evaluate("document.querySelector('.expense-entry').textContent")).includes(
      'Expense Details',
    ),
  );
  console.log(
    'PASS: Receipt layout, invoice lookup, saved details, history, and expense form verified.',
  );
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
