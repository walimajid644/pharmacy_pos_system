<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { useI18n } from '@/lib/i18n'
import StatCard from '@/components/ui/StatCard.vue'
import DashboardTasks from '@/components/DashboardTasks.vue'
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import BilingualText from '@/components/ui/BilingualText.vue'
import { localDateKey, localDayBounds } from '@/lib/businessDay'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const settingsStore = useSettingsStore()
const canViewSalesHistory = computed(() => auth.hasRole(['admin', 'manager', 'accountant']))
const canManageProducts = computed(() => auth.hasRole(['admin', 'manager']))
const { t, pick, formatCurrency, formatNumber, formatDate } = useI18n()

// Stats
const todaysSales = ref(0)
const yesterdaySales = ref(0)
const activeCustomers = ref(0)
const billsToday = ref(0)
const hourlySales = ref<number[]>(Array(24).fill(0))
const recentBills = ref<{ id: string; invoice_number: string; invoice_date: string; net_amount: number; payment_method: string; customer_name: string | null }[]>([])
const totalProducts = ref(0)
const lowStockCount = ref(0)
const nearExpiryCount = ref(0)

const lowStockItems = ref<any[]>([])
const nearExpiryItems = ref<any[]>([])

const loading = ref(true)
const loadError = ref(false)
const activeTab = ref<'lowStock' | 'nearExpiry'>('lowStock')
function showAlerts(tab:'lowStock'|'nearExpiry'){activeTab.value=tab;document.querySelector('.alerts-card')?.scrollIntoView({block:'nearest',behavior:'smooth'})}
const averageBill = computed(() => billsToday.value ? todaysSales.value / billsToday.value : 0)
const salesChange = computed(() => yesterdaySales.value > 0 ? `${formatNumber(Math.round((todaysSales.value - yesterdaySales.value) / yesterdaySales.value * 100))}% ${pick('vs yesterday','گزشتہ روز کے مقابلے میں')}` : '')
const chartMax = computed(() => Math.max(1, ...hourlySales.value))
const chartPoints = computed(() => hourlySales.value.map((amount, hour) =>
  `${20 + hour * 28.5},${155 - amount / chartMax.value * 120}`).join(' '))
const chartArea = computed(() => `20,155 ${chartPoints.value} 675.5,155`)

onMounted(async () => {
  await settingsStore.loadSettings()
  await loadDashboardData()
})

// Refresh totals after returning from a task while preserving the dashboard layout.
watch(() => route.path, (path, previousPath) => {
  if (path === '/' && previousPath !== '/') void loadDashboardData()
})

