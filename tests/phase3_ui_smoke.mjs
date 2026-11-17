// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/phase3');
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
        '&role=' +
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

  if (!process.argv.includes('--forms-only')) {
    await open('/pos');
    await evaluate(
      "var scan=document.querySelector('#pos-product-search');scan.value='123456789';scan.dispatchEvent(new Event('input',{bubbles:true}));scan.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));",
    );
    await until("document.querySelector('#pos-modal-product-search')!==null");
    await evaluate(
      "document.querySelector('#pos-modal-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:false,bubbles:true}))",
    );
    await until(
      "!document.querySelector('.pos-search-dialog') && !!document.querySelector('#pos-entry-quantity') && !document.querySelector('#pos-entry-quantity').disabled",
    );
    await evaluate(
      "document.querySelector('#pos-entry-quantity').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
    );
    await until("document.querySelectorAll('.pos-line-description').length===1");
    assert(
      await evaluate("document.querySelector('.pos-price-mode').textContent.includes('Retail')"),
    );
    inside(await evaluate(rect('.pos-complete')), 'retail checkout');
    results.push('Retail pricing renders with cart and checkout visible');
    await cdp('Page.navigate', {
      url:
        'http://127.0.0.1:1422/tests/ui/phase1.html?view=' +
        encodeURIComponent('/pos?document=d1') +
        '&pricing=wholesale',
    });
    await until('window.fixtureReady===true');
    await until("document.querySelector('.pos-price-mode')?.textContent.includes('Wholesale')");
    assert(
      await evaluate("document.querySelector('.pos-lines tbody').textContent.includes('7.50')"),
    );
    inside(await evaluate(rect('.pos-complete')), 'wholesale checkout');
    await shot('wholesale-pos-1024x600');
    await evaluate("document.querySelector('input[name=pos-customer-mode]').click()");
    await until("document.querySelector('.pos-price-mode')?.textContent.includes('Retail')");
    assert(
      await evaluate("document.querySelector('.pos-lines tbody').textContent.includes('10.00')"),
    );
    results.push(
      'Wholesale customer switches charged cart prices; walk-in restores retail without clearing lines',
    );

    await open('/products');
    await until("document.querySelector('tbody')?.textContent.includes('Test medicine')");
    await evaluate(
      "[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Edit')).click()",
    );
    await until(
      "[...document.querySelectorAll('label')].some(l=>l.textContent.includes('Wholesale unit price'))",
    );
    assert(
      await evaluate(
        "[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Wholesale unit price')).querySelector('input').value==='7.5'",
      ),
    );
    await evaluate(
      "var price=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Wholesale unit price')).querySelector('input');price.value='';price.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Product')).click()",
    );
    await until(
      "fixture.calls.some(c=>c.command==='database_execute'&&c.query.includes('wholesale_price'))",
    );
    assert(
      await evaluate(
        "fixture.calls.find(c=>c.command==='database_execute'&&c.query.includes('wholesale_price')).args.values[7]===null",
      ),
    );
    results.push(
      'Product editor loads wholesale price and saving blank sends SQL NULL for retail fallback',
    );
    await open('/purchase-suggestions');
    await until(
      "document.querySelector('.commercial-table-scroll tbody')?.textContent.includes('Test medicine')",
    );
    inside(await evaluate(rect('.tool-summary')), 'suggestion footer');
    await shot('purchase-suggestions-1024x600');
    await evaluate(
      "document.querySelector('.commercial-table-scroll tbody input[type=checkbox]').click()",
    );
    await until("!document.querySelector('.tool-header button').disabled");
    await evaluate("document.querySelector('.tool-header button').click()");
    await until("document.querySelector('.commercial-dialog')!==null");
    inside(await evaluate(rect('.commercial-dialog')), 'draft review');
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='save_purchase_order')")));
    await evaluate(
      "var s=document.querySelector('.commercial-dialog select');s.value='s1';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.commercial-dialog').requestSubmit()",
    );
    await until(
      "location.pathname==='/purchase-orders/new'&&document.querySelector('textarea')?.value.includes('Reviewed purchase suggestions')",
    );
    assert(
      await evaluate(
        "[...document.querySelectorAll('input[type=number]')].some(e=>e.value==='40')",
      ),
    );
    assert(await evaluate("[...document.querySelectorAll('select')].some(e=>e.value==='s1')"));
    assert(
      !(await evaluate(
        "fixture.calls.some(c=>['save_purchase_order','send_purchase_order','create_purchase_order'].includes(c.command))",
      )),
    );
    await shot('unsaved-purchase-draft-1024x600');
    results.push(
      'Suggestions require reviewed supplier selection and populate an unsaved draft with 40 units; no order command executes',
    );
    await open('/audit-log');
    await until(
      "document.querySelector('.commercial-table-scroll tbody')?.textContent.includes('SHIFT-1')",
    );
    inside(await evaluate(rect('.tool-summary')), 'audit footer');
    assert(
      await evaluate(
        "document.querySelector('.commercial-table-scroll tbody').textContent.includes('Imported history')",
      ),
    );
    await evaluate(
      "var selects=document.querySelectorAll('.commercial-filters select');selects[0].value='shift_open';selects[0].dispatchEvent(new Event('change',{bubbles:true}));selects[1].value='test-user';selects[1].dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.commercial-filters').requestSubmit()",
    );
    await until(
      "fixture.calls.filter(c=>c.command==='read_audit_log').at(-1).args.request.eventType==='shift_open'",
    );
    assert(
      await evaluate(
        "fixture.calls.filter(c=>c.command==='read_audit_log').at(-1).args.request.actorId==='test-user'",
      ),
    );
    await evaluate("[...document.querySelectorAll('.tool-summary button')].at(-1).click()");
    await until(
      "fixture.calls.filter(c=>c.command==='read_audit_log').at(-1).args.request.offset===100",
    );
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='database_execute')")));
    await shot('audit-log-1024x600');
    results.push(
      'Read-only audit renders imported history, passes user/action filters and pages by 100',
    );
    for (const role of ['cashier', 'accountant'])
      for (const route of ['/purchase-suggestions', '/audit-log']) {
        await open(route, role);
        await until("document.querySelector('.home-view')!==null");
        assert(
          !(await evaluate(
            "fixture.calls.some(c=>['read_audit_log','purchase_suggestions'].includes(c.command))",
          )),
        );
      }
    results.push('Cashier and accountant cannot open protected suggestions or audit workspaces');
    // Product component boundaries must preserve draft isolation and save payloads.
    await open('/products');
    await until(
      "document.querySelector('.inventory-table tbody')?.textContent.includes('Test medicine')",
    );
    await evaluate(
      "[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Edit')).click()",
    );
    await until('!!document.querySelector(\'input[placeholder="e.g. Panadol 500mg"]\')');
    await evaluate(
      `var nameInput=document.querySelector('input[placeholder="e.g. Panadol 500mg"]');nameInput.value='Unsaved draft';nameInput.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('.inventory-terminal > .fixed button')].find(b=>b.textContent.includes('Cancel')).click()`,
    );
    await until("!document.querySelector('.inventory-terminal > .fixed')");
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='database_execute')")));
    await evaluate(
      "[...document.querySelectorAll('.inventory-header button')].find(b=>b.textContent.includes('Add Product')).click()",
    );
    await until('!!document.querySelector(\'input[placeholder="e.g. PARA500"]\')');
    assert(
      await evaluate(
        `document.querySelector('input[placeholder="e.g. PARA500"]').value===''&&document.querySelector('input[placeholder="e.g. Panadol 500mg"]').value===''`,
      ),
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Product')).click()",
    );
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='database_execute')")));
    await evaluate(
      `for(var [selector,value] of [['input[placeholder="e.g. PARA500"]','NEW-SKU'],['input[placeholder="e.g. Panadol 500mg"]','New medicine']]){var field=document.querySelector(selector);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}))}var zero=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Wholesale unit price')).querySelector('input');zero.value='0';zero.dispatchEvent(new Event('input',{bubbles:true}))`,
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Product')).click()",
    );
    await until(
      "fixture.calls.some(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO products'))",
    );
    assert(
      await evaluate(
        "var created=fixture.calls.find(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO products')).args.values;created[1]==='NEW-SKU'&&created[2]==='New medicine'&&created[8]===0",
      ),
    );
    await until("!document.querySelector('.inventory-terminal > .fixed')");
    results.push(
      'Product dialog cancels without writes, resets create drafts, rejects required fields and preserves explicit zero wholesale on save',
    );

    await open('/products');
    await until("!!document.querySelector('.inventory-table tbody')");
    await evaluate(
      "var search=document.querySelector('#products-search');search.value='no-matching-product';search.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await until(
      "!document.querySelector('.inventory-table')&&document.querySelector('.inventory-table-scroll [role=status]')?.textContent.includes('No products found')",
    );
    await evaluate(
      "var search=document.querySelector('#products-search');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await until("!!document.querySelector('.inventory-table tbody')");
    await evaluate(
      "window.printCount=0;window.print=()=>{window.printCount++};[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Label')).click()",
    );
    await until('!!document.querySelector(\'[aria-label="Print barcode labels"]\')');
    await evaluate(
      `var count=document.querySelector('[aria-label="Print barcode labels"] input');count.value='0';count.dispatchEvent(new Event('input',{bubbles:true}))`,
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Print labels').click()",
    );
    assert.equal(await evaluate('window.printCount'), 0);
    await evaluate(
      `var count=document.querySelector('[aria-label="Print barcode labels"] input');count.value='2';count.dispatchEvent(new Event('input',{bubbles:true}))`,
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Print labels').click()",
    );
    await until(
      "document.querySelectorAll('body > .barcode-print-root .barcode-print-label').length===2&&window.printCount===1",
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Print labels').click()",
    );
    assert.equal(await evaluate('window.printCount'), 1);
    assert(await evaluate("document.body.classList.contains('printing-labels')"));
    await shot('extracted-barcode-label-preview');
    await evaluate("window.dispatchEvent(new Event('afterprint'))");
    await until(
      "!document.querySelector('.barcode-print-root')&&!document.body.classList.contains('printing-labels')",
    );
    await evaluate(`document.querySelector('[aria-label="Print barcode labels"] button').click()`);
    await until('!document.querySelector(\'[aria-label="Print barcode labels"]\')');
    await evaluate(
      "[...document.querySelectorAll('tbody button')].find(b=>b.textContent.includes('Label')).click()",
    );
    await until('!!document.querySelector(\'[aria-label="Print barcode labels"] input\')');
    assert.equal(
      await evaluate(`document.querySelector('[aria-label="Print barcode labels"] input').value`),
      '1',
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Print labels').click()",
    );
    await until("document.body.classList.contains('printing-labels')");
    await evaluate(`document.querySelector('[aria-label="Print barcode labels"] button').click()`);
    await until(
      "!document.querySelector('.barcode-print-root')&&!document.body.classList.contains('printing-labels')",
    );
    assert(
      await evaluate(
        "![...document.head.querySelectorAll('style')].some(s=>s.textContent==='@page { size: 75mm 35mm; margin: 0; }')",
      ),
    );
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='database_execute')")));
    results.push(
      'Product table search/events and barcode preview preserve count validation, copies, afterprint/unmount cleanup and reopen defaults; print dialog stubbed',
    );

    await open('/purchase-orders/new');
    await until("!!document.querySelector('.po-form-view .form-container')");
    assert.equal(await evaluate("document.querySelectorAll('.line-item').length"), 1);
    await evaluate("document.querySelectorAll('.form-actions button')[1].click()");
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='save_purchase_order')")));
    await evaluate(
      "var supplier=document.querySelector('.form-select');supplier.value='s1';supplier.dispatchEvent(new Event('change',{bubbles:true}));var product=document.querySelector('input[placeholder=\"Search product...\"]');product.click();product.value='Test';product.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await until("!!document.querySelector('.product-option')");
    await evaluate("document.querySelector('.product-option').click()");
    await evaluate(
      "var inputs=document.querySelectorAll('.line-item input[type=number]');[2,5,10,20].forEach((value,index)=>{inputs[index].value=String(value);inputs[index].dispatchEvent(new Event('input',{bubbles:true}))})",
    );
    await until("document.querySelector('.line-total').textContent.includes('8.80')");
    await evaluate(
      "var discount=document.querySelector('#order-discount');discount.value='1';discount.dispatchEvent(new Event('input',{bubbles:true}));var shipping=document.querySelector('#shipping-cost');shipping.value='2';shipping.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await until("document.querySelector('.total-row .totals-value').textContent.includes('9.80')");
    await evaluate("document.querySelector('.section-header button').click()");
    await until("document.querySelectorAll('.line-item').length===2");
    await evaluate("document.querySelectorAll('.remove-button')[1].click()");
    await until("document.querySelectorAll('.line-item').length===1");
    assert(await evaluate("document.querySelector('.remove-button').disabled"));
    await evaluate(
      "var discount=document.querySelector('#order-discount');discount.value='100';discount.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await evaluate("document.querySelectorAll('.form-actions button')[2].click()");
    assert(!(await evaluate("fixture.calls.some(c=>c.command==='save_purchase_order')")));
    await evaluate(
      "var discount=document.querySelector('#order-discount');discount.value='1';discount.dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await shot('extracted-purchase-order-form-1024x600');
    await evaluate("document.querySelectorAll('.form-actions button')[1].click()");
    await until(
      "fixture.calls.some(c=>c.command==='save_purchase_order')&&location.pathname==='/purchase-orders'",
    );
    assert(
      await evaluate(
        "var request=fixture.calls.find(c=>c.command==='save_purchase_order').args.request;request.poId===null&&request.status==='draft'&&request.supplierId==='s1'&&request.discountAmount===1&&request.shippingCost===2&&request.items.length===1&&request.items[0].productId==='p1'&&request.items[0].quantityOrdered===2&&request.items[0].unitCost===5&&request.items[0].taxRate===10&&request.items[0].discountPercent===20",
      ),
    );
    results.push(
      'Purchase components retain required-field/discount guards, selection, add/remove, recalculated totals and exact reviewed draft request',
    );

    await open('/purchase-orders/po-existing');
    await until("!!document.querySelector('.po-form-view .form-container')");
    assert(
      await evaluate(
        "document.querySelector('.view-title').textContent.includes('Edit')&&document.querySelector('.form-select').value==='s1'&&document.querySelector('textarea').value==='Saved synthetic order'&&document.querySelector('.total-row .totals-value').textContent.includes('17.50')",
      ),
    );
    await evaluate("document.querySelectorAll('.form-actions button')[2].click()");
    await until(
      "fixture.calls.some(c=>c.command==='save_purchase_order')&&location.pathname==='/purchase-orders'",
    );
    assert(
      await evaluate(
        "var request=fixture.calls.find(c=>c.command==='save_purchase_order').args.request;request.poId==='po-existing'&&request.status==='sent'&&request.items[0].quantityOrdered===3&&request.items[0].unitCost===5&&request.items[0].taxRate===10&&request.items[0].discountPercent===0",
      ),
    );
    results.push(
      'Existing purchase order hydrates header/lines/totals and sends the same order ID and saved pricing through the native command',
    );
  }
  async function fill(selector, value) {
    await evaluate(
      `(()=>{const field=document.querySelector(${JSON.stringify(selector)});if(!field)throw Error('Missing input');field.value=${JSON.stringify(String(value))};field.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
  }
  await open('/suppliers');
  await until("!!document.querySelector('.suppliers-view .view-header button')");
  await evaluate("document.querySelector('.suppliers-view .view-header button').click()");
  await until("!!document.querySelector('.modal-form')");
  await fill('input[placeholder="SUP001"]', 'SUP-REFACTOR');
  await fill('input[placeholder^="Enter supplier name"]', 'Refactor supplier');
  await fill('input[placeholder="30"]', 45);
  await evaluate("document.querySelector('.modal-form').requestSubmit()");
  await until(
    "fixture.calls.some(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO suppliers'))",
  );
  assert(
    await evaluate(
      "var values=fixture.calls.find(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO suppliers')).args.values;values[1]==='SUP-REFACTOR'&&values[2]==='Refactor supplier'&&values[10]===45",
    ),
  );
  await until("!document.querySelector('.modal-form')");
  results.push(
    'Extracted supplier form propagates code, name and payment terms into the existing save workflow and closes after success',
  );

  await open('/users');
  await until("!!document.querySelector('.tool-header button')");
  await evaluate("document.querySelector('.tool-header button').click()");
  await until('!!document.querySelector(\'input[placeholder="e.g. john.doe"]\')');
  await fill('input[placeholder="e.g. john.doe"]', 'synthetic.refactor');
  await fill('input[placeholder="Enter password"]', 'Synthetic refactor 2026!');
  await fill('input[placeholder="e.g. John Doe"]', 'Synthetic Refactor User');
  await evaluate(
    "var role=document.querySelector('.fixed select');role.value='accountant';role.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save User').click()",
  );
  await until(
    "fixture.calls.some(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO users'))",
  );
  assert(
    await evaluate(
      "var values=fixture.calls.find(c=>c.command==='database_execute'&&c.query.includes('INSERT INTO users')).args.values;values[1]==='synthetic.refactor'&&values[2].startsWith('$2')&&values[3]==='Synthetic Refactor User'&&values[4]==='accountant'",
    ),
  );
  await until('!document.querySelector(\'input[placeholder="e.g. john.doe"]\')');
  results.push(
    'Extracted user form retains typed role/name changes and hashes the synthetic password before the existing save command',
  );

  await open('/settings');
  await until(
    "[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Company Info'))",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Company Info')).click()",
  );
  await until('!!document.querySelector(\'input[placeholder="e.g. City Pharmacy"]\')');
  await fill('input[placeholder="e.g. City Pharmacy"]', 'Refactor Pharmacy');
  await fill('textarea[placeholder="Street address, city, postal code"]', 'Synthetic test address');
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Save Settings')).click()",
  );
  await until(
    "fixture.calls.some(c=>c.command==='database_execute'&&c.query.includes('UPDATE app_settings'))",
  );
  assert(
    await evaluate(
      "var values=fixture.calls.find(c=>c.command==='database_execute'&&c.query.includes('UPDATE app_settings')).args.values;values[0]==='Refactor Pharmacy'&&values[1]==='Synthetic test address'",
    ),
  );
  results.push(
    'Extracted company-settings tab shares its draft with the settings save action and preserves the submitted company/address values',
  );

  const resultFile = process.argv.includes('--forms-only') ? 'forms-results.json' : 'results.json';
  await writeFile(path.join(out, resultFile), JSON.stringify(results, null, 2));
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
