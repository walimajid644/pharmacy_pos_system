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
let pageErrors = [];
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
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.text);
      console.error(
        'PAGE ERROR',
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
      );
    }
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
        '&compact=1&layout=1&role=' +
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
  await cdp('Page.navigate', {
    url: 'http://127.0.0.1:1422/tests/ui/phase1.html?view=%2F&compact=1&dashboard-fail=1&product-count=1',
  });
  await until('window.fixtureReady===true');
  await until("document.querySelector('.home-view [role=alert]')!==null");
  assert.equal(
    await evaluate(
      "document.querySelector('.stat-card:last-child .stat-card-value').textContent.trim()",
    ),
    '1',
  );
  console.log('Product total remains 1 when the sales dashboard query fails');
  const routes = [
    '/pos',
    '/products',
    '/purchase-orders',
    '/purchase-orders/new',
    '/customers',
    '/suppliers',
    '/sales-history',
    '/reports',
    '/daily-closing',
    '/users',
    '/settings',
    '/payments',
    '/expenses',
    '/supplier-ledger',
    '/customer-ledger',
    '/item-search',
    '/stock-adjustments',
    '/sales-returns',
    '/shifts',
    '/catalog-bulk',
    '/catalog-import',
    '/expiry-actions',
    '/purchase-suggestions',
    '/estimates',
    '/preorders',
  ];
  for (const [index, route] of routes.entries()) {
    pageErrors = [];
    await open('/');
    await until(
      "!!document.querySelector('.bill-row') && !document.querySelector('.home-view .skeleton')",
    );
    await evaluate(`
      // The refresh audit uses an empty finance register, independent of union-query fixtures.
      var invoke=__TAURI_INTERNALS__.invoke;
      __TAURI_INTERNALS__.invoke=async(command,args={})=> command==='database_select' && args.query?.toLowerCase().includes('from account_entries') ? [] : command==='current_shift' ? {id:'shift1',cashierId:'test-user',cashierName:'Test Cashier',openedAt:new Date().toISOString(),openingCashCents:0,status:'open'} : invoke(command,args);
      window.initialHome=document.querySelector('.home-view');
      window.beforeBill=document.querySelector('.bill-row');
      window.trace=[];
      window.flashObserver=new MutationObserver(()=>{if(!document.querySelector('.workspace-overlay') && document.querySelector('.home-view .skeleton')) window.trace.push('skeleton');});
      window.flashObserver.observe(document.body,{childList:true,subtree:true});
      fixture.dashboardDelay=80;
    `);
    await evaluate(`testRouter.push(${JSON.stringify(route)})`);
    await until("!!document.querySelector('.workspace-dialog')");
    await delay(200);
    await evaluate(
      `window.beforeRects=[...document.querySelectorAll('.home-view .stat-card,.home-view .insight-card,.home-view .alerts-card')].map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height})); fixture.calls.length=0;`,
    );
    if (index % 2) await escape();
    else await evaluate("document.querySelector('.workspace-close').click()");
    await until("location.pathname==='/'&&!document.querySelector('.workspace-overlay')");
    await until("fixture.calls.filter(c=>c.query?.includes('FROM sales_dashboard')).length>=3");
    await delay(150);
    const result = await evaluate(
      `({route:${JSON.stringify(route)},flashes:window.trace,homeSame:initialHome===document.querySelector('.home-view'),billSame:beforeBill===document.querySelector('.bill-row'),rectsChanged:JSON.stringify(beforeRects)!==JSON.stringify([...document.querySelectorAll('.home-view .stat-card,.home-view .insight-card,.home-view .alerts-card')].map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height}))),scrollY:window.scrollY})`,
    );
    assert.deepEqual(result.flashes, [], route + ' must not show loading placeholders');
    assert.deepEqual(pageErrors, [], route + ' must render without runtime errors');
    assert(
      result.homeSame && result.billSame && !result.rectsChanged && result.scrollY === 0,
      route + ' must preserve dashboard DOM/layout',
    );
    console.log('Stable background refresh: ' + route);
  }
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
