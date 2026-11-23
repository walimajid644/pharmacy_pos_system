// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/no-scroll');
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
  async function open(view, role = 'admin', dense = true) {
    await cdp('Page.navigate', {
      url:
        'http://127.0.0.1:1422/tests/ui/phase1.html?view=' +
        encodeURIComponent(view) +
        (dense ? '&compact=1&layout=1&role=' : '&role=') +
        role,
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

  async function escape() {
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      windowsVirtualKeyCode: 27,
    });
  }

  const routes = [
    '/',
    '/pos',
    '/products',
    '/purchase-orders',
    '/purchase-orders/new',
    '/purchase-orders/po-existing/receive',
    '/customers',
    '/suppliers',
    '/users',
    '/sales-history',
    '/sales-returns',
    '/sales-returns/new',
    '/stock-adjustments',
    '/stock-adjustments/new',
    '/shifts',
    '/daily-closing',
    '/reports',
    '/settings',
    '/supplier-ledger',
    '/customer-ledger',
    '/payments',
    '/expenses',
    '/estimates',
    '/preorders',
    '/item-search',
    '/expiry-actions',
    '/purchase-suggestions',
    '/audit-log',
    '/controlled-sales',
    '/cashier-performance',
    '/catalog-import',
    '/catalog-bulk',
    '/fbr-sandbox',
    '/backups',
  ];
  const findings = [];
  const overflowProbe = `(() => {
    const root=document.body;
    return [...root.querySelectorAll('*'),root].filter(e=>e instanceof HTMLElement && !e.closest('.sr-only,[inert]') && !['INPUT','TEXTAREA','SELECT','OPTION'].includes(e.tagName)).flatMap(e=>{
      const r=e.getBoundingClientRect(),style=getComputedStyle(e);
      if(!e.getClientRects().length||r.width<2||r.height<2||!e.clientHeight||!e.clientWidth||style.display==='inline'||style.textOverflow==='ellipsis') return [];
      const x=e.scrollWidth-e.clientWidth,y=e.scrollHeight-e.clientHeight;
      return x>2||y>2?[{tag:e.tagName,cls:e.className,x,y,h:Math.round(r.height),w:Math.round(r.width)}]:[];
    }).slice(0,16);
  })()`;
  async function check(route) {
    await delay(400);
    const issues = await evaluate(overflowProbe);
    findings.push({ route, issues });
    if (issues.length) console.log(JSON.stringify({ route, issues }));
    if (issues.length) await shot(route.replaceAll(/[^a-z0-9-]/gi, '-'));
  }
  async function clickText(text, selector = '.workspace-body button') {
    await evaluate(
      `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw new Error('Missing button: '+${JSON.stringify(text)});b.click()})()`,
    );
  }
  for (const route of routes) {
    await open(route);
    await check(route);
  }
  await open('/settings');
  for (const tab of ['Tax & Currency', 'Inventory', 'Receipt', 'Appearance & Language']) {
    await clickText(tab);
    await check('/settings/' + tab);
  }
  await open('/reports');
  for (const report of [
    'Daily Sales Summary',
    'Sales by Product',
    'Low Stock Report',
    'Near Expiry Report',
    'Stock Valuation',
  ]) {
    await clickText(report);
    await check('/reports/' + report);
  }
  for (const [route, text] of [
    ['/customers', 'Add Customer'],
    ['/suppliers', 'Add Supplier'],
    ['/users', 'Add User'],
    ['/products', 'Add Product'],
    ['/products', 'Batches'],
    ['/products', 'Label'],
    ['/estimates', 'New estimate'],
    ['/preorders', 'New pre-order'],
  ]) {
    await open(route);
    await clickText(text);
    await check(route + '/' + text);
  }
  for (const route of ['/sales-history', '/sales-returns', '/stock-adjustments']) {
    await open(route);
    await evaluate("document.querySelector('.workspace-body tbody button').click()");
    await check(route + '/review');
    if (route === '/sales-history') {
      await clickText('Digital receipt', '.detail-tabs button');
      await check(route + '/receipt');
    }
  }
  await open('/item-search');
  await clickText('Batches', '.workspace-body tbody button');
  await check('/item-search/batches');
  await open('/products');
  await clickText('Batches', '.workspace-body tbody button');
  await clickText('Add New Batch', '.batch-dialog button');
  await check('/products/add-batch');
  await open('/stock-adjustments/new');
  for (let i = 0; i < 20; i++) await clickText('Add batch');
  await check('/stock-adjustments/new/many-lines');
  await open('/sales-returns/new');
  await evaluate(
    "var field=document.querySelector('.workspace-body input');field.value='INV-SAVED';field.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  await clickText('Find invoice');
  await check('/sales-returns/new/populated');
  await open('/daily-closing');
  await clickText('Close Day');
  await check('/daily-closing/reconciliation');
  await open('/pos');
  await evaluate(
    "document.querySelector('#pos-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await check('/pos/search');
  await open('/pos');
  await evaluate("document.querySelector('#pos-customer').focus()");
  await check('/pos/customer-picker');
  await open('/supplier-ledger');
  for (const tab of ['Record payment', 'Payment history']) {
    await clickText(tab);
    await check('/supplier-ledger/' + tab);
  }
  await open('/purchase-suggestions');
  await evaluate(
    "document.querySelector('.commercial-table-scroll tbody input[type=checkbox]').click()",
  );
  await clickText('Review draft PO');
  await check('/purchase-suggestions/review');
  await open('/expiry-actions');
  await clickText('Quarantine audit');
  await check('/expiry-actions/holds');
  await clickText('Resolve hold');
  await check('/expiry-actions/resolve');
  await open('/catalog-bulk');
  await evaluate(
    "document.querySelector('.commercial-table-scroll tbody input[type=checkbox]').click();var reorder=document.querySelector('.commercial-filters input[type=number]');reorder.value='10';reorder.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.commercial-filters').requestSubmit()",
  );
  await check('/catalog-bulk/review');
  await shot('compact-catalog-review');
  await open('/expenses', 'admin', false);
  await evaluate(
    "[...document.querySelectorAll('.commercial-tabs button')].find(b=>b.textContent.includes('Expense history')).click()",
  );
  await until("!!document.querySelector('.commercial-table-scroll tbody button')");
  await clickText('Void', '.workspace-body tbody button');
  await check('/expenses/void');
  await open('/catalog-import');
  const csv =
    'sku,name,unit_price,cost_price,pack_size\nSCROLL-TEST,Synthetic layout medicine,10,5,1\n';
  await evaluate(
    `var dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(csv)}],'layout.csv',{type:'text/csv'}));var file=document.querySelector('.catalog-file');file.files=dt.files;file.dispatchEvent(new Event('change',{bubbles:true}))`,
  );
  await until("!document.querySelector('.catalog-validate').disabled");
  await clickText('Validate preview');
  await until("document.querySelector('.catalog-review')!==null");
  await check('/catalog-import/preview');
  await clickText('Review import');
  await check('/catalog-import/confirm');
  await writeFile(path.join(out, 'findings.json'), JSON.stringify(findings, null, 2));
  for (const item of findings.filter((x) => x.issues.length)) console.log(JSON.stringify(item));
  console.log(
    `${findings.filter((x) => !x.issues.length).length}/${findings.length} screens and dialog states fit without overflow`,
  );
  assert(
    findings.every((x) => !x.issues.length),
    'Some screens still overflow; see test-results/no-scroll/findings.json',
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
