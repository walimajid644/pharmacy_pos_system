<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import type { AlertTab } from '@/lib/dashboardTypes';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useDashboardData } from '@/composables/useDashboardData';
import DashboardTasks from '@/components/DashboardTasks.vue';
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
    if (path === '/' && previousPath !== '/') void loadDashboardData({ background: true });
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
          @click="loadDashboardData()"
        >
          <span aria-hidden="true">↻</span> {{ pick('Refresh', 'تازہ کریں') }}
        </button>
      </div>
    </div>

    <div
      v-if="loadError"
      class="rounded-lg border border-danger bg-danger-bg p-4 text-danger-text"
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
/* Match the Sales terminal's 11–12px text, short controls and tight spacing. */
.home-view {
  --compact-panel: var(--color-primary-50);
  --compact-field: var(--surface-card);
  --compact-rule: var(--color-primary-400);
  --compact-ink: var(--color-primary-800);
  flex: 1;
  width: 100%;
  min-height: 0;
  max-width: none;
  margin: 0;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font:
    12px/1.25 Arial,
    Tahoma,
    sans-serif;
  font-variant-numeric: tabular-nums;
}
:global([data-theme='dark'] .home-view) {
  --compact-panel: var(--color-primary-50);
  --compact-field: var(--surface-card);
  --compact-rule: var(--color-primary-600);
  --compact-ink: var(--text-primary);
}
.home-view :deep(*) {
  box-sizing: border-box;
}
.welcome-header,
.dashboard-actions,
.quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.welcome-header {
  justify-content: space-between;
}
.dashboard-actions {
  margin-inline-start: auto;
}
.home-view.home-view :deep(button:not(.stat-card):not(.bill-row):not(.alert-tab)) {
  height: 28px;
  min-height: 0;
  width: auto;
  padding: 3px 8px;
  border: 1px solid var(--compact-rule);
  border-radius: 2px;
  background: var(--compact-field);
  color: var(--compact-ink);
  font:
    11px/1.2 Arial,
    Tahoma,
    sans-serif;
  box-shadow: none;
  gap: 5px;
  cursor: pointer;
}
.home-view.home-view :deep(button.bg-brand-600:not(.stat-card):not(.bill-row):not(.alert-tab)) {
  background: var(--brand-700);
  border-color: var(--brand-600);
  color: white;
}
.home-view :deep(button:disabled) {
  opacity: 0.5;
  cursor: default;
}
.home-view :deep(button:focus-visible) {
  outline: 2px solid var(--brand-600);
  outline-offset: 1px;
}
.home-view.home-view :deep(.dashboard-tasks) {
  gap: 6px;
}
.home-view.home-view :deep(.task-card) {
  min-width: 95px;
  border-bottom: 2px solid var(--brand-600);
}
.home-view.home-view :deep(.task-icon) {
  width: 20px;
  height: 18px;
  font-size: 14px;
  background: transparent;
}
.quick-actions {
  flex-wrap: wrap;
}
.quick-actions :deep(button > span),
.dashboard-action > span {
  font-size: 14px;
  line-height: 1;
}
.home-view.home-view :deep(.stats-grid) {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.home-view.home-view :deep(.stat-card) {
  min-width: 0;
  min-height: 74px;
  padding: 6px 8px;
  gap: 4px;
  border-radius: 2px;
  box-shadow: none;
}
.home-view.home-view :deep(.stat-card.clickable:hover) {
  transform: none;
  background: var(--color-hover);
}
.home-view.home-view :deep(.stat-card-header) {
  gap: 4px;
  align-items: start;
}
.home-view.home-view :deep(.title-en),
.home-view.home-view :deep(.title-ur) {
  font:
    11px/1.25 Arial,
    Tahoma,
    sans-serif;
}
.home-view.home-view :deep(.stat-card-icon) {
  font-size: 16px;
}
.home-view.home-view :deep(.stat-card-value) {
  font:
    bold 18px/1.15 Arial,
    Tahoma,
    sans-serif;
  overflow-wrap: anywhere;
}
.home-view.home-view :deep(.stat-card-trend) {
  font-size: 10px;
  line-height: 1.2;
}
.insights-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 6px;
  min-height: 0;
}
.home-view.home-view :deep(.insight-card) {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 2px;
  box-shadow: none;
}
.home-view.home-view :deep(.insight-heading) {
  gap: 8px;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.home-view.home-view :deep(.heading-3) {
  font:
    bold 12px/1.25 Arial,
    Tahoma,
    sans-serif;
  margin: 0 0 3px;
}
.home-view.home-view :deep(.heading-4) {
  font-size: 12px;
}
.home-view.home-view :deep(.body),
.home-view.home-view :deep(.body-sm),
.home-view.home-view :deep(.number-display-sm) {
  font:
    11px/1.25 Arial,
    Tahoma,
    sans-serif;
}
.home-view.home-view :deep(.number-display) {
  font:
    bold 18px/1.2 Arial,
    Tahoma,
    sans-serif;
}
.home-view.home-view :deep(.sales-chart) {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}
.home-view.home-view :deep(.insight-empty),
.home-view.home-view :deep(.empty-state) {
  padding: 8px;
  font-size: 11px;
}
.home-view.home-view :deep(.empty-icon) {
  font-size: 20px;
  margin-bottom: 4px;
}
.home-view.home-view :deep(.bill-row) {
  height: 36px;
  padding: 3px 4px;
  gap: 6px;
  font-size: 11px;
}
.home-view.home-view :deep(.bill-row strong),
.home-view.home-view :deep(.bill-row b) {
  font-size: 12px;
}
.home-view.home-view :deep(.bill-row small) {
  font-size: 10px;
}
.home-view.home-view :deep(.alerts-card) {
  min-height: 0;
  padding: 0;
  border-radius: 2px;
  box-shadow: none;
}
.home-view.home-view :deep(.alerts-header) {
  flex-shrink: 0;
  padding: 4px 8px;
  gap: 6px;
  background: var(--compact-panel);
  color: var(--compact-ink);
}
.home-view.home-view :deep(.alert-tabs) {
  gap: 4px;
}
.home-view.home-view :deep(.alert-tab) {
  min-height: 24px;
  padding: 2px 5px;
  border-radius: 2px;
  font-size: 10px;
}
.home-view.home-view :deep(.alert-tab .bilingual-text),
.home-view.home-view :deep(.alert-tab .bilingual-text span) {
  font:
    10px/1.2 Arial,
    Tahoma,
    sans-serif;
}
.home-view.home-view :deep(.alerts-content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.home-view.home-view :deep(.alerts-table) {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.home-view.home-view :deep(.alerts-table th) {
  height: 32px;
  padding: 3px 6px;
  position: static;
  background: var(--compact-field);
  font:
    11px/1.2 Arial,
    Tahoma,
    sans-serif;
  border-bottom: 1px solid var(--compact-rule);
}
.home-view.home-view :deep(.alerts-table th:first-child) {
  width: 28%;
}
.home-view.home-view :deep(.alerts-table td) {
  height: 34px;
  padding: 3px 6px;
  font-size: 11px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.home-view.home-view :deep(.alerts-table td:first-child) {
  max-height: 34px;
}
.home-view.home-view :deep(.alerts-table td button) {
  height: 24px !important;
  padding: 2px 6px !important;
}
.home-view.home-view :deep(.compact-pager) {
  height: 26px;
  padding: 2px 6px;
  gap: 8px;
  color: var(--compact-ink);
}
.home-view.home-view :deep(.compact-pager button) {
  height: 22px;
}
.home-view.home-view :deep(.skeleton) {
  height: 26px;
  border-radius: 2px;
}
.home-view > [role='alert'] {
  padding: 5px 8px;
  font-size: 11px;
}
@media (min-width: 900px) and (min-height: 500px) {
  .home-view {
    height: 100%;
    display: grid;
    grid-template-rows: auto auto minmax(110px, 0.9fr) minmax(120px, 1fr);
    overflow: hidden;
  }
  .home-view.has-load-error {
    grid-template-rows: auto auto auto minmax(100px, 0.9fr) minmax(100px, 1fr);
  }
}
@media (max-width: 899px) {
  .home-view.home-view :deep(.stats-grid) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .insights-grid {
    min-height: 200px;
  }
  .home-view.home-view :deep(.alerts-card) {
    min-height: 220px;
  }
}
@media (max-width: 600px) {
  .home-view {
    padding: 6px;
  }
  .home-view.home-view :deep(.stats-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .insights-grid {
    grid-template-columns: 1fr;
  }
  .home-view.home-view :deep(.insight-card) {
    min-height: 180px;
  }
  .home-view.home-view :deep(.alerts-header) {
    align-items: start;
  }
}
</style>
