<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import PurchaseOrderRegister from '@/components/purchases/PurchaseOrderRegister.vue';
import { usePurchaseOrders } from '@/composables/usePurchaseOrders';

const {
  router,
  formatCurrency,
  pick,
  purchaseOrders,
  loading,
  searchQuery,
  statusFilter,
  dateFrom,
  dateTo,
  filteredPOs,
  statusCounts,
  getStatusVariant,
  createNewPO,
  viewPO,
  receivePO,
  cancelPO,
  formatDate,
} = usePurchaseOrders();
</script>

<template>
  <div class="purchase-orders-view purchase-terminal compact-workspace">
    <!-- Header -->
    <div class="view-header">
      <div>
        <h2 class="view-title">{{ pick('Purchase Register', 'خریداری رجسٹر') }}</h2>
        <p class="view-subtitle">
          {{
            uiLabel(
              'Review purchases, receive existing orders, or enter a new distributor invoice.',
            )
          }}
        </p>
      </div>
      <Button variant="outline" @click="router.push('/purchase-suggestions')">{{
        pick('Purchase Suggestions', 'خریداری کی تجاویز')
      }}</Button>
      <Button variant="outline" @click="createNewPO">
        <span class="button-icon">+</span>
        {{ uiLabel('Create Purchase Order') }}
      </Button>
      <Button permission="purchases.receive" @click="router.push('/purchases')"
        >+ {{ pick('New Purchase', 'نئی خریداری') }}</Button
      >
    </div>

    <!-- Status Tabs -->
    <div class="status-tabs">
      <button
        v-for="status in [
          'all',
          'receivable',
          'draft',
          'sent',
          'partial',
          'received',
          'cancelled',
        ] as const"
        :key="status"
        @click="statusFilter = status"
        class="status-tab"
        :class="{ 'status-tab-active': statusFilter === status }"
      >
        {{ uiLabel(status) }}
        <span class="status-count">{{ statusCounts[status as keyof typeof statusCounts] }}</span>
      </button>
    </div>

    <!-- Filters -->
    <Card class="filters-card">
      <div class="filters-grid">
        <Input
          v-model="searchQuery"
          :aria-label="uiLabel('Search purchase orders by number or supplier')"
          :placeholder="uiLabel('Search by PO number or supplier...')"
          class="search-input"
        />
        <Input
          v-model="dateFrom"
          type="date"
          :aria-label="uiLabel('Order date from')"
          :placeholder="uiLabel('From date')"
        />
        <Input
          v-model="dateTo"
          type="date"
          :aria-label="uiLabel('Order date to')"
          :placeholder="uiLabel('To date')"
        />
        <Button
          @click="
            searchQuery = '';
            dateFrom = '';
            dateTo = '';
          "
          variant="outline"
        >
          {{ uiLabel('Clear Filters') }}
        </Button>
      </div>
    </Card>

    <div class="purchase-table-scroll">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>{{ uiLabel('Loading purchase orders...') }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredPOs.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <h3 class="empty-title">{{ uiLabel('No Purchase Orders Found') }}</h3>
        <p class="empty-subtitle">
          {{
            uiLabel(
              searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Enter your first distributor invoice',
            )
          }}
        </p>
        <Button
          v-if="!searchQuery && statusFilter === 'all'"
          @click="createNewPO"
          variant="outline"
        >
          {{ uiLabel('Create Purchase Order') }}
        </Button>
      </div>

      <!-- Purchase register -->
      <CompactPages
        v-else
        :items="filteredPOs"
        :row-height="56"
        :header-height="34"
        v-slot="{ rows }"
      >
        <PurchaseOrderRegister
          :format-currency="formatCurrency"
          :filtered-p-os="rows.map((row) => row.item)"
          :get-status-variant="getStatusVariant"
          :view-p-o="viewPO"
          :receive-p-o="receivePO"
          :cancel-p-o="cancelPO"
          :format-date="formatDate"
        />
      </CompactPages>
    </div>
    <footer class="purchase-summary">
      <div>
        <small>{{ uiLabel('Orders shown') }}</small><strong
          >{{ filteredPOs.length }} / {{ purchaseOrders.length }}</strong
        >
      </div>
      <div>
        <small>{{ uiLabel('Awaiting receipt') }}</small><strong>{{
          statusCounts.sent + statusCounts.partial
        }}</strong>
      </div>
      <div class="purchase-summary-total">
        <small>{{ uiLabel('Filtered order total') }}</small><strong>{{
          formatCurrency(filteredPOs.reduce((sum, po) => sum + Number(po.total_amount), 0))
        }}</strong>
      </div>
    </footer>
  </div>
</template>

<style src="@/components/purchases/PurchaseOrders.css"></style>

<style scoped>
.view-header > div {
  min-width: 0;
  flex: 1;
}
.purchase-orders-view.purchase-terminal .view-header :deep(button) {
  flex-shrink: 0;
  padding-block: 0;
  line-height: 1.15;
}
</style>
