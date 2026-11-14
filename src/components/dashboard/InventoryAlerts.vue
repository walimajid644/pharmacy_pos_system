<script setup lang="ts">
import { useI18n } from '@/lib/i18n';
import type { AlertTab, LowStockItem, NearExpiryItem } from '@/lib/dashboardTypes';
import Badge from '@/components/ui/Badge.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import BilingualText from '@/components/ui/BilingualText.vue';

defineProps<{
  activeTab: AlertTab;
  loading: boolean;
  lowStockCount: number;
  nearExpiryCount: number;
  lowStockItems: LowStockItem[];
  nearExpiryItems: NearExpiryItem[];
  canManageProducts: boolean;
}>();
const emit = defineEmits<{ tab: [tab: AlertTab]; products: []; expiry: [batchId: string] }>();
const { pick, formatNumber, formatDate } = useI18n();
function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(`${expiryDate.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function getExpiryBadgeVariant(days: number) {
  if (days < 0) return 'danger';
  if (days <= 30) return 'danger';
  if (days <= 60) return 'warning';
  return 'success';
}

function getExpiryText(days: number): string {
  if (days < 0)
    return `${formatNumber(Math.abs(days))} ${pick('days expired', 'دن میعاد ختم ہوئے')}`;
  return `${formatNumber(days)} ${pick('days left', 'دن باقی')}`;
}
</script>

<template>
  <Card class="alerts-card">
    <div class="alerts-header">
      <h3 class="heading-3">
        {{ pick('Inventory alerts', 'انوینٹری انتباہات') }}
      </h3>

      <!-- Tabs -->
      <div class="alert-tabs">
        <button
          @click="emit('tab', 'lowStock')"
          class="alert-tab"
          :class="{ 'alert-tab-active': activeTab === 'lowStock' }"
        >
          <Badge :variant="lowStockCount > 0 ? 'danger' : 'neutral'" :dot="lowStockCount > 0">
            <BilingualText textKey="low_stock_items" />
            ({{ formatNumber(lowStockCount) }})
          </Badge>
        </button>
        <button
          @click="emit('tab', 'nearExpiry')"
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
        <h4 class="heading-4 mb-1">
          {{ pick('No Low Stock Items', 'کم اسٹاک والی کوئی چیز نہیں') }}
        </h4>
        <p class="body-sm text-text-secondary">
          {{ pick('All products have sufficient stock', 'تمام مصنوعات کا اسٹاک کافی ہے') }}
        </p>
      </div>

      <table v-else class="alerts-table">
        <thead>
          <tr>
            <th class="label"><BilingualText textKey="product_name" /></th>
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
              <Button
                v-if="canManageProducts"
                variant="outline"
                size="sm"
                @click="emit('products')"
              >
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
        <h4 class="heading-4 mb-1">
          {{ pick('No Near Expiry Items', 'قریب المیعاد کوئی چیز نہیں') }}
        </h4>
        <p class="body-sm text-text-secondary">
          {{ pick('All batches are within safe expiry dates', 'تمام بیچوں کی میعاد مناسب ہے') }}
        </p>
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
              <Badge
                :variant="getExpiryBadgeVariant(getDaysUntilExpiry(item.expiry_date))"
                size="sm"
              >
                {{ getExpiryText(getDaysUntilExpiry(item.expiry_date)) }}
              </Badge>
            </td>
            <td class="body-sm">
              {{ formatNumber(item.quantity_in_stock) }}
              <Button
                v-if="canManageProducts"
                variant="ghost"
                size="xs"
                @click="emit('expiry', item.id)"
              >
                {{ pick('Actions', 'کارروائیاں') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Card>
</template>

<style scoped>
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

.empty-state {
  padding: var(--space-3);
  text-align: center;
}

.empty-icon {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-2);
}

@media (min-width: 1000px) and (min-height: 500px) {
  .alerts-card {
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
