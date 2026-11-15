// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/escape');
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

  await open('/pos');
  await until("document.querySelector('#pos-product-search')!==null");
  await evaluate(
    "document.querySelector('#pos-product-search').focus();document.querySelector('#pos-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await until("document.activeElement?.id==='pos-modal-product-search'");
  await escape();
  await until("document.querySelector('.pos-search-dialog')===null");
  assert.equal(await evaluate('location.pathname'), '/pos');
  await escape();
  await until("location.pathname==='/'");
  results.push(
    'Escape closes the product-search dialog first, then Sales from its focused item field',
  );

  await open('/products');
  await until("document.querySelector('.inventory-table tbody button')!==null");
  await evaluate(
    "[...document.querySelectorAll('.inventory-header button')].find(b=>b.textContent.includes('Add Product')).click()",
  );
  await until("document.querySelector('.product-dialog input')!==null");
  await evaluate("document.querySelector('.product-dialog input').focus()");
  await escape();
  await until("document.querySelector('.product-dialog')===null");
  assert.equal(await evaluate('location.pathname'), '/products');
  for (const [action, popup] of [
    ['Batches', '.batch-dialog'],
    ['Label', '.barcode-dialog'],
  ]) {
    await evaluate(
      `[...document.querySelectorAll('.inventory-table tbody button')].find(b=>b.textContent.includes('${action}')).click()`,
    );
    await until(`document.querySelector('${popup}')!==null`);
    if (action === 'Batches') {
      await until("document.querySelector('.batch-dialog table')!==null");
      await evaluate(
        "[...document.querySelectorAll('.batch-dialog button')].find(b=>b.textContent.includes('Add New Batch')).click()",
      );
    }
    await until(`document.querySelector('${popup} input')!==null`);
    await evaluate(`document.querySelector('${popup} input').focus()`);
    await escape();
    await until(`document.querySelector('${popup}')===null`);
    assert.equal(await evaluate('location.pathname'), '/products');
  }
  await escape();
  await until("location.pathname==='/'");
  results.push(
    'Product edit, add-batch and barcode dialogs close independently; the next Escape closes Products',
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
  results.push(
    'Sales, Products, Purchases, purchase editor, receiving, Customers and Suppliers close even while a field has focus',
  );

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
  results.push('Adjustment, return and invoice-detail review dialogs close before their registers');

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
    'Customer picker and shortcut help respond to Escape without closing the screen underneath',
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
