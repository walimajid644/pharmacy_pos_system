<script setup lang="ts">
import type { Supplier } from '@/lib/types';
import type { PurchaseOrderFormData } from '@/lib/purchaseOrderForm';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';

defineProps<{ suppliers: Supplier[] }>();
const po = defineModel<PurchaseOrderFormData>({ required: true });
</script>

<template>
  <Card class="form-section">
    <h3 class="section-title">Order Information</h3>
    <div class="form-grid">
      <div class="form-field">
        <label for="field-purchaseorderinformation-1">Supplier *</label>
        <select
          id="field-purchaseorderinformation-1"
          v-model="po.supplier_id"
          class="form-select"
          required
        >
          <option value="">Select supplier...</option>
          <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
            {{ supplier.name }} ({{ supplier.supplier_code }})
          </option>
        </select>
      </div>

      <div class="form-field">
        <label for="field-purchaseorderinformation-2">Order Date *</label>
        <Input id="field-purchaseorderinformation-2" v-model="po.order_date" type="date" required />
      </div>

      <div class="form-field">
        <label for="field-purchaseorderinformation-3">Expected Delivery Date</label>
        <Input
          id="field-purchaseorderinformation-3"
          v-model="po.expected_delivery_date"
          type="date"
        />
      </div>

      <div class="form-field full-width">
        <label for="field-purchaseorderinformation-4">Notes</label>
        <textarea
          id="field-purchaseorderinformation-4"
          v-model="po.notes"
          class="form-textarea"
          placeholder="Additional notes or instructions..."
          rows="3"
        ></textarea>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.form-section {
  padding: 2rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-select,
.form-textarea {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-family: inherit;
}

.form-select {
  cursor: pointer;
}

.form-textarea {
  resize: vertical;
}

@media (max-width: 1024px) {
  .form-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
