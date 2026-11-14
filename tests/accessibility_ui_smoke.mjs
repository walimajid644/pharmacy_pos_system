// Headless Edge checks against real Vue screens with an isolated mocked Tauri bridge.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('test-results/accessibility');
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
  async function open(view) {
    await cdp('Page.navigate', {
      url: 'http://127.0.0.1:1422/tests/ui/phase1.html?view=' + encodeURIComponent(view),
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

  const axe = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  const scans = [];
  for (const view of [
    '/login',
    '/pos',
    '/products',
    '/purchase-orders',
    '/customers',
    '/reports',
    '/users',
    '/settings',
  ]) {
    console.log(`Scanning accessibility: ${view}`);
    await open(view);
    await evaluate(axe);
    const result = await evaluate(
      `axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(r => ({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) }))`,
    );
    scans.push({ view, ...result });
  }

  for (const [view, text] of [
    ['/products', 'Add Product'],
    ['/customers', 'Add Customer'],
    ['/users', 'Add User'],
    ['/suppliers', 'Add Supplier'],
  ]) {
    await open(view);
    await evaluate(axe);
    const parentDialogs = await evaluate(`document.querySelectorAll('[role="dialog"]').length`);
    await evaluate(
      `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!button)throw Error('Missing add action');button.focus();button.click()})()`,
    );
    await until(`document.querySelectorAll('[role="dialog"]').length === ${parentDialogs + 1}`);
    await delay(200);
    const result = await evaluate(
      `axe.run([...document.querySelectorAll('[role="dialog"]')].at(-1), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then(r => ({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })) }))`,
    );
    scans.push({ view: view + ':create-dialog', ...result });
    await writeFile(path.join(out, 'progress.json'), JSON.stringify(scans, null, 2));
    assert(
      await evaluate(
        `[...document.querySelectorAll('[role="dialog"]')].at(-1).contains(document.activeElement)`,
      ),
      'Opening dialog moves focus inside',
    );
    await evaluate(
      `(()=>{const root=[...document.querySelectorAll('[role="dialog"]')].at(-1);const controls=[...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')].filter(e=>e.getClientRects().length);controls.at(-1).focus()})()`,
    );
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', windowsVirtualKeyCode: 9 });
    assert(
      await evaluate(
        `[...document.querySelectorAll('[role="dialog"]')].at(-1).contains(document.activeElement)`,
      ),
      'Tab stays within dialog',
    );
    await cdp('Page.bringToFront');
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await until(`document.querySelectorAll('[role="dialog"]').length === ${parentDialogs}`);
    assert(
      await evaluate(`document.activeElement?.textContent.includes(${JSON.stringify(text)})`),
      'Closing dialog restores trigger focus',
    );
  }
  await writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        engine: 'axe-core',
        scope:
          'Eight fixture routes and four create dialogs, 1024x600, English/light; automated checks do not replace keyboard/screen-reader review',
        scans,
      },
      null,
      2,
    ),
  );
  const blockers = scans.flatMap((s) =>
    s.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact))
      .map((v) => ({ view: s.view, ...v })),
  );
  assert.deepEqual(blockers, [], 'Critical/serious accessibility findings');
  console.log(
    'Eight routes and four dialogs: no critical or serious automated accessibility findings',
  );
} finally {
  if (socket?.readyState === 1)
    socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  socket?.close();
  edge.kill();
}
