<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import CompactPages from '@/components/ui/CompactPages.vue';
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
        <h2 class="text-xl font-bold">{{ uiLabel('Sales by Product') }}</h2>
        <p class="text-sm text-gray-600">
          {{ uiLabel('Top 50 products |') }} {{ dateFrom }} {{ uiLabel('to') }} {{ dateTo }}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        @click="exportToCSV('sales-by-product', salesByProductData)"
      >
        {{ uiLabel('📥 Export CSV') }}
      </Button>
    </div>

    <div class="paged-table-host flex-1 overflow-auto p-6">
      <CompactPages
        :items="salesByProductData"
        :row-height="56"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-start p-3">{{ label('Product') }}</th>
              <th class="text-start p-3">SKU</th>
              <th class="text-end p-3">{{ uiLabel('Qty Sold') }}</th>
              <th class="text-end p-3">{{ uiLabel('Invoices') }}</th>
              <th class="text-end p-3">{{ uiLabel('Total Sales') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item: row } in pageRows" :key="row.sku" class="border-b hover:bg-gray-50">
              <td class="p-3">{{ row.product_name }}</td>
              <td class="p-3 font-mono text-sm">{{ row.sku }}</td>
              <td class="p-3 text-end">{{ row.total_quantity }}</td>
              <td class="p-3 text-end">{{ row.invoice_count }}</td>
              <td class="p-3 text-end font-semibold">{{ formatCurrency(row.total_sales) }}</td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
  </div>
</template>
