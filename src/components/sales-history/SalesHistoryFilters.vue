<script setup lang="ts">
import type { Ref } from 'vue';
import type { useSalesHistory } from '@/composables/useSalesHistory';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSalesHistory>;
defineProps<{
  pick: ViewValue<State['pick']>;
  t: ViewValue<State['t']>;
  formatNumber: ViewValue<State['formatNumber']>;
  customers: ViewValue<State['customers']>;
  totalSales: ViewValue<State['totalSales']>;
  totalInvoices: ViewValue<State['totalInvoices']>;
  clearFilters: ViewValue<State['clearFilters']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
const dateFrom = defineModel<ViewValue<State['dateFrom']>>('dateFrom', { required: true });
const dateTo = defineModel<ViewValue<State['dateTo']>>('dateTo', { required: true });
const selectedCustomer = defineModel<ViewValue<State['selectedCustomer']>>('selectedCustomer', {
  required: true,
});
const selectedPaymentMethod = defineModel<ViewValue<State['selectedPaymentMethod']>>(
  'selectedPaymentMethod',
  { required: true },
);
const searchQuery = defineModel<ViewValue<State['searchQuery']>>('searchQuery', { required: true });
</script>

<template>
  <div class="tool-toolbar p-6 border-b space-y-4">
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div>
        <label for="field-saleshistoryfilters-1" class="block text-sm font-medium mb-2">{{
          pick('From Date', 'ابتدائی تاریخ')
        }}</label>
        <Input id="field-saleshistoryfilters-1" v-model="dateFrom" type="date" />
      </div>
      <div>
        <label for="field-saleshistoryfilters-2" class="block text-sm font-medium mb-2">{{
          pick('To Date', 'آخری تاریخ')
        }}</label>
        <Input id="field-saleshistoryfilters-2" v-model="dateTo" type="date" />
      </div>
      <div>
        <label for="field-saleshistoryfilters-3" class="block text-sm font-medium mb-2">{{
          pick('Customer', 'گاہک')
        }}</label>
        <select
          id="field-saleshistoryfilters-3"
          v-model="selectedCustomer"
          class="w-full border rounded-md p-2"
        >
          <option value="">{{ pick('All Customers', 'تمام گاہک') }}</option>
          <option v-for="customer in customers" :key="customer.id" :value="customer.id">
            {{ customer.first_name }} {{ customer.last_name }}
          </option>
        </select>
      </div>
      <div>
        <label for="field-saleshistoryfilters-4" class="block text-sm font-medium mb-2">{{
          t('payment_method')
        }}</label>
        <select
          id="field-saleshistoryfilters-4"
          v-model="selectedPaymentMethod"
          class="w-full border rounded-md p-2"
        >
          <option value="">{{ pick('All Methods', 'تمام طریقے') }}</option>
          <option value="cash">{{ t('cash') }}</option>
          <option value="card">{{ t('card') }}</option>
          <option value="credit">{{ pick('Credit / Udhar', 'کریڈٹ / ادھار') }}</option>
          <option value="mobile">{{ t('mobile') }}</option>
        </select>
      </div>
      <div>
        <label for="field-saleshistoryfilters-5" class="block text-sm font-medium mb-2">{{
          t('search')
        }}</label>
        <Input
          id="field-saleshistoryfilters-5"
          v-model="searchQuery"
          :placeholder="pick('Invoice # or customer...', 'انوائس نمبر یا گاہک...')"
        />
      </div>
    </div>

    <div class="flex justify-between items-center">
      <div class="text-sm text-gray-600">
        <span class="font-semibold">{{ formatNumber(totalInvoices) }}</span>
        {{ pick('invoices', 'انوائسیں') }} | {{ t('total') }}:
        <span class="font-semibold">{{ formatCurrency(totalSales) }}</span>
      </div>
      <Button variant="outline" size="sm" @click="clearFilters">{{
        pick('Clear Filters', 'فلٹر صاف کریں')
      }}</Button>
    </div>
  </div>
</template>
