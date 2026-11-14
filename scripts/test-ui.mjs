import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Own the fixture server: never silently run tests against another application.
const probe = net.createServer();
await new Promise((resolve, reject) => {
  probe.once('error', reject);
  probe.listen(1422, '127.0.0.1', resolve);
});
await new Promise((resolve) => probe.close(resolve));
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1422', '--strictPort'],
  { stdio: 'inherit', windowsHide: true },
);
let serverError;
server.on('error', (error) => {
  serverError = error;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error('Fixture server exited before readiness');
    try {
      const response = await fetch('http://127.0.0.1:1422/tests/ui/phase1.html', {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {
      /* Server is still starting. */
    }
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Fixture server did not become ready');
  const suites = [
    'phase1',
    'phase2',
    'phase3',
    'release_gate',
    'single_store_phase2',
    'single_store_phase3',
    'accessibility',
  ];
  const requested = process.argv[2];
  if (requested && !suites.includes(requested)) throw new Error('Unknown UI suite: ' + requested);
  for (const name of suites.filter((name) => !requested || name === requested)) {
    const result = spawnSync(process.execPath, [`tests/${name}_ui_smoke.mjs`], {
      stdio: 'inherit',
      windowsHide: true,
      timeout: 300000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} UI checks failed (${result.status})`);
  }
} finally {
  server.kill();
}
