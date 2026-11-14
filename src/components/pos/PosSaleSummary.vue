<script setup lang="ts">
import type { Ref } from 'vue';
import type { usePosTerminal } from '@/composables/usePosTerminal';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePosTerminal>;
defineProps<{
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
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
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
    <label class="pos-summary-discount"
      ><small>{{ pick('Invoice discount', 'انوائس رعایت') }}</small
      ><span
        ><bdi>Rs</bdi
        ><input
          type="number"
          min="0"
          :max="maxInvoiceDiscount"
          step="0.01"
          :value="cartStore.discountAmount.toFixed(2)"
          @change="onInvoiceDiscountChange"
          :aria-label="pick('Invoice discount in rupees', 'انوائس رعایت روپے میں')" /></span
    ></label>
    <div class="pos-summary-total">
      <small>{{ t('total') }}</small><strong>{{ formatCurrency(total) }}</strong>
    </div>
  </div>
</template>
