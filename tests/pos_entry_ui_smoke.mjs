// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/pos-entry');
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
  await open('/pos');
  await until("document.querySelector('#pos-item-code')!==null");
  await until("document.querySelector('#pos-invoice-number').value==='1'");
  const firstInvoice = await evaluate("document.querySelector('#pos-invoice-number').value");
  assert.equal(firstInvoice, '1');
  assert(await evaluate("document.querySelector('#pos-invoice-number').readOnly"));
  const invoiceRect = await evaluate(rect('#pos-invoice-number'));
  const clientRect = await evaluate(rect('#pos-customer'));
  assert(invoiceRect.bottom <= clientRect.y && Math.abs(invoiceRect.x - clientRect.x) <= 1);
  async function chooseProduct(loose = false, click = false) {
    await evaluate(
      "document.querySelector('#pos-item-code').focus();document.querySelector('#pos-item-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
    );
    await until("document.querySelector('.pos-product-row')!==null");
    if (click) await evaluate("document.querySelector('.pos-product-row').click()");
    else
      await evaluate(
        `document.querySelector('#pos-modal-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:${loose},bubbles:true}))`,
      );
    await until(
      "!document.querySelector('.pos-search-dialog') && document.activeElement?.id==='pos-entry-quantity'",
    );
  }
  async function fields(quantity, bonus, discount) {
    await evaluate(
      `for(const [id,value] of Object.entries({'pos-entry-quantity':${JSON.stringify(quantity)},'pos-entry-bonus':${JSON.stringify(bonus)},'pos-entry-discount':${JSON.stringify(discount)}})){const e=document.getElementById(id);e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));}`,
    );
  }
  const post = () =>
    evaluate(
      "document.querySelector('#pos-entry-quantity').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
    );
  await evaluate(
    "document.querySelector('#pos-item-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
  );
  await until("!!document.querySelector('.pos-product-row')");
  assert.equal(await evaluate('document.activeElement?.id'), 'pos-modal-product-search');
  assert.equal(await evaluate("document.querySelectorAll('.pos-search-dialog th').length"), 6);
  const gridRect = await evaluate(rect('.pos-search-dialog-results'));
  const searchRect = await evaluate(rect('#pos-modal-product-search'));
  assert(gridRect.bottom <= searchRect.y, 'Search input belongs below the medicine grid');
  await evaluate(
    "var input = document.querySelector('#pos-modal-product-search'); input.value = 'Medicine 1'; input.dispatchEvent(new Event('input', { bubbles: true }))",
  );
  await evaluate(
    "document.querySelector('#pos-search-matching-words').click(); document.querySelector('#pos-search-generic').click()",
  );
  await until("fixture.calls.some(c => c.query?.includes('generic_name LIKE'))");
  await evaluate(
    "document.querySelector('#pos-search-matching-words').click(); document.querySelector('#pos-search-generic').click()",
  );
  await evaluate(
    "var input = document.querySelector('#pos-modal-product-search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }))",
  );
  await until("!!document.querySelector('.pos-product-row')");
  assert(
    await evaluate(`(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-primary-600)';
    document.querySelector('.pos-search-dialog').append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return ['.pos-product-row.highlighted', '.pos-search-dialog-query'].every(selector =>
      getComputedStyle(document.querySelector(selector)).backgroundColor === expected);
  })()`),
    'Search uses universal theme colors',
  );
  await shot('search-reference-1024x600');
  await escape();
  await until("!document.querySelector('.pos-search-dialog')");
  results.push(
    'Reference search grid has six columns, a focused bottom search input, working search options, and Escape dismissal',
  );
  await chooseProduct();
  assert.equal(await evaluate('testCart.items.length'), 0, 'Selection only fills the entry row');
  assert(
    await evaluate(
      "document.querySelector('#pos-product-search').value.includes('Medicine') && document.querySelector('#pos-item-code').value!==''",
    ),
  );
  assert(await evaluate("document.querySelector('#pos-entry-price').readOnly"));
  assert(
    await evaluate(`(()=>{
    const pack=document.querySelector('#pos-entry-pack-size'),stock=document.querySelector('#pos-entry-stock'),arrow=document.querySelector('.pos-entry-add');
    return !document.querySelector('#pos-entry-mode') && pack.readOnly && stock.readOnly && pack.value==='10' && Number(stock.value.replaceAll(',',''))===4000 && (arrow.compareDocumentPosition(pack)&Node.DOCUMENT_POSITION_FOLLOWING) && (pack.compareDocumentPosition(stock)&Node.DOCUMENT_POSITION_FOLLOWING);
  })()`),
  );
  await fields(3, 2, 10);
  await post();
  await until('testCart.items.length===1');
  assert(
    await evaluate(
      'testCart.items[0].quantity===3 && testCart.items[0].bonusQuantity===2 && testCart.items[0].discount===10 && testCart.subtotal===270',
    ),
  );
  await until("document.activeElement?.id==='pos-item-code'");
  assert(
    await evaluate(
      "document.querySelector('#pos-entry-quantity').disabled && document.querySelector('#pos-entry-quantity').value==='1' && document.querySelector('#pos-entry-bonus').value==='0'",
    ),
  );
  results.push(
    'Mini ITEM Enter opens search; selecting a product stages it; quantity Enter posts quantity/bonus/discount once and resets entry',
  );
  await evaluate(`(() => {
    const percent = document.querySelector('#pos-invoice-discount-percent');
    percent.value = '10';
    percent.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until('testCart.discountAmount === 27');
  await evaluate(`(() => {
    const flat = document.querySelector('#pos-invoice-discount-flat');
    flat.value = '54';
    flat.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until(`document.querySelector('#pos-invoice-discount-percent').value === '20.00'`);
  await evaluate(`(() => {
    const percent = document.querySelector('#pos-invoice-discount-percent');
    percent.value = '101';
    percent.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert(await evaluate('testCart.discountAmount === 54'));
  await evaluate(
    `Array.from(document.querySelectorAll('.pos-detail-actions button')).find(b => b.textContent.includes('Sale detail')).click()`,
  );
  await until(`!!document.querySelector('dialog[open]')`);
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))`,
  );
  assert(await evaluate('testCart.items.length === 1'), 'Detail dialog blocks sale shortcuts');
  await evaluate(`document.querySelector('dialog').close(); testCart.setDiscountAmount(0)`);
  results.push(
    'Percentage and flat invoice discounts stay synchronized; invalid percentages are rejected; sale detail preserves the draft',
  );
  await chooseProduct(false, true);
  assert.equal(await evaluate('testCart.items.length'), 1, 'Click stages without adding');
  await evaluate("document.querySelector('.pos-item-entry button[type=button]').click()");
  await chooseProduct(true);
  await fields(2, 1, 0);
  await evaluate("document.querySelector('.pos-entry-add').click()");
  await until('testCart.items.length===2');
  assert(
    await evaluate(
      'testCart.items[1].isLooseSale && testCart.items[1].quantity===2 && testCart.items[1].bonusQuantity===1',
    ),
  );
  results.push(
    'Single-click selection and down-arrow posting support loose units and free bonus units',
  );
  await chooseProduct();
  await fields(0, 0, 0);
  await post();
  assert.equal(await evaluate('testCart.items.length'), 2);
  await until("!!document.querySelector('.pos-entry-error')");
  await fields(1, 0, 5);
  await post();
  await until('testCart.items.length===3');
  assert(
    await evaluate('testCart.items[0].discount===10 && testCart.items[2].discount===5'),
    'Different discounts do not overwrite an existing line',
  );
  await chooseProduct();
  await evaluate(
    "document.querySelector('#pos-entry-quantity').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true}))",
  );
  assert.equal(await evaluate('testCart.items.length'), 3);
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    ctrlKey: true,
    modifiers: 2,
  });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', modifiers: 2 });
  assert(
    await evaluate(
      "!fixture.calls.some(c=>c.command==='checkout_sale') && document.querySelector('.pos-complete').disabled",
    ),
  );
  await evaluate("document.querySelector('.pos-item-entry button[type=button]').click()");
  assert.equal(await evaluate('testCart.items.length'), 3);
  await chooseProduct(true);
  await fields(12, 2, 0);
  await evaluate('window.confirm=()=>false');
  await post();
  assert(
    await evaluate(
      "testCart.items[1].quantity===2 && !document.querySelector('#pos-entry-quantity').disabled",
    ),
  );
  await evaluate('window.confirm=()=>true');
  await post();
  assert(
    await evaluate(
      'testCart.items[1].quantity===14 && testCart.items[1].bonusQuantity===3 && testCart.items[1].confirmBreak',
    ),
  );
  results.push(
    'Invalid/repeated Enter is blocked, different discounts remain separate, pending entries block checkout, and strip-opening cancellation preserves the entry',
  );
  for (const selector of ['.workspace-body', '.pos-item-entry', '.pos-table-scroll'])
    await fits(selector);
  await shot('staged-sale-1024x600');
  await chooseProduct();
  await escape();
  await until("location.pathname==='/'");
  await evaluate("document.querySelector('.dashboard-tasks button').click()");
  await until("!!document.querySelector('#pos-item-code')");
  await until("document.querySelector('#pos-invoice-number').value==='1'");
  assert(
    await evaluate(
      "testCart.items.length===0 && document.querySelector('#pos-item-code').value==='' && document.querySelector('#pos-entry-quantity').disabled",
    ),
  );
  results.push(
    'Closing/reopening Sales clears both the staged item and table; entry controls and table fit without scrolling',
  );
  await chooseProduct();
  await fields(2, 0, 0);
  await post();
  await until('testCart.items.length===1');
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))",
  );
  await until('testCart.items.length===0');
  assert(
    await evaluate(
      "testCart.items.length===0 && document.querySelector('#pos-item-code').value==='' && document.querySelector('#pos-entry-quantity').disabled",
    ),
  );
  results.push(
    'Ctrl+N in sales modal resets existing sale to start (clears cart, clears pending item, focuses item code)',
  );
  await escape();
  await until("location.pathname==='/'");
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))",
  );
  await until("location.pathname==='/pos' && !!document.querySelector('#pos-item-code')");
  results.push('Ctrl+N outside sales modal navigates to /pos and starts new sale');
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
