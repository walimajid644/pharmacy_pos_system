// Runs the real Vue application inside an isolated Tauri/WebView2 test build.
// Authentication setup uses native APIs with a synthetic account, never user credentials.
// This is automated integration evidence, not clean-Windows/hardware/manual acceptance.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { verifyNativeSecurity } from './native_security.mjs';

const out = path.resolve('test-results/native-acceptance');
await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile('tests/tauri-native.conf.json', 'utf8'));
assert(config.identifier.startsWith('com.pharmacypos.codex.acceptance'));
assert.notEqual(config.identifier, 'com.pharmacypos.app');
const exe = path.resolve('src-tauri/target/debug/pharmacy-pos.exe');
const hash = createHash('sha256')
  .update(await readFile(exe))
  .digest('hex');
const allocator = net.createServer();
const configuredPort = Number(
  config.app.windows[0].additionalBrowserArgs.match(/--remote-debugging-port=(\d+)/)[1],
);
await new Promise((r, j) => {
  allocator.once('error', j);
  allocator.listen(configuredPort, '127.0.0.1', r);
});
const port = allocator.address().port;
await new Promise((r) => allocator.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
  },
});
let processError;
child.on('error', (e) => {
  processError = e;
});
const logs = [];
child.stderr.on('data', (d) => logs.push(String(d)));
let socket, cdp, evaluate;
const results = [],
  consoleErrors = [];
