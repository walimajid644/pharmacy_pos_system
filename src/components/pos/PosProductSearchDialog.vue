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
const { height } = useElementSize(resultsRegion);
useDialogKeyboard(dialog, () => emit('close'));
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
  <div class="pos-search-overlay" @click.self="emit('close')">
    <section
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-product-dialog-title"
      tabindex="-1"
      class="pos-search-dialog"
      @keydown.stop
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
          id="pos-modal-product-search"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="
            pick('Type at least 2 characters to search…', 'تلاش کے لیے کم از کم 2 حروف لکھیں…')
          "
          aria-controls="pos-search-dialog-results"
          @input="emit('search')"
          @keydown="emit('keydownSearch', $event)"
        />
        <small>{{
          pick(
            '↑↓ choose · Enter adds pack · Shift+Enter adds loose units',
            '↑↓ منتخب کریں · Enter پیک · Shift+Enter کھلی اکائیاں',
          )
        }}</small>
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
            query.trim().length < 2
              ? pick(
                  'Enter a product name, generic name, SKU or barcode above.',
                  'اوپر مصنوعات کا نام، عام نام، کوڈ یا بارکوڈ لکھیں۔',
                )
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
              <th>{{ pick('Add to sale', 'فروخت میں شامل کریں') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ product, index } in visibleResults"
              :key="product.id"
              class="pos-product-row"
              :class="{ highlighted: highlightedIndex === index }"
              @click="highlightedIndex = index"
              @dblclick="emit('select', product, false)"
            >
              <td>
                <strong :title="product.name">{{ product.name }}</strong
                ><small :title="product.generic_name || ''">{{ product.generic_name }}</small>
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
        <span>{{ formatNumber(results.length) }} {{ pick('matches', 'نتائج') }}</span>
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