async function loadDashboardData() {
  loading.value = true
  loadError.value = false
  try {
    const [dayStart, dayEnd] = localDayBounds(localDateKey())
    const todayInvoices = await executeQuery<{ invoice_date: string; net_amount: number }>(
      `SELECT invoice_date, net_amount FROM sales_dashboard
       WHERE invoice_date >= ? AND invoice_date < ? AND status = 'completed'`,
      [dayStart, dayEnd]
    )
    todaysSales.value = todayInvoices.reduce((sum, invoice) => sum + Number(invoice.net_amount), 0)
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const [yesterdayStart, yesterdayEnd] = localDayBounds(localDateKey(yesterday))
    const [previous] = await executeQuery<{ total: number }>(`SELECT COALESCE(SUM(net_amount), 0) AS total FROM sales_dashboard WHERE invoice_date >= ? AND invoice_date < ? AND status = 'completed'`, [yesterdayStart, yesterdayEnd])
    yesterdaySales.value = Number(previous?.total || 0)
    const [customers] = await executeQuery<{ count: number }>(`SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL`)
    activeCustomers.value = Number(customers?.count || 0)
    billsToday.value = todayInvoices.length
    const hours = Array(24).fill(0) as number[]
    for (const invoice of todayInvoices) hours[new Date(invoice.invoice_date).getHours()] += Number(invoice.net_amount)
    hourlySales.value = hours
    recentBills.value = await executeQuery(
      `SELECT si.id, si.invoice_number, si.invoice_date, si.net_amount, si.payment_method,
              TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name
       FROM sales_dashboard si LEFT JOIN customers c ON c.id = si.customer_id
       WHERE si.status = 'completed' ORDER BY si.invoice_date DESC LIMIT 6`
    )

    // Get total products
    const productsResult = await executeQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL AND is_active = 1'
    )
    totalProducts.value = productsResult[0]?.count || 0

    // Get low stock items
    lowStockItems.value = await executeQuery(
      `SELECT p.*, 
              COALESCE(SUM(pb.quantity_in_stock), 0) as current_stock
       FROM products p
       LEFT JOIN product_batches pb ON p.id = pb.product_id AND pb.expiry_date >= date('now', 'localtime')
       WHERE p.deleted_at IS NULL AND p.is_active = 1
       GROUP BY p.id
       HAVING current_stock <= p.reorder_level
       ORDER BY current_stock ASC
       LIMIT 10`
    )
    const [lowCount] = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
         SELECT p.id FROM products p LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.expiry_date >= date('now', 'localtime')
         WHERE p.deleted_at IS NULL AND p.is_active = 1 GROUP BY p.id
         HAVING COALESCE(SUM(pb.quantity_in_stock), 0) <= p.reorder_level)`
    )
    lowStockCount.value = lowCount?.count || 0

    // Get near-expiry items
    const nearExpiryDays = Number(settingsStore.settings?.near_expiry_days ?? 60)
    const expiryLimit = new Date()
    expiryLimit.setDate(expiryLimit.getDate() + nearExpiryDays)
    const expiryLimitKey = localDateKey(expiryLimit)
    nearExpiryItems.value = await executeQuery(
      `SELECT pb.*, p.name, p.sku
       FROM product_batches pb
       JOIN products p ON pb.product_id = p.id
       WHERE p.deleted_at IS NULL 
         AND pb.quantity_in_stock > 0
         AND DATE(pb.expiry_date) <= DATE(?)
       ORDER BY pb.expiry_date ASC
       LIMIT 10`, [expiryLimitKey]
    )
    const [expiryCount] = await executeQuery<{ count: number }>(
      `SELECT COUNT(*) AS count FROM product_batches pb JOIN products p ON p.id = pb.product_id
       WHERE p.deleted_at IS NULL AND pb.quantity_in_stock > 0
         AND DATE(pb.expiry_date) <= DATE(?)`, [expiryLimitKey]
    )
    nearExpiryCount.value = expiryCount?.count || 0
  } catch (error) {
    console.error('Error loading dashboard data:', error)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(`${expiryDate.slice(0, 10)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffTime = expiry.getTime() - today.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

function getExpiryBadgeVariant(days: number) {
  if (days < 0) return 'danger'
  if (days <= 30) return 'danger'
  if (days <= 60) return 'warning'
  return 'success'
}

function getExpiryText(days: number): string {
  if (days < 0) return `${formatNumber(Math.abs(days))} ${pick('days expired', 'دن میعاد ختم ہوئے')}`
  return `${formatNumber(days)} ${pick('days left', 'دن باقی')}`
}

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="home-view" :class="{ 'has-load-error': loadError }">
    <!-- Dashboard actions -->
    <div class="welcome-header">
      <DashboardTasks v-if="auth.hasRole(['admin', 'manager', 'cashier'])" />
      <div class="dashboard-actions">
        <button type="button" class="dashboard-action refresh-action" :disabled="loading" @click="loadDashboardData">
          <span aria-hidden="true">↻</span> {{ pick('Refresh', 'تازہ کریں') }}
        </button>
      </div>
    </div>

    <div v-if="loadError" class="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800" role="alert">
      {{ pick('Dashboard data could not be loaded. Try Refresh.', 'ڈیش بورڈ کا ڈیٹا لوڈ نہیں ہو سکا۔ تازہ کریں۔') }}
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <StatCard
        :title="t('todays_sales')"
        :value="loading ? '…' : formatCurrency(todaysSales)"
        icon="💰"
        color="success"
        :trend="yesterdaySales > 0 ? (todaysSales >= yesterdaySales ? 'up' : 'down') : undefined"
        :trend-value="salesChange"
        :clickable="canViewSalesHistory"
        @click="navigateTo('/sales-history')"
      />

      <StatCard :title="t('low_stock_items')" :value="loading ? '…' : formatNumber(lowStockCount)" icon="⚠️" :color="lowStockCount > 0 ? 'danger' : 'success'" :clickable="true" @click="showAlerts('lowStock')" />
      <StatCard :title="t('near_expiry_items')" :value="loading ? '…' : formatNumber(nearExpiryCount)" icon="📅" :color="nearExpiryCount > 0 ? 'warning' : 'success'" :clickable="true" @click="showAlerts('nearExpiry')" />
      <StatCard :title="pick('Active Customers', 'فعال گاہک')" :value="loading ? '…' : formatNumber(activeCustomers)" icon="♙" color="primary" :clickable="auth.hasRole(['admin', 'manager', 'cashier'])" @click="navigateTo('/customers')" />
      <StatCard
        :title="pick('Bills Today', 'آج کے بل')"
        :value="loading ? '…' : formatNumber(billsToday)"
        icon="🧾"
        color="primary"
        :clickable="canViewSalesHistory"
        @click="navigateTo('/sales-history')"
      />

      <StatCard
        :title="pick('Average Bill', 'اوسط بل')"
        :value="loading ? '…' : formatCurrency(averageBill)"
        icon="📊"
        color="primary"
      />

      <StatCard
        :title="t('total_products')"
        :value="loading ? '…' : formatNumber(totalProducts)"
        icon="📦"
        color="primary"
        :clickable="canManageProducts"
        @click="navigateTo('/products')"
      />

    </div>

    <nav class="quick-actions" :aria-label="pick('Quick actions','فوری کام')">
      <Button
        v-if="auth.hasRole(['admin','manager','cashier'])"
        variant="primary"
        size="md"
        @click="navigateTo('/pos')"
      >
        <span class="text-lg leading-none">＋</span>
        {{ pick('New Sale','نئی فروخت') }}
      </Button>
      <Button
        v-if="canManageProducts"
        variant="outline"
        size="md"
        @click="router.push({path:'/purchase-orders',query:{status:'receivable'}})"
      >
        <span class="text-lg leading-none">↓</span>
        {{ pick('Receive PO','مال وصول کریں') }}
      </Button>
      <Button
        v-if="canManageProducts"
        variant="outline"
        size="md"
        @click="navigateTo('/daily-closing')"
      >
        <span class="text-lg leading-none">▤</span>
        {{ pick('Daily Closing','روزانہ بندش') }}
      </Button>
      <Button
        v-if="auth.hasRole(['admin','manager','cashier'])"
        variant="outline"
        size="md"
        @click="navigateTo('/shifts')"
      >
        <span class="text-lg leading-none">▣</span>
        {{ pick('Open Shift','شفٹ کھولیں') }}
      </Button>
    </nav>

    <div class="insights-grid">
      <Card class="insight-card">
        <div class="insight-heading">
          <div>
            <h3 class="heading-3 mb-1">{{ pick('Sales today, hour by hour', 'آج کی فروخت، فی گھنٹہ') }}</h3>
            <p class="body-sm text-text-secondary">{{ formatDate(new Date()) }} · {{ pick('local time', 'مقامی وقت') }}</p>
          </div>
          <strong class="number-display text-brand-600">{{ formatCurrency(todaysSales) }}</strong>
        </div>
        <div v-if="loading" class="skeleton"></div>
        <div v-else-if="billsToday === 0" class="insight-empty">{{ pick('No completed sales today', 'آج کوئی مکمل فروخت نہیں ہوئی') }}</div>
        <svg v-else class="sales-chart" viewBox="0 0 700 180" role="img" :aria-label="pick('Hourly sales for today', 'آج کی فی گھنٹہ فروخت')">
          <line x1="20" y1="155" x2="675.5" y2="155" stroke="currentColor" opacity=".25" />
          <polygon :points="chartArea" fill="var(--color-primary)" opacity=".12" />
          <polyline :points="chartPoints" fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <text v-for="hour in [0, 4, 8, 12, 16, 20]" :key="hour" :x="20 + hour * 28.5" y="176" text-anchor="middle" fill="currentColor" font-size="11">{{ formatNumber(String(hour).padStart(2, '0')) }}</text>
        </svg>
      </Card>
      <Card class="insight-card">
        <div class="insight-heading">
          <div>
            <h3 class="heading-3 mb-1">{{ pick('Recent Bills', 'حالیہ بل') }}</h3>
            <p class="body-sm text-text-secondary">{{ pick('Latest completed sales', 'تازہ مکمل فروخت') }}</p>
          </div>
        </div>
        <div v-if="loading" class="skeleton"></div>
        <div v-else-if="!recentBills.length" class="insight-empty">{{ pick('No bills yet', 'ابھی کوئی بل نہیں') }}</div>
        <template v-else>
          <component :is="canViewSalesHistory ? 'button' : 'div'" v-for="bill in recentBills" :key="bill.id" :type="canViewSalesHistory ? 'button' : undefined" class="bill-row" :class="{ 'bill-row-link': canViewSalesHistory }" @click="canViewSalesHistory && navigateTo('/sales-history')">
            <span><strong class="body font-semibold">{{ bill.customer_name || pick('Walk-in', 'عام گاہک') }}</strong><small class="body-sm text-text-secondary"><bdi>{{ bill.invoice_number }}</bdi> · {{ formatDate(bill.invoice_date) }} · {{ t(bill.payment_method as 'cash' | 'card' | 'mobile') }}</small></span>
            <b class="number-display-sm text-brand-600">{{ formatCurrency(bill.net_amount) }}</b>
          </component>
        </template>
      </Card>
    </div>

    <!-- Alerts Section -->
    <Card class="alerts-card">
      <div class="alerts-header">
        <h3 class="heading-3">
          {{ pick('Inventory alerts', 'انوینٹری انتباہات') }}
        </h3>
        
        <!-- Tabs -->
        <div class="alert-tabs">
          <button
            @click="showAlerts('lowStock')"
            class="alert-tab"
            :class="{ 'alert-tab-active': activeTab === 'lowStock' }"
          >
            <Badge :variant="lowStockCount > 0 ? 'danger' : 'neutral'" :dot="lowStockCount > 0">
              <BilingualText textKey="low_stock_items" />
              ({{ formatNumber(lowStockCount) }})
            </Badge>
          </button>
          <button
            @click="showAlerts('nearExpiry')"
            class="alert-tab"
            :class="{ 'alert-tab-active': activeTab === 'nearExpiry' }"
          >
            <Badge :variant="nearExpiryCount > 0 ? 'warning' : 'neutral'" :dot="nearExpiryCount > 0">
              <BilingualText textKey="near_expiry_items" />
              ({{ formatNumber(nearExpiryCount) }})
            </Badge>
          </button>
        </div>
      </div>

      <!-- Low Stock Tab -->
      <div v-if="activeTab === 'lowStock'" class="alerts-content">
        <div v-if="loading" class="loading-state">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>

        <div v-else-if="lowStockItems.length === 0" class="empty-state">
          <div class="empty-icon">✅</div>
          <h4 class="heading-4 mb-1">{{ pick('No Low Stock Items', 'کم اسٹاک والی کوئی چیز نہیں') }}</h4>
          <p class="body-sm text-text-secondary">{{ pick('All products have sufficient stock', 'تمام مصنوعات کا اسٹاک کافی ہے') }}</p>
        </div>

        <table v-else class="alerts-table">
          <thead>
            <tr>
              <th class="label">< BilingualText textKey="product_name" /></th>
              <th class="label"><BilingualText textKey="sku" /></th>
              <th class="label"><BilingualText textKey="stock" /></th>
              <th class="label">{{ pick('Reorder Level', 'دوبارہ آرڈر کی حد') }}</th>
              <th class="label">{{ pick('Actions', 'اقدامات') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in lowStockItems" :key="item.id" class="table-row">
              <td class="body font-medium">{{ item.name }}</td>
              <td class="mono body-sm">{{ item.sku }}</td>
              <td>
                <Badge variant="danger" :dot="true" size="sm">
                  {{ formatNumber(item.current_stock) }} {{ pick('units', 'اکائیاں') }}
                </Badge>
              </td>
              <td class="body-sm">{{ formatNumber(item.reorder_level) }}</td>
              <td>
                <Button v-if="canManageProducts" variant="outline" size="sm" @click="navigateTo('/products')">
                  {{ pick('View', 'دیکھیں') }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Near Expiry Tab -->
      <div v-if="activeTab === 'nearExpiry'" class="alerts-content">
        <div v-if="loading" class="loading-state">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>

        <div v-else-if="nearExpiryItems.length === 0" class="empty-state">
          <div class="empty-icon">✅</div>
          <h4 class="heading-4 mb-1">{{ pick('No Near Expiry Items', 'قریب المیعاد کوئی چیز نہیں') }}</h4>
          <p class="body-sm text-text-secondary">{{ pick('All batches are within safe expiry dates', 'تمام بیچوں کی میعاد مناسب ہے') }}</p>
        </div>

        <table v-else class="alerts-table">
          <thead>
            <tr>
              <th class="label"><BilingualText textKey="product_name" /></th>
              <th class="label"><BilingualText textKey="batch_number" /></th>
              <th class="label"><BilingualText textKey="expiry_date" /></th>
              <th class="label">{{ pick('Days Left', 'باقی دن') }}</th>
              <th class="label"><BilingualText textKey="stock" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in nearExpiryItems" :key="item.id" class="table-row">
              <td class="body font-medium">{{ item.name }}</td>
              <td class="mono body-sm">{{ item.batch_number }}</td>
              <td class="body-sm">{{ formatDate(item.expiry_date) }}</td>
              <td>
                <Badge :variant="getExpiryBadgeVariant(getDaysUntilExpiry(item.expiry_date))" size="sm">
                  {{ getExpiryText(getDaysUntilExpiry(item.expiry_date)) }}
                </Badge>
              </td>
              <td class="body-sm">
                {{ formatNumber(item.quantity_in_stock) }}
                <Button
                  v-if="canManageProducts"
                  variant="ghost"
                  size="xs"
                  @click="router.push({path:'/expiry-actions',query:{batch:item.id}})"
                >
                  {{ pick('Actions','کارروائیاں') }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.home-view {
  flex: 1;
  width: 100%;
  padding: var(--space-4) var(--space-5);
  max-width: 1800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Dashboard actions */
.welcome-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

/* Quick actions navigation */
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.quick-actions :deep(.btn) {
  gap: var(--space-2);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.stats-grid :deep(.stat-card) {
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}

.stats-grid :deep(.stat-card-header) {
  gap: var(--space-2);
  align-items: center;
}

.stats-grid :deep(.title-en),
.stats-grid :deep(.title-ur) {
  font-size: var(--text-sm);
  line-height: 1.3;
}

.stats-grid :deep(.stat-card-icon) {
  font-size: var(--text-xl);
}

.stats-grid :deep(.stat-card-value) {
  font-size: var(--text-2xl);
  overflow-wrap: anywhere;
}

.stats-grid :deep(.stat-card-trend) {
  font-size: var(--text-sm);
}

.dashboard-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-inline-start: auto;
}

.dashboard-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-base);
}

.dashboard-action span {
  font-size: 1.1rem;
  line-height: 1;
}

.refresh-action {
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.refresh-action:hover {
  background: var(--color-hover);
  border-color: var(--color-primary);
}

.dashboard-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.dashboard-action:disabled {
  opacity: 0.6;
  cursor: wait;
}

.insights-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--space-3);
}

.insight-card {
  padding: var(--space-3);
  min-width: 0;
}

.insight-heading {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: start;
  margin-bottom: var(--space-2);
}

.insight-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}

.sales-chart {
  width: 100%;
  height: auto;
  color: var(--color-text-secondary);
}

.bill-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2);
  border-top: 1px solid var(--color-border);
  text-align: start;
  color: var(--color-text-primary);
  transition: var(--transition-base);
}

