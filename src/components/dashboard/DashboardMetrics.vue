<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/lib/i18n';
import type { AlertTab } from '@/lib/dashboardTypes';
import StatCard from '@/components/ui/StatCard.vue';

const props = defineProps<{
  loading: boolean;
  todaysSales: number;
  yesterdaySales: number;
  activeCustomers: number;
  billsToday: number;
  totalProducts: number;
  lowStockCount: number;
  nearExpiryCount: number;
  canViewSalesHistory: boolean;
  canManageProducts: boolean;
  canManageCustomers: boolean;
}>();
const emit = defineEmits<{
  salesHistory: [];
  customers: [];
  products: [];
  alerts: [tab: AlertTab];
}>();
const { t, pick, formatCurrency, formatNumber } = useI18n();
const averageBill = computed(() => (props.billsToday ? props.todaysSales / props.billsToday : 0));
const salesChange = computed(() =>
  props.yesterdaySales > 0
    ? `${formatNumber(Math.round(((props.todaysSales - props.yesterdaySales) / props.yesterdaySales) * 100))}% ${pick('vs yesterday', 'گزشتہ روز کے مقابلے میں')}`
    : '',
);
</script>

<template>
  <div class="stats-grid">
    <StatCard
      :title="t('todays_sales')"
      :value="loading ? '…' : formatCurrency(todaysSales)"
      icon="💰"
      color="success"
      :trend="yesterdaySales > 0 ? (todaysSales >= yesterdaySales ? 'up' : 'down') : undefined"
      :trend-value="salesChange"
      :clickable="canViewSalesHistory"
      @click="emit('salesHistory')"
    />

    <StatCard
      :title="t('low_stock_items')"
      :value="loading ? '…' : formatNumber(lowStockCount)"
      icon="⚠️"
      :color="lowStockCount > 0 ? 'warning' : 'success'"
      :clickable="true"
      @click="emit('alerts', 'lowStock')"
    />
    <StatCard
      :title="t('near_expiry_items')"
      :value="loading ? '…' : formatNumber(nearExpiryCount)"
      icon="📅"
      :color="nearExpiryCount > 0 ? 'warning' : 'success'"
      :clickable="true"
      @click="emit('alerts', 'nearExpiry')"
    />
    <StatCard
      :title="pick('Active Customers', 'فعال گاہک')"
      :value="loading ? '…' : formatNumber(activeCustomers)"
      icon="♙"
      color="primary"
      :clickable="canManageCustomers"
      @click="emit('customers')"
    />
    <StatCard
      :title="pick('Bills Today', 'آج کے بل')"
      :value="loading ? '…' : formatNumber(billsToday)"
      icon="🧾"
      color="primary"
      :clickable="canViewSalesHistory"
      @click="emit('salesHistory')"
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
      @click="emit('products')"
    />
  </div>
</template>

<style scoped>
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

@media (min-width: 1280px) {
  .stats-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

@media (min-width: 1000px) and (min-height: 500px) {
  .stats-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .stats-grid :deep(.stat-card) {
    padding: var(--space-2);
  }

  .stats-grid :deep(.title-en),
  .stats-grid :deep(.title-ur) {
    font-size: 0.75rem;
  }

  .stats-grid :deep(.stat-card-value) {
    font-size: 1.25rem;
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
