// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/ui-polish');
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
const runtimeErrors = [];
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
      runtimeErrors.push(
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
    for (let i = 0; i < 200; i++) {
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
      if(command==='database_select'&&q.includes('as invoice_count')&&q.includes('from sales_invoices'))return [{invoice_count:2,total_sales:100,total_cash:70,total_card:20,total_mobile:10,total_credit:0}];
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

  const prefs = `window.uiPrefs=(await import('/src/lib/i18n.ts')).useI18n();window.uiTheme=(await import('/src/lib/theme.ts')).useTheme();`;
  await evaluate(`(async()=>{${prefs}})()`);
  const field = async (selector, value, event = 'input') =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const key = async (value, code, modifiers = 0) => {
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: value,
      windowsVirtualKeyCode: code,
      modifiers,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: value,
      windowsVirtualKeyCode: code,
      modifiers,
    });
  };
  const findings = [];
  const probe = `(()=>{const root=document.querySelector('.workspace-body');return [...root.querySelectorAll('*'),root].filter(e=>e instanceof HTMLElement&&!e.closest('.sr-only,[inert]')&&!['INPUT','TEXTAREA','SELECT','OPTION'].includes(e.tagName)).flatMap(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(!e.getClientRects().length||r.width<2||r.height<2||!e.clientHeight||!e.clientWidth||s.display==='inline'||s.textOverflow==='ellipsis')return [];const x=e.scrollWidth-e.clientWidth,y=e.scrollHeight-e.clientHeight;return x>2||y>2?[{tag:e.tagName,cls:e.className,x,y}]:[];}).slice(0,12);})()`;
  const routes = [
    '/report-center',
    '/purchase-settings',
    '/purchase-orders',
    '/purchase-orders/new',
    '/purchase-orders/po-1/receive',
    '/daily-closing',
    '/reports',
    '/incomes',
    '/bank-transactions',
    '/opening-balances',
    '/batch-stickers',
    '/user-rights',
    '/login-history',
    '/restore',
  ];
  for (const language of process.env.UI_POLISH_KEYS_ONLY ? [] : ['en', 'ur', 'mixed'])
    for (const theme of ['light', 'dark']) {
      await evaluate(
        `(()=>{uiPrefs.setLanguage(${JSON.stringify(language)});uiTheme.setTheme(${JSON.stringify(theme)});uiPrefs.setNumberFormat(${JSON.stringify(language === 'ur' ? 'ur' : 'en')});uiPrefs.setDateFormat('dmy');})()`,
      );
      for (const route of routes) {
        await evaluate(`testRouter.push(${JSON.stringify(route)})`);
        await delay(180);
        if (route === '/report-center') {
          await evaluate("document.querySelector('.report-filters button[type=submit]').click()");
          await until("document.querySelector('.report-results tbody tr')");
        }
        const issues = await evaluate(probe);
        if (issues.length) {
          findings.push({ language, theme, route, issues });
          await shot(language + '-' + theme + '-' + route.replaceAll('/', '-'));
        }
        const controls = await evaluate(
          `(()=>{const root=document.querySelector('.workspace-body');return [...root.querySelectorAll('button,input,select,textarea')].filter(e=>e.getClientRects().length&&!e.closest('[inert]')).filter(e=>{const r=e.getBoundingClientRect();return r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<0||r.top<0;}).map(e=>e.textContent||e.type);})()`,
        );
        if (controls.length) findings.push({ language, theme, route, controls });
        if (route === '/purchase-settings') {
          const state = await evaluate(
            "({title:document.querySelector('.purchase-settings h1').textContent,dir:document.documentElement.dir,bg:getComputedStyle(document.querySelector('.purchase-settings')).backgroundColor})",
          );
          assert.equal(state.dir, language === 'ur' ? 'rtl' : 'ltr');
          assert(state.title.includes(language === 'ur' ? 'خریداری' : 'Purchase Form Settings'));
          if (theme === 'dark') assert.notEqual(state.bg, 'rgb(255, 255, 255)');
        }
        if (
          language === 'ur' &&
          theme === 'dark' &&
          ['/purchase-settings', '/report-center', '/purchase-orders/new'].includes(route)
        )
          await shot('urdu-dark-' + route.replaceAll('/', '-'));
      }
    }
  await writeFile(path.join(out, 'layout-findings.json'), JSON.stringify(findings, null, 2));
  assert.deepEqual(runtimeErrors, [], 'Browser runtime errors');
  assert.deepEqual(findings, [], 'Locale/theme layout overflow: ' + JSON.stringify(findings));
  await evaluate(
    "uiPrefs.setLanguage('en');uiPrefs.setNumberFormat('en');testRouter.push('/purchase-settings')",
  );
  await until("document.querySelector('.purchase-settings button[aria-keyshortcuts]')");
  await evaluate("document.querySelector('.preference-grid input').focus()");
  await field('.preference-grid input', '5');
  await key('s', 83, 2);
  await until('settingsSaves.length===1');
  await evaluate("testRouter.push('/purchase-orders/new')");
  await until("document.querySelector('.line-item input[role=combobox]')");
  await evaluate("document.querySelector('.line-item input[role=combobox]').focus()");
  await field('.line-item input[role=combobox]', 'Medicine');
  await until("document.querySelector('.product-dropdown [role=option]')");
  await key('ArrowDown', 40);
  await key('Enter', 13);
  assert.equal(await evaluate('document.activeElement?.type'), 'number');
  assert.equal(
    await evaluate("document.querySelector('.line-item input[role=combobox]').value"),
    'Medicine 2',
  );
  await field('#field-purchaseorderinformation-1', 's1', 'change');
  await key('s', 83, 2);
  await until('savedOrders.length===1');
  assert.equal(await evaluate('savedOrders[0].items[0].quantityOrdered'), 5);
  await evaluate("testRouter.push('/report-center')");
  await until("document.querySelector('.report-filters button')");
  const before = await evaluate('reportCalls.length');
  await evaluate("document.querySelector('.report-filters select').focus()");
  await key('Enter', 13, 2);
  await until('reportCalls.length>' + before);
  await until("document.querySelector('.report-results tbody tr')");
  await key('p', 80, 2);
  await until('printedRows===70');
  await evaluate("window.dispatchEvent(new Event('afterprint'))");
  await evaluate("testRouter.push('/purchase-settings')");
  await until("document.querySelector('.purchase-settings button')");
  await evaluate(
    "testAuth.currentUser.permissions=['catalog.read'];document.querySelector('.preference-grid input').focus()",
  );
  await key('s', 83, 2);
  await delay(100);
  assert.equal(await evaluate('settingsSaves.length'), 1, 'Shortcut bypassed disabled save');
  results.push(
    '84 locale/theme screen layouts at 1024x600; Urdu RTL and dark surfaces; translated labels; product typing/arrow/Enter focus; Ctrl+S settings/draft and Ctrl+Enter/Ctrl+P report shortcuts; denied save remains blocked',
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
