<script setup lang="ts">
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
  dailySalesData: ViewValue<State['dailySalesData']>;
  exportToCSV: ViewValue<State['exportToCSV']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div class="p-6 border-b flex justify-between items-center">
      <div>
        <h2 class="text-xl font-bold">{{ label('Daily Sales Summary') }}</h2>
        <p class="text-sm text-gray-600">{{ dateFrom }} to {{ dateTo }}</p>
      </div>
      <Button variant="outline" size="sm" @click="exportToCSV('daily-sales', dailySalesData)">
        📥 Export CSV
      </Button>
    </div>

    <div class="paged-table-host flex-1 overflow-auto p-6">
      <CompactPages
        :items="dailySalesData"
        :row-height="56"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-left p-3">{{ label('Date') }}</th>
              <th class="text-right p-3">Invoices</th>
              <th class="text-right p-3">Total Sales</th>
              <th class="text-right p-3">Cash</th>
              <th class="text-right p-3">Card</th>
              <th class="text-right p-3">{{ label('Mobile') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ item: row } in pageRows"
              :key="row.sale_date"
              class="border-b hover:bg-gray-50"
            >
              <td class="p-3">{{ new Date(row.sale_date).toLocaleDateString() }}</td>
              <td class="p-3 text-right">{{ row.invoice_count }}</td>
              <td class="p-3 text-right font-semibold">{{ formatCurrency(row.total_sales) }}</td>
              <td class="p-3 text-right">{{ formatCurrency(row.cash_sales) }}</td>
              <td class="p-3 text-right">{{ formatCurrency(row.card_sales) }}</td>
              <td class="p-3 text-right">{{ formatCurrency(row.mobile_sales) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="dailySalesData.length > 0" class="border-t bg-gray-50">
            <tr class="font-bold">
              <td class="p-3">TOTAL</td>
              <td class="p-3 text-right">
                {{ dailySalesData.reduce((sum, r) => sum + r.invoice_count, 0) }}
              </td>
              <td class="p-3 text-right">
                {{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.total_sales, 0)) }}
              </td>
              <td class="p-3 text-right">
                {{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.cash_sales, 0)) }}
              </td>
              <td class="p-3 text-right">
                {{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.card_sales, 0)) }}
              </td>
              <td class="p-3 text-right">
                {{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.mobile_sales, 0)) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </CompactPages>
    </div>
  </div>
</template>
