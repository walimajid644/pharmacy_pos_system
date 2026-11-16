<script setup lang="ts">
import type { Ref } from 'vue';
import type { useSuppliers } from '@/composables/useSuppliers';
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSuppliers>;
defineProps<{
  t: ViewValue<State['t']>;
  pick: ViewValue<State['pick']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  formatNumber: ViewValue<State['formatNumber']>;
  ledgerBalance: ViewValue<State['ledgerBalance']>;
  filteredSuppliers: ViewValue<State['filteredSuppliers']>;
  openEditModal: ViewValue<State['openEditModal']>;
  deleteSupplier: ViewValue<State['deleteSupplier']>;
}>();
</script>

<template>
  <CompactPages :items="filteredSuppliers" :row-height="146" :header-height="0" v-slot="{ rows }">
    <div class="suppliers-grid">
      <Card v-for="{ item: supplier } in rows" :key="supplier.id" class="supplier-card">
        <div class="supplier-header">
          <div>
            <h3 class="supplier-name">{{ supplier.name }}</h3>
            <p class="supplier-code">{{ supplier.supplier_code }}</p>
          </div>
          <Badge :variant="supplier.is_active ? 'success' : 'neutral'">
            {{ supplier.is_active ? t('active') : t('inactive') }}
          </Badge>
        </div>

        <div class="supplier-details">
          <div v-if="supplier.contact_person" class="detail-row">
            <span class="detail-icon">♙</span>
            <span>{{ supplier.contact_person }}</span>
          </div>
          <div v-if="supplier.phone_number" class="detail-row">
            <span class="detail-icon">☎︎</span>
            <span>{{ supplier.phone_number }}</span>
          </div>
          <div v-if="supplier.email" class="detail-row">
            <span class="detail-icon">@</span>
            <span>{{ supplier.email }}</span>
          </div>
          <div v-if="supplier.city" class="detail-row">
            <span class="detail-icon">⌖</span>
            <span>{{ supplier.city }}, {{ supplier.country }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">∑</span>
            <span
              >{{ pick('Received PO balance', 'موصولہ آرڈر کا بقایا') }}:
              {{ formatCurrency(ledgerBalance[supplier.id] || 0) }}</span
            >
          </div>
          <div class="detail-row">
            <span class="detail-icon">📅</span>
            <span
              >{{ pick('Payment', 'ادائیگی') }}: {{ formatNumber(supplier.payment_terms) }}
              {{ t('days') }}</span
            >
          </div>
        </div>

        <div class="supplier-actions">
          <Button @click="openEditModal(supplier)" variant="outline" size="sm">
            {{ t('edit') }}
          </Button>
          <Button @click="deleteSupplier(supplier.id)" variant="outline" size="sm">
            {{ t('delete') }}
          </Button>
        </div>
      </Card>
    </div>
  </CompactPages>
</template>
