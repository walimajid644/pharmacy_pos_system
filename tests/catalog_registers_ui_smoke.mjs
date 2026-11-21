// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/catalog-registers');
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
let inspectPage;
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
    if (m.method === 'Network.loadingFailed')
      console.error('Test request failed:', m.params.errorText);
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
  inspectPage = () =>
    evaluate(
      '({url:location.href,state:document.readyState,html:document.documentElement.outerHTML.slice(0,1000)})',
    );
  async function until(expression) {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
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
    window.registerClock = 1;
    const row = (id,name,isActive=true,assignedCount=0) => ({id,name,description:'Test description',isActive,assignedCount,updatedAt:'v1'});
    window.registerRows = {
      category: [row('cat-linked','Linked Category',true,1), row('cat-inactive','Inactive Category',false), ...Array.from({length:40},(_,i)=>row('category-'+i,'Category '+String(i+1).padStart(2,'0')))],
      manufacturer: [row('mfg-linked','Linked Company',true,1), row('mfg-inactive','Inactive Company',false)],
      shelf: [row('shelf-linked','Old Shelf',true,1), row('shelf-inactive','Inactive Shelf',false)],
    };
    window.registerProduct = {id:'p1',sku:'REG-1',name:'Registered medicine',generic_name:'Generic',barcode:'123456789',category_id:'cat-linked',manufacturer_id:'mfg-linked',unit_price:10,cost_price:5,wholesale_price:null,pack_size:10,sell_by_loose_unit:1,controlled_substance:0,reorder_level:10,is_active:1,current_stock:25,shelf_location:'Old Shelf',shelf_location_id:'shelf-linked',created_at:'now',updated_at:'now',deleted_at:null};
    window.originalRegisterInvoke = __TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke = async (command,args={}) => {
      if (command === 'list_catalog_register') return registerRows[args.kind].map(row=>({...row})).sort((a,b)=>a.name.localeCompare(b.name));
      if (command === 'save_catalog_register') {
        const request=args.request;
        const rows=registerRows[request.kind];
        const existing=rows.find(row=>row.id===request.id);
        if (rows.some(row=>row.id!==request.id && row.name.toLowerCase()===request.name.trim().toLowerCase())) throw 'This name already exists. Edit or reactivate the existing entry';
        if (existing && existing.updatedAt!==request.expectedUpdatedAt) throw 'This entry changed. Refresh the register and try again';
        const saved={id:request.id || request.kind+'-new-'+(++registerClock),name:request.name.trim(),description:request.description,isActive:request.isActive,assignedCount:existing?.assignedCount || 0,updatedAt:'v'+(++registerClock)};
        if(existing) rows.splice(rows.indexOf(existing),1,saved); else rows.push(saved);
        if(request.kind==='shelf' && saved.id===registerProduct.shelf_location_id) registerProduct.shelf_location=saved.name;
        return saved.id;
      }
      if (command==='database_select') {
        const q=args.query.toLowerCase();
        if(q.includes('from products p left join product_batches')) return [{...registerProduct}];
        const kind=q.includes('from categories')?'category':q.includes('from manufacturers')?'manufacturer':q.includes('from shelf_locations')?'shelf':null;
        if(kind) return registerRows[kind].map(row=>({id:row.id,name:row.name,description:row.description,is_active:row.isActive?1:0,created_at:'now',updated_at:row.updatedAt,deleted_at:null}));
      }
      return originalRegisterInvoke(command,args);
    };
    await testRouter.push('/categories');
  })()`);
  await until(
    "!!document.querySelector('.register-table tbody tr') && !document.querySelector('.register-save').disabled",
  );
  assert(
    await evaluate(`(() => {
    const page=document.querySelector('.catalog-register'),editor=document.querySelector('.register-editor');
    const a=page.getBoundingClientRect(),b=editor.getBoundingClientRect();
    return a.bottom<=innerHeight && b.bottom<=innerHeight && page.scrollHeight<=page.clientHeight+1 && editor.scrollHeight<=editor.clientHeight+1 && document.querySelectorAll('.register-table tbody tr').length<registerRows.category.length;
  })()`),
    'Register form and paginated list must fit 1024x600',
  );
  await shot('categories-1024x600');
  const field = async (selector, value, event = 'input') =>
    evaluate(
      `(() => {const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const rowAction = async (label) =>
    evaluate(
      `[...document.querySelectorAll('.register-row-actions button')].find(button=>button.textContent.includes(${JSON.stringify(label)})).click()`,
    );
  const saveForm = async () => {
    await evaluate("document.querySelector('.register-save').click()");
    await until("!document.querySelector('.register-save').disabled");
  };
  await field('#register-name', 'New Category');
  await saveForm();
  await until("registerRows.category.some(row=>row.name==='New Category')");
  await field('.register-search input', 'New Category');
  await until(
    "document.querySelector('.register-table tbody').textContent.includes('New Category')",
  );
  await rowAction('Edit');
  await field('#register-name', 'New Category Renamed');
  await saveForm();
  await rowAction('Deactivate');
  await until(
    "registerRows.category.find(row=>row.name==='New Category Renamed').isActive===false",
  );
  await rowAction('Activate');
  await until("registerRows.category.find(row=>row.name==='New Category Renamed').isActive===true");
  const count = await evaluate('registerRows.category.length');
  await field('#register-name', 'linked category');
  await saveForm();
  await until("!!document.querySelector('.register-error')");
  assert.equal(await evaluate('registerRows.category.length'), count);
  assert(
    await evaluate(
      "document.querySelector('.register-error').textContent.includes('already exists') && document.querySelector('#register-name').value==='linked category'",
    ),
  );
  await evaluate(
    "[...document.querySelectorAll('.register-tabs button')].find(button=>button.textContent.includes('Companies')).click()",
  );
  await until(
    "location.pathname==='/manufacturers' && !document.querySelector('.register-save').disabled",
  );
  await field('#register-name', 'Test Pharma');
  await saveForm();
  await until("registerRows.manufacturer.some(row=>row.name==='Test Pharma')");
  await evaluate(
    "[...document.querySelectorAll('.register-tabs button')].find(button=>button.textContent.includes('Companies')).click()",
  );
  await until(
    "location.pathname==='/manufacturers' && !document.querySelector('.register-save').disabled",
  );
  await field('#register-name', 'Test Pharma');
  await saveForm();
  await until("registerRows.manufacturer.some(row=>row.name==='Test Pharma')");
  await evaluate(
    "[...document.querySelectorAll('.register-tabs button')].find(button=>button.textContent.includes('Shelves')).click()",
  );
  await until(
    "location.pathname==='/shelf-locations' && !document.querySelector('.register-save').disabled",
  );
  await field('.register-search input', 'Old Shelf');
  await rowAction('Edit');
  await field('#register-name', 'Main Shelf');
  await saveForm();
  await until("registerProduct.shelf_location==='Main Shelf'");
  await field('.register-search input', 'Main Shelf');
  await rowAction('Deactivate');
  await until("!registerRows.shelf.find(row=>row.id==='shelf-linked').isActive");
  await field('#register-name', 'Fridge Shelf');
  await saveForm();
  await until("registerRows.shelf.some(row=>row.name==='Fridge Shelf')");
  await evaluate(
    "document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark')",
  );
  await shot('shelves-dark-1024x600');
  await evaluate("document.querySelector('.register-header-actions button').click()");
  await until(
    "location.pathname==='/products' && !!document.querySelector('.inventory-terminal tbody tr')",
  );
  await evaluate(
    "[...document.querySelectorAll('.inventory-terminal tbody button')].find(button=>button.textContent.includes('Edit')).click()",
  );
  await until("!!document.querySelector('#pf-shelf')");
  assert(
    await evaluate(
      `document.querySelector('#pf-shelf').value==='Main Shelf' && document.querySelector('#pf-shelf option:checked').textContent.includes('inactive')`,
    ),
  );
  assert(
    await evaluate(
      `![...document.querySelector('#pf-category').options].some(option=>option.textContent.includes('Inactive Category')) && [...document.querySelector('#pf-mfg').options].some(option=>option.textContent.includes('Test Pharma'))`,
    ),
  );
  await evaluate(
    "[...document.querySelectorAll('.product-dialog-card button')].find(button=>button.textContent.includes('Cancel')).click()",
  );
  await until("!document.querySelector('#pf-shelf')");
  await evaluate(
    "[...document.querySelectorAll('.inventory-header button')].find(button=>button.textContent.includes('Add')).click()",
  );
  await until("!!document.querySelector('#pf-shelf')");
  assert(
    await evaluate(
      `![...document.querySelector('#pf-shelf').options].some(option=>option.value==='Main Shelf') && [...document.querySelector('#pf-shelf').options].some(option=>option.value==='Fridge Shelf')`,
    ),
  );
  await evaluate(
    "[...document.querySelectorAll('.product-dialog-card button')].find(button=>button.textContent.includes('Cancel')).click()",
  );
  await evaluate(
    "(async()=>{testAuth.currentUser={...testAuth.currentUser,role:'cashier'};await testRouter.push('/categories');})()",
  );
  await until("location.pathname==='/'");
  assert(await evaluate("!document.querySelector('.catalog-register')"));
  console.log(
    'Catalog register CRUD, duplicate handling, pagination, dark theme, product options and cashier route restrictions passed',
  );
} catch (e) {
  console.error(e);
  if (inspectPage) {
    try {
      console.error(await inspectPage());
    } catch {}
  }

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
