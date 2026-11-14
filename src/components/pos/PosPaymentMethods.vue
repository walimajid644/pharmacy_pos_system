<script setup lang="ts">
import type { Ref } from 'vue';
import type { usePosTerminal } from '@/composables/usePosTerminal';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePosTerminal>;
defineProps<{
  pick: ViewValue<State['pick']>;
  selectedCustomer: ViewValue<State['selectedCustomer']>;
}>();
const paymentMethod = defineModel<ViewValue<State['paymentMethod']>>('paymentMethod', {
  required: true,
});
</script>

<template>
  <div
    class="pos-payment-actions"
    role="group"
    :aria-label="pick('Payment method shortcuts', 'ادائیگی کے شارٹ کٹس')"
  >
    <Button
      :variant="paymentMethod === 'cash' ? 'primary' : 'outline'"
      size="md"
      class="pos-pay-btn pos-pay-button cash"
      :aria-pressed="paymentMethod === 'cash'"
      @click="paymentMethod = 'cash'"
    >
      <span class="flex items-center justify-between w-full gap-2">
        <span>{{ pick('Cash', 'نقد') }}</span>
        <kbd class="pos-kbd">F8</kbd>
      </span>
    </Button>
    <Button
      :variant="paymentMethod === 'card' ? 'primary' : 'outline'"
      size="md"
      class="pos-pay-btn pos-pay-button card"
      :aria-pressed="paymentMethod === 'card'"
      @click="paymentMethod = 'card'"
    >
      <span class="flex items-center justify-between w-full gap-2">
        <span>{{ pick('Card', 'کارڈ') }}</span>
        <kbd class="pos-kbd">F9</kbd>
      </span>
    </Button>
    <Button
      :variant="paymentMethod === 'mobile' ? 'primary' : 'outline'"
      size="md"
      class="pos-pay-btn pos-pay-button mobile"
      :aria-pressed="paymentMethod === 'mobile'"
      @click="paymentMethod = 'mobile'"
    >
      <span class="flex items-center justify-between w-full gap-2">
        <span>{{ pick('Mobile / JazzCash', 'موبائل / جاز کیش') }}</span>
        <kbd class="pos-kbd">F10</kbd>
      </span>
    </Button>
    <Button
      v-if="selectedCustomer"
      :variant="paymentMethod === 'credit' ? 'primary' : 'outline'"
      size="md"
      class="pos-pay-btn pos-pay-button credit"
      :aria-pressed="paymentMethod === 'credit'"
      @click="paymentMethod = 'credit'"
    >
      <span>{{ pick('Credit / Udhar', 'کریڈٹ / ادھار') }}</span>
    </Button>
  </div>
</template>
