<script setup lang="ts">
import type { Ref } from 'vue';
import type { useReports } from '@/composables/useReports';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useReports>;
defineProps<{
  label: ViewValue<State['label']>;
  pick: ViewValue<State['pick']>;
  stockValuationData: ViewValue<State['stockValuationData']>;
  exportToCSV: ViewValue<State['exportToCSV']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div class="p-6 border-b flex justify-between items-center">
      <div>
        <h2 class="text-xl font-bold">Stock Valuation Report</h2>
        <p class="text-sm text-gray-600">Current inventory value</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        @click="exportToCSV('stock-valuation', stockValuationData)"
      >
        📥 Export CSV
      </Button>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b bg-gray-50">
            <th class="text-left p-3">{{ label('Product') }}</th>
            <th class="text-right p-3">{{ label('Stock') }}</th>
            <th class="text-right p-3">Cost Value</th>
            <th class="text-right p-3">Retail Value</th>
            <th class="text-right p-3">Potential Profit</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in stockValuationData" :key="row.sku" class="border-b hover:bg-gray-50">
            <td class="p-3">
              <div>{{ row.product_name }}</div>
              <div class="text-sm text-gray-600">{{ row.sku }}</div>
            </td>
            <td class="p-3 text-right">
              {{ row.total_stock
              }}<small v-if="row.quarantined_stock" class="block text-red-600"
                >{{ row.quarantined_stock }}
                {{ pick('quarantined (included)', 'قرنطینہ (شامل)') }}</small
              >
            </td>
            <td class="p-3 text-right">{{ formatCurrency(row.cost_value) }}</td>
            <td class="p-3 text-right font-semibold">{{ formatCurrency(row.retail_value) }}</td>
            <td class="p-3 text-right text-green-600 font-semibold">
              {{ formatCurrency(row.potential_profit) }}
            </td>
          </tr>
        </tbody>
        <tfoot v-if="stockValuationData.length > 0" class="border-t bg-gray-50">
          <tr class="font-bold">
            <td class="p-3">TOTAL</td>
            <td class="p-3 text-right">
              {{ stockValuationData.reduce((sum, r) => sum + r.total_stock, 0) }}
            </td>
            <td class="p-3 text-right">
              {{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.cost_value, 0)) }}
            </td>
            <td class="p-3 text-right">
              {{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.retail_value, 0)) }}
            </td>
            <td class="p-3 text-right text-green-600">
              {{
                formatCurrency(stockValuationData.reduce((sum, r) => sum + r.potential_profit, 0))
              }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
