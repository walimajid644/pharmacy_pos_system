import { spawnSync } from 'node:child_process';

const cases = [
  ...['business_day', 'pos_cart', 'saved_sale', 'catalog_file'].map((name) => [
    process.execPath,
    ['--experimental-strip-types', `tests/${name}_smoke.mjs`],
  ]),
  ...['commercial_operations_smoke', 'test_inventory_schema'].map((name) => [
    'python',
    [`tests/${name}.py`],
  ]),
];
for (const [command, args] of cases) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
