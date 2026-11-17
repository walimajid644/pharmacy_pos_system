<script setup lang="ts">
import { computed, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { useI18n } from '@/lib/i18n';
import type { PosProduct } from '@/lib/pos';
import type { Product } from '@/lib/types';

const props = defineProps<{
  results: PosProduct[];
  loading: boolean;
  error: boolean;
  unitPrice: (product: Product) => number;
}>();
const query = defineModel<string>('query', { required: true });
const highlightedIndex = defineModel<number>('highlightedIndex', { required: true });
const emit = defineEmits<{
  search: [];
  keydownSearch: [event: KeyboardEvent];
  select: [product: PosProduct, loose: boolean];
  close: [];
}>();
const { pick, formatCurrency, formatNumber } = useI18n();
const dialog = ref<HTMLElement | null>(null);
const resultsRegion = ref<HTMLElement | null>(null);
const searchField = ref<HTMLInputElement | null>(null);
const { height } = useElementSize(resultsRegion);
useDialogKeyboard(dialog, () => emit('close'));
function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    emit('keydownSearch', event);
    if (event.defaultPrevented) searchField.value?.focus({ preventScroll: true });
  } else if (
    event.key === 'Enter' &&
    !(event.target instanceof Element && event.target.closest('button'))
  ) {
    emit('keydownSearch', event);
  }
}
const pageSize = computed(() => Math.max(1, Math.floor((height.value - 34) / 44)));
const page = computed(() => Math.floor(highlightedIndex.value / pageSize.value));
const pageCount = computed(() => Math.max(1, Math.ceil(props.results.length / pageSize.value)));
const visibleResults = computed(() =>
  props.results
    .slice(page.value * pageSize.value, (page.value + 1) * pageSize.value)
    .map((product, offset) => ({ product, index: page.value * pageSize.value + offset })),
);
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
        <h2 id="pos-product-dialog-title">{{ pick('Search products', 'مصنوعات تلاش کریں') }}</h2>
        <span>{{ pick('Esc to close', 'بند کرنے کے لیے Esc') }}</span>
      </header>
      <div class="pos-search-dialog-query">
        <label for="pos-modal-product-search">{{
          pick('Name / generic / SKU / barcode', 'نام / عام نام / کوڈ / بارکوڈ')
        }}</label>
        <input
          ref="searchField"
          id="pos-modal-product-search"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="
            pick(
              'Search name, generic name, SKU or barcode…',
              'نام، عام نام، کوڈ یا بارکوڈ تلاش کریں…',
            )
          "
          aria-controls="pos-search-dialog-results"
          @input="emit('search')"
          :aria-activedescendant="
            results[highlightedIndex] ? `pos-search-product-${highlightedIndex}` : undefined
          "
        />
        <small>{{
          pick(
            '↑↓ choose · Enter selects pack · Shift+Enter selects loose units',
            '↑↓ منتخب کریں · Enter پیک · Shift+Enter کھلی اکائیاں',
          )
        }}</small>
        <p
          v-if="!loading && results[highlightedIndex] && !results[highlightedIndex]!.batches.length"
          class="pos-search-stock-warning"
          role="status"
        >
          {{
            pick(
              `No stock recorded for ${results[highlightedIndex]!.name.trim()}. You can add it; checkout will record negative stock.`,
              `${results[highlightedIndex]!.name.trim()} کا اسٹاک موجود نہیں۔ فروخت شامل کرنے پر اسٹاک منفی ہو جائے گا۔`,
            )
          }}
        </p>
      </div>
      <div
        ref="resultsRegion"
        id="pos-search-dialog-results"
        class="pos-search-dialog-results"
        :aria-busy="loading"
      >
        <p v-if="loading" role="status">
          {{ pick('Searching products…', 'مصنوعات تلاش ہو رہی ہیں…') }}
        </p>
        <p v-else-if="error" role="alert">
          {{ pick('Product search failed. Try again.', 'تلاش ناکام ہوئی۔ دوبارہ کوشش کریں۔') }}
        </p>
        <p v-else-if="!results.length" role="status">
          {{
            !query.trim()
              ? pick('No active medicines in inventory.', 'انوینٹری میں کوئی فعال دوا موجود نہیں۔')
              : pick('No matching products.', 'کوئی مماثل مصنوعات نہیں ملیں۔')
          }}
        </p>
        <table v-else>
          <thead>
            <tr>
              <th>{{ pick('Product', 'مصنوعات') }}</th>
              <th>SKU</th>
              <th>{{ pick('Stock', 'اسٹاک') }}</th>
              <th>{{ pick('Pack size', 'پیک سائز') }}</th>
              <th>{{ pick('Pack price', 'پیک قیمت') }}</th>
              <th>{{ pick('Select', 'منتخب کریں') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ product, index } in visibleResults"
              :key="product.id"
              :id="`pos-search-product-${index}`"
              :aria-selected="highlightedIndex === index"
              class="pos-product-row"
              :class="{ highlighted: highlightedIndex === index }"
              @click="emit('select', product, false)"
            >
              <td>
                <strong :title="product.name">{{ product.name }}</strong><small
                  :title="product.generic_name || ''"
                  >{{ product.generic_name }}</small
                >
              </td>
              <td>
                <bdi>{{ product.sku }}</bdi>
              </td>
              <td>
                {{
                  formatNumber(
                    product.batches.reduce((sum, batch) => sum + batch.quantity_in_stock, 0),
                  )
                }}
              </td>
              <td>{{ formatNumber(product.pack_size) }}</td>
              <td>
                <bdi>{{ formatCurrency(unitPrice(product) * product.pack_size) }}</bdi>
              </td>
              <td class="pos-search-add-actions">
                <button type="button" @click.stop="emit('select', product, false)">
                  {{ pick('Pack', 'پیک') }}
                </button>
                <button
                  v-if="product.sell_by_loose_unit"
                  type="button"
                  @click.stop="emit('select', product, true)"
                >
                  {{ pick('Loose', 'کھلی') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="pos-search-dialog-footer">
        <span
          >{{ formatNumber(results.length) }}
          {{
            query.trim()
              ? pick('matches', 'نتائج')
              : pick('medicines · A–Z · first 50', 'ادویات · حروف تہجی · پہلی 50')
          }}</span
        >
        <nav v-if="pageCount > 1" :aria-label="pick('Search result pages', 'تلاش کے صفحات')">
          <button
            type="button"
            :disabled="page === 0"
            @click="highlightedIndex = (page - 1) * pageSize"
          >
            ‹ {{ pick('Previous', 'پچھلا') }}
          </button>
          <span>{{ formatNumber(page + 1) }} / {{ formatNumber(pageCount) }}</span>
          <button
            type="button"
            :disabled="page + 1 >= pageCount"
            @click="highlightedIndex = (page + 1) * pageSize"
          >
            {{ pick('Next', 'اگلا') }} ›
          </button>
        </nav>
        <button type="button" @click="emit('close')">{{ pick('Close', 'بند کریں') }}</button>
      </footer>
    </section>
  </div>
</template>
