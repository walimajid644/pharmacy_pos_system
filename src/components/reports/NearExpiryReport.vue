<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import type { Ref } from 'vue';
import type { useReports } from '@/composables/useReports';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useReports>;
defineProps<{
  label: ViewValue<State['label']>;
  openBatchActions: (batchId: string) => void;
  pick: ViewValue<State['pick']>;
  formatDate: ViewValue<State['formatDate']>;
  settingsStore: ViewValue<State['settingsStore']>;
  auth: ViewValue<State['auth']>;
  nearExpiryData: ViewValue<State['nearExpiryData']>;
  exportToCSV: ViewValue<State['exportToCSV']>;
  getDaysClass: ViewValue<State['getDaysClass']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
}>();
</script>

<template>
  <div class="flex-1 flex flex-col">
    <div class="p-6 border-b flex justify-between items-center">
      <div>
        <h2 class="text-xl font-bold">{{ pick('Near Expiry Report', 'قریب المیعاد رپورٹ') }}</h2>
        <p class="text-sm text-gray-600">
          {{
            pick(
              'Expired batches and batches expiring within',
              'میعاد ختم اور اس مدت میں ختم ہونے والے بیچ',
            )
          }}
          {{ settingsStore.settings?.near_expiry_days ?? 60 }}
          {{
            pick('days · value includes quarantined stock', 'دن · قیمت میں قرنطینہ اسٹاک شامل ہے')
          }}
        </p>
      </div>
      <Button variant="outline" size="sm" @click="exportToCSV('near-expiry', nearExpiryData)">
        📥 Export CSV
      </Button>
    </div>

    <div class="paged-table-host flex-1 overflow-auto p-6">
      <CompactPages
        :items="nearExpiryData"
        :row-height="56"
        :header-height="36"
        v-slot="{ rows: pageRows }"
      >
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-left p-3">{{ label('Product') }}</th>
              <th class="text-left p-3">{{ label('Batch') }}</th>
              <th class="text-left p-3">{{ pick('Expiry date', 'تاریخِ میعاد') }}</th>
              <th class="text-right p-3">{{ pick('Days left', 'باقی دن') }}</th>
              <th class="text-right p-3">{{ pick('Outside quarantine', 'قرنطینہ سے باہر') }}</th>
              <th>{{ pick('Quarantined', 'قرنطینہ') }}</th>
              <th class="text-right p-3">{{ pick('Retail value', 'ریٹیل قیمت') }}</th>
              <th>{{ pick('Actions', 'کارروائیاں') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ item: row } in pageRows"
              :key="row.batch_id"
              class="border-b hover:bg-gray-50"
            >
              <td class="p-3">{{ row.product_name }}</td>
              <td class="p-3 font-mono text-sm">{{ row.batch_number }}</td>
              <td class="p-3 text-sm">{{ formatDate(row.expiry_date) }}</td>
              <td class="p-3 text-right" :class="getDaysClass(row.days_until_expiry)">
                {{ row.days_until_expiry }} {{ pick('days', 'دن')
                }}<small class="block">{{
                  row.days_until_expiry < 0
                    ? pick('Expired', 'میعاد ختم')
                    : pick('Near expiry', 'قریب المیعاد')
                }}</small>
              </td>
              <td class="p-3 text-right">{{ row.quantity_in_stock }}</td>
              <td class="p-3">
                <span v-if="row.quarantined_stock" class="stock-badge held"
                  >{{ pick('Quarantined', 'قرنطینہ') }}: {{ row.quarantined_stock }}</span
                ><span v-else>0</span>
              </td>
              <td class="p-3 text-right">{{ formatCurrency(row.batch_value) }}</td>
              <td class="p-3">
                <Button
                  v-if="auth.hasRole(['admin', 'manager'])"
                  class="expiry-batch-action"
                  variant="outline"
                  size="sm"
                  @click="openBatchActions(row.batch_id)"
                  >{{ pick('Batch actions', 'بیچ کی کارروائیاں') }}</Button><small v-else>{{
                  pick('Ask a manager', 'منیجر سے رابطہ کریں')
                }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </CompactPages>
    </div>
  </div>
</template>
