// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/access-restore');
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
    window.allowedRights=undefined;window.savedRights=[];window.rightsRevision=0;window.deniedRights=[];window.loginFilters=[];window.restoreCalls=[];
    window.rightsEntries=[{key:'banking.post',label:'Post bank movements',eligible:true,allowed:true},{key:'catalog.write',label:'Add/edit products',eligible:true,allowed:true},...Array.from({length:36},(_,i)=>({key:'action-'+i,label:'Staff action '+i,eligible:i<30,allowed:i<30}))];
    const original=__TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='current_permissions')return {role:testAuth.currentUser.role,permissions:window.allowedRights||[]};
      if(command==='read_user_rights')return {userId:args.userId,name:args.userId==='admin'?'Administrator':'Staff Manager',username:args.userId,role:args.userId==='admin'?'admin':'manager',revision:rightsRevision,entries:rightsEntries.map(e=>({...e,allowed:args.userId==='admin'?e.eligible:!deniedRights.includes(e.key)&&e.eligible}))};
      if(command==='save_user_rights'){if(window.failRights)throw 'This account changed. Reload its rights before saving';savedRights.push(args.request);deniedRights=[...args.request.deniedPermissions];rightsRevision++;return;}
      if(command==='read_login_history'){loginFilters.push(args);return {entries:[{id:'failure',occurred_at:new Date().toISOString(),event:'failed_sign_in',username:'unknown-user',reason:'invalid_credentials'},...(args.event==='failed_sign_in'?[]:[{id:'success',occurred_at:new Date().toISOString(),event:'sign_in',username:'manager',reason:'authenticated'}])],truncated:false};}
      if(command==='restore_status')return {maintenance:!!window.restoreScheduled,pending:!!window.restoreScheduled,lastRestore:null};
      if(command==='prepare_restore'){if(args.sourcePath.includes('invalid'))throw 'This is not a supported Pharmacy POS backup';return {planId:'reviewed-backup',sha256:'a'.repeat(64),preparedAt:Date.now()/1000,summary:{sourceFile:'pharmacy-backup.db',company:'Backup Pharmacy',products:100,invoices:12,latestInvoice:'INV-12',administrators:['backup-admin'],openDrawers:0}};}
      if(command==='queue_restore'){restoreCalls.push(args);if(window.failRestore)throw 'Administrator password is incorrect';window.restoreScheduled=true;return {scheduled:true,safetyBackup:'C:/test-only/safety.db'};}
      if(command==='restart_for_restore'){window.restartRequested=true;return;}
      if(command==='database_select'&&args.query.includes('FROM users WHERE'))return [{id:'admin',full_name:'Administrator',username:'admin',is_active:1},{id:'manager',full_name:'Staff Manager',username:'manager',is_active:1}];
      return original(command,args);
    };
    await testRouter.push('/user-rights');
  })()`);
  const field = async (selector, value, event = 'input') =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
    );
  const button = async (selector, text) => {
    await until(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].some(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})&&!b.disabled)`,
    );
    await evaluate(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`,
    );
  };
  const fits = async (selector) => {
    const m = await evaluate(
      `(()=>{const root=document.querySelector(${JSON.stringify(selector)});return {height:root.scrollHeight,client:root.clientHeight,clipped:[...root.querySelectorAll('input,select,button')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden').filter(e=>e.getBoundingClientRect().bottom>innerHeight+1||e.getBoundingClientRect().right>innerWidth+1).map(e=>e.textContent||e.type)}})()`,
    );
    assert(m.height <= m.client + 2, JSON.stringify(m));
    assert.deepEqual(m.clipped, [], JSON.stringify(m));
  };
  await until("document.querySelector('.rights-terminal select')?.options.length===3");
  await field('.rights-terminal select', 'manager', 'change');
  await until('!!document.querySelector(\'[data-permission="banking.post"]\')');
  await evaluate('document.querySelector(\'[data-permission="banking.post"]\').click()');
  await button('.rights-terminal .money-save', 'Save rights');
  await until('savedRights.length===1');
  assert.deepEqual(await evaluate('savedRights[0].deniedPermissions'), ['banking.post']);
  await fits('.rights-terminal');
  await shot('staff-rights');
  await field('.rights-terminal select', 'admin', 'change');
  await until("document.querySelector('.rights-terminal .money-save').disabled");
  assert(
    await evaluate(
      "[...document.querySelectorAll('.rights-terminal input[type=checkbox]')].every(e=>e.disabled)",
    ),
  );
  await field('.rights-terminal select', 'manager', 'change');
  await until("!document.querySelector('.rights-terminal .money-save').disabled");
  await evaluate(
    "window.failRights=true;document.querySelector('.rights-terminal .money-save').click()",
  );
  await until("document.querySelector('[role=alert]')?.textContent.includes('account changed')");
  await evaluate('window.failRights=false');
  await evaluate("testRouter.push('/login-history')");
  await until(
    "document.querySelector('.login-history tbody')?.textContent.includes('unknown-user')",
  );
  await field('.login-history select', 'failed_sign_in', 'change');
  await until("loginFilters.at(-1).event==='failed_sign_in'");
  await fits('.login-history');
  await shot('login-history');
  await evaluate("testRouter.push('/restore')");
  await until("!!document.querySelector('.restore-source input')");
  assert(await evaluate("document.querySelector('.restore-confirm .money-save').disabled"));
  await field('.restore-source input', 'C:/test-only/invalid.db');
  await button('.restore-source button', 'Inspect backup');
  await until("document.querySelector('[role=alert]')?.textContent.includes('not a supported')");
  assert(await evaluate("document.querySelector('.restore-confirm .money-save').disabled"));
  await field('.restore-source input', 'C:/test-only/pharmacy-backup.db');
  await button('.restore-source button', 'Inspect backup');
  await until("document.querySelector('.restore-review').textContent.includes('Backup Pharmacy')");
  await fits('.restore-terminal');
  await evaluate("document.querySelector('.restore-confirm input[type=checkbox]').click()");
  await field('.restore-confirm input[type=password]', 'DUMMY-TEST-PASSWORD');
  await field('.restore-confirm input[autocomplete=off]', 'RESTORE');
  await shot('reviewed-restore');
  await evaluate('window.failRestore=true');
  await button('.restore-confirm .money-save', 'Restore and restart');
  await until(
    "document.querySelector('[role=alert]')?.textContent.includes('password is incorrect')",
  );
  assert.equal(
    await evaluate("document.querySelector('.restore-confirm input[type=password]').value"),
    '',
  );
  assert.equal(await evaluate('!!window.restartRequested'), false);
  assert.equal(await evaluate('testAuth.maintenance'), false);
  await field('.restore-confirm input[type=password]', 'DUMMY-TEST-PASSWORD');
  await evaluate('window.failRestore=false');
  await button('.restore-confirm .money-save', 'Restore and restart');
  await until('window.restartRequested===true');
  assert.equal(await evaluate('testAuth.maintenance'), true);
  assert.equal(await evaluate('restoreCalls.at(-1).planId'), 'reviewed-backup');
  assert.equal(await evaluate('restoreCalls.at(-1).confirmation'), 'RESTORE');
  assert.equal(
    await evaluate("document.querySelector('.restore-confirm input[type=password]').value"),
    '',
  );
  await evaluate(
    "window.restoreScheduled=false;testAuth.maintenance=false;testAuth.currentUser.role='manager';testAuth.currentUser.permissions=['catalog.read'];window.allowedRights=['catalog.read'];testRouter.push('/products')",
  );
  await until("!!document.querySelector('.inventory-terminal tbody')");
  assert(
    await evaluate(
      "[...document.querySelectorAll('.inventory-terminal button')].find(b=>b.textContent.includes('Add Product')).disabled",
    ),
  );
  assert(
    await evaluate(
      "[...document.querySelectorAll('.inventory-terminal tbody button')].find(b=>b.textContent.includes('Edit')).disabled",
    ),
  );
  await evaluate("window.allowedRights=[];testRouter.push('/login-history')");
  assert.equal(await evaluate('testRouter.currentRoute.value.path'), '/');
  await evaluate("testAuth.currentUser.permissions=undefined;testAuth.currentUser.role='cashier'");
  for (const path of ['/user-rights', '/login-history', '/restore']) {
    await evaluate(`testRouter.push(${JSON.stringify(path)})`);
    assert.equal(await evaluate('testRouter.currentRoute.value.path'), '/');
  }
  results.push(
    'User-rights save/stale/admin locks, login-history filters, reviewed restore/password/restart, live route revocation and disabled product actions passed',
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
