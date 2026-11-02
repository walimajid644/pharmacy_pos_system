<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { usePurchaseDraftStore } from '@/stores/purchaseDraft'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import type { Supplier, Product, PurchaseOrder, PurchaseOrderItem } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const draftStore=usePurchaseDraftStore()
const fromSuggestions=ref(false)
const { formatCurrency,pick } = useI18n()
const { showToast } = useToast()

const poId = route.params.id as string
const isEditing = computed(() => !!poId)

const suppliers = ref<Supplier[]>([])
const products = ref<Product[]>([])
const loading = ref(true)
const saving = ref(false)

// PO Form Data
const po = ref({
  supplier_id: '',
  order_date: new Date().toISOString().split('T')[0],
  expected_delivery_date: '',
  discount_amount: 0,
  shipping_cost: 0,
  notes: ''
})

interface LineItem {
  id?: string
  product_id: string
  product_name?: string
  quantity_ordered: number
  unit_cost: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

const lineItems = ref<LineItem[]>([])
const productSearch = ref('')

const filteredProducts = computed(() => {
  if (!productSearch.value) return []
  const query = productSearch.value.toLowerCase()
  return products.value.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.sku.toLowerCase().includes(query) ||
    p.barcode?.toLowerCase().includes(query)
  ).slice(0, 10)
})

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const subtotal = computed(() => {
  return lineItems.value.reduce((sum, item) => {
    const base = roundMoney(item.quantity_ordered * item.unit_cost)
    return sum + roundMoney(base * (1 - item.discount_percent / 100))
  }, 0)
})

const taxAmount = computed(() => {
  return lineItems.value.reduce((sum, item) => {
    const base = roundMoney(item.quantity_ordered * item.unit_cost)
    const taxableAmount = roundMoney(base * (1 - item.discount_percent / 100))
    return sum + roundMoney(taxableAmount * (item.tax_rate / 100))
  }, 0)
})

const totalAmount = computed(() => {
  return roundMoney(subtotal.value + taxAmount.value - Number(po.value.discount_amount) + Number(po.value.shipping_cost))
})

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    // Load suppliers
    suppliers.value = await executeQuery<Supplier>(
      'SELECT * FROM suppliers WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name'
    )

    // Load products
    products.value = await executeQuery<Product>(
      'SELECT * FROM products WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name'
    )

    // If editing, load existing PO
    if (isEditing.value) {
      await loadExistingPO()
    } else {
      const pending=route.query.suggestions==='1'?draftStore.take():null
      if(pending){
        po.value.supplier_id=pending.supplierId;po.value.notes=pending.notes
        lineItems.value=pending.items.flatMap(item=>{const product=products.value.find(p=>p.id===item.productId);return product?[{product_id:product.id,product_name:product.name,quantity_ordered:item.quantity,unit_cost:product.cost_price,tax_rate:0,discount_percent:0,line_total:roundMoney(item.quantity*product.cost_price)}]:[]})
        fromSuggestions.value=true
        if(lineItems.value.length!==pending.items.length)showToast('Some products are no longer active. Review the remaining draft lines.','warning')
        if(!lineItems.value.length)addLineItem()
      }else{addLineItem()}
    }
  } catch (error) {
    showToast('Error loading data', 'error')
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function loadExistingPO() {
  try {
    const [existingPO] = await executeQuery<PurchaseOrder>(
      'SELECT * FROM purchase_orders WHERE id = ?',
      [poId]
    )

    if (!existingPO) {
      showToast('Purchase order not found', 'error')
      router.push('/purchase-orders')
      return
    }

    po.value = {
      supplier_id: existingPO.supplier_id,
      order_date: existingPO.order_date.split('T')[0],
      expected_delivery_date: existingPO.expected_delivery_date?.split('T')[0] || '',
      discount_amount: existingPO.discount_amount,
      shipping_cost: existingPO.shipping_cost,
      notes: existingPO.notes || ''
    }

    // Load line items
    const items = await executeQuery<PurchaseOrderItem & { product_name: string }>(
      `SELECT poi.*, p.name as product_name
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.po_id = ?`,
      [poId]
    )

    lineItems.value = items.map(item => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity_ordered: item.quantity_ordered,
      unit_cost: item.unit_cost,
      tax_rate: item.tax_rate,
      discount_percent: item.discount_percent,
      line_total: item.line_total
    }))
  } catch (error) {
    showToast('Error loading purchase order', 'error')
    console.error(error)
  }
}

