<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { computed } from 'vue';
import { useI18n } from '@/lib/i18n';
const { formatNumber } = useI18n();
import Button from '@/components/ui/Button.vue';
import CompactPages from '@/components/ui/CompactPages.vue';
import { usePurchaseOrderReceive } from '@/composables/usePurchaseOrderReceive';
import '@/assets/styles/finance-tools.css';
const { router, loading, saving, po, receiveItems, canReceive, receiveGoods, formatCurrency } =
  usePurchaseOrderReceive();
const receivable = computed(() => !!po.value && ['sent', 'partial'].includes(po.value.status));
</script>
<template>
  <section class="money-terminal">
    <header class="money-toolbar">
      <h1>{{ uiLabel('Receive Purchase ·') }} {{ po?.po_number }}</h1>
      <Button variant="outline" :disabled="saving" @click="router.push('/purchase-orders')">{{
        uiLabel('Back to Orders')
      }}</Button><Button
        permission="purchases.receive"
        :disabled="loading || saving || !canReceive || !receivable"
        @click="receiveGoods"
        >{{ uiLabel(saving ? 'Receiving…' : 'Receive Stock') }}</Button
      >
    </header>
    <p v-if="loading">{{ uiLabel('Loading order…') }}</p>
    <template v-else-if="po">
      <p>
        {{ po.supplier_name }} · {{ uiLabel(po.status) }} {{ uiLabel('· Order total') }}
        {{ formatCurrency(po.total_amount) }}
      </p>
      <p>
        {{
          uiLabel(
            'Enter only quantities received today. Batch number and future expiry are required for each received line.',
          )
        }}
      </p>
      <div class="money-list receive-list">
        <CompactPages :items="receiveItems" :row-height="64" v-slot="{ rows }">
          <table>
            <thead>
              <tr>
                <th>{{ uiLabel('Product') }}</th>
                <th>{{ uiLabel('Ordered') }}</th>
                <th>{{ uiLabel('Received') }}</th>
                <th>{{ uiLabel('Unit cost') }}</th>
                <th>{{ uiLabel('Receive now') }}</th>
                <th>{{ uiLabel('Batch number') }}</th>
                <th>{{ uiLabel('Expiry date') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item } in rows" :key="item.id">
                <td>{{ item.product_name }}</td>
                <td>{{ formatNumber(item.quantity_ordered) }}</td>
                <td>{{ formatNumber(item.quantity_received) }}</td>
                <td>{{ formatCurrency(item.unit_cost) }}</td>
                <td>
                  <input
                    v-model.number="item.receive_now"
                    :aria-label="uiLabel('Receive quantity for') + ' ' + item.product_name"
                    type="number"
                    min="0"
                    :max="item.quantity_ordered - item.quantity_received"
                    step="1"
                    :disabled="saving || !receivable"
                  />
                </td>
                <td>
                  <input
                    v-model="item.batch_number"
                    :aria-label="uiLabel('Batch number for') + ' ' + item.product_name"
                    :disabled="saving || !receivable"
                  />
                </td>
                <td>
                  <input
                    v-model="item.expiry_date"
                    :aria-label="uiLabel('Expiry date for') + ' ' + item.product_name"
                    type="date"
                    :disabled="saving || !receivable"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>
      <footer class="money-toolbar">
        <span>{{ uiLabel('Supplier payments are recorded in Supplier Ledger.') }}</span><Button
          permission="purchases.receive"
          :disabled="saving || !canReceive || !receivable"
          @click="receiveGoods"
          >{{ uiLabel('Receive Stock') }}</Button
        >
      </footer>
    </template>
  </section>
</template>
<style scoped>
.receive-list {
  min-height: 0;
}
table {
  table-layout: fixed;
  width: 100%;
}
th,
td {
  padding: 8px 5px;
  text-align: start;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
th:first-child {
  width: 24%;
}
th:nth-child(2),
th:nth-child(3) {
  width: 7%;
}
input {
  width: 100%;
  min-width: 0;
  padding: 7px 3px;
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-primary);
}
p,
footer span {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
