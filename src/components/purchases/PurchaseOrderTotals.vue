<script setup lang="ts">
import type { PurchaseOrderFormData } from '@/lib/purchaseOrderForm';
import { useI18n } from '@/lib/i18n';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';

defineProps<{ subtotal: number; taxAmount: number; totalAmount: number }>();
const po = defineModel<PurchaseOrderFormData>({ required: true });
const { formatCurrency } = useI18n();
</script>

<template>
  <Card class="totals-card">
    <div class="totals-row">
      <span class="totals-label">Subtotal:</span>
      <span class="totals-value">{{ formatCurrency(subtotal) }}</span>
    </div>
    <div class="totals-row">
      <span class="totals-label">Tax:</span>
      <span class="totals-value">{{ formatCurrency(taxAmount) }}</span>
    </div>
    <div class="totals-row">
      <label class="totals-label" for="order-discount">Order discount:</label>
      <Input
        id="order-discount"
        v-model.number="po.discount_amount"
        type="number"
        min="0"
        step="0.01"
        class="w-36"
      />
    </div>
    <div class="totals-row">
      <label class="totals-label" for="shipping-cost">Shipping cost:</label>
      <Input
        id="shipping-cost"
        v-model.number="po.shipping_cost"
        type="number"
        min="0"
        step="0.01"
        class="w-36"
      />
    </div>
    <div class="totals-row total-row">
      <span class="totals-label">Total Amount:</span>
      <span class="totals-value">{{ formatCurrency(totalAmount) }}</span>
    </div>
  </Card>
</template>

<style scoped>
.totals-card {
  padding: 2rem;
  background-color: var(--color-hover);
}

.totals-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
}

.totals-row:last-child {
  border-bottom: none;
}

.total-row {
  padding-top: 1rem;
  margin-top: 0.5rem;
  border-top: 2px solid var(--color-border);
}

.totals-label {
  font-size: 1rem;
  color: var(--color-text-secondary);
}

.total-row .totals-label {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.totals-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.total-row .totals-value {
  font-size: 1.5rem;
  color: var(--color-primary);
}
</style>