const persistenceOnly = process.argv.includes('--verify-persistence');
const securityOnly = process.argv.includes('--verify-security');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const password = 'Synthetic acceptance 2026 only!';
const run = randomUUID().slice(0, 8);
const stamp = new Date().toISOString();
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
async function until(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(out, `${run}-${name}.png`), Buffer.from(r.data, 'base64'));
}
const invoke = (command, args = {}) =>
  evaluate(`nativeAcceptance.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
const query = (query, values = []) => invoke('database_select', { query, values });
const execute = (query, values = []) => invoke('database_execute', { query, values });
const request = (command, request) => invoke(command, { request });
async function route(to) {
  await evaluate(`nativeAcceptance.router.push(${JSON.stringify(to)})`);
  await delay(250);
  assert.equal(await evaluate('location.pathname'), typeof to === 'string' ? to : to.path);
}
async function input(selector, value, event = 'input') {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input: '+${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))})()`,
  );
}
async function scan(barcode, loose = false) {
  await input('#pos-product-search', barcode);
  await evaluate(
    `document.querySelector('#pos-product-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:${loose},bubbles:true}))`,
  );
  await delay(500);
}
async function denied(promise, pattern) {
  await assert.rejects(promise, pattern);
}
try {
  let target;
  for (let i = 0; i < 900; i++) {
    if (processError) throw processError;
    if (child.exitCode !== null)
      throw Error(`Test app exited: ${child.exitCode}: ${logs.join('')}`);
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
      ).json();
      target = targets.find(
        (t) => ['page', 'webview'].includes(t.type) && t.url.startsWith('http://tauri.localhost'),
      );
      if (target) break;
    } catch {}
    await delay(100);
  }
  assert(target, 'Isolated WebView2 debug target did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.addEventListener('open', r, { once: true });
    socket.addEventListener('error', j, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  let acceptDialog = true;
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p?.reject(Error(JSON.stringify(m.error))) : p?.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown')
      consoleErrors.push(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
      );
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening')
      void cdp('Page.handleJavaScriptDialog', { accept: acceptDialog });
  });
  cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`CDP timed out: ${method}`));
      }, 45000);
      pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description ||
          r.exceptionDetails.exception?.value ||
          r.exceptionDetails.text,
      );
    return r.result.value;
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await until('!!window.nativeAcceptance');
  assert.equal(
    await evaluate('nativeAcceptance.isolationId'),
    config.identifier,
    'Refusing a production or unrelated app',
  );
  await shot('login');
  let initial = await invoke('login_user', { username: 'admin', password });
  if (!initial) {
    initial = await invoke('login_user', { username: 'admin', password: 'admin123' });
    assert(initial?.must_change_password, 'Only a disposable synthetic admin is supported');
    await denied(query('SELECT * FROM products'), /password/i);
    await invoke('change_password', { currentPassword: 'admin123', newPassword: password });
    results.push(
      'Fresh native first-password gate blocks database access; synthetic password changed through API',
    );
  }
  assert(await evaluate(`nativeAcceptance.auth.login('admin',${JSON.stringify(password)})`));
  await evaluate("nativeAcceptance.i18n.setLanguage('en')");
  await route('/');
  const status = await invoke('backup_status');
  assert(status.path.includes(config.identifier), `Refusing non-test data path: ${status.path}`);
  if (securityOnly) {
    await verifyNativeSecurity({
      evaluate,
      invoke,
      query,
      out,
      identifier: config.identifier,
      hash,
    });
  } else if (persistenceOnly) {
    const prior = JSON.parse(await readFile(path.join(out, 'latest.json'), 'utf8'));
    assert.equal(prior.status, 'passed');
    assert.equal(prior.identifier, config.identifier);
    assert.equal(prior.sha256, hash, 'Persistence check requires the same test binary');
    assert.equal(
      (await query('SELECT COUNT(*) AS count FROM sales_invoices'))[0].count,
      prior.expected.invoiceCount,
    );
    assert.equal(
      (
        await query('SELECT quantity_in_stock FROM product_batches WHERE id=?', [
          prior.expected.batchId,
        ])
      )[0].quantity_in_stock,
      7,
    );
    assert.equal(
      (await invoke('customer_statement', { customerId: prior.expected.customerId })).customer
        .current_balance,
      0,
    );
    assert.equal(
      (
        await query(
          "SELECT COUNT(*) AS count FROM schema_migrations WHERE version='013_catalog_and_controlled'",
        )
      )[0].count,
      1,
    );
    assert.equal(await invoke('current_shift'), null);
    let checks = [];
    try {
      checks = JSON.parse(await readFile(path.join(out, 'persistence.json'), 'utf8')).checks;
    } catch {}
    checks.push({
      date: stamp,
      sha256: hash,
      status: 'passed',
      invoiceCount: prior.expected.invoiceCount,
    });
    await writeFile(
      path.join(out, 'persistence.json'),
      JSON.stringify({ identifier: config.identifier, checks }, null, 2),
    );
    console.log(
      'Native process restart: invoices, stock7, settled credit, closed drawers and single migration marker preserved',
    );
  } else {
    const baseline = await query('SELECT COUNT(*) AS count FROM sales_invoices');
    await execute('UPDATE app_settings SET tax_rate=0, show_drap=1');
    const actor = await evaluate('nativeAcceptance.auth.currentUser.id');
    results.push(
      'Real native bridge/session active; separate test identifier and backup path verified',
    );

    // Actual file picker change, preview, confirmation and commit UI against Rust.
    const csv =
      'sku,name,generic_name,barcode,unit_price,cost_price,wholesale_price,pack_size,sell_by_loose_unit,reorder_level,controlled_substance,drap_registration_number,batch_number,expiry_date,quantity_in_stock,received_date\n' +
      `COUNTER-${run},Synthetic counter ${run},Synthetic generic,9900${run},10,5,8,10,yes,10,no,,,,,\n` +
      `RX-${run},Synthetic controlled ${run},Synthetic Rx generic,9911${run},10,5,,1,yes,5,yes,TEST-DRAP,RX-B-${run},2099-12-31,30,${day}\n` +
      `HOLD-${run},Synthetic expiry ${run},Synthetic expiry generic,9922${run},10,5,,1,yes,5,no,,HOLD-B-${run},${day},10,${day}\n`;
    await route('/catalog-import');
    await until("!!document.querySelector('.catalog-file')");
    await evaluate(
      `(()=>{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(csv)}],'synthetic-native.csv',{type:'text/csv'}));const e=document.querySelector('.catalog-file');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await until("!document.querySelector('.catalog-validate').disabled");
    await evaluate("document.querySelector('.catalog-validate').click()");
    await until("!!document.querySelector('.catalog-review')");
    assert.equal(
      (await query('SELECT COUNT(*) AS count FROM products WHERE sku=?', [`COUNTER-${run}`]))[0]
        .count,
      0,
    );
    assert.equal(
      await evaluate("document.querySelector('.catalog-review').disabled"),
      false,
      await evaluate("document.querySelector('.workspace-body').innerText"),
    );
    await shot('catalog-preview');
    await evaluate("document.querySelector('.catalog-review').click()");
    await until("!!document.querySelector('.commercial-dialog input[type=checkbox]')");
    await evaluate("document.querySelector('.commercial-dialog input[type=checkbox]').click()");
    await delay(50);
    await evaluate("document.querySelector('.commercial-dialog').requestSubmit()");
    await until(
      "document.querySelector('.workspace-body [role=status]')?.textContent.includes('Import saved')",
    );
    const products = await query('SELECT * FROM products WHERE sku IN (?,?,?)', [
      `COUNTER-${run}`,
      `RX-${run}`,
      `HOLD-${run}`,
    ]);
    assert.equal(products.length, 3);
    const p = products.find((p) => p.sku === `COUNTER-${run}`),
      rx = products.find((p) => p.sku === `RX-${run}`),
      held = products.find((p) => p.sku === `HOLD-${run}`);
    results.push(
      'Real CSV UI preview writes nothing; explicit reviewed commit creates three products and two opening batches atomically',
    );

    await route('/shifts');
    const existing = await invoke('current_shift');
    if (existing) {
      const [used] = await query(
        'SELECT (SELECT COUNT(*) FROM sales_invoices WHERE shift_id=?)+(SELECT COUNT(*) FROM account_entries WHERE shift_id=?)+(SELECT COUNT(*) FROM supplier_payments WHERE shift_id=?)+(SELECT COUNT(*) FROM sales_returns WHERE refund_shift_id=?) AS count',
        [existing.id, existing.id, existing.id, existing.id],
      );
      assert.equal(
        used.count,
        0,
        'Previous synthetic drawer has transactions; review its cash count before rerun',
      );
      assert.equal(existing.cashierId, actor);
      await request('close_shift', {
        shiftId: existing.id,
        countedCashCents: existing.openingCashCents,
        notes: 'Cleanup of unused synthetic test drawer',
      });
      await route('/');
      await route('/shifts');
    }
    await until("!!document.querySelector('.workspace-body form input')");
    await input('.workspace-body form input', '100');
    await evaluate("document.querySelector('.workspace-body form').requestSubmit()");
    await until(
      "document.querySelector('.workspace-body')?.textContent.includes('Blind cash count')",
    );
    const shift = await invoke('current_shift');
    assert.equal(shift.expectedCashCents, null);
    const supplier = randomUUID();
    await execute(
      'INSERT INTO suppliers (id,supplier_code,name,payment_terms,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      [supplier, `NATIVE-${run}`, 'Synthetic native supplier', 30, stamp, stamp],
    );
    const po = await request('save_purchase_order', {
      poId: null,
      supplierId: supplier,
      orderDate: day,
      expectedDeliveryDate: null,
      notes: 'Synthetic native acceptance',
      discountAmount: 0,
      shippingCost: 0,
      status: 'sent',
      userId: actor,
      timestamp: stamp,
      items: [
        { productId: p.id, quantityOrdered: 20, unitCost: 5, taxRate: 0, discountPercent: 0 },
      ],
    });
    const [poLine] = await query('SELECT id FROM purchase_order_items WHERE po_id=?', [po.id]);
    await request('receive_purchase_order', {
      poId: po.id,
      userId: actor,
      timestamp: stamp,
      items: [
        { poItemId: poLine.id, quantity: 20, batchNumber: `B-${run}`, expiryDate: '2099-12-31' },
      ],
    });
    const [batch] = await query('SELECT * FROM product_batches WHERE product_id=?', [p.id]);
    assert.equal(batch.quantity_in_stock, 20);
    results.push(
      'Native shift opened through UI with blind total; real purchase receipt adds 20 base units',
    );

    await route('/pos');
    await until("document.querySelector('.pos-shift-badge')?.textContent.includes('Shift open')");
    await scan(p.barcode);
    await until('nativeAcceptance.cart.items.length===1');
    acceptDialog = false;
    await scan(p.barcode, true);
    assert.equal(await evaluate('nativeAcceptance.cart.items.length'), 1);
    assert.equal(
      (await query('SELECT quantity_in_stock FROM product_batches WHERE id=?', [batch.id]))[0]
        .quantity_in_stock,
      20,
    );
    acceptDialog = true;
    await scan(p.barcode, true);
    await until('nativeAcceptance.cart.items.length===2');
    await input('.pos-lines tbody tr:nth-child(2) input[aria-label="Quantity"]', '2', 'change');
    await input('.pos-cash-tender input', '150');
    await until("!document.querySelector('.pos-complete').disabled");
    await shot('counter-before-checkout');
    await evaluate("document.querySelector('.pos-complete').click()");
    await until('nativeAcceptance.cart.items.length===0');
    assert.equal(await evaluate('document.activeElement?.id'), 'pos-product-search');
    const [invoice] = await query(
      'SELECT * FROM sales_invoices WHERE id IN (SELECT invoice_id FROM sales_invoice_items WHERE product_id=?)',
      [p.id],
    );
    assert.equal(invoice.net_amount, 120);
    assert.equal(invoice.change_amount, 30);
    assert.equal(
      (await query('SELECT quantity_in_stock FROM product_batches WHERE id=?', [batch.id]))[0]
        .quantity_in_stock,
      8,
    );
    const saved = await invoke('saved_sale', { invoiceId: invoice.id });
    assert.equal(
      saved.items.reduce((n, l) => n + l.quantity, 0),
      12,
    );
    results.push(
      'Actual POS barcode/keyboard path: declined strip has no effect; pack + two loose cash sale saves Rs120/change30 and stock8',
    );

    const supplierPayment = await request('record_supplier_payment', {
      poId: po.id,
      amountCents: 4000,
      method: 'cash',
      reference: 'NATIVE',
      notes: null,
    });
    assert.equal(supplierPayment.balanceCents, 6000);
    await denied(
      request('record_supplier_payment', {
        poId: po.id,
        amountCents: 6001,
        method: 'cash',
        reference: null,
        notes: null,
      }),
      /60\.01.*60\.00|60\.00.*60\.01/s,
    );
    const expense = randomUUID();
    await request('record_account_entry', {
      requestId: expense,
      kind: 'expense',
      customerId: null,
      category: 'Other',
      description: 'Synthetic native expense',
      amountCents: 1000,
      method: 'cash',
      reference: 'NATIVE',
      entryDate: day,
    });
    const loose = saved.items.find((l) => l.is_loose_sale);
    const returned = await request('submit_sales_return', {
      userId: actor,
      timestamp: stamp,
      invoiceId: invoice.id,
      reason: 'other',
      notes: 'Synthetic native return',
      refundMethod: 'cash',
      items: [{ invoiceItemId: loose.id, quantity: 1, restock: true }],
    });
    for (const action of ['approved', 'refunded'])
      await request('decide_sales_return', { recordId: returned, timestamp: stamp, action });
    const adjustment = await request('submit_stock_adjustment', {
      userId: actor,
      timestamp: stamp,
      adjustmentType: 'decrease',
      reason: 'damaged',
      notes: 'Synthetic native adjustment',
      items: [{ batchId: batch.id, quantity: 1 }],
    });
    await request('decide_stock_adjustment', {
      recordId: adjustment,
      timestamp: stamp,
      action: 'approved',
    });
    assert.equal(
      (await query('SELECT quantity_in_stock FROM product_batches WHERE id=?', [batch.id]))[0]
        .quantity_in_stock,
      8,
    );
    results.push(
      'Real supplier payment, overpayment rejection, cash expense, approved refund/restock and adjustment reconcile stock8',
    );

    await route('/shifts');
    await until(
      "document.querySelector('.workspace-body')?.textContent.includes('Blind cash count')",
    );
    await input('.workspace-body form input', '160');
    await evaluate("document.querySelector('.workspace-body form').requestSubmit()");
    await until(
      "document.querySelector('.workspace-body [role=status]')?.textContent.includes('Shift closed')",
    );
    const [closed] = await query(
      'SELECT expected_cash_cents,variance_cents FROM cashier_shifts WHERE id=?',
      [shift.id],
    );
    assert.equal(closed.expected_cash_cents, 16000);
    assert.equal(closed.variance_cents, 0);
    await denied(
      invoke('void_account_entry', { id: expense, reason: 'Synthetic post-close void' }),
      /closed/i,
    );
    results.push(
      'Actual blind-close UI records expected Rs160/zero variance; post-close expense void rejected',
    );

    // Separate drawer for credit/controlled paths; no hidden auto-reconciliation.
    const nextShift = await request('open_shift', { openingCashCents: 0 });
    const customer = await request('save_customer', {
      id: null,
      firstName: 'Synthetic',
      lastName: `Credit ${run}`,
      phoneNumber: null,
      address: null,
      customerType: 'wholesale',
      creditLimit: 100,
      isActive: true,
    });
    const sale = {
      cashierId: actor,
      customerId: customer,
      paymentMethod: 'credit',
      receivedAmount: 0,
      orderDiscount: 0,
      expectedSubtotal: 8,
      expectedTaxAmount: 0,
      expectedNetAmount: 8,
      timestamp: stamp,
      items: [
        {
          productId: p.id,
          batchId: batch.id,
          quantity: 1,
          isLooseSale: true,
          discountPercent: 0,
          confirmBreak: true,
        },
      ],
    };
    await request('checkout_sale', sale);
    assert.equal(
      (await invoke('customer_statement', { customerId: customer })).customer.current_balance,
      8,
    );
    await denied(
      request('checkout_sale', {
        ...sale,
        customerId: null,
        expectedSubtotal: 10,
        expectedNetAmount: 10,
      }),
      /registered|walk-in/i,
    );
    const receipt = randomUUID();
    const collection = {
      requestId: receipt,
      kind: 'receipt',
      customerId: customer,
      category: 'Customer payment',
      description: 'Synthetic collection',
      amountCents: 800,
      method: 'bank',
      reference: 'NATIVE',
      entryDate: day,
    };
    await request('record_account_entry', collection);
    await request('record_account_entry', collection);
    assert.equal(
      (await invoke('customer_statement', { customerId: customer })).customer.current_balance,
      0,
    );
    results.push(
      'Real wholesale credit sale charges saved Rs8; walk-in credit rejected; collection retry does not collect twice',
    );

    await route('/pos');
    await scan(rx.barcode);
    await until('nativeAcceptance.cart.items.length===1');
    assert.equal(await evaluate("document.querySelector('.pos-complete').disabled"), true);
    await input('.pos-prescription-note', 'Synthetic Rx REF-native-only');
    await evaluate("document.querySelectorAll('.pos-payment-actions button')[1].click()");
    await until("!document.querySelector('.pos-complete').disabled");
    await evaluate("document.querySelector('.pos-complete').click()");
    await until('nativeAcceptance.cart.items.length===0');
    const [rxInvoice] = await query(
      'SELECT invoice_id FROM sales_invoice_items WHERE product_id=?',
      [rx.id],
    );
    await execute(
      'UPDATE products SET controlled_substance=0,drap_registration_number=?,name=? WHERE id=?',
      ['CHANGED', 'Changed catalog name', rx.id],
    );
    const rxSaved = await invoke('saved_sale', { invoiceId: rxInvoice.invoice_id });
    assert.equal(rxSaved.items[0].drap_registration_number, 'TEST-DRAP');
    assert.equal(rxSaved.items[0].controlled_substance, 1);
    const range = {
      start: `${day}T00:00:00+05:00`,
      end: new Date(new Date(`${day}T00:00:00+05:00`).getTime() + 86400000).toISOString(),
      offset: 0,
    };
    const controlled = await request('controlled_sales_report', range);
    assert(
      controlled.rows.some(
        (r) => r.prescription_note === 'Synthetic Rx REF-native-only' && r.drap === 'TEST-DRAP',
      ),
    );
    results.push(
      'Controlled POS blocks missing evidence; saved/report DRAP and classification survive later catalog edits',
    );

    const [heldBatch] = await query('SELECT id FROM product_batches WHERE product_id=?', [held.id]);
    await request('hold_batch', {
      requestId: randomUUID(),
      batchId: heldBatch.id,
      quantity: 10,
      reason: 'Synthetic acceptance hold',
    });
    assert.equal(
      (await query('SELECT quantity_in_stock FROM product_batches WHERE id=?', [heldBatch.id]))[0]
        .quantity_in_stock,
      0,
    );
    await denied(
      request('checkout_sale', {
        ...sale,
        customerId: null,
        paymentMethod: 'card',
        receivedAmount: 10,
        expectedSubtotal: 10,
        expectedNetAmount: 10,
        items: [
          {
            productId: held.id,
            batchId: heldBatch.id,
            quantity: 1,
            isLooseSale: true,
            discountPercent: 0,
          },
        ],
      }),
      /stock|available|quarantin/i,
    );
    await request('close_shift', {
      shiftId: nextShift,
      countedCashCents: 0,
      notes: 'Synthetic credit/card drawer',
    });
    results.push(
      'Quarantined units cannot be sold through actual native bridge; credit/card drawer closes at zero cash',
    );

    // Real queries, locales, themes and minimum viewport rather than mocked rows.
    const screens = [
      '/',
      '/products',
      '/customers',
      '/suppliers',
      '/supplier-ledger',
      '/purchase-orders',
      '/stock-adjustments',
      '/sales-returns',
      '/sales-history',
      '/daily-closing',
      '/reports',
      '/shifts',
      '/backups',
      '/settings',
      '/users',
      '/item-search',
      '/payments',
      '/expenses',
      '/estimates',
      '/preorders',
      '/customer-ledger',
      '/expiry-actions',
      '/cashier-performance',
      '/purchase-suggestions',
      '/audit-log',
      '/catalog-import',
      '/catalog-bulk',
      '/controlled-sales',
      '/fbr-sandbox',
      '/pos',
    ];
    let layouts = 0;
    for (const [language, theme, width, height] of [
      ['en', 'light', 1024, 600],
      ['ur', 'dark', 1024, 600],
      ['mixed', 'light', 1280, 800],
    ]) {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        `nativeAcceptance.i18n.setLanguage(${JSON.stringify(language)});nativeAcceptance.theme.setTheme(${JSON.stringify(theme)})`,
      );
      for (const screen of screens) {
        await route(screen);
        const geometry = await evaluate(
          `(()=>{const e=document.querySelector('.workspace-dialog')||document.querySelector('.desktop-workspace')||document.querySelector('main');const r=e?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,body:document.body.innerText.length,dialog:r&&{x:r.x,y:r.y,right:r.right,bottom:r.bottom}}})()`,
        );
        assert(geometry.body > 30, `Blank screen ${screen}`);
        assert(
          geometry.scroll <= width + 1,
          `Page horizontal overflow ${screen}/${language}: ${JSON.stringify(geometry)}`,
        );
        if (screen === '/pos') {
          const control = await evaluate(
            "(()=>{const r=document.querySelector('.pos-complete').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()",
          );
          assert(
            control.x >= 0 &&
              control.y >= 0 &&
              control.right <= width + 1 &&
              control.bottom <= height + 1,
            `Checkout clipped ${language}: ${JSON.stringify(control)}`,
          );
          await shot(`pos-${language}-${theme}-${width}`);
        }
        if (['/', '/reports', '/controlled-sales', '/expiry-actions', '/products'].includes(screen))
          await shot(`${screen.replaceAll('/', '') || 'home'}-${language}-${theme}-${width}`);
        layouts++;
      }
    }
    results.push(
      `${layouts} real native-backed route/locale/theme/viewport checks; checkout and page bounds checked`,
    );

    // Role checks use a synthetic cashier created by the authenticated admin gateway.
    const cashier = randomUUID(),
      cashierName = `native-${run}`;
    await execute(
      'INSERT INTO users (id,username,password_hash,full_name,role,is_active,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)',
      [
        cashier,
        cashierName,
        await bcrypt.hash(password, 12),
        'Synthetic cashier',
        'cashier',
        stamp,
        stamp,
      ],
    );
    await evaluate('nativeAcceptance.auth.logout()');
    assert(
      await evaluate(
        `nativeAcceptance.auth.login(${JSON.stringify(cashierName)},${JSON.stringify(password)})`,
      ),
    );
    await denied(
      query('SELECT * FROM sales_invoices'),
      /permitted|prescription|restricted|permission/i,
    );
    await denied(invoke('saved_sale', { invoiceId: invoice.id }), /own/i);
    await denied(request('controlled_sales_report', range), /permitted/i);
    await denied(
      request('import_catalog', { requestId: randomUUID(), createLookups: false, rows: [] }),
      /permitted/i,
    );
    await route('/');
    await query('SELECT COUNT(*) AS count FROM sales_dashboard');
    results.push(
      'Real cashier cannot access prescription tables, another cashier sale, controlled report or catalog import; summary remains available',
    );
    await evaluate('nativeAcceptance.auth.logout()');
    assert(await evaluate(`nativeAcceptance.auth.login('admin',${JSON.stringify(password)})`));
    await route('/backups');
    const backup = await invoke('create_backup', { destinationDir: out });
    const backupRelative = path.relative(await realpath(out), await realpath(backup.path));
    assert(
      backupRelative && !backupRelative.startsWith('..') && !path.isAbsolute(backupRelative),
      'Backup must remain inside the test output directory',
    );
    const finalCount = (await query('SELECT COUNT(*) AS count FROM sales_invoices'))[0].count;
    assert.equal(finalCount - baseline[0].count, 3);
    const unexpected = consoleErrors.filter((e) => !/Failed to load resource|Login error/.test(e));
    assert.deepEqual(
      await evaluate('nativeAcceptance.diagnostics'),
      [],
      'Unexpected redacted frontend diagnostics',
    );
    assert.deepEqual(unexpected, [], 'Unexpected frontend/native query errors');
    results.push(
      'Native backup exported; exactly three test invoices persisted; no unexpected frontend errors',
    );
    await writeFile(
      path.join(out, 'latest.json'),
      JSON.stringify(
        {
          date: stamp,
          run,
          status: 'passed',
          identifier: config.identifier,
          executable: exe,
          sha256: hash,
          backup: backup.path,
          expected: { invoiceCount: finalCount, batchId: batch.id, customerId: customer },
          results,
          consoleErrors,
          limitations: [
            'Debug test build and synthetic data; authentication set up through real native API',
            'Not the exact NSIS installed release',
            'No clean Windows, physical printer/scanner, real pharmacy sample, or FBR network testing',
          ],
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ status: 'passed', results }, null, 2));
  }
} catch (error) {
  if (cdp) {
    try {
      await shot('failure');
    } catch {}
  }
  await writeFile(
    path.join(
      out,
      securityOnly
        ? 'security-failure.json'
        : persistenceOnly
          ? 'persistence-failure.json'
          : 'latest.json',
    ),
    JSON.stringify(
      {
        date: stamp,
        run,
        status: 'failed',
        identifier: config.identifier,
        sha256: hash,
        results,
        error: String(error.stack || error),
        consoleErrors,
        logs,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  socket?.close();
  if (child.exitCode === null) child.kill();
}