.bill-row-link:hover {
  background: var(--color-hover);
}

.bill-row-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.bill-row span {
  min-width: 0;
}

.bill-row strong,
.bill-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .insights-grid {
    grid-template-columns: 1fr;
  }
}

/* Alerts Card */
.alerts-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.alerts-header {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.alert-tabs {
  display: flex;
  gap: var(--space-2);
}

.alert-tab {
  background: none;
  border: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-fast);
}

.alert-tab:hover {
  background-color: var(--color-hover);
}

.alert-tab-active {
  background-color: var(--color-primary);
  color: white;
}

.alert-tab-active:hover {
  background-color: var(--color-primary-hover);
}

.alerts-content {
  flex: 1;
  min-height: 0;
  padding: var(--space-2) var(--space-3);
  overflow: auto;
}

/* Table with design system */
.alerts-table {
  width: 100%;
  border-collapse: collapse;
}

.alerts-table th {
  text-align: start;
  padding: var(--space-2);
  border-bottom: 2px solid var(--color-border);
  position: sticky;
  top: -0.5rem;
  background: var(--color-surface);
  z-index: 1;
}

.alerts-table td {
  padding: var(--space-2);
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border);
}

.table-row {
  transition: var(--transition-fast);
}

.table-row:hover {
  background-color: var(--color-hover);
}