function addLineItem() {
  lineItems.value.push({
    product_id: '',
    quantity_ordered: 1,
    unit_cost: 0,
    tax_rate: 17,
    discount_percent: 0,
    line_total: 0
  })
}

function removeLineItem(index: number) {
  if (lineItems.value.length === 1) {
    showToast('Cannot remove the last line item', 'error')
    return
  }
  lineItems.value.splice(index, 1)
}

function selectProduct(item: LineItem, product: Product) {
  item.product_id = product.id
  item.product_name = product.name
  item.unit_cost = product.cost_price
  productSearch.value = ''
  calculateLineTotal(item)
}

function calculateLineTotal(item: LineItem) {
  const base = roundMoney(item.quantity_ordered * item.unit_cost)
  const discounted = roundMoney(base * (1 - item.discount_percent / 100))
  item.line_total = roundMoney(discounted + roundMoney(discounted * item.tax_rate / 100))
}

async function savePO(status: 'draft' | 'sent') {
  if (!validatePO()) return
  if (!authStore.currentUser) {
    showToast('Please sign in before saving an order', 'error')
    return
  }
  saving.value = true
  try {
    await invoke('save_purchase_order', {
      request: {
        poId: isEditing.value ? poId : null,
        supplierId: po.value.supplier_id,
        orderDate: po.value.order_date,
        expectedDeliveryDate: po.value.expected_delivery_date || null,
        notes: po.value.notes || null,
        discountAmount: Number(po.value.discount_amount),
        shippingCost: Number(po.value.shipping_cost),
        status,
        userId: authStore.currentUser.id,
        timestamp: new Date().toISOString(),
        items: lineItems.value.map(item => ({
          productId: item.product_id,
          quantityOrdered: Number(item.quantity_ordered),
          unitCost: Number(item.unit_cost),
          taxRate: Number(item.tax_rate),
          discountPercent: Number(item.discount_percent),
        })),
      },
    })
    showToast(`Purchase order ${isEditing.value ? 'updated' : 'created'} successfully`, 'success')
    router.push('/purchase-orders')
  } catch (error) {
    showToast('Error saving purchase order', 'error')
    console.error(error)
  } finally {
    saving.value = false
  }
}
function validatePO(): boolean {
  if (!po.value.supplier_id) {
    showToast('Please select a supplier', 'error')
    return false
  }

  if (!po.value.order_date) {
    showToast('Please select order date', 'error')
    return false
  }

  if (lineItems.value.length === 0) {
    showToast('Please add at least one line item', 'error')
    return false
  }

  const discount = Number(po.value.discount_amount)
  const shipping = Number(po.value.shipping_cost)
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal.value ||
      !Number.isFinite(shipping) || shipping < 0 ||
      Math.abs(roundMoney(discount) - discount) > 0.0000001 ||
      Math.abs(roundMoney(shipping) - shipping) > 0.0000001) {
    showToast('Enter a valid discount and shipping cost (up to two decimals); discount cannot exceed subtotal', 'error')
    return false
  }

  for (const item of lineItems.value) {
    if (!item.product_id) {
      showToast('Please select products for all line items', 'error')
      return false
    }
    if (item.quantity_ordered <= 0) {
      showToast('Quantity must be greater than 0', 'error')
      return false
    }
    if (item.unit_cost < 0) {
      showToast('Unit cost cannot be negative', 'error')
      return false
    }
  }

  return true
}

function cancel() {
  if (confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
    router.push('/purchase-orders')
  }
}

function getProductName(productId: string): string {
  return products.value.find(p => p.id === productId)?.name || ''
}
</script>

<template>
  <div class="tool-terminal po-form-view">
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">
          {{ isEditing ? 'Edit' : 'Create' }} Purchase Order
        </h2>
        <p class="view-subtitle">
          {{ isEditing ? 'Update purchase order details' : 'Add products and quantities to order from supplier' }}
        </p>
      </div>
      <Button @click="cancel" variant="outline">
        Cancel
      </Button>
    </div>

