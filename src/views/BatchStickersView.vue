<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { executeQuery } from '@/lib/database';
import { encodeCode39 } from '@/lib/code39';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';

type Batch = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  batch_number: string;
  expiry_date: string;
  quantity_in_stock: number;
  unit_price: number;
  pack_size: number;
};
const { pick, formatCurrency } = useI18n();
const query = ref(''),
  batches = ref<Batch[]>([]),
  selected = ref<Batch | null>(null),
  loading = ref(false),
  error = ref('');
const copies = ref(1),
  priceMode = ref('unit'),
  printing = ref(false);
const barcode = computed(() => encodeCode39(selected.value?.barcode || ''));
const price = computed(() =>
  selected.value
    ? formatCurrency(
        selected.value.unit_price * (priceMode.value === 'pack' ? selected.value.pack_size : 1),
      )
    : '',
);
let version = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  cleanupPrint: (() => void) | undefined;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = '';
  selected.value = null;
  try {
    const term =
      '%' +
      query.value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') +
      '%';
    const rows = await executeQuery<Batch>(
      `SELECT b.id,p.name,p.sku,p.barcode,b.batch_number,b.expiry_date,b.quantity_in_stock,p.unit_price,p.pack_size FROM product_batches b JOIN products p ON p.id=b.product_id WHERE p.deleted_at IS NULL AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\' OR b.batch_number LIKE ? ESCAPE '\\') ORDER BY p.name COLLATE NOCASE,b.expiry_date,b.id LIMIT 100`,
      [term, term, term, term],
    );
    if (current === version) batches.value = rows;
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(query, () => {
  clearTimeout(timer);
  version++;
  selected.value = null;
  loading.value = true;
  timer = setTimeout(() => void load(), 200);
});
async function print() {
  if (
    printing.value ||
    !selected.value ||
    !Number.isInteger(copies.value) ||
    copies.value < 1 ||
    copies.value > 100
  )
    return;
  printing.value = true;
  await nextTick();
  document.body.classList.add('printing-batch-stickers');
  const style = document.createElement('style');
  style.textContent = '@page {size:75mm 35mm;margin:0;}';
  document.head.appendChild(style);
  const clean = () => {
    document.body.classList.remove('printing-batch-stickers');
    style.remove();
    printing.value = false;
    window.removeEventListener('afterprint', clean);
    cleanupPrint = undefined;
  };
  cleanupPrint = clean;
  window.addEventListener('afterprint', clean, { once: true });
  try {
    window.print();
  } catch {
    clean();
    error.value = pick('Could not open print dialog.', 'پرنٹ ڈائیلاگ نہیں کھل سکا۔');
  }
}
onMounted(load);
onBeforeUnmount(() => {
  version++;
  clearTimeout(timer);
  cleanupPrint?.();
});
</script>
<template>
  <main class="tool-terminal compact-workspace batch-stickers">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Print Batch Stickers', 'بیچ کے اسٹیکرز') }}</h1>
        <p>
          {{
            pick(
              'Select a saved batch. 75 × 35 mm labels.',
              'محفوظ بیچ منتخب کریں۔ 75 × 35 ملی میٹر لیبل۔',
            )
          }}
        </p>
      </div>
      <button :disabled="loading || printing" @click="load">
        {{ pick('Refresh', 'تازہ کریں') }}
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="stickers-body">
      <section class="stickers-list">
        <label
          >{{ pick('Item, barcode or batch number', 'آئٹم، بارکوڈ یا بیچ نمبر')
          }}<input v-model="query" type="search" :disabled="printing" /></label
        ><small>{{
          pick(
            'Up to 100 matches. Narrow your search to find another batch.',
            'زیادہ سے زیادہ 100 نتائج۔ تلاش کو محدود کریں۔',
          )
        }}</small>
        <CompactPages :items="batches" :row-height="44" :header-height="32" v-slot="{ rows }"
          ><table>
            <thead>
              <tr>
                <th>{{ pick('Item', 'آئٹم') }}</th>
                <th>{{ pick('Batch', 'بیچ') }}</th>
                <th>{{ pick('Expiry', 'میعاد') }}</th>
                <th>{{ pick('Stock', 'اسٹاک') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item } in rows" :key="item.id" :aria-selected="selected?.id === item.id">
                <td>
                  {{ item.name }}<small>{{ item.sku }}</small>
                </td>
                <td>{{ item.batch_number }}</td>
                <td>{{ item.expiry_date.slice(0, 10) }}</td>
                <td>{{ item.quantity_in_stock }}</td>
                <td>
                  <button :disabled="printing" @click="selected = item">
                    {{ pick('Select', 'منتخب کریں') }}
                  </button>
                </td>
              </tr>
              <tr v-if="!batches.length">
                <td colspan="5">
                  {{
                    loading
                      ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                      : pick('No batches found.', 'کوئی بیچ نہیں ملا۔')
                  }}
                </td>
              </tr>
            </tbody>
          </table></CompactPages
        >
      </section>
      <aside class="stickers-form">
        <h2>{{ pick('Label preview', 'لیبل کا نمونہ') }}</h2>
        <div class="stickers-options">
          <label
            >{{ pick('Copies', 'تعداد')
            }}<input
              v-model.number="copies"
              type="number"
              min="1"
              max="100"
              step="1"
              :disabled="printing" /></label
          ><label
            >{{ pick('Price', 'قیمت')
            }}<select v-model="priceMode" :disabled="printing">
              <option value="unit">{{ pick('Per unit', 'فی یونٹ') }}</option>
              <option value="pack">{{ pick('Per pack', 'فی پیک') }}</option>
              <option value="none">{{ pick('Hide price', 'قیمت چھپائیں') }}</option>
            </select></label
          >
        </div>
        <div v-if="selected" class="batch-label-preview">
          <strong>{{ selected.name }}</strong>
          <div>{{ pick('Batch', 'بیچ') }}: {{ selected.batch_number }}</div>
          <div>{{ pick('Expiry', 'میعاد') }}: {{ selected.expiry_date.slice(0, 10) }}</div>
          <svg
            v-if="barcode"
            :viewBox="`0 0 ${barcode.width} 30`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="`Product barcode ${selected.barcode}`"
          >
            <rect
              v-for="(bar, index) in barcode.bars"
              :key="index"
              :x="bar.x"
              y="0"
              :width="bar.width"
              height="30"
              fill="currentColor"
            /></svg
          ><small>{{ selected.barcode || selected.sku }}</small
          ><b v-if="priceMode !== 'none'"
            >{{ price }} /
            {{ priceMode === 'pack' ? pick('pack', 'پیک') : pick('unit', 'یونٹ') }}</b
          >
        </div>
        <p v-else>{{ pick('Choose a batch from the list.', 'فہرست سے بیچ منتخب کریں۔') }}</p>
        <small v-if="selected && !barcode">{{
          pick('No supported Code 39 barcode. Item code prints as text.', 'کوڈ بطور متن پرنٹ ہوگا۔')
        }}</small>
        <p>
          {{
            pick(
              'The barcode identifies the product. Batch and expiry print as text.',
              'بارکوڈ آئٹم کا ہے۔ بیچ اور میعاد بطور متن ہیں۔',
            )
          }}
        </p>
        <button
          :disabled="
            !selected || printing || !Number.isInteger(copies) || copies < 1 || copies > 100
          "
          @click="print"
        >
          {{ pick('Print stickers', 'اسٹیکرز پرنٹ کریں') }}
        </button>
      </aside>
    </div>
  </main>
  <Teleport to="body"
    ><div v-if="printing && selected" class="batch-sticker-print">
      <section v-for="copy in copies" :key="copy" class="batch-sticker-label">
        <strong>{{ selected.name }}</strong>
        <div>{{ uiLabel('Batch:') }} {{ selected.batch_number }}</div>
        <div>{{ uiLabel('Expiry:') }} {{ selected.expiry_date.slice(0, 10) }}</div>
        <svg v-if="barcode" :viewBox="`0 0 ${barcode.width} 30`" preserveAspectRatio="none">
          <rect
            v-for="(bar, index) in barcode.bars"
            :key="index"
            :x="bar.x"
            y="0"
            :width="bar.width"
            height="30"
            fill="black"
          /></svg
        ><small>{{ selected.barcode || selected.sku }}</small
        ><b v-if="priceMode !== 'none'"
          >{{ price }} / {{ priceMode === 'pack' ? 'pack' : 'unit' }}</b
        >
      </section>
    </div></Teleport
  >
</template>
<style scoped>
.batch-stickers {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 8px;
}
.stickers-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
}
.stickers-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.batch-stickers label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
}
.batch-stickers input,
.batch-stickers select {
  min-width: 0;
  width: 100%;
  padding: 5px;
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-primary);
  border-radius: 4px;
}
.batch-stickers button {
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.stickers-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.stickers-options {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px;
}
.batch-stickers table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}
.batch-stickers td,
.batch-stickers th {
  text-align: start;
  padding: 5px;
  border-bottom: 1px solid var(--border);
}
.batch-stickers small {
  display: block;
  font-size: 11px;
}
.batch-label-preview {
  border: 1px solid var(--border);
  padding: 10px;
  display: flex;
  flex-direction: column;
  text-align: center;
  gap: 4px;
  font-size: 12px;
}
.batch-label-preview svg {
  height: 40px;
  width: 100%;
}
.batch-stickers [aria-selected='true'] {
  background: var(--surface-secondary);
}
.stickers-form p {
  font-size: 11px;
}
.stickers-form > button {
  background: var(--color-primary-600);
  color: var(--text-inverse);
}
</style>
<style>
.batch-sticker-print {
  display: none;
}
@media print {
  body.printing-batch-stickers > *:not(.batch-sticker-print) {
    display: none !important;
  }
  body > .batch-sticker-print {
    display: block !important;
    background: #fff;
    color: #000;
  }
  .batch-sticker-label {
    direction: ltr;
    width: 75mm;
    height: 35mm;
    padding: 2mm;
    box-sizing: border-box;
    overflow: hidden;
    break-after: page;
    text-align: center;
    font:
      8pt Arial,
      sans-serif;
  }
  .batch-sticker-label:last-child {
    break-after: auto;
  }
  .batch-sticker-label strong {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    height: 4mm;
  }
  .batch-sticker-label svg {
    display: block;
    width: 71mm;
    height: 9mm;
    margin: 1mm 0;
    shape-rendering: crispEdges;
  }
  .batch-sticker-label small,
  .batch-sticker-label b {
    display: block;
    font-size: 7pt;
  }
}
</style>
