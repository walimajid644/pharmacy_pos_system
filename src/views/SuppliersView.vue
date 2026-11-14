<script setup lang="ts">
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import BilingualText from '@/components/ui/BilingualText.vue';
import SupplierCards from '@/components/suppliers/SupplierCards.vue';
import SupplierFormDialog from '@/components/suppliers/SupplierFormDialog.vue';
import { useSuppliers } from '@/composables/useSuppliers';

const {
  t,
  pick,
  formatCurrency,
  formatNumber,
  suppliers,
  loading,
  searchQuery,
  statusFilter,
  showModal,
  isEditing,
  ledgerBalance,
  currentSupplier,
  filteredSuppliers,
  openAddModal,
  openEditModal,
  saveSupplier,
  deleteSupplier,
} = useSuppliers();
</script>

<template>
  <div class="tool-terminal suppliers-view">
    <!-- Header -->
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">
          <BilingualText textKey="suppliers" />
        </h2>
        <p class="view-subtitle">{{ formatNumber(suppliers.length) }} {{ t('suppliers') }}</p>
      </div>
      <Button @click="openAddModal" size="lg">
        <span class="button-icon">+</span>
        {{ pick('Add Supplier', 'سپلائر شامل کریں') }}
      </Button>
    </div>

    <!-- Search & Filters -->
    <Card class="filters-card">
      <div class="filters-grid">
        <Input
          v-model="searchQuery"
          :placeholder="pick('Search suppliers...', 'سپلائرز تلاش کریں...')"
          class="search-input"
        />
        <select v-model="statusFilter" class="filter-select">
          <option value="all">{{ pick('All Status', 'تمام حیثیتیں') }}</option>
          <option value="active">{{ t('active') }}</option>
          <option value="inactive">{{ t('inactive') }}</option>
        </select>
      </div>
    </Card>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ pick('Loading suppliers...', 'سپلائرز لوڈ ہو رہے ہیں...') }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredSuppliers.length === 0" class="empty-state">
      <div class="empty-icon">📦</div>
      <h3 class="empty-title">{{ pick('No Suppliers Found', 'کوئی سپلائر نہیں ملا') }}</h3>
      <p class="empty-subtitle">
        {{
          pick(
            'Add your first supplier to get started',
            'شروع کرنے کے لیے اپنا پہلا سپلائر شامل کریں',
          )
        }}
      </p>
      <Button @click="openAddModal" variant="outline">
        {{ pick('Add Supplier', 'سپلائر شامل کریں') }}
      </Button>
    </div>

    <!-- Suppliers Grid -->
    <SupplierCards
      v-else
      :t="t"
      :pick="pick"
      :format-currency="formatCurrency"
      :format-number="formatNumber"
      :ledger-balance="ledgerBalance"
      :filtered-suppliers="filteredSuppliers"
      :open-edit-modal="openEditModal"
      :delete-supplier="deleteSupplier"
    />
    <!-- Modal -->
    <SupplierFormDialog
      :t="t"
      :pick="pick"
      :is-editing="isEditing"
      :save-supplier="saveSupplier"
      v-model:show-modal="showModal"
      v-model:current-supplier="currentSupplier"
    />
  </div>
</template>

<style src="@/components/suppliers/Suppliers.css"></style>
