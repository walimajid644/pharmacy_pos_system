<script setup lang="ts">
import { onActionKeydown } from '@/lib/actionKeys';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { useI18n } from '@/lib/i18n';
import { usePurchaseOrderForm } from '@/composables/usePurchaseOrderForm';
import Button from '@/components/ui/Button.vue';
import PurchaseOrderInformation from '@/components/purchases/PurchaseOrderInformation.vue';
import PurchaseOrderLines from '@/components/purchases/PurchaseOrderLines.vue';
import PurchaseOrderTotals from '@/components/purchases/PurchaseOrderTotals.vue';

const { pick } = useI18n();
const {
  preferences,
  isEditing,
  suppliers,
  products,
  loading,
  saving,
  po,
  lineItems,
  fromSuggestions,
  subtotal,
  taxAmount,
  totalAmount,
  addLineItem,
  removeLineItem,
  selectProduct,
  calculateLineTotal,
  savePO,
  cancel,
} = usePurchaseOrderForm();
</script>

<template>
  <div class="tool-terminal po-form-view compact-workspace" @keydown="onActionKeydown">
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">
          {{ uiLabel(isEditing ? 'Edit' : 'Create') }} {{ uiLabel('Purchase Order') }}
        </h2>
        <p class="view-subtitle">
          {{
            uiLabel(
              isEditing
                ? 'Update purchase order details'
                : 'Add products and quantities to order from supplier',
            )
          }}
        </p>
      </div>
      <Button @click="cancel" variant="outline">{{ uiLabel('Cancel') }}</Button>
    </div>

    <p v-if="fromSuggestions" class="commercial-hint">
      {{
        pick(
          'Unsaved suggestion draft: verify supplier, unit costs, quantities and incoming orders. Nothing has been ordered automatically.',
          'غیر محفوظ تجویز مسودہ: سپلائر، اکائی لاگت، تعداد اور آنے والے آرڈر کی تصدیق کریں۔ کوئی خودکار آرڈر نہیں ہوا۔',
        )
      }}
    </p>
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ uiLabel('Loading...') }}</p>
    </div>

    <div v-else class="form-container">
      <PurchaseOrderInformation v-model="po" :suppliers="suppliers" />
      <PurchaseOrderLines
        v-model="lineItems"
        :products="products"
        :show-tax="!!preferences.purchase_show_tax"
        :show-discount="!!preferences.purchase_show_discount"
        @add="addLineItem"
        @remove="removeLineItem"
        @select="selectProduct"
        @recalculate="calculateLineTotal"
      />
      <PurchaseOrderTotals
        v-model="po"
        :subtotal="subtotal"
        :tax-amount="taxAmount"
        :total-amount="totalAmount"
      />

      <div class="form-actions">
        <small>{{ uiLabel('Ctrl+S: Save draft') }}</small>
        <Button @click="cancel" variant="outline" :disabled="saving">{{
          uiLabel('Cancel')
        }}</Button>
        <Button
          permission="purchases.write"
          aria-keyshortcuts="Control+s"
          @click="savePO('draft')"
          variant="outline"
          :disabled="saving"
        >
          {{ uiLabel(saving ? 'Saving...' : 'Save as Draft') }}
        </Button>
        <Button permission="purchases.write" @click="savePO('sent')" :disabled="saving">
          {{ uiLabel(saving ? 'Saving...' : 'Save & Send to Supplier') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.po-form-view {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.view-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.view-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.loading-state {
  text-align: center;
  padding: 4rem;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
}

@media (max-width: 768px) {
  .po-form-view {
    padding: 1rem;
  }

  .form-actions {
    flex-direction: column;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
