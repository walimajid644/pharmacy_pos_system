<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import type { usePosTerminal } from '@/composables/usePosTerminal';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePosTerminal>;
const props = defineProps<{
  t: ViewValue<State['t']>;
  pick: ViewValue<State['pick']>;
  formatNumber: ViewValue<State['formatNumber']>;
  cartStore: ViewValue<State['cartStore']>;
  showCost: ViewValue<State['showCost']>;
  lineGross: ViewValue<State['lineGross']>;
  lineDiscount: ViewValue<State['lineDiscount']>;
  lineMargin: ViewValue<State['lineMargin']>;
  removeFromCart: ViewValue<State['removeFromCart']>;
  updateQuantities: ViewValue<State['updateQuantities']>;
  onLineDiscountAmountChange: ViewValue<State['onLineDiscountAmountChange']>;
  onLineDiscountChange: ViewValue<State['onLineDiscountChange']>;
  getBatchWarning: ViewValue<State['getBatchWarning']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  formatDate: ViewValue<State['formatDate']>;
}>();
const tableRegion = ref<HTMLElement | null>(null);
const { height } = useElementSize(tableRegion);
const page = ref(0);
const pageSize = computed(() => Math.max(1, Math.floor((height.value - 56) / 50)));
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.cartStore.items.length / pageSize.value)),
);
const visibleItems = computed(() =>
  props.cartStore.items
    .map((item, index) => ({ item, index }))
    .slice(page.value * pageSize.value, (page.value + 1) * pageSize.value),
);
watch(
  () => props.cartStore.items.length,
  (count, previous) => {
    page.value = count > previous ? pageCount.value - 1 : Math.min(page.value, pageCount.value - 1);
  },
);
watch(pageCount, () => {
  page.value = Math.min(page.value, pageCount.value - 1);
});
</script>

