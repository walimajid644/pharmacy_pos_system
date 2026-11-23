// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/supplier-payments');
const baseUrl = process.env.PAYMENT_UI_BASE_URL || 'http://localhost:1422';
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-supplier-payment-'));
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
  await until("!!document.querySelector('.receipt-entry')");
  await evaluate(`(()=>{
    const old=__TAURI_INTERNALS__.invoke;
    fixture.supplierPaid=10000;
    __TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='record_supplier_payment'){
        fixture.calls.push({command,args});fixture.supplierPaid+=args.request.amountCents;
        return {voucherNumber:'SP-TEST',amountCents:args.request.amountCents,balanceCents:100000-fixture.supplierPaid};
      }
      const q=args.query?.toLowerCase()||'';
      if(command==='database_select'&&q.includes('from bank_accounts'))return [{id:'bank1',name:'Business bank'}];
      if(command==='database_select'&&q.includes('select po.id, po.po_number'))return [
        {id:'po1',po_number:'PO-1',supplier_id:'s1',supplier_name:'First Supplier',order_date:'2026-01-01',received_date:'2026-01-01',payment_terms:30,status:'received',total_amount:1000,ordered_value:1000,received_value:1000,paid_cents:fixture.supplierPaid},
        {id:'opening1',po_number:'Opening · REF',supplier_id:'s2',supplier_name:'Second Supplier',order_date:'2026-01-01',received_date:null,payment_terms:0,status:'opening',total_amount:200,ordered_value:1,received_value:1,paid_cents:0}
      ];
      if(command==='database_select'&&q.includes('select p.id,p.voucher_number'))return [];
      return old(command,args);
    };
  })()`);
  await evaluate(
    "[...document.querySelectorAll('.commercial-tabs button')].find(b=>b.textContent.includes('Pay supplier')).click()",
  );
  await until(
    '!!document.querySelector(\'select[aria-label="Payment supplier"] option[value=s1]\')',
  );
  assert(
    await evaluate(
      "getComputedStyle(document.querySelector('.supplier-payment-form')).display!=='none'",
    ),
    'Pay supplier opens entry directly',
  );
  await fill('select[aria-label="Payment supplier"]', 's1');
  await until(
    "document.querySelector('select[aria-label=\"Payment order or opening\"]').value==='po1'",
  );
  assert(
    (
      await evaluate('document.querySelector(\'input[aria-label="Payment balance"]\').value')
    ).includes('900'),
  );
  await fill('input[aria-label="Payment reference"]', 'REF-1');
  await fill('input[aria-label="Payment amount"]', '1000');
  await evaluate("document.querySelector('.payment-save').click()");
  assert.equal(
    await evaluate("fixture.calls.filter(c=>c.command==='record_supplier_payment').length"),
    0,
    'Overpayment must not submit',
  );
  await fill('input[aria-label="Payment amount"]', '20');
  await fill('select[aria-label="Payment method"]', 'bank');
  await fill('select[aria-label="Payment bank account"]', 'bank1');
  await fill('input[aria-label="Payment cheque or draft"]', 'DRAFT-1');
  await fill('textarea[aria-label="Payment remarks"]', 'Supplier payment');
  inside(await evaluate(rect('.supplier-payment-form')), 'payment form');
  inside(await evaluate(rect('.payment-actions')), 'payment actions');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.supplier-payment-form,.payment-body,.payment-fields')].every(e=>e.scrollWidth<=e.clientWidth+2&&e.scrollHeight<=e.clientHeight+2)",
    ),
    'Payment layout fits at 1024x600',
  );
  assert(
    await evaluate(
      "getComputedStyle(document.querySelector('.payment-remarks textarea')).height.replace('px','')>=60",
    ),
    'Remarks is multiline',
  );
  await shot('supplier-payment-1024x600');
  assert(
    await evaluate(
      "(()=>{const shell=document.querySelector('.workspace-dialog').getBoundingClientRect();const form=document.querySelector('.supplier-payment-form').getBoundingClientRect();return shell.width<900 && Math.abs(shell.width-form.width)<8;})()",
    ),
    'The outer modal must fit the compact form',
  );
  await evaluate(
    "[...document.querySelectorAll('.payment-actions button')].find(b=>b.textContent.includes('Search / History')).click()",
  );
  await until(
    "getComputedStyle(document.querySelector('.supplier-payment-form')).display==='none'",
  );
  await evaluate(
    "[...document.querySelectorAll('.ledger-page .commercial-tabs button')].find(b=>b.textContent.includes('Record payment')).click()",
  );
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Payment cheque or draft"]\').value'),
    'DRAFT-1',
  );
  await evaluate("document.querySelector('.payment-save').click()");
  await until("document.querySelector('input[aria-label=\"Payment ID\"]')?.value==='SP-TEST'");
  const payload = await evaluate(
    "fixture.calls.find(c=>c.command==='record_supplier_payment').args.request",
  );
  assert.equal(payload.poId, 'po1');
  assert.equal(payload.amountCents, 2000);
  assert.equal(payload.bankAccountId, 'bank1');
  assert.equal(payload.reference, 'REF-1');
  assert.equal(payload.notes, 'Cheque / Draft: DRAFT-1 · Supplier payment');
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/i);
  await evaluate(
    "[...document.querySelectorAll('.payment-actions button')].find(b=>b.textContent.includes('New')).click()",
  );
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Payment ID"]\').value'),
    '',
  );
  await fill('select[aria-label="Payment supplier"]', 's2');
  await until(
    "document.querySelector('select[aria-label=\"Payment order or opening\"]').value==='opening1'",
  );
  assert(
    (
      await evaluate('document.querySelector(\'input[aria-label="Payment balance"]\').value')
    ).includes('200'),
  );
  console.log(
    'PASS: Payment layout, supplier balance, bank payment, saved cheque details, draft history, overpayment protection, and opening selection.',
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
