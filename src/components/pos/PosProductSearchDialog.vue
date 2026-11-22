<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import CompactPages from '@/components/ui/CompactPages.vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { useI18n } from '@/lib/i18n';
import type { PosProduct } from '@/lib/pos';
import type { Product } from '@/lib/types';

defineProps<{
  results: PosProduct[];
  loading: boolean;
  error: boolean;
  unitPrice: (product: Product) => number;
}>();
const query = defineModel<string>('query', { required: true });
const matchingWords = defineModel<boolean>('matchingWords', { required: true });
const generic = defineModel<boolean>('generic', { required: true });
const highlightedIndex = defineModel<number>('highlightedIndex', { required: true });
const emit = defineEmits<{
  search: [];
  keydownSearch: [event: KeyboardEvent];
  select: [product: PosProduct, loose: boolean];
  close: [];
}>();
const { pick, formatCurrency, formatNumber } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const searchField = ref<HTMLInputElement | null>(null);
useDialogKeyboard(dialog, () => emit('close'));
// The bottom search field is the initial keyboard target, as in the desktop reference.
watch(
  dialog,
  async (element) => {
    if (!element) return;
    await nextTick();
    searchField.value?.focus({ preventScroll: true });
  },
  { flush: 'post' },
);
function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    emit('keydownSearch', event);
    if (event.defaultPrevented) searchField.value?.focus({ preventScroll: true });
  } else if (
    event.key === 'Enter' &&
    !(event.target instanceof Element && event.target.closest('button, input[type="checkbox"]'))
  ) {
    emit('keydownSearch', event);
  }
}
</script>

<template>
  <div class="pos-search-overlay" @pointerdown.self.prevent>
    <section
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-product-dialog-title"
      tabindex="-1"
      class="pos-search-dialog"
      @keydown.stop="onDialogKeydown"
    >
      <header class="pos-search-dialog-header">
        <h2 id="pos-product-dialog-title">{{ pick('Search', 'تلاش') }}</h2>
        <button
          type="button"
          class="pos-search-close"
          :aria-label="pick('Close search', 'تلاش بند کریں')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div id="pos-search-dialog-results" class="pos-search-dialog-results" :aria-busy="loading">
        <CompactPages
          :items="results"
          :row-height="23"
          :header-height="24"
          :active-index="highlightedIndex"
          v-slot="{ rows }"
        >
          <table role="grid" :aria-label="pick('Medicines', 'ادویات')">
            <colgroup>
              <col class="pos-search-code-col" />
              <col class="pos-search-name-col" />
              <col class="pos-search-pack-col" />
              <col class="pos-search-price-col" />
              <col class="pos-search-stock-col" />
              <col class="pos-search-brand-col" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{{ pick('Code', 'کوڈ') }}</th>
                <th scope="col">{{ pick('Item Name', 'آئٹم کا نام') }}</th>
                <th scope="col">{{ pick('Pack Type', 'پیک قسم') }}</th>
                <th scope="col">{{ pick('Sale Price', 'فروخت قیمت') }}</th>
                <th scope="col">{{ pick('Stock', 'اسٹاک') }}</th>
                <th scope="col">{{ pick('Brand', 'برانڈ') }}</th>
              </tr>
            </thead>
            <tbody v-if="!loading && !error">
              <tr
                v-for="{ item: product, index } in rows"
                :key="product.id"
                :id="`pos-search-product-${index}`"
                :aria-selected="highlightedIndex === index"
                class="pos-product-row"
                :class="{ highlighted: highlightedIndex === index }"
                @click="emit('select', product, false)"
              >
                <td :title="product.sku">
                  <bdi>{{ product.sku }}</bdi>
                </td>
                <td
                  :title="
                    generic && product.generic_name
                      ? `${product.name} · ${product.generic_name}`
                      : product.name
                  "
                >
                  {{ product.name }}
                </td>
                <td>
                  <bdi>{{ formatNumber(product.pack_size) }}s</bdi>
                </td>
                <td>
                  <bdi>{{ formatCurrency(unitPrice(product) * product.pack_size) }}</bdi>
                </td>
                <td :class="{ 'pos-stock-negative': (product.recordedStock ?? 0) < 0 }">
                  <bdi>{{
                    formatNumber(
                      product.recordedStock ??
                        product.batches.reduce((sum, batch) => sum + batch.quantity_in_stock, 0),
                    )
                  }}</bdi>
                </td>
                <td :title="product.manufacturer_name || ''">
                  {{ product.manufacturer_name || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
        <p v-if="loading" role="status">
          {{ pick('Searching products…', 'مصنوعات تلاش ہو رہی ہیں…') }}
        </p>
        <p v-else-if="error" role="alert">
          {{ pick('Product search failed. Try again.', 'تلاش ناکام ہوئی۔ دوبارہ کوشش کریں۔') }}
        </p>
        <p v-else-if="!results.length" role="status">
          {{
            query.trim()
              ? pick('No matching products.', 'کوئی مماثل مصنوعات نہیں ملیں۔')
              : pick('No active medicines in inventory.', 'انوینٹری میں کوئی فعال دوا موجود نہیں۔')
          }}
        </p>
      </div>
      <footer class="pos-search-dialog-query">
        <div class="pos-search-bottom-row">
          <label class="sr-only" for="pos-modal-product-search">{{
            pick('Search medicines by name, code or barcode', 'نام، کوڈ یا بارکوڈ سے دوا تلاش کریں')
          }}</label>
          <input
            ref="searchField"
            id="pos-modal-product-search"
            v-model="query"
            type="search"
            autocomplete="off"
            aria-controls="pos-search-dialog-results"
            :aria-activedescendant="
              results[highlightedIndex] ? `pos-search-product-${highlightedIndex}` : undefined
            "
            @input="emit('search')"
          />
          <div class="pos-search-options">
            <label
              ><input
                id="pos-search-matching-words"
                v-model="matchingWords"
                type="checkbox"
                @change="emit('search')"
              />{{ pick('Search With Matching Words', 'الفاظ کی مطابقت سے تلاش') }}</label
            >
            <label
              ><input
                id="pos-search-generic"
                v-model="generic"
                type="checkbox"
                @change="emit('search')"
              />{{ pick('Formula / Generic Name', 'فارمولا / عام نام') }}</label
            >
          </div>
        </div>
        <div class="pos-search-bottom-status">
          <small>{{
            pick(
              '↑↓ choose · Enter selects pack · Shift+Enter selects loose units · Esc closes',
              '↑↓ منتخب کریں · Enter پیک · Shift+Enter کھلی اکائیاں · Esc بند کریں',
            )
          }}</small>
          <span
            >{{ formatNumber(results.length) }}
            {{ pick('results · first 50', 'نتائج · پہلے 50') }}</span
          >
          <button
            v-if="results[highlightedIndex]?.sell_by_loose_unit && !loading && !error"
            type="button"
            @click="emit('select', results[highlightedIndex]!, true)"
          >
            {{ pick('Select loose', 'کھلی اکائیاں منتخب کریں') }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
