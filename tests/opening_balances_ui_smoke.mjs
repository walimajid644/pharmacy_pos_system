// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/openings-and-stickers');
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
  await evaluate(`(async()=>{
    window.step3Rows=[];window.step3Writes=[];window.expenseHeads=[{id:'general',name:'General',description:null,isActive:true,assignedCount:1,updatedAt:'v1'}];
    window.batchRows=[{id:'batch-a',name:'Test medicine',sku:'MED-1',barcode:'123456789',batch_number:'BATCH-A',expiry_date:'2099-12-31',quantity_in_stock:25,unit_price:10,pack_size:10},{id:'batch-b',name:'No stock medicine',sku:'MED-2',barcode:null,batch_number:'BATCH-B',expiry_date:'2025-01-01',quantity_in_stock:0,unit_price:20,pack_size:1}];
    const original=__TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='list_catalog_register'&&args.kind==='expense_head') return expenseHeads.map(h=>({...h}));
      if(command==='save_catalog_register'&&args.request.kind==='expense_head'){
        const r=args.request;const old=expenseHeads.find(h=>h.id===r.id);
        if(old)Object.assign(old,r,{updatedAt:'v2'});else expenseHeads.push({...r,id:'new-head',assignedCount:0,updatedAt:'v1'});
        return r.id||'new-head';
      }
      if(command==='record_opening_balance'){
        if(window.failOpening)throw 'Synthetic save failure';
        const r=args.request;step3Writes.push(r);step3Rows.push({id:r.requestId,kind:r.kind,name:r.kind+' account',amount_cents:r.amountCents,entry_date:r.entryDate,reference:r.reference,notes:r.notes,entity_id:r.entityId});return r.requestId;
      }
      if(command==='record_supplier_payment'){window.openingPayment=args.request;window.openingPaid=(window.openingPaid||0)+args.request.amountCents;return {voucherNumber:'SP-OPENING',amountCents:args.request.amountCents,balanceCents:12345-window.openingPaid};}
      if(command==='database_select'){
        const q=args.query.toLowerCase();
        if(q.includes('from opening_balances o order by'))return step3Rows.map(r=>({...r}));
        if(q.includes('from customers c where c.is_active')||q.includes('from suppliers s where s.is_active')||q.includes('from bank_accounts b where')){
          const kind=q.includes('from customers')?'customer':q.includes('from suppliers')?'supplier':'bank';return [{id:kind+'-account',name:kind+' account',existing:step3Rows.filter(r=>r.kind===kind).length}];
        }
        if(q.includes('union all select o.id'))return step3Rows.filter(r=>r.kind==='supplier').map(r=>({id:r.id,po_number:'Opening · '+r.reference,supplier_name:r.name,supplier_id:r.entity_id,order_date:r.entry_date,received_date:null,payment_terms:0,status:'opening',total_amount:r.amount_cents/100,ordered_value:1,received_value:1,paid_cents:window.openingPaid||0}));
        if(q.includes('from supplier_opening_payments p')&&q.includes('p.opening_id'))return [];
        if(q.includes('from expense_heads'))return expenseHeads.filter(h=>h.isActive).map(h=>({id:h.id,name:h.name}));
        if(q.includes('from product_batches b join products p')&&q.includes('limit 100')) return batchRows.filter(b=>(b.name+' '+b.batch_number).toLowerCase().includes(args.values[0].slice(1,-1).toLowerCase()));
      }
      return original(command,args);
    };
    window.print=()=>{window.didPrint=true};
    await testRouter.push('/expense-heads');
  })()`);
  const field = async (selector, value, event = 'input') =>
    evaluate(
      `(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const button = async (selector, text) =>
    evaluate(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`,
    );
  const fits = async (selector) => {
    const measurements = await evaluate(
      `(()=>{const root=document.querySelector(${JSON.stringify(selector)}),r=root.getBoundingClientRect();return {height:root.scrollHeight,client:root.clientHeight,bottom:r.bottom,clipped:[...root.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden').filter(e=>e.getBoundingClientRect().bottom>innerHeight+1||e.getBoundingClientRect().right>innerWidth+1).map(e=>e.textContent||e.type)}})()`,
    );
    assert(measurements.height <= measurements.client + 2, JSON.stringify(measurements));
    assert(measurements.bottom <= 600, JSON.stringify(measurements));
    assert.deepEqual(measurements.clipped, []);
  };
  await until("!!document.querySelector('#register-name')");
  await field('#register-name', 'Delivery');
  await evaluate("document.querySelector('.register-save').click()");
  await until('expenseHeads.length===2');
  await field('.register-search input', 'Delivery');
  await button('.register-row-actions button', 'Deactivate');
  await until('expenseHeads[1].isActive===false');
  await fits('.catalog-register');
  await evaluate("testRouter.push('/expenses')");
  await until("!!document.querySelector('select option[value=General]')");
  assert.equal(
    await evaluate("[...document.querySelectorAll('select option')].some(o=>o.value==='Delivery')"),
    false,
  );
  await evaluate("testRouter.push('/opening-balances')");
  await until("document.querySelector('.opening-form select')?.options.length===2");
  await fits('.opening-terminal');
  const enterOpening = async (kind) => {
    await field('.opening-form select', kind + '-account', 'change');
    await field('.opening-form input[type=number]', '123.45');
    await field('.opening-form input[maxlength="100"]', 'Old book');
  };
  await enterOpening('customer');
  await evaluate("window.failOpening=true;document.querySelector('.opening-form button').click()");
  await until(
    "document.querySelector('[role=alert]')?.textContent.includes('Synthetic save failure')",
  );
  assert.equal(await evaluate('step3Writes.length'), 0);
  assert.equal(
    await evaluate("document.querySelector('.opening-form input[type=number]').value"),
    '123.45',
  );
  await evaluate("window.failOpening=false;document.querySelector('.opening-form button').click()");
  await until('step3Writes.length===1');
  await until(
    "document.querySelector('.opening-form select option[value=customer-account]')?.disabled",
  );
  assert.equal(await evaluate('step3Writes[0].amountCents'), 12345);
  await shot('customer-opening');
  for (const kind of ['supplier', 'bank']) {
    await button('.opening-actions button', kind === 'supplier' ? 'Suppliers' : 'Banks');
    await until(`!!document.querySelector('.opening-form select option[value=${kind}-account]')`);
    await enterOpening(kind);
    if (kind === 'bank')
      await field('.opening-form select:nth-of-type(1)', 'bank-account', 'change');
    if (kind === 'bank')
      await evaluate(
        "const selects=document.querySelectorAll('.opening-form select');selects[1].value='negative';selects[1].dispatchEvent(new Event('change',{bubbles:true}))",
      );
    await evaluate("document.querySelector('.opening-form button').click()");
    await until(`step3Writes.length===${kind === 'bank' ? 3 : 2}`);
  }
  assert.equal(await evaluate('step3Writes[2].amountCents'), -12345);
  await fits('.opening-terminal');
  await evaluate("testRouter.push('/products')");
  await evaluate("testRouter.push('/opening-balances')");
  await until("document.querySelector('.opening-list tbody')?.textContent.includes('Old book')");
  await evaluate("testRouter.push('/supplier-ledger')");
  await until("document.querySelector('.ledger-page tbody')?.textContent.includes('Opening')");
  assert(
    await evaluate("document.querySelector('.ledger-page').textContent.includes('age unknown')"),
  );
  await fits('.ledger-page');
  await button('.ledger-page .commercial-tabs button', 'Record payment');
  await field(
    'select[aria-label="Payment order or opening"]',
    await evaluate("step3Rows.find(r=>r.kind==='supplier').id"),
    'change',
  );
  await field('.ledger-form input[type=number]', '23.45');
  await field('select[aria-label="Payment method"]', 'bank', 'change');
  await until(
    '!!document.querySelector(\'select[aria-label="Payment bank account"] option[value=bank-a]\')',
  );
  await field('select[aria-label="Payment bank account"]', 'bank-a', 'change');
  await evaluate("document.querySelector('.ledger-form button[type=submit]').click()");
  await until('!!window.openingPayment');
  assert.equal(await evaluate('openingPayment.amountCents'), 2345);
  assert.match(await evaluate('openingPayment.requestId'), /^[0-9a-f-]{36}$/i);
  await evaluate("testRouter.push('/batch-stickers')");
  await until("document.querySelectorAll('.stickers-list tbody button').length===2");
  await fits('.batch-stickers');
  await evaluate("document.querySelector('.stickers-list tbody button').click()");
  await until("!!document.querySelector('.batch-label-preview svg')");
  assert(
    await evaluate(
      "document.querySelector('.batch-label-preview').textContent.includes('BATCH-A')",
    ),
  );
  await field('.stickers-options input', '2');
  await field('.stickers-options select', 'pack', 'change');
  await button('.stickers-form>button', 'Print stickers');
  await until('window.didPrint===true');
  assert.equal(await evaluate("document.querySelectorAll('.batch-sticker-label').length"), 2);
  assert(
    await evaluate("document.querySelector('.batch-sticker-label b').textContent.includes('100')"),
  );
  assert(
    await evaluate(
      "document.querySelector('.batch-sticker-label').textContent.includes('2099-12-31')",
    ),
  );
  await cdp('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await cdp('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 284, height: 133, scale: 2 },
  });
  await writeFile(path.join(out, 'printed-batch-label.png'), Buffer.from(printed.data, 'base64'));
  await cdp('Emulation.setEmulatedMedia', { media: '' });
  await evaluate("window.dispatchEvent(new Event('afterprint'));window.didPrint=false");
  await field('.stickers-options input', '101');
  assert(await evaluate("document.querySelector('.stickers-form>button').disabled"));
  await field('.stickers-options input', '1');
  await field('.stickers-options select', 'none', 'change');
  await evaluate("document.querySelectorAll('.stickers-list tbody button')[1].click()");
  await button('.stickers-form>button', 'Print stickers');
  await until('window.didPrint===true');
  assert.equal(await evaluate("!!document.querySelector('.batch-sticker-label svg')"), false);
  assert.equal(await evaluate("!!document.querySelector('.batch-sticker-label b')"), false);
  assert(
    await evaluate(
      "document.querySelector('.batch-sticker-label').textContent.includes('BATCH-B')",
    ),
  );
  await evaluate("window.dispatchEvent(new Event('afterprint'))");
  await shot('batch-sticker-preview');
  await evaluate(
    "document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark')",
  );
  await fits('.batch-stickers');
  await shot('batch-sticker-dark');
  await evaluate("testAuth.currentUser.role='cashier';testRouter.push('/products')");
  for (const path of ['/opening-balances', '/expense-heads', '/bank-accounts', '/batch-stickers']) {
    await evaluate(`testRouter.push(${JSON.stringify(path)})`);
    assert.equal(await evaluate('testRouter.currentRoute.value.path'), '/');
  }
  results.push(
    'Expense-head CRUD/use, signed opening save/reload/failure, roles, no-scroll and batch-label print controls passed',
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
