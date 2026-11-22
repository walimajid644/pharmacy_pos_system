<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import type { Ref } from 'vue';
import type { usePurchaseOrders } from '@/composables/usePurchaseOrders';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePurchaseOrders>;
defineProps<{
  formatCurrency: ViewValue<State['formatCurrency']>;
  filteredPOs: ViewValue<State['filteredPOs']>;
  getStatusVariant: ViewValue<State['getStatusVariant']>;
  viewPO: ViewValue<State['viewPO']>;
  receivePO: ViewValue<State['receivePO']>;
  cancelPO: ViewValue<State['cancelPO']>;
  formatDate: ViewValue<State['formatDate']>;
}>();
</script>

<template>
  <table class="purchase-table">
    <thead>
      <tr>
        <th>{{ uiLabel('PO Number') }}</th>
        <th>{{ uiLabel('Supplier') }}</th>
        <th>{{ uiLabel('Order Date') }}</th>
        <th>{{ uiLabel('Expected Delivery') }}</th>
        <th>{{ uiLabel('Status') }}</th>
        <th class="money">{{ uiLabel('Total Amount') }}</th>
        <th>{{ uiLabel('Actions') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="po in filteredPOs" :key="po.id">
        <td>
          <strong>{{ po.po_number }}</strong>
        </td>
        <td>{{ po.supplier_name || '—' }}</td>
        <td>{{ formatDate(po.order_date) }}</td>
        <td>{{ po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—' }}</td>
        <td>
          <Badge :variant="getStatusVariant(po.status)">{{ po.status.toUpperCase() }}</Badge>
        </td>
        <td class="money">
          <strong>{{ formatCurrency(po.total_amount) }}</strong>
        </td>
        <td>
          <div class="purchase-row-actions">
            <Button @click="viewPO(po.id)" variant="outline" size="sm">{{
              uiLabel(po.status === 'draft' ? 'Edit order' : 'View details')
            }}</Button>
            <Button
              v-if="po.status === 'sent' || po.status === 'partial'"
              class="receive-goods"
              @click="receivePO(po.id)"
              size="sm"
              >{{ uiLabel('Receive goods') }}</Button
            >
            <Button
              v-if="po.status === 'draft' || po.status === 'sent'"
              class="cancel-order"
              @click="cancelPO(po.id)"
              variant="destructive"
              size="sm"
              >{{ uiLabel('Cancel') }}</Button
            >
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
