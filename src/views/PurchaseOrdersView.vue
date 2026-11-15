<script setup lang="ts">
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
        <h2 class="view-title">Purchases</h2>
        <p class="view-subtitle">{{ purchaseOrders.length }} total orders</p>
      </div>
      <Button variant="outline" @click="router.push('/purchase-suggestions')">{{
        pick('Purchase Suggestions', 'خریداری کی تجاویز')
      }}</Button>
      <Button @click="createNewPO" size="lg">
        <span class="button-icon">+</span>
        Create Purchase Order
      </Button>
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
        <Input v-model="dateTo" type="date" aria-label="Order date to" placeholder="To date" />
        <Button
          @click="
            searchQuery = '';
            dateFrom = '';
            dateTo = '';
          "
          variant="outline"
        >
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
          {{
            searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first purchase order'
          }}
        </p>
        <Button
          v-if="!searchQuery && statusFilter === 'all'"
          @click="createNewPO"
          variant="outline"
        >
          Create Purchase Order
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
        <small>Orders shown</small
        ><strong>{{ filteredPOs.length }} / {{ purchaseOrders.length }}</strong>
      </div>
      <div>
        <small>Awaiting receipt</small
        ><strong>{{ statusCounts.sent + statusCounts.partial }}</strong>
      </div>
      <div class="purchase-summary-total">
        <small>Filtered order total</small
        ><strong>{{
          formatCurrency(filteredPOs.reduce((sum, po) => sum + Number(po.total_amount), 0))
        }}</strong>
      </div>
    </footer>
  </div>
</template>

<style src="@/components/purchases/PurchaseOrders.css"></style>
