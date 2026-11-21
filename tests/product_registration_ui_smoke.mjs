// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/product-registration');
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

  await open('/products');
  await until("!!document.querySelector('.inventory-terminal tbody tr')");
  await evaluate(`(async () => {
    window.productRecord = {
      id: 'p1', sku: 'MED-1', name: 'Saved medicine', generic_name: 'Test generic', barcode: '123456789',
      category_id: null, manufacturer_id: null, unit_price: 10, cost_price: 5, wholesale_price: null,
      pack_size: 10, sell_by_loose_unit: true, controlled_substance: false, drap_registration_number: null,
      reorder_level: 10, is_active: true, current_stock: 25,
      shelf_location: '', remarks: '', uom: 'box', pack_type: '', ext_disc_percent: 0, stm_level: 0,
      maintain_batch: 0, fridge_item: 0, registration_date: null,
      created_at: '2026-11-21', updated_at: '2026-11-21', deleted_at: null,
    };
    window.baseInvoke = __TAURI_INTERNALS__.invoke;
    window.productWrites = [];
    __TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'database_select' && args.query.includes('FROM shelf_locations')) return ['Shelf A','New Shelf'].map((name,index)=>({id:'shelf-'+index,name,is_active:1,description:null,created_at:'now',updated_at:'now',deleted_at:null}));
      if (command === 'database_select' && /FROM products p LEFT JOIN product_batches/i.test(args.query)) return [{...productRecord}];
      if (command === 'database_execute' && /^(UPDATE|INSERT INTO) products/i.test(args.query.trim())) {
        if (window.failProductSave) throw 'UNIQUE constraint failed: products.sku SYNTHETIC_SECRET';
        const fields = args.query.trim().startsWith('UPDATE')
          ? args.query.split(/SET/i)[1].split(/WHERE/i)[0].split(',').map(value => value.split('=')[0].trim())
          : args.query.slice(args.query.indexOf('(') + 1, args.query.indexOf(')')).split(',').map(value => value.trim());
        fields.forEach((field,index) => productRecord[field] = args.values[index]);
        productWrites.push(args);
        return 1;
      }
      return baseInvoke(command, args);
    };
    await testRouter.push('/item-search'); await testRouter.push('/products');
  })()`);
  await until("!!document.querySelector('.inventory-terminal tbody tr')");
  const edit = async () => {
    await evaluate(
      `[...document.querySelectorAll('.inventory-terminal tbody button')].find(button => button.textContent.includes('Edit')).click()`,
    );
    await until("!!document.querySelector('#pf-shelf')");
  };
  const save = async () => {
    await evaluate(
      `[...document.querySelectorAll('.product-dialog-card button')].find(button => /Save|Update/.test(button.textContent)).click()`,
    );
  };
  await edit();
  await evaluate(`
    for (const [id,value] of Object.entries({'pf-shelf':'Shelf A','pf-remarks':'Keep chilled','pf-uom':'bottle','pf-packtype':'100 ml','pf-extdisc':'7.25','pf-stm':'12'})) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
    }
    var date = document.querySelector('.p-reg-date input'); date.value = '2026-11-21'; date.dispatchEvent(new Event('input',{bubbles:true}));
    const flags = document.querySelectorAll('.p-flags-row input'); flags[1].click(); flags[2].click();
  `);
  await save();
  await until("!document.querySelector('#pf-shelf')");
  assert.deepEqual(
    await evaluate(
      `['shelf_location','remarks','uom','pack_type','ext_disc_percent','stm_level','maintain_batch','fridge_item','registration_date'].map(key=>productRecord[key])`,
    ),
    ['Shelf A', 'Keep chilled', 'bottle', '100 ml', 7.25, 12, 1, 1, '2026-11-21'],
  );
  await edit();
  assert.deepEqual(
    await evaluate(
      `['pf-shelf','pf-remarks','pf-uom','pf-packtype','pf-extdisc','pf-stm'].map(id=>document.getElementById(id).value)`,
    ),
    ['Shelf A', 'Keep chilled', 'bottle', '100 ml', '7.25', '12'],
  );
  assert(
    await evaluate(
      `document.querySelectorAll('.p-flags-row input')[0].checked && document.querySelectorAll('.p-flags-row input')[1].checked && document.querySelectorAll('.p-flags-row input')[2].checked && document.querySelectorAll('.p-flags-row input')[4].checked && document.querySelector('.p-reg-date input').value === '2026-11-21'`,
    ),
  );
  await shot('reopened-product-details');
  await evaluate(
    `document.querySelector('#pf-extdisc').value = '101'; document.querySelector('#pf-extdisc').dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  await save();
  assert.equal(
    await evaluate('productWrites.length'),
    1,
    'Invalid discount must not reach storage',
  );
  await evaluate(
    `document.querySelector('#pf-extdisc').value = '0'; document.querySelector('#pf-extdisc').dispatchEvent(new Event('input',{bubbles:true})); window.failProductSave=true;`,
  );
  await save();
  await until(
    "fixture.calls.some(call=>call.command === 'record_diagnostic' && call.args.request.context?.operation === 'product_save')",
  );
  const diagnostic = await evaluate(
    "fixture.calls.filter(call=>call.command === 'record_diagnostic').at(-1).args.request",
  );
  assert.equal(diagnostic.context.reason, 'constraint_violation');
  assert.match(diagnostic.context.supportId, /^ERR-[A-F0-9]{12}$/);
  assert(!JSON.stringify(diagnostic).includes('SYNTHETIC_SECRET'));
  assert(
    await evaluate("!!document.querySelector('#pf-shelf')"),
    'Failed save preserves editable form',
  );
  const toasts = await evaluate(
    "import('/src/composables/useToast.ts').then(module => module.useToast().toasts.value.map(toast=>toast.message))",
  );
  assert(toasts.some((message) => message.includes(diagnostic.context.supportId)));
  assert(toasts.every((message) => !message.includes('SYNTHETIC_SECRET')));
  await evaluate(
    `window.failProductSave=false; for(const id of ['pf-shelf','pf-remarks','pf-packtype']){const input=document.getElementById(id);input.value='';input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));} document.querySelector('#pf-stm').value='0';document.querySelector('#pf-stm').dispatchEvent(new Event('input',{bubbles:true}));document.querySelectorAll('.p-flags-row input')[1].click();document.querySelectorAll('.p-flags-row input')[2].click();var date=document.querySelector('.p-reg-date input');date.value='';date.dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  await save();
  await until("!document.querySelector('#pf-shelf')");
  await edit();
  assert(
    await evaluate(
      `document.querySelector('#pf-shelf').value === '' && document.querySelector('#pf-extdisc').value === '0' && !document.querySelectorAll('.p-flags-row input')[1].checked && !document.querySelectorAll('.p-flags-row input')[2].checked && document.querySelector('.p-reg-date input').value === ''`,
    ),
  );
  await evaluate(
    `[...document.querySelectorAll('.product-dialog-card button')].find(button => button.textContent.includes('Cancel')).click()`,
  );
  await until("!document.querySelector('#pf-shelf')");
  await evaluate(
    `[...document.querySelectorAll('.inventory-header button')].find(button => button.textContent.includes('Add')).click()`,
  );
  await until("!!document.querySelector('#pf-shelf')");
  assert(
    await evaluate(
      "document.querySelector('.product-dialog-card h2').textContent.includes('Add New Product')",
    ),
  );
  await evaluate(
    `for (const [id,value] of Object.entries({'pf-sku':'NEW-1','pf-name':'New medicine','pf-shelf':'New Shelf','pf-remarks':'New remarks','pf-uom':'strip','pf-packtype':'14s','pf-extdisc':'5','pf-stm':'3'})) { const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true})); }`,
  );
  await save();
  await until("!document.querySelector('#pf-shelf')");
  assert.deepEqual(
    await evaluate(
      '[productRecord.sku, productRecord.shelf_location, productRecord.uom, productRecord.pack_type, productRecord.ext_disc_percent]',
    ),
    ['NEW-1', 'New Shelf', 'strip', '14s', 5],
    'New-item insert must contain all registration fields',
  );
  await until("document.querySelector('.inventory-terminal tbody').textContent.includes('NEW-1')");
  await edit();
  assert(
    await evaluate(
      `document.querySelector('#pf-shelf').value === 'New Shelf' && document.querySelector('#pf-uom').value === 'strip' && document.querySelector('#pf-packtype').value === '14s' && document.querySelector('#pf-extdisc').value === '5'`,
    ),
  );
  await evaluate(`(async () => {
    const { installErrorHandling } = await import('/src/lib/diagnostics.ts');
    window.errorTestApp = {config:{}};
    installErrorHandling(errorTestApp);
    errorTestApp.config.errorHandler(new TypeError('SYNTHETIC_SECRET'), null, 'render function');
  })()`);
  await until(
    "fixture.calls.some(call=>call.command === 'record_diagnostic' && call.args.request.context?.operation === 'frontend_render')",
  );
  const renderDiagnostic = await evaluate(
    "fixture.calls.filter(call=>call.command === 'record_diagnostic').at(-1).args.request",
  );
  assert.equal(renderDiagnostic.source, 'catalog');
  assert.equal(renderDiagnostic.context.reason, 'type_error');
  assert(!JSON.stringify(renderDiagnostic).includes('SYNTHETIC_SECRET'));
  const errorToasts = await evaluate(
    "import('/src/composables/useToast.ts').then(module => module.useToast().toasts.value.map(toast=>toast.message))",
  );
  assert(errorToasts.some((message) => message.includes(renderDiagnostic.context.supportId)));
  assert(errorToasts.every((message) => !message.includes('SYNTHETIC_SECRET')));
  console.log(
    'New/edit product saves, reopen, clearing, validation and structured error support codes passed',
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
