// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/compact');
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
  async function fits(selector) {
    inside(await evaluate(rect(selector)), selector);
    const overflow = await evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)});return {width:e.scrollWidth-e.clientWidth,height:e.scrollHeight-e.clientHeight};})()`,
    );
    assert(
      overflow.width <= 1 && overflow.height <= 1,
      `${selector} overflows: ${JSON.stringify(overflow)}`,
    );
  }
  await open('/');
  await until(
    "!!document.querySelector('.alerts-table tbody tr') && !!document.querySelector('.bill-row')",
  );
  await delay(250);
  for (const selector of ['.home-view', '.insights-grid', '.alerts-content']) await fits(selector);
  assert(
    await evaluate(
      "[...document.querySelectorAll('.home-view .compact-page-content')].every(e => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1)",
    ),
  );
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.refresh-action')).fontSize"),
    '11px',
  );
  assert.equal(
    await evaluate("getComputedStyle(document.querySelector('.stat-card-value')).fontSize"),
    '18px',
  );
  await shot('dashboard-populated-1024x600');
  async function assertSoftMetrics() {
    assert(
      await evaluate(`(() => {
      const root=getComputedStyle(document.documentElement);
      const swatch=document.createElement('div');swatch.style.background='var(--surface-card)';document.body.append(swatch);
      const surface=getComputedStyle(swatch).backgroundColor;swatch.remove();
      return [...document.querySelectorAll('.stat-card')].every(card=>{
        const style=getComputedStyle(card),icon=card.querySelector('.stat-card-icon'),chip=getComputedStyle(icon),rect=icon.getBoundingClientRect();
        return style.borderRadius==='10px' && style.borderLeftWidth==='1px' && style.backgroundColor===surface && rect.width===40 && rect.height===40 && chip.borderRadius==='50%' && !!icon.querySelector('svg');
      }) && root.getPropertyValue('--radius-lg').trim()==='14px';
    })()`),
      'Metric cards use neutral surfaces, 10px corners and 40px circular icons',
    );
  }
  await assertSoftMetrics();
  await evaluate("document.querySelectorAll('.alert-tab')[1].click()");
  await delay(150);
  await fits('.alerts-content');
  await evaluate(
    "document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')",
  );
  await delay(350);
  await shot('dashboard-dark-1024x600');
  await assertSoftMetrics();
  results.push(
    'Compact dashboard uses 11px controls and 18px metrics; populated bills/alerts fit without scrolling',
  );
  await evaluate(`
    window.dashboardFlashed=false;
    window.dashboardBillNode=document.querySelector('.bill-row');
    window.dashboardObserver=new MutationObserver(()=>{
      if(document.querySelector('.home-view .skeleton')) window.dashboardFlashed=true;
    });
    window.dashboardObserver.observe(document.querySelector('.home-view'),{childList:true,subtree:true});
    fixture.dashboardDelay=150;
    fixture.dashboardBillAmount=200;
    fixture.calls.length=0;
    document.querySelector('.dashboard-tasks button').click();
  `);
  await until("document.querySelector('#pos-product-search')!==null");
  await escape();
  await until("location.pathname==='/'");
  await until("fixture.calls.some(c=>c.query?.includes('FROM sales_dashboard'))");
  assert(
    await evaluate(
      "document.querySelector('.bill-row')===window.dashboardBillNode&&!document.querySelector('.home-view .skeleton')",
    ),
  );
  await until("document.querySelector('.bill-row b')?.textContent.includes('200.00')");
  assert.equal(await evaluate('window.dashboardFlashed'), false);
  await evaluate(
    "fixture.dashboardFail=true;fixture.calls.length=0;document.querySelector('.dashboard-tasks button').click()",
  );
  await until("document.querySelector('#pos-product-search')!==null");
  await escape();
  await until("location.pathname==='/'");
  await until("fixture.calls.some(c=>c.command==='record_diagnostic')");
  assert(
    await evaluate(
      "!window.dashboardFlashed&&!document.querySelector('.home-view [role=alert]')&&document.querySelector('.bill-row b').textContent.includes('200.00')",
    ),
  );
  await evaluate('window.dashboardObserver.disconnect()');
  results.push(
    'Closing Sales refreshes dashboard data in the background without placeholders or replacing existing cards; failed refresh retains the last values without a flashing error',
  );
  await open('/pos');
  await evaluate(
    "document.querySelector('#pos-product-search').focus();document.querySelector('#pos-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await until("document.activeElement?.id==='pos-modal-product-search'");
  await evaluate(
    "var input=document.querySelector('#pos-modal-product-search');input.value='Medicine';input.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  await until("document.querySelector('.pos-search-dialog .pos-product-row')!==null");
  await delay(200);
  await fits('.pos-search-dialog');
  await fits('.pos-search-dialog-results');
  await evaluate("document.querySelector('#pos-modal-product-search').focus()");
  assert.equal(await evaluate('document.activeElement?.id'), 'pos-modal-product-search');
  await evaluate("document.querySelector('.pos-search-dialog-footer > button').focus()");
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowDown',
    windowsVirtualKeyCode: 40,
  });
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowDown',
    windowsVirtualKeyCode: 40,
  });
  assert(
    await evaluate(
      "document.querySelector('.pos-product-row[aria-selected=true]')?.textContent.includes('Medicine 2')",
    ),
  );
  assert.equal(await evaluate('document.activeElement?.id'), 'pos-modal-product-search');
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowDown',
    windowsVirtualKeyCode: 40,
    autoRepeat: true,
  });
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowDown',
    windowsVirtualKeyCode: 40,
  });
  assert(
    await evaluate(
      "document.querySelector('.pos-product-row[aria-selected=true]')?.textContent.includes('Medicine 3')",
    ),
  );
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowUp',
    windowsVirtualKeyCode: 38,
  });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', windowsVirtualKeyCode: 38 });
  assert(
    await evaluate(
      "document.querySelector('.pos-product-row[aria-selected=true]')?.textContent.includes('Medicine 2')",
    ),
  );
  await evaluate(
    "document.querySelector('#pos-modal-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))",
  );

  await evaluate(
    "for(let i=0;i<12;i++)document.querySelector('#pos-modal-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))",
  );
  await delay(100);
  assert(
    await evaluate(
      "document.querySelector('.pos-search-dialog .pos-product-row.highlighted')?.textContent.includes('Medicine 13')",
    ),
  );
  await fits('.pos-search-dialog-results');
  assert(await evaluate('testCart.items.length===0'));
  await shot('product-search-paged-1024x600');
  await evaluate(
    "document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')",
  );
  await delay(350);
  await shot('product-search-dark-1024x600');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
  await until(
    "!document.querySelector('.pos-search-dialog') && !!document.querySelector('#pos-entry-quantity') && !document.querySelector('#pos-entry-quantity').disabled",
  );
  await evaluate(
    "document.querySelector('#pos-entry-quantity').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await until("testCart.items.length===1&&!document.querySelector('.pos-search-dialog')");
  assert.equal(await evaluate('testCart.items[0].product.name'), 'Medicine 13');

  results.push(
    'Product-search dialog pages long result lists; keyboard navigation keeps the highlighted row visible without scrolling',
  );
  await open('/products');
  await until("document.querySelector('.inventory-table tbody tr') !== null");
  await delay(200);
  await fits('.workspace-body');
  await fits('.inventory-table-scroll');
  assert(await evaluate("document.querySelectorAll('.inventory-table tbody tr').length < 40"));
  const firstProduct = await evaluate(
    "document.querySelector('.inventory-table tbody').textContent",
  );
  await evaluate(
    "document.querySelector('.inventory-table-scroll .compact-pager button:last-child').click()",
  );
  await delay(100);
  assert.notEqual(
    await evaluate("document.querySelector('.inventory-table tbody').textContent"),
    firstProduct,
  );
  await shot('products-paged-1024x600');
  await evaluate(
    "[...document.querySelectorAll('.inventory-header button')].find(b=>b.textContent.includes('Add Product')).click()",
  );
  await until("!!document.querySelector('.product-dialog-card')");
  await fits('.product-dialog-card');
  assert(
    await evaluate(
      "getComputedStyle(document.querySelector('.product-dialog-card')).borderRadius==='14px' && getComputedStyle(document.querySelector('.product-dialog-card')).overflow==='hidden'",
    ),
  );
  inside(await evaluate(rect('.product-dialog-card button:last-child')), 'save product');
  await shot('product-dialog-1024x600');
  await evaluate("document.querySelector('.product-dialog input').focus()");
  await escape();
  await until("!document.querySelector('.product-dialog')");
  assert(await evaluate("location.pathname==='/products'"));
  await evaluate(
    "[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Batches')).click()",
  );
  await until("!!document.querySelector('.batch-dialog tbody tr')");
  await fits('.batch-dialog-content');
  await evaluate(
    "[...document.querySelectorAll('.batch-dialog button')].find(b=>b.textContent.includes('Add New Batch')).click()",
  );
  await delay(200);
  await fits('.batch-dialog-content');
  await shot('batch-add-dialog-1024x600');
  await evaluate("document.querySelector('.batch-dialog input').focus()");
  await escape();
  await until("!document.querySelector('.batch-dialog')");
  assert(await evaluate("location.pathname==='/products'"));
  await evaluate(
    "[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Label')).click()",
  );
  await until("!!document.querySelector('.barcode-dialog-card')");
  await fits('.barcode-dialog-card');
  await shot('barcode-dialog-1024x600');
  await evaluate("document.querySelector('.barcode-dialog input').focus()");
  await escape();
  await until("!document.querySelector('.barcode-dialog')");
  assert(await evaluate("location.pathname==='/products'"));
  await escape();
  await until("location.pathname==='/'&&!document.querySelector('.workspace-dialog')");

  results.push(
    '40 products and batches page without overflow; product, add-batch and barcode dialogs fit 1024x600',
  );
  await open('/purchase-orders');
  await until("!!document.querySelector('.purchase-table tbody tr')");
  await delay(200);
  await fits('.workspace-body');
  await fits('.purchase-table-scroll');
  assert(await evaluate("document.querySelectorAll('.purchase-table tbody tr').length < 40"));
  await shot('purchases-paged-1024x600');
  await open('/purchase-orders/new');
  await until("!!document.querySelector('.line-item')");
  await fits('.workspace-body');
  inside(await evaluate(rect('.form-actions')), 'purchase actions');
  await evaluate(
    "for(let index=0;index<25;index++)document.querySelector('.section-header button').click()",
  );
  await delay(250);
  await fits('.workspace-body');
  await fits('.order-lines-section');
  assert(
    await evaluate(
      "[...document.querySelectorAll('.line-item-number')].some(e=>e.textContent==='26')",
    ),
  );
  await evaluate("document.querySelector('.order-lines-section .compact-pager button').click()");
  await delay(100);
  assert(
    await evaluate(
      "![...document.querySelectorAll('.line-item-number')].some(e=>e.textContent==='26')",
    ),
  );
  await fits('.order-lines-section .compact-page-content');
  const firstLine = await evaluate("document.querySelector('.line-item-number').textContent");
  await evaluate(
    "var quantity=document.querySelector('.line-item input[type=number]');quantity.value='9';quantity.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  await evaluate(
    "document.querySelector('.order-lines-section .compact-pager button:last-child').click()",
  );
  await delay(100);
  await evaluate("document.querySelector('.order-lines-section .compact-pager button').click()");
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('.line-item-number').textContent"),
    firstLine,
  );
  assert.equal(
    await evaluate("document.querySelector('.line-item input[type=number]').value"),
    '9',
  );
  await shot('purchase-lines-paged-1024x600');
  await open('/purchase-orders/po-existing/receive');
  await until("!!document.querySelector('.receive-items .table-row')");
  await delay(200);
  await fits('.workspace-body');
  await fits('.receive-items');
  inside(await evaluate(rect('.actions')), 'receipt actions');
  assert(await evaluate("document.querySelectorAll('.receive-items .table-row').length < 40"));
  await shot('purchase-receive-paged-1024x600');
  await evaluate(
    "document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')",
  );
  await shot('purchase-receive-dark-1024x600');
  results.push(
    'Purchase register, 26-line editor and 40-line receiving form page without overflow and retain visible actions',
  );

  for (const [route, control] of [
    ['/pos', '#pos-product-search'],
    ['/products', '#products-search'],
    ['/purchase-orders', '.filters-grid input'],
    ['/purchase-orders/new', '.form-select'],
    ['/purchase-orders/po-existing/receive', '.col-batch input'],
    ['/customers', 'input'],
    ['/suppliers', 'input'],
  ]) {
    await open(route);
    await until(`!!document.querySelector('.workspace-dialog ${control}')`);
    await evaluate(`document.querySelector('.workspace-dialog ${control}').focus()`);
    await escape();
    await until("location.pathname==='/'&&!document.querySelector('.workspace-dialog')");
  }
  for (const route of ['/stock-adjustments', '/sales-returns', '/sales-history']) {
    await open(route);
    await until("document.querySelector('.workspace-body tbody button')!==null");
    await evaluate("document.querySelector('.workspace-body tbody button').click()");
    await until("document.querySelector('.workspace-body [role=dialog]')!==null");
    await escape();
    await until("document.querySelector('.workspace-body [role=dialog]')===null");
    assert.equal(await evaluate('location.pathname'), route);
    await escape();
    await until("location.pathname==='/'");
  }
  await open('/pos');
  await until("document.querySelector('#pos-customer')!==null");
  await evaluate(
    "var customer=document.querySelector('#pos-customer');customer.focus();customer.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))",
  );
  await until("document.querySelector('#pos-customer-options')!==null");
  await evaluate("document.querySelector('#pos-customer').focus()");
  await escape();
  await until("document.querySelector('#pos-customer-options')===null");
  assert.equal(await evaluate('location.pathname'), '/pos');
  await escape();
  await until("location.pathname==='/'");
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', windowsVirtualKeyCode: 112 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', windowsVirtualKeyCode: 112 });
  await until('document.querySelector(\'[aria-label^="Keyboard shortcuts"]\')!==null');
  await escape();
  await until('document.querySelector(\'[aria-label^="Keyboard shortcuts"]\')===null');
  results.push(
    'Escape closes workspaces from focused fields, closes inner dialogs first, and handles batch, barcode, invoice, return, adjustment, customer picker and help popups',
  );
  console.log(JSON.stringify(results, null, 2));
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
