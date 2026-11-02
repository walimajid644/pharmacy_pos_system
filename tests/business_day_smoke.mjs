import assert from 'node:assert/strict'
import { localDateKey, localDayBounds } from '../src/lib/businessDay.ts'

process.env.TZ = 'Asia/Karachi'

const lateUtcSale = new Date('2026-10-25T19:30:00.000Z')
assert.equal(localDateKey(lateUtcSale), '2026-10-26')
assert.deepEqual(localDayBounds('2026-10-26'), [
  '2026-10-25T19:00:00.000Z',
  '2026-10-26T19:00:00.000Z',
])
assert.throws(() => localDayBounds('2026-02-30'))
console.log('Local business-day boundaries passed for Asia/Karachi')
