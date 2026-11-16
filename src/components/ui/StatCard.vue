<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  titleUr?: string;
  value: string | number;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'secondary' | 'info';
  clickable?: boolean;
}>();

const iconPaths: Record<string, string> = {
  '💰': 'M3 5h18v14H3z M3 9h18 M7 15h2 M15 13h3',
  '⚠️': 'M12 3 2 21h20z M12 9v5 M12 17h.01',
  '📅': 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3',
  '♙': 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',
  '🧾': 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h4',
  '📊': 'M4 20h16 M6 16V9 M12 16V4 M18 16v-5',
  '📦': 'm3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M8 5l9 4',
};
const iconPath = computed(() => iconPaths[props.icon || '']);

const emit = defineEmits<{
  click: [];
}>();

const colorClass = computed(() => {
  const colors = {
    primary: 'stat-card-primary',
    success: 'stat-card-success',
    warning: 'stat-card-warning',
    danger: 'stat-card-danger',
    secondary: 'stat-card-secondary',
    info: 'stat-card-info',
  };
  return colors[props.color || 'primary'];
});
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="stat-card"
    :class="[colorClass, { clickable: clickable }]"
    @click="clickable && emit('click')"
  >
    <div class="stat-card-header">
      <div class="stat-card-title">
        <div class="title-en">{{ title }}</div>
        <div v-if="titleUr" class="title-ur">{{ titleUr }}</div>
      </div>
      <div v-if="icon" class="stat-card-icon">
        <svg
          v-if="iconPath"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="iconPath" /></svg
        ><span v-else aria-hidden="true">{{ icon }}</span>
      </div>
    </div>

    <div class="stat-card-value">
      {{ value }}
    </div>

    <div v-if="trend" class="stat-card-trend" :class="`trend-${trend}`">
      <span class="trend-arrow">
        {{ trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→' }}
      </span>
      <span v-if="trendValue" class="trend-value">{{ trendValue }}</span>
    </div>
  </component>
</template>

<style scoped>
.stat-card {
  width: 100%;
  text-align: start;
  color: inherit;
  font: inherit;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  transition: var(--transition);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
}

.stat-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.stat-card.clickable:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.stat-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.stat-card-title {
  flex: 1;
}

.title-en {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  font-family: var(--font-en);
}

.title-ur {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  font-family: var(--font-ur);
  margin-top: 0.125rem;
}

.stat-card-icon {
  font-size: 2rem;
  opacity: 0.5;
  line-height: 1;
}

.stat-card-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-card-trend {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.trend-up {
  color: var(--color-success);
}

.trend-down {
  color: var(--color-danger);
}

.trend-neutral {
  color: var(--color-text-secondary);
}

.trend-arrow {
  font-size: 1rem;
}

/* Color variants */
.stat-card-primary .stat-card-icon {
  color: var(--color-primary);
}

.stat-card-success .stat-card-icon {
  color: var(--color-success);
}

.stat-card-warning .stat-card-icon {
  color: var(--color-warning);
}

.stat-card-danger .stat-card-icon {
  color: var(--color-danger);
}

.stat-card-secondary .stat-card-icon {
  color: var(--color-secondary);
}
</style>
