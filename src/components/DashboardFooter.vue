<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import type { UserRole } from '@/lib/types';

const router = useRouter();
const auth = useAuthStore();
const { pick } = useI18n();

const links = [
  {
    path: '/payments',
    en: 'Receipts',
    ur: 'وصولیاں',
    icon: '↔',
    roles: ['admin', 'manager', 'accountant'],
  },
  {
    path: '/expenses',
    en: 'Expenses',
    ur: 'اخراجات',
    icon: '▥',
    roles: ['admin', 'manager', 'accountant'],
  },
  {
    path: '/preorders',
    en: 'Sale Orders',
    ur: 'فروخت آرڈر',
    icon: '📦',
    roles: ['admin', 'manager', 'cashier'],
  },
  {
    path: '/customers',
    en: 'Clients',
    ur: 'گاہک',
    icon: '♙',
    roles: ['admin', 'manager', 'cashier'],
  },
  {
    path: '/suppliers',
    en: 'Suppliers',
    ur: 'سپلائرز',
    icon: '▧',
    roles: ['admin', 'manager'],
  },
  {
    path: '/sales-history',
    en: 'Sales History',
    ur: 'فروخت کی تاریخ',
    icon: '◷',
    roles: ['admin', 'manager', 'accountant'],
  },
  {
    path: '/item-search',
    en: 'Adv. Item Search',
    ur: 'تفصیلی مصنوعات تلاش',
    icon: '⌕',
    roles: ['admin', 'manager', 'cashier', 'accountant'],
  },
  {
    path: '/estimates',
    en: 'Estimates',
    ur: 'تخمینے',
    icon: '📋',
    roles: ['admin', 'manager', 'cashier'],
  },
  {
    path: '/backups',
    en: 'Backup',
    ur: 'بیک اپ',
    icon: '💾',
    roles: ['admin', 'manager'],
  },
];

const visibleLinks = computed(() =>
  links.filter((l) => auth.hasRole(l.roles as UserRole[]) && auth.canRoute(l.path)),
);
</script>

<template>
  <footer
    v-if="visibleLinks.length"
    class="dashboard-footer"
    :style="{ '--shortcut-count': visibleLinks.length }"
    :aria-label="pick('Quick actions', 'فوری اختیارات')"
  >
    <button
      v-for="link in visibleLinks"
      :key="link.path"
      type="button"
      class="footer-btn"
      :data-path="link.path"
      @click="router.push(link.path)"
    >
      <span class="footer-icon" aria-hidden="true">{{ link.icon }}</span>
      <span class="footer-label">{{ pick(link.en, link.ur) }}</span>
    </button>
  </footer>
</template>

<style scoped>
.dashboard-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.4rem 1rem;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.06);
}
.footer-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.footer-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-primary);
  border-color: var(--color-primary);
}
.footer-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.footer-icon {
  font-size: 1rem;
  line-height: 1;
}
.footer-label {
  line-height: 1.2;
}
</style>