<p v-if="fromSuggestions" class="commercial-hint">{{pick('Unsaved suggestion draft: verify supplier, unit costs, quantities and incoming orders. Nothing has been ordered automatically.','غیر محفوظ تجویز مسودہ: سپلائر، اکائی لاگت، تعداد اور آنے والے آرڈر کی تصدیق کریں۔ کوئی خودکار آرڈر نہیں ہوا۔')}}</p>
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>

    <div v-else class="form-container">
      <!-- PO Header -->
      <Card class="form-section">
        <h3 class="section-title">Order Information</h3>
        <div class="form-grid">
          <div class="form-field">
            <label>Supplier *</label>
            <select v-model="po.supplier_id" class="form-select" required>
              <option value="">Select supplier...</option>
              <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
                {{ supplier.name }} ({{ supplier.supplier_code }})
              </option>
            </select>
          </div>

          <div class="form-field">
            <label>Order Date *</label>
            <Input
              v-model="po.order_date"
              type="date"
              required
            />
          </div>

          <div class="form-field">
            <label>Expected Delivery Date</label>
            <Input
              v-model="po.expected_delivery_date"
              type="date"
            />
          </div>

          <div class="form-field full-width">
            <label>Notes</label>
            <textarea
              v-model="po.notes"
              class="form-textarea"
              placeholder="Additional notes or instructions..."
              rows="3"
            ></textarea>
          </div>
        </div>
      </Card>

      <!-- Line Items -->
      <Card class="form-section">
        <div class="section-header">
          <h3 class="section-title">Order Items</h3>
          <Button @click="addLineItem" variant="outline" size="sm">
            + Add Item
          </Button>
        </div>

        <div class="line-items">
          <div v-for="(item, index) in lineItems" :key="index" class="line-item">
            <div class="line-item-number">{{ index + 1 }}</div>
            
            <div class="line-item-fields">
              <!-- Product Selection -->
              <div class="form-field">
                <label>Product *</label>
                <div class="product-select">
                  <Input
                    :value="item.product_name || getProductName(item.product_id)"
                    @input="productSearch = $event.target.value"
                    placeholder="Search product..."
                    readonly
                    @click="productSearch = ''; $event.target.removeAttribute('readonly')"
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
                  @input="calculateLineTotal(item)"
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
                  @input="calculateLineTotal(item)"
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
                  @input="calculateLineTotal(item)"
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
                  @input="calculateLineTotal(item)"
                />
              </div>

              <!-- Line Total -->
              <div class="form-field">
                <label>Line Total</label>
                <div class="line-total">{{ formatCurrency(item.line_total) }}</div>
              </div>
            </div>

            <Button
              @click="removeLineItem(index)"
              variant="outline"
              size="sm"
              class="remove-button"
              :disabled="lineItems.length === 1"
            >
              ×
            </Button>
          </div>
        </div>
      </Card>

      <!-- Totals -->
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
          <Input id="order-discount" v-model.number="po.discount_amount" type="number" min="0" step="0.01" class="w-36" />
        </div>
        <div class="totals-row">
          <label class="totals-label" for="shipping-cost">Shipping cost:</label>
          <Input id="shipping-cost" v-model.number="po.shipping_cost" type="number" min="0" step="0.01" class="w-36" />
        </div>
        <div class="totals-row total-row">
          <span class="totals-label">Total Amount:</span>
          <span class="totals-value">{{ formatCurrency(totalAmount) }}</span>
        </div>
      </Card>

      <!-- Actions -->
      <div class="form-actions">
        <Button @click="cancel" variant="outline" :disabled="saving">
          Cancel
        </Button>
        <Button @click="savePO('draft')" variant="outline" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save as Draft' }}
        </Button>
        <Button @click="savePO('sent')" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save & Send to Supplier' }}
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
}

@media (max-width: 1024px) {
  .form-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .line-item-fields {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .po-form-view {
    padding: 1rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .line-item {
    flex-direction: column;
  }

  .line-item-fields {
    grid-template-columns: 1fr;
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