.mono {
  font-family: var(--font-mono);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.skeleton {
  height: 3rem;
  background: var(--color-hover);
  border-radius: var(--radius-md);
  animation: shimmer 1.2s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Empty State */
.empty-state {
  padding: var(--space-3);
  text-align: center;
}

.empty-icon {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-2);
}

/* Responsive */
@media (min-width: 1280px) {
  .stats-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

/* Keep every dashboard section in view; long lists scroll within their panel. */
@media (min-width: 1000px) and (min-height: 500px) {
  .home-view {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto minmax(100px, 0.8fr) minmax(100px, 1fr);
  }

  .home-view.has-load-error {
    grid-template-rows: auto auto auto auto minmax(100px, 0.8fr) minmax(100px, 1fr);
  }

  .insights-grid,
  .insight-card,
  .alerts-card {
    min-height: 0;
  }

  .insight-card {
    overflow: auto;
  }

  .insight-card:first-child {
    display: flex;
    flex-direction: column;
  }

  .insight-heading {
    flex-shrink: 0;
  }

  .sales-chart {
    flex: 1;
    min-height: 0;
  }

  .alerts-card {
    display: flex;
    flex-direction: column;
  }

  .alerts-header {
    flex-shrink: 0;
  }

  .alerts-content {
    min-height: 0;
    flex: 1;
  }
}

@media (max-width: 768px) {
  .home-view {
    padding: var(--space-4);
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .alerts-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .alert-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .alerts-table {
    font-size: var(--text-xs);
  }

  .alerts-table th,
  .alerts-table td {
    padding: var(--space-2);
  }
}
</style>
