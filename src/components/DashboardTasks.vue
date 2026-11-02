<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import type { UserRole } from '@/lib/types'

const router = useRouter()
const auth = useAuthStore()
const { pick } = useI18n()
const tasks = [
  { path: '/pos', en: 'Sales', ur: 'فروخت', icon: '🛒', color: 'var(--color-success)', roles: ['admin', 'manager', 'cashier'] },
  { path: '/products', en: 'Products', ur: 'مصنوعات', icon: '💊', color: 'var(--color-secondary)', roles: ['admin', 'manager'] },
  { path: '/purchase-orders', en: 'Purchases', ur: 'خریداری', icon: '📦', color: 'var(--color-warning)', roles: ['admin', 'manager'] },
]
const visibleTasks = computed(() => tasks.filter(task => auth.hasRole(task.roles as UserRole[])))
</script>

<template>
  <nav class="dashboard-tasks" :aria-label="pick('Main tasks', 'اہم کام')">
    <button v-for="task in visibleTasks" :key="task.path" type="button" class="task-card" :style="{ '--task-color': task.color }" @click="router.push(task.path)">
      <span class="task-icon" aria-hidden="true">{{ task.icon }}</span>
      <span>{{ pick(task.en, task.ur) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.dashboard-tasks { display: flex; flex-wrap: wrap; gap: .65rem; }
.task-card { display: flex; align-items: center; justify-content: center; gap: .35rem; min-height: 52px; width: 103.95px; min-width: 0; padding: .4rem .25rem; border: 1px solid var(--color-border); border-bottom: 3px solid var(--task-color); border-radius: var(--radius); background: var(--color-surface); color: var(--color-text-primary); font-size: .875rem; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-sm); }
.task-icon { display: grid; place-items: center; flex-shrink: 0; width: 1.25rem; height: 2rem; border-radius: .5rem; background: var(--color-hover); font-size: 1.125rem; line-height: 1; }
.task-card:hover { background: var(--color-hover); border-color: var(--task-color); }
.task-card:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 500px) { .task-card { flex: 1; min-width: 0; padding-inline: .5rem; gap: .4rem; } }
</style>