<template>
  <div
    ref="tableRegion"
    class="pos-table-scroll"
    tabindex="0"
    role="region"
    :aria-label="pick('Sale items', 'فروخت کی اشیاء')"
  >
    <table class="pos-lines">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">{{ pick('Description', 'تفصیل') }}</th>
          <th scope="col">{{ pick('Batch / Exp', 'بیچ / میعاد') }}</th>
          <th scope="col">{{ t('quantity') }}</th>
          <th
            scope="col"
            :title="
              pick(
                'Free packs or loose units; deducted from stock',
                'مفت پیک یا کھلی اکائیاں؛ اسٹاک سے کم ہوں گی',
              )
            "
          >
            {{ pick('Bonus', 'بونس') }}
          </th>
          <th scope="col">{{ t('unit_price') }}</th>
          <th v-if="showCost" scope="col">{{ pick('Cost', 'لاگت') }}</th>
          <th
            v-if="showCost"
            scope="col"
            :title="
              pick(
                'Line margin after free stock and line discount, before invoice discount and tax',
                'بونس اور آئٹم رعایت کے بعد منافع؛ انوائس رعایت اور ٹیکس سے پہلے',
              )
            "
          >
            {{ pick('Margin %', 'منافع %') }}
          </th>
          <th scope="col">{{ pick('Disc %', 'رعایت %') }}</th>
          <th scope="col">{{ pick('Disc Rs', 'رعایت روپے') }}</th>
          <th scope="col">{{ t('total') }}</th>
          <th scope="col">
            <span class="sr-only">{{ pick('Remove', 'ہٹائیں') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="{ item, index } in visibleItems" :key="index">
          <td class="pos-line-number">{{ formatNumber(index + 1) }}</td>
          <td class="pos-line-description">
            <strong>{{ item.product.name }}</strong>
            <div class="pos-line-badges">
              <span class="pos-type-pill">{{
                item.isLooseSale
                  ? pick('Loose unit', 'کھلی اکائی')
                  : `${pick('Pack', 'پیک')} · ${formatNumber(item.product.pack_size)} ${pick('units', 'اکائیاں')}`
              }}</span><span v-if="item.confirmBreak" class="pos-break-pill">{{
                pick('Strip opening confirmed', 'پٹی کھولنے کی تصدیق')
              }}</span>
            </div>
          </td>
          <td>
            <bdi class="pos-batch-number">{{ item.batch.batch_number }}</bdi><small
              class="pos-expiry-date"
              :class="{ warning: !!getBatchWarning(item.batch.expiry_date) }"
              >{{ formatDate(item.batch.expiry_date)
              }}<span v-if="getBatchWarning(item.batch.expiry_date)">
                · {{ getBatchWarning(item.batch.expiry_date) }}</span
              ></small
            >
          </td>
          <td>
            <input
              type="number"
              :value="item.quantity"
              @change="updateQuantities(index, $event)"
              class="pos-discount-input"
              min="1"
              step="1"
              :aria-label="pick('Quantity', 'تعداد')"
            />
          </td>
          <td>
            <input
              type="number"
              :value="item.bonusQuantity"
              @change="updateQuantities(index, $event, true)"
              class="pos-discount-input"
              min="0"
              step="1"
              :aria-label="pick('Free quantity', 'مفت تعداد')"
            />
          </td>
          <td class="pos-money">
            <bdi>{{
              formatCurrency(
                cartStore.unitPrice(item.product) * (item.isLooseSale ? 1 : item.product.pack_size),
              )
            }}</bdi>
          </td>
          <td v-if="showCost" class="pos-money">
            <bdi>{{
              formatCurrency(
                item.batch.cost_price_at_batch * (item.isLooseSale ? 1 : item.product.pack_size),
              )
            }}</bdi>
          </td>
          <td
            v-if="showCost"
            class="pos-money"
            :class="{ 'pos-negative': (lineMargin(item) ?? 0) < 0 }"
          >
            {{ lineMargin(item) == null ? '—' : `${lineMargin(item)!.toFixed(1)}%` }}
          </td>
          <td>
            <input
              class="pos-discount-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              :value="item.discount"
              :aria-label="pick('Line discount percent', 'آئٹم کی رعایت فیصد')"
              @change="onLineDiscountChange(index, $event)"
            />
          </td>
          <td>
            <input
              class="pos-discount-input"
              type="number"
              min="0"
              :max="lineGross(item)"
              step="0.01"
              :value="lineDiscount(item).toFixed(2)"
              :aria-label="pick('Line discount in rupees', 'آئٹم کی رعایت روپے میں')"
              @change="onLineDiscountAmountChange(index, $event)"
            />
          </td>
          <td class="pos-money pos-line-total">
            <bdi>{{ formatCurrency(cartStore.lineTotal(item)) }}</bdi>
          </td>
          <td>
            <Button
              variant="destructive"
              size="sm"
              class="pos-remove"
              :aria-label="pick('Remove item', 'آئٹم ہٹائیں')"
              @click="removeFromCart(index)"
              >×</Button
            >
          </td>
        </tr>
        <tr v-if="!cartStore.items.length">
          <td :colspan="showCost ? 12 : 10" class="pos-empty">
            <span aria-hidden="true">▤</span
            ><strong>{{ pick('No items in this sale', 'اس فروخت میں کوئی آئٹم نہیں') }}</strong
            ><small>{{
              pick(
                'Scan a barcode or search for a product above.',
                'اوپر بارکوڈ اسکین کریں یا مصنوعات تلاش کریں۔',
              )
            }}</small>
          </td>
        </tr>
      </tbody>
    </table>
    <nav
      v-if="pageCount > 1"
      class="pos-item-pages"
      :aria-label="pick('Sale item pages', 'آئٹم صفحات')"
    >
      <button type="button" :disabled="page === 0" @click="page--">
        ‹ {{ pick('Previous', 'پچھلا') }}
      </button>
      <span
        >{{ formatNumber(page + 1) }} / {{ formatNumber(pageCount) }} ·
        {{ formatNumber(cartStore.items.length) }} {{ t('items') }}</span
      >
      <button type="button" :disabled="page + 1 >= pageCount" @click="page++">
        {{ pick('Next', 'اگلا') }} ›
      </button>
    </nav>
  </div>
</template>
