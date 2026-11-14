<script setup lang="ts">
import type { Ref } from 'vue';
import type { usePurchaseOrderReceive } from '@/composables/usePurchaseOrderReceive';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof usePurchaseOrderReceive>;
defineProps<{
  formatCurrency: ViewValue<State['formatCurrency']>;
  po: ViewValue<State['po']>;
}>();
</script>

<template>
  <Card v-if="po" class="po-info">
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">PO Number:</span>
        <span class="info-value">{{ po.po_number }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Supplier:</span>
        <span class="info-value">{{ po.supplier_name }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Order Date:</span>
        <span class="info-value">{{ new Date(po.order_date).toLocaleDateString() }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status:</span>
        <Badge :variant="po.status === 'sent' ? 'primary' : 'warning'">
          {{ po.status.toUpperCase() }}
        </Badge>
      </div>
      <div class="info-item">
        <span class="info-label">Total Amount:</span>
        <span class="info-value amount">{{ formatCurrency(po.total_amount) }}</span>
      </div>
    </div>
  </Card>
</template>
