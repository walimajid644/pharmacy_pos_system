<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter,useRoute } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/composables/useToast'
import type { PurchaseOrder } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'

const router = useRouter()
const route = useRoute()
const { formatCurrency,pick } = useI18n()
const { showToast } = useToast()

interface POWithSupplier extends PurchaseOrder {
  supplier_name: string
}

const purchaseOrders = ref<POWithSupplier[]>([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref<'all' | 'receivable' | 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'>(route.query.status==='receivable'?'receivable':'all')
const dateFrom = ref('')
const dateTo = ref('')

const filteredPOs = computed(() => {
  let result = purchaseOrders.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(po =>
      po.po_number.toLowerCase().includes(query) ||
      po.supplier_name.toLowerCase().includes(query)
    )
  }

  // Status filter
  if (statusFilter.value !== 'all') {
    result = result.filter(po => statusFilter.value==='receivable' ? po.status==='sent'||po.status==='partial' : po.status === statusFilter.value)
  }

  // Date filter
  if (dateFrom.value) {
    result = result.filter(po => po.order_date >= dateFrom.value)
  }
  if (dateTo.value) {
    result = result.filter(po => po.order_date <= dateTo.value)
  }

  return result
})

const statusCounts = computed(() => {
  const counts = {
    all: purchaseOrders.value.length,
    receivable: 0,
    draft: 0,
    sent: 0,
    partial: 0,
    received: 0,
    cancelled: 0
  }
  purchaseOrders.value.forEach(po => {
    counts[po.status]++
  })
  counts.receivable=counts.sent+counts.partial
  return counts
})

onMounted(async () => {
  await loadPurchaseOrders()
})

async function loadPurchaseOrders() {
  loading.value = true
  try {
    purchaseOrders.value = await executeQuery<POWithSupplier>(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       ORDER BY po.order_date DESC, po.created_at DESC`
    )
  } catch (error) {
    showToast('Error loading purchase orders', 'error')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'draft': return 'neutral'
    case 'sent': return 'primary'
    case 'partial': return 'warning'
    case 'received': return 'success'
    case 'cancelled': return 'danger'
    default: return 'neutral'
  }
}

function createNewPO() {
  router.push('/purchase-orders/new')
}

function viewPO(id: string) {
  router.push(`/purchase-orders/${id}`)
}

function receivePO(id: string) {
  router.push(`/purchase-orders/${id}/receive`)
}

async function cancelPO(id: string) {
  if (!confirm('Are you sure you want to cancel this purchase order?')) return

  try {
    await invoke('cancel_purchase_order', { poId: id })
    showToast('Purchase order cancelled', 'success')
    await loadPurchaseOrders()
  } catch (error) {
    showToast('Error cancelling purchase order', 'error')
    console.error(error)
  }
}
</script>

<template>
  <div class="purchase-orders-view purchase-terminal">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h2 class="view-title">Purchases</h2>
        <p class="view-subtitle">
          {{ purchaseOrders.length }} total orders
        </p>
      </div>
<Button variant="outline" @click="router.push('/purchase-suggestions')">{{pick('Purchase Suggestions','خریداری کی تجاویز')}}</Button>
      <Button @click="createNewPO" size="lg">
        <span class="button-icon">+</span>
        Create Purchase Order
      </Button>
    </div>

    <!-- Status Tabs -->
    <div class="status-tabs">
      <button
        v-for="status in ['all', 'receivable', 'draft', 'sent', 'partial', 'received', 'cancelled']"
        :key="status"
        @click="statusFilter = status as any"
        class="status-tab"
        :class="{ 'status-tab-active': statusFilter === status }"
      >
        {{ status.charAt(0).toUpperCase() + status.slice(1) }}
        <span class="status-count">{{ statusCounts[status as keyof typeof statusCounts] }}</span>
      </button>
    </div>

    <!-- Filters -->
    <Card class="filters-card">
      <div class="filters-grid">
        <Input
          v-model="searchQuery"
          aria-label="Search purchase orders by number or supplier"
          placeholder="Search by PO number or supplier..."
          class="search-input"
        />
        <Input
          v-model="dateFrom"
          type="date"
          aria-label="Order date from"
          placeholder="From date"
        />
        <Input
          v-model="dateTo"
          type="date"
          aria-label="Order date to"
          placeholder="To date"
        />
        <Button @click="searchQuery = ''; dateFrom = ''; dateTo = ''" variant="outline">
          Clear Filters
        </Button>
      </div>
    </Card>

    <div class="purchase-table-scroll">
    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading purchase orders...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredPOs.length === 0" class="empty-state">
      <div class="empty-icon">📦</div>
      <h3 class="empty-title">No Purchase Orders Found</h3>
      <p class="empty-subtitle">
        {{ searchQuery || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first purchase order' }}
      </p>
      <Button v-if="!searchQuery && statusFilter === 'all'" @click="createNewPO" variant="outline">
        Create Purchase Order
      </Button>
    </div>

    <!-- Purchase register -->
    <table v-else class="purchase-table">
      <thead><tr><th>PO Number</th><th>Supplier</th><th>Order Date</th><th>Expected Delivery</th><th>Status</th><th class="money">Total Amount</th><th>Actions</th></tr></thead>
      <tbody><tr v-for="po in filteredPOs" :key="po.id">
        <td><strong>{{ po.po_number }}</strong></td><td>{{ po.supplier_name || '—' }}</td>
        <td>{{ formatDate(po.order_date) }}</td><td>{{ po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—' }}</td>
        <td><Badge :variant="getStatusVariant(po.status)">{{ po.status.toUpperCase() }}</Badge></td>
        <td class="money"><strong>{{ formatCurrency(po.total_amount) }}</strong></td>
        <td><div class="purchase-row-actions">
          <Button @click="viewPO(po.id)" variant="outline" size="sm">{{ po.status === 'draft' ? 'Edit order' : 'View details' }}</Button>
          <Button v-if="po.status === 'sent' || po.status === 'partial'" class="receive-goods" @click="receivePO(po.id)" size="sm">Receive goods</Button>
          <Button v-if="po.status === 'draft' || po.status === 'sent'" class="cancel-order" @click="cancelPO(po.id)" variant="destructive" size="sm">Cancel</Button>
        </div></td>
      </tr></tbody>
    </table>
    </div>
    <footer class="purchase-summary">
      <div><small>Orders shown</small><strong>{{ filteredPOs.length }} / {{ purchaseOrders.length }}</strong></div>
      <div><small>Awaiting receipt</small><strong>{{ statusCounts.sent + statusCounts.partial }}</strong></div>
      <div class="purchase-summary-total"><small>Filtered order total</small><strong>{{ formatCurrency(filteredPOs.reduce((sum, po) => sum + Number(po.total_amount), 0)) }}</strong></div>
    </footer>
  </div>
</template>

<style scoped>
.purchase-orders-view {
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

.button-icon {
  font-size: 1.5rem;
  margin-right: 0.5rem;
}

.status-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  overflow-x: auto;
}

.status-tab {
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background-color: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition-fast);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-tab:hover {
  background-color: var(--color-hover);
  border-color: var(--color-primary);
}

.status-tab-active {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.status-count {
  padding: 0.125rem 0.5rem;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius);
  font-size: 0.75rem;
  font-weight: 600;
}

.filters-card {
  margin-bottom: 2rem;
  padding: 1.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 1rem;
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

.empty-state {
  text-align: center;
  padding: 4rem;
}

.empty-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.empty-subtitle {
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
}

.po-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.po-card {
  padding: 1.5rem;
  transition: var(--transition-fast);
}

.po-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.po-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.po-main-info {
  flex: 1;
}

.po-number-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.po-number {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  font-family: monospace;
}

.po-supplier {
  font-size: 1rem;
  color: var(--color-text-secondary);
}

.po-amount {
  text-align: right;
}

.amount-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.amount-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
}

.po-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.detail-row.full-width {
  grid-column: 1 / -1;
}

.detail-icon {
  font-size: 1.125rem;
}

.detail-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.detail-value {
  color: var(--color-text-primary);
}

.po-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .purchase-orders-view {
    padding: 1rem;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }

  .po-header {
    flex-direction: column;
    gap: 1rem;
  }

  .po-amount {
    text-align: left;
  }

  .po-details {
    grid-template-columns: 1fr;
  }

  .status-tabs {
    overflow-x: scroll;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
