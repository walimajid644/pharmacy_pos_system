// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/banking-income');
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
    window.banks=[{id:'a',name:'Main Bank',is_active:1},{id:'b',name:'Second Bank',is_active:1}];
    window.moneyRows=[];window.incomeRows=[];window.bankWrites=[];window.incomeWrites=[];window.recWrites=[];window.linked=false;window.headRows=[{id:'head',name:'Other income',description:null,isActive:true,assignedCount:0,updatedAt:'v1'}];
    const original=__TAURI_INTERNALS__.invoke;
    __TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='bank_statement'){
        const account=args.accountId;let rows=[{entry_key:'opening:a',account_id:'a',entry_date:'2026-11-01',number:'Opening',description:'Opening balance',amount_cents:10000,source:'opening',source_id:'opening-a',cleared:1},...moneyRows.filter(r=>r.status==='posted').flatMap(r=>[{entry_key:'bank:'+r.requestId+':from',account_id:r.accountId,entry_date:r.entryDate,number:'BT-'+r.requestId.slice(0,8),description:r.kind,amount_cents:r.kind==='deposit'?r.amountCents:-r.amountCents,source:'bank',source_id:r.requestId,cleared:0},...(r.kind==='transfer'?[{entry_key:'bank:'+r.requestId+':to',account_id:r.toAccountId,entry_date:r.entryDate,number:'BT-TRANSFER',description:'Transfer received',amount_cents:r.amountCents,source:'bank',source_id:r.requestId,cleared:0}]:[])]),...incomeRows.filter(r=>r.method==='bank'&&r.status==='posted').map(r=>({entry_key:'income:'+r.id,account_id:r.bank_account_id,entry_date:r.entry_date,number:r.number,description:r.description,amount_cents:r.amount_cents,source:'income',source_id:r.id,cleared:0})),...(window.linked?[{entry_key:'account:old',account_id:'a',entry_date:'2026-11-01',number:'OLD-BANK',description:'Old bank collection',amount_cents:500,source:'account',source_id:'old',cleared:0}]:[])].filter(r=>r.account_id===account&&r.entry_date<=args.toDate).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.entry_key.localeCompare(b.entry_key));
        for(const r of rows)if(recWrites.some(rec=>rec.entryKeys.includes(r.entry_key)))r.cleared=1;
        return {accounts:banks,entries:rows.filter(r=>r.entry_date>=args.fromDate),beforeCents:rows.filter(r=>r.entry_date<args.fromDate).reduce((s,r)=>s+r.amount_cents,0),closingCents:rows.reduce((s,r)=>s+r.amount_cents,0),clearedCents:rows.filter(r=>r.cleared).reduce((s,r)=>s+r.amount_cents,0),truncated:false,unassigned:linked?[]:[{source:'account',id:'old',number:'OLD-BANK',entry_date:'2026-11-01',description:'Old bank collection',amount_cents:500}],unassignedTruncated:false,reconciliations:recWrites.filter(r=>r.accountId===account).map(r=>({id:r.requestId,statement_date:r.statementDate,statement_balance_cents:r.statementBalanceCents,book_balance_cents:r.statementBalanceCents,reference:r.reference}))};
      }
      if(command==='record_bank_transaction') {bankWrites.push({...args.request});if(window.failBank)throw 'Synthetic bank failure';moneyRows.push({...args.request,status:'posted'});return 'BT-SAVED';}
      if(command==='assign_bank_voucher'){window.linked=true;return;}
      if(command==='reconcile_bank_statement'){recWrites.push({...args.request});return;}
      if(command==='record_income_entry'){incomeWrites.push({...args.request});if(window.failIncome)throw 'Synthetic income failure';const r=args.request;incomeRows.push({id:r.requestId,number:'IN-'+incomeRows.length,head_name:headRows.find(h=>h.id===r.headId).name,description:r.description,amount_cents:r.amountCents,method:r.method,bank_account_id:r.bankAccountId,bank_name:r.bankAccountId?'Main Bank':null,entry_date:r.entryDate,reference:r.reference,status:'posted',void_reason:null});return 'IN-SAVED';}
      if(command==='void_finance_posting'){if(args.source==='income')incomeRows.find(r=>r.id===args.id).status='void';else moneyRows.find(r=>r.requestId===args.id).status='void';return;}
      if(command==='list_catalog_register'&&args.kind==='income_head')return headRows.map(r=>({...r}));
      if(command==='save_catalog_register'&&args.request.kind==='income_head'){const r=args.request;headRows.push({...r,id:'head2',assignedCount:0,updatedAt:'v1'});return 'head2';}
      if(command==='database_select'){
        const q=args.query.toLowerCase();if(q.includes('from income_heads'))return headRows.filter(r=>r.isActive).map(r=>({id:r.id,name:r.name}));
        if(q.includes('from bank_accounts')&&!q.includes('opening_balances'))return banks.filter(b=>b.is_active);
        if(q.includes('from income_entries')){if(q.includes('sum('))return [{total:incomeRows.filter(r=>r.status==='posted').reduce((s,r)=>s+r.amount_cents,0)}];return incomeRows.map(r=>({...r}));}
      }
      return original(command,args);
    };
    window.print=()=>{window.didPrint=true};
    await testRouter.push('/income-heads');
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
  await until("!!document.querySelector('#register-name')");
  await field('#register-name', 'Service income');
  await evaluate("document.querySelector('.register-save').click()");
  await until('headRows.length===2');
  await fits('.catalog-register');
  await evaluate("testRouter.push('/bank-transactions')");
  await until(
    "document.querySelectorAll('.bank-statement-table tbody tr').length>0 && document.querySelector('.bank-filters select').value==='a'",
  );
  await fits('.bank-terminal');
  await shot('statement-1024x600');
  await button('.bank-terminal nav button', 'Unassigned');
  await button('.money-list tbody button', 'Assign to');
  await until('window.linked===true');
  await button('.bank-terminal nav button', 'New movement');
  await until("!!document.querySelector('.bank-form')");
  await fits('.bank-terminal');
  await field('.bank-form input[type=number]', '25');
  await field('.bank-form input[maxlength="100"]', 'Cash deposit');
  await evaluate(
    "window.failBank=true;document.querySelector('.bank-form button.money-save').click()",
  );
  await until(
    "document.querySelector('[role=alert]')?.textContent.includes('Synthetic bank failure')",
  );
  assert.equal(
    await evaluate("document.querySelector('.bank-form input[type=number]').value"),
    '25',
  );
  await evaluate(
    "window.failBank=false;document.querySelector('.bank-form button.money-save').click()",
  );
  await until('moneyRows.length===1');
  assert.equal(await evaluate('bankWrites[0].requestId===bankWrites[1].requestId'), true);
  await field('.bank-form select', 'transfer', 'change');
  await until("document.querySelector('.bank-form select').value==='transfer'");
  await evaluate(
    "(()=>{const e=document.querySelectorAll('.bank-form select')[1];e.value='b';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await field('.bank-form input[type=number]', '10');
  await field('.bank-form input[maxlength="100"]', 'Transfer');
  await evaluate("document.querySelector('.bank-form button.money-save').click()");
  await until('moneyRows.length===2');
  assert.equal(await evaluate('moneyRows[1].toAccountId'), 'b');
  assert.equal(await evaluate('moneyRows[1].cashDrawer'), false);
  await button('.bank-terminal nav button', 'Statement');
  await until("!!document.querySelector('.bank-reconcile')");
  await until(
    "document.querySelectorAll('.bank-statement-table input[type=checkbox]').length===3 && [...document.querySelectorAll('.bank-statement-table input[type=checkbox]')].every(e=>!e.disabled)",
  );
  await evaluate(
    "(async()=>{for(const e of document.querySelectorAll('.bank-statement-table input[type=checkbox]')){e.click();await Promise.resolve();}})()",
  );
  await field('.bank-reconcile input[type=number]', '120');
  await field('.bank-reconcile input[maxlength="100"]', 'Statement closing');
  await until("!document.querySelector('.bank-reconcile button.money-save').disabled");
  await evaluate("document.querySelector('.bank-reconcile button.money-save').click()");
  await until('recWrites.length===1');
  assert.equal(await evaluate('recWrites[0].statementBalanceCents'), 12000);
  await button('.bank-terminal>header button', 'Refresh');
  await until("document.querySelector('.bank-statement-table')?.textContent.includes('BT')");
  await button('.bank-filters button', 'Print statement');
  await until('window.didPrint===true');
  assert(
    await evaluate("document.querySelector('.finance-print-root').textContent.includes('120.00')"),
  );
  await evaluate("window.dispatchEvent(new Event('afterprint'));window.didPrint=false");
  await evaluate("testRouter.push('/incomes')");
  await until("document.querySelector('.income-form select')?.options.length===3");
  await fits('.income-terminal');
  await field('.income-form select', 'head', 'change');
  await field('.income-form input[maxlength="500"]', 'Interest');
  await field('.income-form input[type=number]', '7.50');
  await evaluate(
    "(()=>{const e=document.querySelectorAll('.income-form select')[1];e.value='bank';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await until("document.querySelectorAll('.income-form select').length===3");
  await evaluate(
    "(()=>{const e=document.querySelectorAll('.income-form select')[2];e.value='a';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await field('.income-form input[maxlength="100"]', 'Bank interest');
  await fits('.income-terminal');
  await evaluate(
    "window.failIncome=true;document.querySelector('.income-form button.money-save').click()",
  );
  await until(
    "document.querySelector('[role=alert]')?.textContent.includes('Synthetic income failure')",
  );
  await evaluate(
    "window.failIncome=false;document.querySelector('.income-form button.money-save').click()",
  );
  await until('incomeRows.length===1');
  assert.equal(await evaluate('incomeWrites[0].requestId===incomeWrites[1].requestId'), true);
  assert.equal(await evaluate('incomeRows[0].bank_account_id'), 'a');
  await shot('bank-income');
  await button('.income-terminal tbody button', 'Print');
  await until('window.didPrint===true');
  assert(
    await evaluate("document.querySelector('.finance-print-root').textContent.includes('7.50')"),
  );
  await evaluate("window.dispatchEvent(new Event('afterprint'));window.didPrint=false");
  await button('.income-terminal tbody button', 'Void');
  await until("!!document.querySelector('.income-void textarea')");
  await field('.income-void textarea', 'Incorrect income');
  await evaluate("document.querySelector('.income-void button.money-save').click()");
  await until("incomeRows[0].status==='void'");
  await evaluate(
    "document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark')",
  );
  await fits('.income-terminal');
  await shot('income-dark');
  await evaluate("testAuth.currentUser.role='accountant';testRouter.push('/bank-transactions')");
  await until("!!document.querySelector('.bank-terminal')");
  await fits('.bank-terminal');
  await evaluate("testAuth.currentUser.role='cashier';testRouter.push('/products')");
  for (const path of ['/bank-transactions', '/incomes', '/income-heads']) {
    await evaluate(`testRouter.push(${JSON.stringify(path)})`);
    assert.equal(await evaluate('testRouter.currentRoute.value.path'), '/');
  }
  results.push(
    'Bank statements, transfer/save retries, legacy assignment, reconciliation, income/void/printing, roles and 1024x600 layout passed',
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
