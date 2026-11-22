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
        <h2 class="text-xl font-bold">{{ uiLabel('Stock Valuation Report') }}</h2>
        <p class="text-sm text-gray-600">{{ uiLabel('Current inventory value') }}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        @click="exportToCSV('stock-valuation', stockValuationData)"
      >
        {{ uiLabel('📥 Export CSV') }}
      </Button>
    </div>

    <div class="paged-table-host flex-1 overflow-auto p-6">
      <CompactPages
        :items="stockValuationData"
        :row-height="56"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-start p-3">{{ label('Product') }}</th>
              <th class="text-end p-3">{{ label('Stock') }}</th>
              <th class="text-end p-3">{{ uiLabel('Cost Value') }}</th>
              <th class="text-end p-3">{{ uiLabel('Retail Value') }}</th>
              <th class="text-end p-3">{{ uiLabel('Potential Profit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ item: row } in pageRows"
              :key="row.sku"
              class="border-b hover:bg-surface-page"
            >
              <td class="p-3">
                <div>{{ row.product_name }}</div>
                <div class="text-sm text-secondary">{{ row.sku }}</div>
              </td>
              <td class="p-3 text-end">
                {{ row.total_stock
                }}<small v-if="row.quarantined_stock" class="block text-danger"
                  >{{ row.quarantined_stock }}
                  {{ pick('quarantined (included)', 'قرنطینہ (شامل)') }}</small
                >
              </td>
              <td class="p-3 text-end">{{ formatCurrency(row.cost_value) }}</td>
              <td class="p-3 text-end font-semibold">{{ formatCurrency(row.retail_value) }}</td>
              <td class="p-3 text-end text-success font-semibold">
                {{ formatCurrency(row.potential_profit) }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="stockValuationData.length > 0" class="border-t bg-surface-page">
            <tr class="font-bold">
              <td class="p-3">{{ uiLabel('TOTAL') }}</td>
              <td class="p-3 text-end">
                {{ stockValuationData.reduce((sum, r) => sum + r.total_stock, 0) }}
              </td>
              <td class="p-3 text-end">
                {{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.cost_value, 0)) }}
              </td>
              <td class="p-3 text-end">
                {{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.retail_value, 0)) }}
              </td>
              <td class="p-3 text-end text-success">
                {{
                  formatCurrency(stockValuationData.reduce((sum, r) => sum + r.potential_profit, 0))
                }}
              </td>
            </tr>
          </tfoot>
        </table>
      </CompactPages>
    </div>
  </div>
</template>
