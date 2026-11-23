// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/contacts');
const baseUrl = process.env.CONTACT_UI_BASE_URL || 'http://localhost:1422';
await mkdir(out, { recursive: true });
const allocator = net.createServer();
await new Promise((resolve) => allocator.listen(0, '127.0.0.1', resolve));
const debugPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'pharmacy-contacts-'));
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
  async function open(view) {
    await cdp('Page.navigate', {
      url: baseUrl + '/tests/ui/phase1.html?view=' + encodeURIComponent(view),
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
  const fill = async (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );

  const clickText = async (selector, text) =>
    evaluate(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`,
    );
  const fits = async () => {
    inside(await evaluate(rect('.contact-form-card')), 'contact form');
    inside(await evaluate(rect('.contact-actions')), 'contact actions');
    assert(
      await evaluate(
        "[...document.querySelectorAll('.contact-form-card,.contact-fields')].every(e=>e.scrollWidth<=e.clientWidth+2&&e.scrollHeight<=e.clientHeight+2)",
      ),
      'Contact form fits without scrolling at 1024x600',
    );
  };
  await open('/customers');
  await evaluate(
    `(()=>{const old=__TAURI_INTERNALS__.invoke;fixture.contactWrites=[];__TAURI_INTERNALS__.invoke=async(command,args={})=>{if(command==='save_customer'||(command==='database_execute'&&args.query.includes('INSERT INTO suppliers'))){fixture.contactWrites.push({command,args});return 'saved-contact';}return old(command,args);};})()`,
  );
  await clickText('.tool-header button', 'Add Customer');
  await until("!!document.querySelector('.contact-form-card')");
  assert(await evaluate('document.querySelector(\'input[aria-label="Client active"]\').checked'));
  await fill('input[aria-label="Client first name or company"]', 'New Client');
  await fill('input[aria-label="Client last name"]', 'Company');
  await fill('input[aria-label="Client phone"]', '03001234567');
  await fill('textarea[aria-label="Client address"]', 'Street 1\nLahore');
  await fill('select[aria-label="Client type"]', 'wholesale');
  await fill('input[aria-label="Client credit limit"]', '500');
  await fits();
  await shot('client-add-1024x600');
  await evaluate(
    "window.contactDialog=document.querySelector('.contact-form-dialog');document.querySelector('input[name=contact-role][value=supplier]').click()",
  );
  await until('!!document.querySelector(\'input[aria-label="Supplier code"]\')');
  assert(
    await evaluate(
      "document.querySelector('.contact-form-dialog')===contactDialog&&document.querySelectorAll('.contact-form-dialog').length===1",
    ),
    'Role selection keeps the same single modal',
  );
  assert.equal(
    await evaluate(
      'document.querySelector(\'input[aria-label="Supplier name or company"]\').value',
    ),
    'New Client Company',
  );
  await fill('input[aria-label="Supplier name or company"]', 'Supplier draft');
  await evaluate("document.querySelector('input[name=contact-role][value=client]').click()");
  assert.equal(
    await evaluate(
      'document.querySelector(\'input[aria-label="Client first name or company"]\').value',
    ),
    'New Client',
  );
  await evaluate("document.querySelector('input[name=contact-role][value=supplier]').click()");
  assert.equal(
    await evaluate(
      'document.querySelector(\'input[aria-label="Supplier name or company"]\').value',
    ),
    'Supplier draft',
  );
  await evaluate("document.querySelector('input[name=contact-role][value=client]').click()");

  await clickText('.contact-actions button', 'Undo');
  assert.equal(
    await evaluate(
      'document.querySelector(\'input[aria-label="Client first name or company"]\').value',
    ),
    '',
  );
  await fill('input[aria-label="Client first name or company"]', 'New Client');
  await fill('input[aria-label="Client last name"]', 'Company');
  await fill('textarea[aria-label="Client address"]', 'Street 1');
  await evaluate("document.querySelector('.contact-actions button[type=submit]').click()");
  await until("!document.querySelector('.contact-form-card')");
  const client = await evaluate('fixture.contactWrites[0].args.request');
  assert.equal(client.firstName, 'New Client');
  assert.equal(client.lastName, 'Company');
  assert.equal(client.address, 'Street 1');
  assert.equal(client.isActive, true);
  await clickText('tbody button', 'Edit');
  await until("!!document.querySelector('.contact-form-card')");
  assert.equal(
    await evaluate('document.querySelector(\'input[aria-label="Client code"]\').value'),
    'C1',
  );
  assert(
    await evaluate('document.querySelector(\'input[aria-label="Client active"]\').checked'),
    'Numeric active database values stay checked',
  );
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await until("!document.querySelector('.contact-form-card')");

  await clickText('.tool-header button', 'Add Customer');
  await until("!!document.querySelector('.contact-form-card')");
  await evaluate("document.querySelector('input[name=contact-role][value=supplier]').click()");
  await fill('input[aria-label="Supplier code"]', 'SUP-FROM-CLIENT');
  await fill('input[aria-label="Supplier name or company"]', 'Supplier from client register');
  await evaluate("document.querySelector('.contact-actions button[type=submit]').click()");
  await until("!document.querySelector('.contact-form-card')");
  assert.equal(
    await evaluate('fixture.contactWrites.at(-1).command'),
    'database_execute',
    'Selecting supplier must save a supplier even from the client register',
  );
  await open('/suppliers');
  await evaluate(
    `(()=>{const old=__TAURI_INTERNALS__.invoke;fixture.contactWrites=[];__TAURI_INTERNALS__.invoke=async(command,args={})=>{if(command==='save_customer'){fixture.contactWrites.push({command,args});return 'saved-client';}if(command==='database_execute'&&args.query.includes('INSERT INTO suppliers')){fixture.contactWrites.push({command,args});await new Promise(r=>fixture.finishContactSave=r);return 1;}return old(command,args);};})()`,
  );
  await clickText('.view-header button', 'Add Supplier');
  await until("!!document.querySelector('.contact-form-card')");
  assert(
    await evaluate('document.querySelector(\'input[aria-label="Supplier active"]\').checked'),
    'New supplier starts active',
  );
  await fill('input[aria-label="Supplier code"]', 'SUP-NEW');
  await fill('input[aria-label="Supplier name or company"]', 'New Supplier');
  await fill('input[aria-label="Supplier contact person"]', 'Contact Person');
  await fill('textarea[aria-label="Supplier address"]', 'Street 2');
  await fill('input[aria-label="Supplier city"]', 'Karachi');
  await fill('input[aria-label="Supplier country"]', 'Pakistan');
  await fill('textarea[aria-label="Supplier notes"]', 'Supplier notes');
  await fits();
  await shot('supplier-add-1024x600');
  await evaluate("document.querySelector('.contact-actions button[type=submit]').click()");
  await until('fixture.contactWrites.length===1');
  await evaluate(
    "document.querySelector('.contact-entry-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))",
  );
  assert.equal(
    await evaluate('fixture.contactWrites.length'),
    1,
    'Supplier duplicate submit is ignored',
  );
  const values = await evaluate('fixture.contactWrites[0].args.values');
  assert.equal(values[1], 'SUP-NEW');
  assert.equal(values[2], 'New Supplier');
  assert.equal(values[3], 'Contact Person');
  assert.equal(values[6], 'Street 2');
  assert.equal(values[7], 'Karachi');
  assert.equal(values[8], 'Pakistan');
  assert.equal(values[12], 1);
  assert.equal(values[13], 'Supplier notes');
  await evaluate('fixture.finishContactSave()');
  await until("!document.querySelector('.contact-form-card')");

  await clickText('.view-header button', 'Add Supplier');
  await until("!!document.querySelector('.contact-form-card')");
  await evaluate("document.querySelector('input[name=contact-role][value=client]').click()");
  await fill('input[aria-label="Client first name or company"]', 'Client from supplier register');
  await fill('input[aria-label="Client last name"]', 'Test');
  await evaluate("document.querySelector('.contact-actions button[type=submit]').click()");
  await until("!document.querySelector('.contact-form-card')");
  assert.equal(
    await evaluate('fixture.contactWrites.at(-1).command'),
    'save_customer',
    'Selecting client must save a client even from the supplier register',
  );
  console.log(
    'PASS: One selectable contact modal, preserved role drafts, correct saves from either register, add/edit values, active flags, undo, Escape, and duplicate protection.',
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
