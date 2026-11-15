<script setup lang="ts">
import { useI18n } from '@/lib/i18n';
import type { RecentBill } from '@/lib/dashboardTypes';
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';

defineProps<{ loading: boolean; recentBills: RecentBill[]; canViewSalesHistory: boolean }>();
const emit = defineEmits<{ salesHistory: [] }>();
const { t, pick, formatCurrency, formatDate } = useI18n();
</script>

<template>
  <Card class="insight-card">
    <div class="insight-heading">
      <div>
        <h3 class="heading-3 mb-1">{{ pick('Recent Bills', 'حالیہ بل') }}</h3>
        <p class="body-sm text-text-secondary">
          {{ pick('Latest completed sales', 'تازہ مکمل فروخت') }}
        </p>
      </div>
    </div>
    <div v-if="loading" class="skeleton"></div>
    <div v-else-if="!recentBills.length" class="insight-empty">
      {{ pick('No bills yet', 'ابھی کوئی بل نہیں') }}
    </div>
    <CompactPages v-else :items="recentBills" :row-height="36" :header-height="0" v-slot="{ rows }">
      <component
        :is="canViewSalesHistory ? 'button' : 'div'"
        v-for="{ item: bill } in rows"
        :key="bill.id"
        :type="canViewSalesHistory ? 'button' : undefined"
        class="bill-row"
        :class="{ 'bill-row-link': canViewSalesHistory }"
        @click="canViewSalesHistory && emit('salesHistory')"
      >
        <span
          ><strong class="body font-semibold">{{
            bill.customer_name || pick('Walk-in', 'عام گاہک')
          }}</strong
          ><small class="body-sm text-text-secondary"
            ><bdi>{{ bill.invoice_number }}</bdi> · {{ formatDate(bill.invoice_date) }} ·
            {{ t(bill.payment_method as 'cash' | 'card' | 'mobile') }}</small
          ></span
        >
        <b class="number-display-sm text-brand-600">{{ formatCurrency(bill.net_amount) }}</b>
      </component>
    </CompactPages>
  </Card>
</template>

<style scoped>
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

@media (min-width: 1000px) and (min-height: 500px) {
  .insight-heading {
    flex-shrink: 0;
  }
}
</style>
