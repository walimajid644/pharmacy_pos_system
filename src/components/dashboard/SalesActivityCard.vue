<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/lib/i18n';
import Card from '@/components/ui/Card.vue';

const props = defineProps<{
  loading: boolean;
  todaysSales: number;
  billsToday: number;
  hourlySales: number[];
}>();
const { pick, formatCurrency, formatDate, formatNumber } = useI18n();
const chartMax = computed(() => Math.max(1, ...props.hourlySales));
const chartPoints = computed(() =>
  props.hourlySales
    .map((amount, hour) => `${20 + hour * 28.5},${155 - (amount / chartMax.value) * 120}`)
    .join(' '),
);
const chartArea = computed(() => `20,155 ${chartPoints.value} 675.5,155`);
</script>

<template>
  <Card class="insight-card">
    <div class="insight-heading">
      <div>
        <h3 class="heading-3 mb-1">
          {{ pick('Sales today, hour by hour', 'آج کی فروخت، فی گھنٹہ') }}
        </h3>
        <p class="body-sm text-text-secondary">
          {{ formatDate(new Date()) }} · {{ pick('local time', 'مقامی وقت') }}
        </p>
      </div>
      <strong class="number-display text-brand-600">{{ formatCurrency(todaysSales) }}</strong>
    </div>
    <div v-if="loading" class="skeleton"></div>
    <div v-else-if="billsToday === 0" class="insight-empty">
      {{ pick('No completed sales today', 'آج کوئی مکمل فروخت نہیں ہوئی') }}
    </div>
    <svg
      v-else
      class="sales-chart"
      viewBox="0 0 700 180"
      role="img"
      :aria-label="pick('Hourly sales for today', 'آج کی فی گھنٹہ فروخت')"
    >
      <line x1="20" y1="155" x2="675.5" y2="155" stroke="currentColor" opacity=".25" />
      <polygon :points="chartArea" fill="var(--color-primary)" opacity=".12" />
      <polyline
        :points="chartPoints"
        fill="none"
        stroke="var(--color-primary)"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <text
        v-for="hour in [0, 4, 8, 12, 16, 20]"
        :key="hour"
        :x="20 + hour * 28.5"
        y="176"
        text-anchor="middle"
        fill="currentColor"
        font-size="11"
      >
        {{ formatNumber(String(hour).padStart(2, '0')) }}
      </text>
    </svg>
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

.sales-chart {
  width: 100%;
  height: auto;
  color: var(--color-text-secondary);
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

  .sales-chart {
    flex: 1;
    min-height: 0;
  }
}
</style>
