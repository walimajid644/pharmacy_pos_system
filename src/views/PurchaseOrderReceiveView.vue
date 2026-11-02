<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { formatCurrency } = useI18n()
const { showToast } = useToast()

const poId = route.params.id as string

const loading = ref(true)
const saving = ref(false)
const po = ref<PurchaseOrder & { supplier_name: string } | null>(null)

interface ReceiveItem extends PurchaseOrderItem {
  product_name: string
  receive_now: number
  batch_number: string
  expiry_date: string
}

const receiveItems = ref<ReceiveItem[]>([])

onMounted(async () => {
  await loadPO()
})

async function loadPO() {
  loading.value = true
  try {
    const [poData] = await executeQuery<PurchaseOrder & { supplier_name: string }>(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ?`,
      [poId]
    )

    if (!poData) {
      showToast('Purchase order not found', 'error')
      router.push('/purchase-orders')
      return
    }

    po.value = poData

    const items = await executeQuery<PurchaseOrderItem & { product_name: string }>(
      `SELECT poi.*, p.name as product_name
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.po_id = ?`,
      [poId]
    )

    receiveItems.value = items.map(item => ({
      ...item,
      receive_now: item.quantity_ordered - item.quantity_received,
      batch_number: '',
      expiry_date: ''
    }))
  } catch (error) {
    showToast('Error loading purchase order', 'error')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const canReceive = computed(() => {
  return receiveItems.value.some(item => item.receive_now > 0)
})

async function receiveGoods() {
  if (!po.value || !['sent', 'partial'].includes(po.value.status)) {
    showToast('Only sent or partially received orders can receive stock', 'error')
    return
  }
  if (!authStore.currentUser || !validate()) return

  saving.value = true
  try {
    await invoke('receive_purchase_order', {
      request: {
        poId,
        userId: authStore.currentUser.id,
        timestamp: new Date().toISOString(),
        items: receiveItems.value
          .filter(item => Number(item.receive_now) > 0)
          .map(item => ({
            poItemId: item.id,
            quantity: Number(item.receive_now),
            batchNumber: item.batch_number,
            expiryDate: item.expiry_date,
          })),
      },
    })
    showToast('Goods received successfully', 'success')
    router.push('/purchase-orders')
  } catch (error) {
    showToast('Error receiving goods', 'error')
    console.error(error)
  } finally {
    saving.value = false
  }
}
function validate(): boolean {
  if (!receiveItems.value.some(item => Number(item.receive_now) > 0)) {
    showToast('Enter a quantity to receive', 'error')
    return false
  }
  for (const item of receiveItems.value) {
    if (!Number.isInteger(Number(item.receive_now)) || Number(item.receive_now) < 0) {
      showToast('Receive quantities must be whole, non-negative numbers', 'error')
      return false
    }
    if (item.receive_now > 0) {
      if (!item.batch_number) {
        showToast('Please enter batch number for all items to receive', 'error')
        return false
      }
      if (!item.expiry_date) {
        showToast('Please enter expiry date for all items to receive', 'error')
        return false
      }
      if (item.expiry_date <= new Date().toISOString().slice(0, 10)) {
        showToast('Expiry date must be in the future', 'error')
        return false
      }
      if (item.receive_now > (item.quantity_ordered - item.quantity_received)) {
        showToast('Receive quantity cannot exceed ordered quantity', 'error')
        return false
      }
    }
  }
  return true
}
</script>

<template>
  <div class="tool-terminal receive-view">
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">Receive Purchase Order</h2>
        <p class="view-subtitle">Enter batch details and quantities received</p>
      </div>
      <Button @click="router.push('/purchase-orders')" variant="outline">
        Back to List
      </Button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>

    <div v-else-if="po" class="content">
      <!-- PO Info -->
      <Card class="po-info">
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

      <!-- Receive Items -->
      <Card class="receive-items">
        <h3 class="section-title">Items to Receive</h3>
        
        <div class="items-table">
          <div class="table-header">
            <div class="col-product">Product</div>
            <div class="col-ordered">Ordered</div>
            <div class="col-received">Already Received</div>
            <div class="col-receive">Receive Now</div>
            <div class="col-batch">Batch Number</div>
            <div class="col-expiry">Expiry Date</div>
          </div>

          <div v-for="item in receiveItems" :key="item.id" class="table-row">
            <div class="col-product">
              <div class="product-name">{{ item.product_name }}</div>
            </div>
            <div class="col-ordered">{{ item.quantity_ordered }}</div>
            <div class="col-received">{{ item.quantity_received }}</div>
            <div class="col-receive">
              <Input
                v-model.number="item.receive_now"
                type="number"
                min="0"
                :max="item.quantity_ordered - item.quantity_received"
              />
            </div>
            <div class="col-batch">
              <Input
                v-model="item.batch_number"
                placeholder="Batch #"
                :disabled="item.receive_now === 0"
              />
            </div>
            <div class="col-expiry">
              <Input
                v-model="item.expiry_date"
                type="date"
                :disabled="item.receive_now === 0"
              />
            </div>
          </div>
        </div>
      </Card>

      <!-- Actions -->
      <div class="actions">
        <Button @click="router.push('/purchase-orders')" variant="outline" :disabled="saving">
          Cancel
        </Button>
        <Button @click="receiveGoods" :disabled="!canReceive || saving">
          {{ saving ? 'Processing...' : 'Receive Goods & Update Stock' }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receive-view {
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

.content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.po-info {
  padding: 2rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.info-value.amount {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary);
}

.receive-items {
  padding: 2rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
}

.items-table {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr 1.5fr;
  gap: 1rem;
  padding: 1rem;
  align-items: center;
}

.table-header {
  background-color: var(--color-hover);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.table-row {
  border-bottom: 1px solid var(--color-border);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background-color: var(--color-hover);
}

.product-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.col-ordered,
.col-received {
  font-weight: 600;
  color: var(--color-text-primary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

@media (max-width: 1024px) {
  .table-header,
  .table-row {
    grid-template-columns: 1fr 0.8fr 0.8fr 0.8fr 1fr 1fr;
    font-size: 0.875rem;
  }
}

@media (max-width: 768px) {
  .receive-view {
    padding: 1rem;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .table-header > div {
    display: none;
  }

  .table-row > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .table-row > div::before {
    content: attr(class);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: capitalize;
  }

  .actions {
    flex-direction: column;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
