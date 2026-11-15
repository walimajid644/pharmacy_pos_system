<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Product } from '@/lib/types';
import type { PurchaseOrderLine } from '@/lib/purchaseOrderForm';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{ products: Product[] }>();
const lineItems = defineModel<PurchaseOrderLine[]>({ required: true });
const emit = defineEmits<{
  add: [];
  remove: [index: number];
  select: [item: PurchaseOrderLine, product: Product];
  recalculate: [item: PurchaseOrderLine];
}>();
const { formatCurrency } = useI18n();
const productSearch = ref('');
const filteredProducts = computed(() => {
  if (!productSearch.value) return [];
  const query = productSearch.value.toLowerCase();
  return props.products
    .filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query),
    )
    .slice(0, 10);
});

function getProductName(id: string) {
  return props.products.find((product) => product.id === id)?.name || '';
}
function onProductInput(event: Event) {
  productSearch.value = (event.target as HTMLInputElement).value;
}
function unlockSearch(event: MouseEvent) {
  productSearch.value = '';
  const input = event.target as HTMLInputElement;
  input.removeAttribute('readonly');
}
function selectProduct(item: PurchaseOrderLine, product: Product) {
  productSearch.value = '';
  emit('select', item, product);
}
</script>

<template>
  <Card class="form-section order-lines-section">
    <div class="section-header">
      <h3 class="section-title">Order Items</h3>
      <Button @click="emit('add')" variant="outline" size="sm"> + Add Item </Button>
    </div>

    <CompactPages
      :items="lineItems"
      :row-height="58"
      :header-height="0"
      follow-added
      v-slot="{ rows }"
    >
      <div class="line-items">
        <div v-for="{ item, index } in rows" :key="index" class="line-item">
          <div class="line-item-number">{{ index + 1 }}</div>

          <div class="line-item-fields">
            <!-- Product Selection -->
            <div class="form-field">
              <label>Product *</label>
              <div class="product-select">
                <Input
                  :model-value="item.product_name || getProductName(item.product_id)"
                  @input="onProductInput"
                  placeholder="Search product..."
                  readonly
                  @click="unlockSearch"
                />
                <div v-if="productSearch && filteredProducts.length > 0" class="product-dropdown">
                  <button
                    v-for="product in filteredProducts"
                    :key="product.id"
                    @click="selectProduct(item, product)"
                    class="product-option"
                    type="button"
                  >
                    <div class="product-option-name">{{ product.name }}</div>
                    <div class="product-option-details">
                      {{ product.sku }} | Cost: {{ formatCurrency(product.cost_price) }}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Quantity -->
            <div class="form-field">
              <label>Quantity *</label>
              <Input
                v-model.number="item.quantity_ordered"
                type="number"
                min="1"
                @update:model-value="emit('recalculate', item)"
                required
              />
            </div>

            <!-- Unit Cost -->
            <div class="form-field">
              <label>Unit Cost *</label>
              <Input
                v-model.number="item.unit_cost"
                type="number"
                step="0.01"
                min="0"
                @update:model-value="emit('recalculate', item)"
                required
              />
            </div>

            <!-- Tax Rate -->
            <div class="form-field">
              <label>Tax %</label>
              <Input
                v-model.number="item.tax_rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                @update:model-value="emit('recalculate', item)"
              />
            </div>

            <!-- Discount -->
            <div class="form-field">
              <label>Discount %</label>
              <Input
                v-model.number="item.discount_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                @update:model-value="emit('recalculate', item)"
              />
            </div>

            <!-- Line Total -->
            <div class="form-field">
              <label>Line Total</label>
              <div class="line-total">{{ formatCurrency(item.line_total) }}</div>
            </div>
          </div>

          <Button
            @click="emit('remove', index)"
            variant="outline"
            size="sm"
            class="remove-button"
            :disabled="lineItems.length === 1"
          >
            ×
          </Button>
        </div>
      </div>
    </CompactPages>
  </Card>
</template>

<style scoped>
.form-section {
  padding: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
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

.line-items {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.line-item {
  display: flex;
  gap: 1rem;
  align-items: start;
  padding: 1.5rem;
  background-color: var(--color-hover);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
}

.line-item-number {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-primary);
  color: white;
  border-radius: 50%;
  font-weight: 600;
  flex-shrink: 0;
}

.line-item-fields {
  flex: 1;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1.5fr;
  gap: 1rem;
}

.product-select {
  position: relative;
}

.product-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  max-height: 300px;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.product-option {
  width: 100%;
  padding: 0.75rem;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: var(--transition-fast);
}

.product-option:hover {
  background-color: var(--color-hover);
}

.product-option-name {
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.product-option-details {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.line-total {
  padding: 0.75rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-weight: 600;
  color: var(--color-primary);
  text-align: right;
}

.remove-button {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  font-size: 1.5rem;
  line-height: 1;
}

@media (max-width: 1024px) {
  .line-item-fields {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .line-item {
    flex-direction: column;
  }

  .line-item-fields {
    grid-template-columns: 1fr;
  }
}
</style>
