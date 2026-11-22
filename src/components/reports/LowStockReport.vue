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
  lowStockData: ViewValue<State['lowStockData']>;
  exportToCSV: ViewValue<State['exportToCSV']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div class="p-6 border-b flex justify-between items-center">
      <div>
        <h2 class="text-xl font-bold">{{ uiLabel('Low Stock Report') }}</h2>
        <p class="text-sm text-gray-600">{{ uiLabel('Products below reorder level') }}</p>
      </div>
      <Button variant="outline" size="sm" @click="exportToCSV('low-stock', lowStockData)">
        {{ uiLabel('📥 Export CSV') }}
      </Button>
    </div>

    <div class="paged-table-host flex-1 overflow-auto p-6">
      <CompactPages
        :items="lowStockData"
        :row-height="56"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-start p-3">{{ label('Product') }}</th>
              <th class="text-start p-3">SKU</th>
              <th class="text-end p-3">{{ uiLabel('Current Stock') }}</th>
              <th class="text-end p-3">{{ uiLabel('Reorder Level') }}</th>
              <th class="text-end p-3">{{ uiLabel('Value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ item: row } in pageRows"
              :key="row.sku"
              class="border-b hover:bg-surface-page"
            >
              <td class="p-3">{{ row.product_name }}</td>
              <td class="p-3 font-mono text-sm">{{ row.sku }}</td>
              <td class="p-3 text-end font-bold text-warning">{{ row.current_stock }}</td>
              <td class="p-3 text-end">{{ row.reorder_level }}</td>
              <td class="p-3 text-end">{{ formatCurrency(row.stock_value) }}</td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
  </div>
</template>
