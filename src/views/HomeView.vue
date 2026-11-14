<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import type { AlertTab } from '@/lib/dashboardTypes';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useDashboardData } from '@/composables/useDashboardData';
import DashboardTasks from '@/components/DashboardTasks.vue';
import Button from '@/components/ui/Button.vue';
import DashboardMetrics from '@/components/dashboard/DashboardMetrics.vue';
import SalesActivityCard from '@/components/dashboard/SalesActivityCard.vue';
import RecentBillsCard from '@/components/dashboard/RecentBillsCard.vue';
import InventoryAlerts from '@/components/dashboard/InventoryAlerts.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const settingsStore = useSettingsStore();
const { pick } = useI18n();
const canViewSalesHistory = computed(() => auth.hasRole(['admin', 'manager', 'accountant']));
const canManageProducts = computed(() => auth.hasRole(['admin', 'manager']));
const {
  todaysSales,
  yesterdaySales,
  activeCustomers,
  billsToday,
  hourlySales,
  recentBills,
  totalProducts,
  lowStockCount,
  nearExpiryCount,
  lowStockItems,
  nearExpiryItems,
  loading,
  loadError,
  loadDashboardData,
} = useDashboardData();
const activeTab = ref<AlertTab>('lowStock');

function showAlerts(tab: AlertTab) {
  activeTab.value = tab;
  document.querySelector('.alerts-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

onMounted(async () => {
  await settingsStore.loadSettings();
  await loadDashboardData();
});

// Refresh totals after returning from a task while preserving the dashboard layout.
watch(
  () => route.path,
  (path, previousPath) => {
    if (path === '/' && previousPath !== '/') void loadDashboardData();
  },
);
function navigateTo(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="home-view" :class="{ 'has-load-error': loadError }">
    <!-- Dashboard actions -->
    <div class="welcome-header">
      <DashboardTasks v-if="auth.hasRole(['admin', 'manager', 'cashier'])" />
      <div class="dashboard-actions">
        <button
          type="button"
          class="dashboard-action refresh-action"
          :disabled="loading"
          @click="loadDashboardData"
        >
          <span aria-hidden="true">↻</span> {{ pick('Refresh', 'تازہ کریں') }}
        </button>
      </div>
    </div>

    <div
      v-if="loadError"
      class="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
      role="alert"
    >
      {{
        pick(
          'Dashboard data could not be loaded. Try Refresh.',
          'ڈیش بورڈ کا ڈیٹا لوڈ نہیں ہو سکا۔ تازہ کریں۔',
        )
      }}
    </div>

    <!-- Stats Grid -->
    <DashboardMetrics
      :loading="loading"
      :todays-sales="todaysSales"
      :yesterday-sales="yesterdaySales"
      :active-customers="activeCustomers"
      :bills-today="billsToday"
      :total-products="totalProducts"
      :low-stock-count="lowStockCount"
      :near-expiry-count="nearExpiryCount"
      :can-view-sales-history="canViewSalesHistory"
      :can-manage-products="canManageProducts"
      :can-manage-customers="auth.hasRole(['admin', 'manager', 'cashier'])"
      @sales-history="navigateTo('/sales-history')"
      @customers="navigateTo('/customers')"
      @products="navigateTo('/products')"
      @alerts="showAlerts"
    />

    <nav class="quick-actions" :aria-label="pick('Quick actions', 'فوری کام')">
      <Button
        v-if="auth.hasRole(['admin', 'manager', 'cashier'])"
        variant="primary"
        size="md"
        @click="navigateTo('/pos')"
      >
        <span class="text-lg leading-none">＋</span>
        {{ pick('New Sale', 'نئی فروخت') }}
      </Button>
      <Button
        v-if="canManageProducts"
        variant="outline"
        size="md"
        @click="router.push({ path: '/purchase-orders', query: { status: 'receivable' } })"
      >
        <span class="text-lg leading-none">↓</span>
        {{ pick('Receive PO', 'مال وصول کریں') }}
      </Button>
      <Button
        v-if="canManageProducts"
        variant="outline"
        size="md"
        @click="navigateTo('/daily-closing')"
      >
        <span class="text-lg leading-none">▤</span>
        {{ pick('Daily Closing', 'روزانہ بندش') }}
      </Button>
      <Button
        v-if="auth.hasRole(['admin', 'manager', 'cashier'])"
        variant="outline"
        size="md"
        @click="navigateTo('/shifts')"
      >
        <span class="text-lg leading-none">▣</span>
        {{ pick('Open Shift', 'شفٹ کھولیں') }}
      </Button>
    </nav>

    <div class="insights-grid">
      <SalesActivityCard
        :loading="loading"
        :todays-sales="todaysSales"
        :bills-today="billsToday"
        :hourly-sales="hourlySales"
      />
      <RecentBillsCard
        :loading="loading"
        :recent-bills="recentBills"
        :can-view-sales-history="canViewSalesHistory"
        @sales-history="navigateTo('/sales-history')"
      />
    </div>

    <!-- Alerts Section -->
    <InventoryAlerts
      :active-tab="activeTab"
      :loading="loading"
      :low-stock-count="lowStockCount"
      :near-expiry-count="nearExpiryCount"
      :low-stock-items="lowStockItems"
      :near-expiry-items="nearExpiryItems"
      :can-manage-products="canManageProducts"
      @tab="showAlerts"
      @products="navigateTo('/products')"
      @expiry="(batch) => router.push({ path: '/expiry-actions', query: { batch } })"
    />
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

.welcome-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.quick-actions :deep(.btn) {
  gap: var(--space-2);
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

@media (max-width: 767px) {
  .insights-grid {
    grid-template-columns: 1fr;
  }
}

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
  .insight-card {
    min-height: 0;
  }

  .insight-card {
    overflow: auto;
  }

  .insight-card:first-child {
    display: flex;
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .home-view {
    padding: var(--space-4);
  }
}
</style>
