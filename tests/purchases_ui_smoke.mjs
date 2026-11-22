// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/purchases');
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-purchases-'));
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
      url:
        'http://127.0.0.1:1422/tests/ui/phase1.html?view=' +
        encodeURIComponent(view) +
        '&purchases=1',
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
  await open('/');
  await evaluate(`document.querySelector('.dashboard-tasks [data-path="/purchases"]').click()`);
  await until(
    'document.querySelector(\'select[aria-label="Distributor"] option[value="s1"]\') !== null && !!document.querySelector(\'.empty-invoice\')',
  );
  assert((await evaluate("document.querySelector('h2').textContent")).includes('Purchase Invoice'));
  assert.equal(
    await evaluate("fixture.calls.filter(c=>c.command==='save_purchase_order').length"),
    0,
    'Opening a purchase must not create an order',
  );
  await fill('input[aria-label="Distributor bill number"]', 'DIRECT-UI');
  await fill('input[aria-label="Search purchase products"]', 'MED-1');
  await until("!!document.querySelector('.search-result-item')");
  await evaluate("document.querySelector('.search-result-item').click()");
  await fill('input[aria-label="Quantity"]', '3');
  await fill('input[aria-label="Bonus"]', '1');
  await fill('input[aria-label="Purchase price"]', '10');
  await fill('input[aria-label="Sale price"]', '15');
  await fill('input[aria-label="Discount percent"]', '10');
  await fill('input[aria-label="Tax percent"]', '5');
  await fill('input[aria-label="Batch number"]', 'DIRECT-BATCH');
  await fill('input[aria-label="Expiry date"]', '2099-12-31');
  await evaluate("document.querySelector('.add-btn').click()");
  await until("!!document.querySelector('.items-table tbody tr')");
  await fill('input[aria-label="Flat invoice discount"]', '2');
  await fill('input[aria-label="Invoice advance tax percent"]', '10');
  assert((await evaluate("document.querySelector('.net-amount').textContent")).includes('28.99'));
  inside(await evaluate(rect('.action-buttons')), 'direct invoice actions');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.purchase-receive-enhanced,.items-table-card,.compact-page-content,.table-scroll')].every(e=>e.scrollHeight<=e.clientHeight+2 && e.scrollWidth<=e.clientWidth+2)",
    ),
    'Direct invoice must fit without overflow',
  );
  await evaluate("document.querySelector('.action-buttons button:last-child').click()");
  assert.equal(
    await evaluate("fixture.calls.filter(c=>c.command==='receive_purchase_with_details').length"),
    0,
    'A distributor is required',
  );
  await fill('select[aria-label="Distributor"]', 's1');
  await shot('direct-purchase-invoice-1024x600');
  await evaluate("document.querySelector('.action-buttons button:last-child').click()");
  await until("fixture.calls.some(c=>c.command==='receive_purchase_with_details')");
  const directPayload = await evaluate(
    "fixture.calls.find(c=>c.command==='receive_purchase_with_details').args.request",
  );
  assert.equal(directPayload.poId, '');
  assert.equal(directPayload.supplierId, 's1');
  assert.equal(directPayload.submissionId.length, 36);
  assert.equal(directPayload.items[0].productId, 'p1');
  assert.equal(directPayload.items[0].quantity, 3);
  assert.equal(directPayload.items[0].bonusQuantity, 1);
  assert.equal(
    await evaluate("fixture.calls.filter(c=>c.command==='save_purchase_order').length"),
    0,
    'Saving a direct invoice uses one atomic native request',
  );
  await until("!!document.querySelector('.purchase-table tbody tr')");
  assert(
    await evaluate(
      "[...document.querySelectorAll('.view-header button')].every(e=>e.scrollHeight<=e.clientHeight+2 && e.scrollWidth<=e.clientWidth+2)",
    ),
    'Register actions must not clip',
  );
  await evaluate(
    "[...document.querySelectorAll('.purchase-table button')].find(b=>b.textContent.includes('Receive')).click()",
  );
  await until(
    "document.querySelector('.purchase-receive-enhanced .items-table tbody tr') !== null",
  );
  assert(
    (await evaluate("document.querySelector('h2').textContent")).includes(
      'Receive Distributor Purchase',
    ),
  );
  inside(await evaluate(rect('.action-buttons')), 'receipt save actions');
  inside(await evaluate(rect('.items-table-card')), 'receipt table');
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Distributor"]\').value'),
    'Test Distributor',
  );
  await fill('input[aria-label="Distributor bill number"]', 'DIST-123');
  await fill('input[aria-label="Receive quantity for Distributor Medicine"]', '4');
  await evaluate("document.querySelector('.action-buttons button:last-child').click()");
  await delay(150);
  assert.equal(
    await evaluate("fixture.calls.filter(c=>c.command==='receive_purchase_with_details').length"),
    1,
    'Over-receipt must not submit',
  );
  await fill('input[aria-label="Receive quantity for Distributor Medicine"]', '3');
  await fill('input[aria-label="Bonus for Distributor Medicine"]', '1');
  await fill('input[aria-label="Batch number for Distributor Medicine"]', 'DIST-BATCH');
  await fill('input[aria-label="Expiry date for Distributor Medicine"]', '2099-12-31');
  await fill('input[aria-label="Item discount percent for Distributor Medicine"]', '10');
  await fill('input[aria-label="Item tax percent for Distributor Medicine"]', '5');
  await fill('input[aria-label="Flat invoice discount"]', '2');
  await fill('input[aria-label="Invoice advance tax percent"]', '10');
  assert((await evaluate("document.querySelector('.net-amount').textContent")).includes('28.99'));
  await shot('enhanced-receiving-1024x600');
  await evaluate("document.querySelector('.action-buttons button:last-child').click()");
  await until(
    "fixture.calls.some(c=>c.command==='receive_purchase_with_details' && c.args.request.poId==='po-receive')",
  );
  const payload = await evaluate(
    "fixture.calls.find(c=>c.command==='receive_purchase_with_details' && c.args.request.poId==='po-receive').args.request",
  );
  assert.equal(payload.poId, 'po-receive');
  assert.equal(payload.supplierBillNumber, 'DIST-123');
  assert.equal(payload.items[0].poItemId, 'receive-line');
  assert.equal(payload.items[0].unitCost, 10);
  assert.equal(payload.items[0].bonusQuantity, 1);
  assert.equal(payload.invoiceDiscountFlat, 2);
  await until("!!document.querySelector('.purchase-terminal')");
  await cdp('Page.navigate', {
    url: 'http://127.0.0.1:1422/tests/ui/phase1.html?view=/purchase-orders/po-existing/receive&compact=1&layout=1',
  });
  await until("window.fixtureReady===true && !!document.querySelector('.items-table tbody tr')");
  await delay(300);
  assert(
    await evaluate("document.querySelectorAll('.items-table tbody tr').length < 40"),
    'Large invoices must paginate',
  );
  inside(await evaluate(rect('.action-buttons')), 'large receipt actions');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.purchase-receive-enhanced,.items-table-card,.compact-page-content,.table-scroll')].every(e=>e.scrollHeight<=e.clientHeight+2 && e.scrollWidth<=e.clientWidth+2)",
    ),
    'Large invoices must not overflow',
  );
  await shot('enhanced-receiving-paged-1024x600');
  console.log(
    'PASS: Dashboard opens direct invoice; distributor and item entry save without a prior order; existing receiving, totals and small-screen layout verified.',
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
