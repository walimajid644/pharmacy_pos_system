// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/reports-preferences');
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
  await evaluate(`(()=>{
    window.purchaseSettings={id:'settings',company_name:'Test Pharmacy',purchase_default_quantity:2,purchase_default_tax:0,purchase_default_discount:0,purchase_show_tax:0,purchase_show_discount:0,purchase_fill_remaining:0};
    window.settingsSaves=[];window.reportCalls=[];window.savedOrders=[];window.receipts=[];window.reportRows=Array.from({length:70},(_,i)=>({sku:'MED-'+i,name:i===69?'LAST ROW':'Medicine '+i,pack_size:10,stock:i,unit_price:20}));
    const original=__TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke=async(command,args={})=>{
      const q=args.query?.toLowerCase()||'';
      if(command==='current_permissions')return {role:'admin',permissions:testAuth.currentUser.permissions||[]};
      if(command==='database_select'&&q.includes('from app_settings'))return [{...purchaseSettings}];
      if(command==='database_execute'&&q.includes('update app_settings')){settingsSaves.push(args);let i=0;for(const name of args.query.matchAll(/([a-z_]+) = [?]/g)){purchaseSettings[name[1]]=args.values[i++];}return;}
      if(command==='database_select'&&q.includes('as stock from products')){reportCalls.push(args);if(window.reportFailure)throw 'Synthetic report failure';return reportRows;}
      if(command==='database_select'&&q.includes('from purchase_orders'))return [{id:'po-1',po_number:'PO-TEST',supplier_id:'s1',supplier_name:'Test Supplier',status:'sent',order_date:'2026-01-01',total_amount:16.5,discount_amount:0,shipping_cost:0}];
      if(command==='database_select'&&q.includes('from purchase_order_items'))return [{id:'po-line',po_id:'po-1',product_id:'p1',product_name:'Test medicine',quantity_ordered:3,quantity_received:1,unit_cost:5,tax_rate:10,discount_percent:0,line_total:16.5}];
      if(command==='save_purchase_order'){savedOrders.push(args.request);return 'po-1';}
      if(command==='receive_purchase_order'){receipts.push(args.request);return;}
      return original(command,args);
    };
    window.print=()=>{window.printedRows=document.querySelectorAll('.finance-print-root tbody tr').length;};
    window.URL.createObjectURL=(blob)=>{window.exportedBlob=blob;return 'blob:fixture';};
    HTMLAnchorElement.prototype.click=function(){window.downloadName=this.download;};
    testRouter.push('/report-center');
  })()`);
  const field = async (selector, value, event = 'input') =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const click = async (text) => {
    await until(
      `[...document.querySelectorAll('button')].some(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})&&!b.disabled)`,
    );
    await evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`,
    );
  };
  const fits = async (selector) => {
    const state = await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {scroll:e.scrollHeight,client:e.clientHeight,bottom:e.getBoundingClientRect().bottom,body:document.documentElement.scrollHeight};})()`,
    );
    assert(
      state.scroll <= state.client + 2 && state.bottom <= 601 && state.body <= 601,
      JSON.stringify(state),
    );
  };
  await until("document.querySelector('.report-filters select')?.options.length===12");
  await click('Generate');
  await until("document.querySelector('.report-results tbody tr')");
  await fits('.report-center');
  assert((await evaluate("document.querySelectorAll('.report-results tbody tr').length")) < 70);
  await click('Export CSV');
  assert((await evaluate('exportedBlob.text()')).includes('LAST ROW'));
  await click('Print');
  await until('window.printedRows===70');
  await evaluate("window.dispatchEvent(new Event('afterprint'))");
  await shot('report-center-1024');
  await field('.report-filters select', 'bank-balances', 'change');
  await field('.report-filters input[type=date]', '2026-12-01');
  await field('.report-filters label:nth-child(3) input', '2026-01-01');
  await click('Generate');
  await until("document.querySelector('[role=alert]')?.textContent.includes('valid date range')");
  await field('.report-filters select', 'stock-list', 'change');
  await evaluate('window.reportFailure=true');
  await click('Generate');
  await until("document.querySelector('[role=alert]')?.textContent.includes('Could not generate')");
  assert.equal(await evaluate("!!document.querySelector('.report-results')"), false);
  await evaluate('window.reportFailure=false;testRouter.push("/purchase-settings")');
  await until("document.querySelector('.preference-grid input')?.value==='2'");
  await fits('.purchase-settings');
  await field('.preference-grid input', '0');
  await click('Save Settings');
  await until("document.querySelector('[role=alert]')?.textContent.includes('whole number')");
  assert.equal(await evaluate('settingsSaves.length'), 0);
  await field('.preference-grid input', '4');
  await click('Save Settings');
  await until('settingsSaves.length===1');
  await shot('purchase-settings-1024');
  await evaluate('testRouter.push("/purchase-orders/new")');
  await until("document.querySelector('.line-item input[type=number]')?.value==='4'");
  assert.equal(
    await evaluate("document.querySelectorAll('.line-item input[type=number]').length"),
    2,
  );
  await evaluate('testRouter.push("/products")');
  await until("!document.querySelector('.line-item')");
  await evaluate('testRouter.push("/purchase-orders/po-1")');
  await until("document.querySelector('.line-item input[type=number]')?.value==='3'");
  assert.equal(
    await evaluate("document.querySelectorAll('.line-item input[type=number]')[2].value"),
    '10',
  );
  await evaluate('testRouter.push("/purchase-orders/po-1/receive")');
  await until("document.querySelector('input[aria-label^=\"Receive quantity\"]')?.value==='0'");
  await field('input[aria-label^="Receive quantity"]', '2');
  await click('Receive Stock');
  assert.equal(await evaluate('receipts.length'), 0);
  await field('input[aria-label^="Batch number"]', 'B-TEST');
  await field('input[aria-label^="Expiry date"]', '2099-12-31');
  await fits('.money-terminal');
  await shot('purchase-receive-1024');
  await click('Receive Stock');
  await until('receipts.length===1');
  assert.deepEqual(await evaluate('receipts[0].items'), [
    { poItemId: 'po-line', quantity: 2, batchNumber: 'B-TEST', expiryDate: '2099-12-31' },
  ]);
  results.push(
    'Reports paginate at 1024x600, CSV/print include all 70 rows, errors clear stale data; settings persist and validate, saved order tax stays visible, receiving validates batch and submits canonical stock transaction',
  );
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
