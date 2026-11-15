<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import { bindTemplateRef } from '@/lib/templateRefs';

import { useCatalogImport } from '@/composables/useCatalogImport';

const {
  pick,
  router,
  sheets,
  sheet,
  filename,
  create,
  preview,
  result,
  error,
  busy,
  page,
  confirm,
  dialog,
  ack,
  onlyErrors,
  shown,
  paged,
  template,
  fileChanged,
  validate,
  save,
} = useCatalogImport();
const binddialog = bindTemplateRef(dialog);
</script>
<template>
  <div class="tool-terminal compact-workspace documents-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Medicine Catalog Import', 'ادویات کی فہرست درآمد کریں') }}</h1>
        <p>
          {{
            pick(
              'Local file → validate → review → one atomic import',
              'مقامی فائل ← جانچ ← جائزہ ← مکمل درآمد',
            )
          }}
        </p>
      </div>
      <div>
        <button @click="template">{{ pick('CSV template', 'CSV نمونہ') }}</button>
        <button @click="router.push('/products')">{{ pick('Products', 'مصنوعات') }}</button>
      </div>
    </header>
    <div class="commercial-filters">
      <label
        >{{ pick('CSV / Excel file', 'CSV / Excel فائل')
        }}<input
          class="catalog-file"
          type="file"
          accept=".csv,.xlsx"
          :disabled="busy"
          @change="fileChanged" /></label
      ><label v-if="sheets.length > 1"
        >{{ pick('Worksheet', 'ورک شیٹ')
        }}<select v-model="sheet" :disabled="busy">
          <option v-for="(s, i) in sheets" :key="s.sheet" :value="i">{{ s.sheet }}</option>
        </select></label
      ><label class="commercial-check"
        ><input v-model="create" type="checkbox" :disabled="busy" />
        {{
          pick(
            'Allow creating missing categories / manufacturers',
            'غائب اقسام / کمپنیوں کو بنانے کی اجازت',
          )
        }}</label
      ><button
        class="catalog-validate bg-primary"
        :disabled="busy || !sheets.length"
        @click="validate"
      >
        {{ pick('Validate preview', 'پیش نظارہ جانچیں') }}
      </button>
    </div>
    <p class="commercial-hint">
      {{
        pick(
          'UTF-8 CSV or .xlsx; up to 5 MB / 5000 rows. Use template headers. SKU and barcode must be Excel Text to retain leading zeros; paste values, not formulas. No file is uploaded.',
          'UTF-8 CSV یا .xlsx؛ زیادہ سے زیادہ ۵ MB / ۵۰۰۰ سطریں۔ نمونے کے عنوان استعمال کریں۔ ابتدائی صفر محفوظ رکھنے کے لیے SKU اور بار کوڈ Excel Text ہوں؛ فارمولے نہیں، اصل قدریں چسپاں کریں۔ فائل کہیں اپ لوڈ نہیں ہوتی۔',
        )
      }}
    </p>
    <p class="commercial-hint">
      {{
        pick(
          'Creates new SKUs only. Existing/archived SKUs and conflicting barcodes are rejected. For multiple opening batches, repeat identical product details with distinct batch numbers. Opening quantities are base units, not packs; they create audited opening stock, not supplier bills or payments. Leave all batch columns blank for a stock-free catalog.',
          'صرف نئے SKU بنائے جاتے ہیں۔ موجود یا محفوظ شدہ SKU اور متصادم بار کوڈ مسترد ہوں گے۔ متعدد ابتدائی بیچ کے لیے یکساں مصنوعات کی تفصیل الگ بیچ نمبر کے ساتھ دہرائیں۔ ابتدائی تعداد بنیادی اکائیوں میں ہے، پیک میں نہیں؛ یہ قابلِ پڑتال ابتدائی اسٹاک بناتی ہے، سپلائر بل یا ادائیگی نہیں۔ صرف فہرست کے لیے بیچ کے تمام کالم خالی چھوڑیں۔',
        )
      }}
    </p>
    <p v-if="busy" role="status" class="commercial-hint">{{ pick('Working…', 'کام جاری ہے…') }}</p>
    <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
    <p v-if="result" class="commercial-hint" role="status">
      {{ pick('Import saved', 'درآمد محفوظ') }}: {{ result.products }}
      {{ pick('products', 'مصنوعات') }} · {{ result.batches }}
      {{ pick('opening batches', 'ابتدائی بیچ') }} · {{ result.operationId }}
    </p>
    <div v-if="preview" class="commercial-filters">
      <strong>{{ filename }}</strong><label class="commercial-check"
        ><input v-model="onlyErrors" type="checkbox" @change="page = 0" />
        {{ pick('Errors only', 'صرف غلطیاں') }}</label
      ><button
        class="catalog-review bg-primary"
        :disabled="!preview.valid || busy"
        @click="
          ack = false;
          confirm = true;
        "
      >
        {{ pick('Review import', 'درآمد کا جائزہ') }}
      </button>
    </div>
    <div class="paged-table-host commercial-table-scroll">
      <CompactPages
        v-if="preview"
        :items="paged"
        :row-height="64"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table>
          <thead>
            <tr>
              <th>{{ pick('Row', 'سطر') }}</th>
              <th>SKU</th>
              <th>{{ pick('Name', 'نام') }}</th>
              <th>{{ pick('Validation / warnings', 'جانچ / انتباہ') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item: r } in pageRows" :key="r.row">
              <td>{{ r.row }}</td>
              <td>{{ r.sku }}</td>
              <td>{{ r.name }}</td>
              <td>
                <span v-if="!r.errors.length">✓ {{ pick('Ready', 'تیار') }}</span
                ><small v-for="e in r.errors" :key="e" class="commercial-error">{{ e }}</small
                ><small v-for="w in r.warnings" :key="w">⚠ {{ w }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
      <p v-else class="commercial-empty">
        {{
          pick(
            'Select a local file and validate before any changes.',
            'تبدیلی سے پہلے مقامی فائل منتخب کر کے جانچ کریں۔',
          )
        }}
      </p>
    </div>
    <footer class="tool-summary">
      <div>
        <small>{{ pick('Products / batches', 'مصنوعات / بیچ') }}</small><strong
          >{{ preview?.products || 0 }} / {{ preview?.batches || 0 }}</strong
        >
      </div>
      <div>
        <small>{{ pick('New categories / manufacturers', 'نئی اقسام / کمپنیاں') }}</small><strong
          >{{ preview?.newCategories || 0 }} / {{ preview?.newManufacturers || 0 }}</strong
        >
      </div>
      <button :disabled="page === 0" @click="page--">{{ pick('Previous', 'پچھلا') }}</button><button
        :disabled="(page + 1) * 100 >= shown.length"
        @click="page++"
      >
        {{ pick('Next', 'اگلا') }}
      </button>
    </footer>
    <div
      v-if="confirm && preview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <form
        :ref="binddialog"
        class="commercial-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="pick('Confirm catalog import', 'فہرست کی درآمد کی تصدیق')"
        @submit.prevent="save"
      >
        <h2>{{ pick('Confirm reviewed catalog', 'جانچی گئی فہرست کی تصدیق') }}</h2>
        <p>
          {{ preview.products }} {{ pick('new products', 'نئی مصنوعات') }} · {{ preview.batches }}
          {{ pick('opening batches', 'ابتدائی بیچ') }}
        </p>
        <p>
          {{
            pick(
              'The complete import is revalidated and saved together. A failure saves nothing. Retrying the same request cannot duplicate stock. Existing products are not overwritten.',
              'مکمل درآمد دوبارہ جانچ کر ایک ساتھ محفوظ ہوتی ہے۔ ناکامی پر کچھ محفوظ نہیں ہوگا۔ اسی درخواست کو دہرانے سے اسٹاک دوگنا نہیں ہوگا۔ موجود مصنوعات تبدیل نہیں ہوتیں۔',
            )
          }}
        </p>
        <label
          ><input v-model="ack" type="checkbox" required />
          {{
            pick(
              'I reviewed quantities, unit prices, dates and lookup names.',
              'میں نے تعداد، اکائی قیمت، تاریخوں اور ناموں کا جائزہ لیا ہے۔',
            )
          }}</label
        >
        <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
        <div>
          <button type="button" :disabled="busy" @click="confirm = false">
            {{ pick('Cancel', 'منسوخ') }}
          </button>
          <button class="catalog-commit bg-primary" :disabled="busy || !ack">
            {{ pick('Import reviewed rows', 'جانچی گئی سطریں درآمد کریں') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
