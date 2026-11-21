import assert from 'node:assert/strict';
import {
  createProductForm,
  validateProductDetails,
  productDetailValues,
} from '../src/lib/productForm.ts';
import { diagnosticReason, diagnosticOperation } from '../src/lib/diagnosticContext.ts';

const form = {
  ...createProductForm(),
  shelf_location: ' Shelf A ',
  remarks: ' Keep chilled ',
  uom: 'bottle',
  pack_type: ' 100 ml ',
  ext_disc_percent: 7.25,
  stm_level: 12,
  maintain_batch: true,
  fridge_item: true,
  registration_date: '2026-11-21',
};
assert.equal(validateProductDetails(form), null);
assert.deepEqual(productDetailValues(form), [
  'Shelf A',
  'Keep chilled',
  'bottle',
  '100 ml',
  7.25,
  12,
  1,
  1,
  '2026-11-21',
]);
for (const changes of [
  { ext_disc_percent: 101 },
  { ext_disc_percent: NaN },
  { stm_level: -1 },
  { stm_level: 0.5 },
  { uom: 'other' },
  { registration_date: '2026-02-30' },
  { registration_date: '2026-13-01' },
  { shelf_location: 'x'.repeat(81) },
  { remarks: 'x'.repeat(1001) },
]) {
  assert(validateProductDetails({ ...form, ...changes }));
}
assert.equal(validateProductDetails({ ...form, registration_date: '2024-02-29' }), null);
assert.deepEqual(productDetailValues(createProductForm()), ['', '', 'box', '', 0, 0, 0, 0, null]);
for (const [error, reason] of [
  [new TypeError('private patient details'), 'type_error'],
  ['UNIQUE constraint failed: products.sku', 'constraint_violation'],
  ['no such column: shelf_location', 'schema_mismatch'],
  ['database is locked', 'database_unavailable'],
  ['This write is not permitted', 'permission_denied'],
  ['Session expired', 'session_expired'],
  ['ResizeObserver loop limit exceeded', 'resize_observer'],
  [new Error('private details'), 'unknown'],
])
  assert.equal(diagnosticReason(error), reason);
assert.equal(
  diagnosticReason({
    get message() {
      throw new Error('getter failed');
    },
  }),
  'unknown',
);
assert.equal(diagnosticOperation('watcher callback'), 'frontend_watch');
assert.equal(diagnosticOperation('native event handler'), 'frontend_event');
assert.equal(diagnosticOperation('render function'), 'frontend_render');
console.log(
  'Product detail validation/serialization and redacted diagnostic classification passed',
);
