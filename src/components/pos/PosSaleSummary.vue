<script setup lang="ts">
import { computed, type Ref } from 'vue';
import type { usePosTerminal } from '@/composables/usePosTerminal';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePosTerminal>;
const props = defineProps<{
  t: ViewValue<State['t']>;
  pick: ViewValue<State['pick']>;
  formatNumber: ViewValue<State['formatNumber']>;
  cartStore: ViewValue<State['cartStore']>;
  authStore: ViewValue<State['authStore']>;
  subtotal: ViewValue<State['subtotal']>;
  taxAmount: ViewValue<State['taxAmount']>;
  total: ViewValue<State['total']>;
  maxInvoiceDiscount: ViewValue<State['maxInvoiceDiscount']>;
  onInvoiceDiscountChange: ViewValue<State['onInvoiceDiscountChange']>;
  setInvoiceDiscount: ViewValue<State['setInvoiceDiscount']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
const discountPercent = computed(() =>
  props.subtotal > 0
    ? ((props.cartStore.discountAmount / props.subtotal) * 100).toFixed(2)
    : '0.00',
);
function changePercent(event: Event) {
  const input = event.target as HTMLInputElement;
  const percent = Number(input.value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    input.value = discountPercent.value;
    return;
  }
  props.setInvoiceDiscount((props.subtotal * percent) / 100);
  input.value = discountPercent.value;
}
</script>

<template>
  <div class="pos-summary" :aria-label="pick('Sale summary', 'فروخت کا خلاصہ')">
    <div>
      <small>{{ t('items') }}</small><strong>{{ formatNumber(cartStore.itemCount) }}</strong>
    </div>
    <div class="pos-summary-cashier">
      <small>{{ pick('Cashier', 'کیشئر') }}</small><strong>{{
        authStore.currentUser?.full_name || '—'
      }}</strong>
    </div>
    <div>
      <small>{{ pick('Gross total', 'مجموعی رقم') }}</small><strong>{{
        formatCurrency(subtotal)
      }}</strong>
    </div>
    <div>
      <small>{{ t('tax') }}</small><strong>{{ formatCurrency(taxAmount) }}</strong>
    </div>
    <div class="pos-summary-discount">
      <small>{{ pick('Invoice discount', 'انوائس رعایت') }}</small>
      <span>
        <label
          ><bdi>%</bdi
          ><input
            id="pos-invoice-discount-percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            :value="discountPercent"
            @change="changePercent"
            :aria-label="pick('Invoice discount percent', 'انوائس رعایت فیصد')"
        /></label>
        <label
          ><bdi>{{ pick('Flat', 'رقم') }}</bdi
          ><input
            id="pos-invoice-discount-flat"
            type="number"
            min="0"
            :max="maxInvoiceDiscount"
            step="0.01"
            :value="cartStore.discountAmount.toFixed(2)"
            @change="onInvoiceDiscountChange"
            :aria-label="pick('Invoice discount in rupees', 'انوائس رعایت روپے میں')" /></label
      ></span>
    </div>
    <div class="pos-summary-total">
      <small>{{ t('total') }}</small><strong>{{ formatCurrency(total) }}</strong>
    </div>
  </div>
</template>
