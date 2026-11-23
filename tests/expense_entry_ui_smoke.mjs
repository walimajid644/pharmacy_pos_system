// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/expenses');
const baseUrl = process.env.EXPENSE_UI_BASE_URL || 'http://localhost:1422';
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-expenses-'));
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

  await open('/expenses');
  await until("document.querySelector('select[aria-label=\"Expense head\"]')?.value==='General'");
  await evaluate(
    `(()=>{const old=__TAURI_INTERNALS__.invoke;fixture.expenseAttempts=[];fixture.failExpense=false;__TAURI_INTERNALS__.invoke=async(command,args={})=>{if(command==='record_account_entry'){fixture.expenseAttempts.push(args.request);if(fixture.failExpense)throw 'Synthetic expense save failure';fixture.calls.push({command,args});return 'EX-SAVED';}return old(command,args);};})()`,
  );
  await fill('input[aria-label="Expense reference"]', 'EXP-REF');
  await fill('input[aria-label="Expense amount"]', '0');
  await fill('textarea[aria-label="Expense remarks"]', 'Office supplies');
  await evaluate("document.querySelector('.expense-actions button[type=submit]').click()");
  assert.equal(await evaluate('fixture.expenseAttempts.length'), 0, 'Zero amount must not submit');
  await fill('input[aria-label="Expense amount"]', '25.50');
  await fill('select[aria-label="Expense payment method"]', 'bank');
  await fill('select[aria-label="Expense bank account"]', 'bank-a');
  inside(await evaluate(rect('.expense-entry')), 'expense form');
  inside(await evaluate(rect('.expense-actions')), 'expense actions');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.expense-entry,.expense-body,.expense-fields')].every(e=>e.scrollWidth<=e.clientWidth+2&&e.scrollHeight<=e.clientHeight+2)",
    ),
    'Expense form fits at 1024x600',
  );
  assert(
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('.expense-remarks textarea')).height)>=60",
    ),
    'Remarks must be multiline',
  );
  await shot('expense-entry-1024x600');
  assert(
    await evaluate(
      "(()=>{const shell=document.querySelector('.workspace-dialog').getBoundingClientRect();const form=document.querySelector('.expense-entry').getBoundingClientRect();return shell.width<900 && Math.abs(shell.width-form.width)<8;})()",
    ),
    'The outer modal must fit the compact form',
  );
  await evaluate("document.querySelectorAll('.expense-actions button')[2].click()");
  await until("!!document.querySelector('.expense-history table')");
  await evaluate("document.querySelector('.commercial-tabs button').click()");
  assert.equal(
    await evaluate('document.querySelector(\'textarea[aria-label="Expense remarks"]\').value'),
    'Office supplies',
  );
  await evaluate(
    "fixture.failExpense=true;document.querySelector('.expense-actions button[type=submit]').click()",
  );
  await until('fixture.expenseAttempts.length===1');
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Expense ID"]\').value'),
    '',
  );
  assert.equal(
    await evaluate('document.querySelector(\'textarea[aria-label="Expense remarks"]\').value'),
    'Office supplies',
  );
  await evaluate(
    "fixture.failExpense=false;document.querySelector('.expense-actions button[type=submit]').click()",
  );
  await until("document.querySelector('input[aria-label=\"Expense ID\"]').value==='EX-SAVED'");
  const payload = await evaluate(
    "fixture.calls.find(c=>c.command==='record_account_entry').args.request",
  );
  assert.equal(payload.kind, 'expense');
  assert.equal(payload.customerId, null);
  assert.equal(payload.amountCents, 2550);
  assert.equal(payload.category, 'General');
  assert.equal(payload.description, 'Office supplies');
  assert.equal(payload.reference, 'EXP-REF');
  assert.equal(payload.bankAccountId, 'bank-a');
  await evaluate("document.querySelector('.expense-actions button').click()");
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Expense ID"]\').value'),
    '',
  );
  assert.equal(
    await evaluate('document.querySelector(\'select[aria-label="Expense payment method"]\').value'),
    'cash',
  );
  await evaluate("document.querySelectorAll('.expense-actions button')[2].click()");
  await until("!!document.querySelector('.expense-history table')");
  await evaluate(
    "[...document.querySelectorAll('.commercial-table-scroll button')].find(b=>b.textContent.includes('Void')).click()",
  );
  await until("!!document.querySelector('.commercial-dialog')");
  assert(
    await evaluate("document.querySelector('.commercial-dialog .bg-destructive').disabled"),
    'Closed drawer void protection remains active',
  );
  console.log(
    'PASS: Expense layout, head selection, bank save, validation, failure recovery, draft history, new expense, and closed-drawer protection.',
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
