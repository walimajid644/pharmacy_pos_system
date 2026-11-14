<script setup lang="ts">
import type { Ref } from 'vue';
import type { useReports } from '@/composables/useReports';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useReports>;
defineProps<{
  label: ViewValue<State['label']>;
  dateFrom: ViewValue<State['dateFrom']>;
  dateTo: ViewValue<State['dateTo']>;
  salesByProductData: ViewValue<State['salesByProductData']>;
  exportToCSV: ViewValue<State['exportToCSV']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div class="p-6 border-b flex justify-between items-center">
      <div>
        <h2 class="text-xl font-bold">Sales by Product</h2>
        <p class="text-sm text-gray-600">Top 50 products | {{ dateFrom }} to {{ dateTo }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        @click="exportToCSV('sales-by-product', salesByProductData)"
      >
        📥 Export CSV
      </Button>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b bg-gray-50">
            <th class="text-left p-3">{{ label('Product') }}</th>
            <th class="text-left p-3">SKU</th>
            <th class="text-right p-3">Qty Sold</th>
            <th class="text-right p-3">Invoices</th>
            <th class="text-right p-3">Total Sales</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in salesByProductData" :key="row.sku" class="border-b hover:bg-gray-50">
            <td class="p-3">{{ row.product_name }}</td>
            <td class="p-3 font-mono text-sm">{{ row.sku }}</td>
            <td class="p-3 text-right">{{ row.total_quantity }}</td>
            <td class="p-3 text-right">{{ row.invoice_count }}</td>
            <td class="p-3 text-right font-semibold">{{ formatCurrency(row.total_sales) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
