<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import type { Ref } from 'vue';
import type { useSalesHistory } from '@/composables/useSalesHistory';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSalesHistory>;
defineProps<{
  pick: ViewValue<State['pick']>;
  t: ViewValue<State['t']>;
  invoices: ViewValue<State['invoices']>;
  loading: ViewValue<State['loading']>;
  searchQuery: ViewValue<State['searchQuery']>;
  selectedCustomer: ViewValue<State['selectedCustomer']>;
  selectedPaymentMethod: ViewValue<State['selectedPaymentMethod']>;
  filteredInvoices: ViewValue<State['filteredInvoices']>;
  viewInvoiceDetails: ViewValue<State['viewInvoiceDetails']>;
  getPaymentMethodBadge: ViewValue<State['getPaymentMethodBadge']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  formatDate: ViewValue<State['formatDate']>;
  formatDateTime: ViewValue<State['formatDateTime']>;
}>();
</script>

<template>
  <div class="paged-table-host tool-table-scroll flex-1 overflow-auto p-6">
    <div v-if="loading && invoices.length === 0" class="text-center py-12 text-gray-500">
      {{ pick('Loading sales history...', 'فروخت کی تاریخ لوڈ ہو رہی ہے...') }}
    </div>

    <div v-else-if="filteredInvoices.length === 0" class="text-center py-12 text-gray-500">
      {{
        searchQuery || selectedCustomer || selectedPaymentMethod
          ? pick('No sales found matching filters', 'فلٹر کے مطابق کوئی فروخت نہیں ملی')
          : pick('No sales history yet', 'ابھی فروخت کی کوئی تاریخ نہیں')
      }}
    </div>

    <CompactPages
      v-else
      :items="filteredInvoices"
      :row-height="56"
      :header-height="36"
      v-slot="{ rows: pageRows }"
    >
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b bg-gray-50">
            <th class="text-left p-3 font-semibold">{{ pick('Date & Time', 'تاریخ اور وقت') }}</th>
            <th class="text-left p-3 font-semibold">{{ t('invoice_number') }}</th>
            <th class="text-left p-3 font-semibold">{{ pick('Customer', 'گاہک') }}</th>
            <th class="text-left p-3 font-semibold">{{ pick('Cashier', 'کیشئر') }}</th>
            <th class="text-center p-3 font-semibold">{{ pick('Payment', 'ادائیگی') }}</th>
            <th class="text-right p-3 font-semibold">{{ pick('Amount', 'رقم') }}</th>
            <th class="text-center p-3 font-semibold">{{ pick('Actions', 'اقدامات') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ item: invoice } in pageRows"
            :key="invoice.id"
            class="border-b hover:bg-gray-50"
          >
            <td class="p-3 text-sm">
              <div>{{ formatDate(invoice.invoice_date) }}</div>
              <div class="text-gray-500">
                {{ formatDateTime(invoice.invoice_date).split(' ').slice(1).join(' ') }}
              </div>
            </td>
            <td class="p-3 font-mono text-sm">{{ invoice.invoice_number }}</td>
            <td class="p-3 text-sm">{{ invoice.customer_name }}</td>
            <td class="p-3 text-sm">{{ invoice.cashier_name }}</td>
            <td class="p-3 text-center">
              <span
                :class="[
                  'inline-block px-2 py-1 text-xs rounded',
                  getPaymentMethodBadge(invoice.payment_method).class,
                ]"
              >
                {{ t(invoice.payment_method as 'cash' | 'card' | 'mobile') }}
              </span>
            </td>
            <td class="p-3 text-right font-semibold">{{ formatCurrency(invoice.net_amount) }}</td>
            <td class="p-3 text-center">
              <Button variant="outline" size="sm" @click="viewInvoiceDetails(invoice)">
                {{ pick('View Details', 'تفصیلات دیکھیں') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </CompactPages>
  </div>
</template>
