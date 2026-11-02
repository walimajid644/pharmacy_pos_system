<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import type { UserRole } from '@/lib/types'

type NavItem = { path: string; en: string; ur: string; icon: string; roles?: UserRole[] }
type NavGroup = { en: string; ur: string; items: NavItem[] }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { pick, t } = useI18n()
const openGroup = ref<string | null>(null)
const navRoot = ref<HTMLElement | null>(null)

const groups: NavGroup[] = [
  { en: 'Register', ur: 'رجسٹر', items: [
    {path:'/catalog-import',en:'Catalog Import',ur:'فہرست کی درآمد',icon:'↓',roles:['admin','manager']},
    {path:'/catalog-bulk',en:'Bulk Catalog Setup',ur:'فہرست کی اجتماعی ترتیب',icon:'▤',roles:['admin','manager']},
    { path: '/item-search', en: 'Advanced Item Search', ur: 'تفصیلی مصنوعات تلاش', icon: '⌕' },
    { path: '/customers', en: 'Customers', ur: 'گاہک', icon: '♙', roles: ['admin', 'manager', 'cashier'] },
    { path: '/suppliers', en: 'Suppliers', ur: 'سپلائرز', icon: '▧', roles: ['admin', 'manager'] },
  ] },
  { en: 'Transactions', ur: 'لین دین', items: [
    { path: '/estimates', en: 'Estimates', ur: 'تخمینے', icon: '▤', roles: ['admin', 'manager', 'cashier'] },
    { path: '/preorders', en: 'Customer Pre-orders', ur: 'گاہک کے پیشگی آرڈر', icon: '◷', roles: ['admin', 'manager', 'cashier'] },
    { path: '/sales-returns', en: 'Sales Returns', ur: 'فروخت کی واپسی', icon: '↩', roles: ['admin', 'manager'] },
    { path: '/sales-history', en: 'Sales History', ur: 'فروخت کی تاریخ', icon: '◷', roles: ['admin', 'manager', 'accountant'] },
    {path:'/expiry-actions',en:'Expiry & Quarantine',ur:'میعاد اور قرنطینہ',icon:'⛔',roles:['admin','manager']},
    {path:'/purchase-suggestions',en:'Purchase Suggestions',ur:'خریداری کی تجاویز',icon:'↓',roles:['admin','manager']},
    { path: '/stock-adjustments', en: 'Stock Adjustments', ur: 'اسٹاک ایڈجسٹمنٹ', icon: '⚖', roles: ['admin', 'manager'] },
  ] },
  { en: 'Accounts', ur: 'کھاتے', items: [
    {path:'/customer-ledger',en:'Customer Udhar Ledger',ur:'گاہک کا ادھار کھاتہ',icon:'▤',roles:['admin','manager','cashier','accountant']},
    { path: '/payments', en: 'Payments & Receipts', ur: 'ادائیگیاں اور وصولیاں', icon: '↔', roles: ['admin', 'manager', 'accountant'] },
    { path: '/expenses', en: 'Expenses', ur: 'اخراجات', icon: '▥', roles: ['admin', 'manager', 'accountant'] },
    { path: '/shifts', en: 'Cash Drawer', ur: 'کیش دراز', icon: '▣', roles: ['admin', 'manager', 'cashier'] },
    { path: '/daily-closing', en: 'Daily Closing', ur: 'روزانہ بندش', icon: '◫', roles: ['admin', 'manager'] },
    { path: '/supplier-ledger', en: 'Supplier Ledger', ur: 'سپلائر کھاتہ', icon: '▦', roles: ['admin', 'manager'] },
  ] },
  { en: 'Admin', ur: 'انتظام', items: [
    {path:'/fbr-sandbox',en:'FBR DI Sandbox Check',ur:'FBR DI سینڈ باکس جانچ',icon:'▤',roles:['admin','manager']},
    {path:'/audit-log',en:'Audit Log',ur:'پڑتال ریکارڈ',icon:'▤',roles:['admin','manager']},
    { path: '/users', en: 'Users', ur: 'صارفین', icon: '♟', roles: ['admin'] },
    { path: '/backups', en: 'Backups', ur: 'بیک اپ', icon: '▣', roles: ['admin', 'manager'] },
  ] },
  { en: 'Reports', ur: 'رپورٹس', items: [
    {path:'/controlled-sales',en:'Controlled Sales',ur:'کنٹرول شدہ فروخت',icon:'℞',roles:['admin','manager','accountant']},
    {path:'/cashier-performance',en:'Cashier Performance',ur:'کیشئر کی کارکردگی',icon:'▥',roles:['admin','manager','accountant']},
    { path: '/reports', en: 'Reports', ur: 'رپورٹس', icon: '▥', roles: ['admin', 'manager', 'accountant'] },
  ] },
  { en: 'General Settings', ur: 'عمومی ترتیبات', items: [
    { path: '/settings', en: 'Settings', ur: 'ترتیبات', icon: '⚙', roles: ['admin', 'manager'] },
    { path: '/change-password', en: 'Change password', ur: 'پاس ورڈ تبدیل کریں', icon: '🔑' },
  ] },
]

const visibleGroups = computed(() => groups.map(group => ({
  ...group,
  items: group.items.filter(allowed),
})).filter(group => group.items.length))

function allowed(item: NavItem) { return !item.roles || auth.hasRole(item.roles) }
function active(path: string) { return path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(`${path}/`) }
function groupActive(group: NavGroup) { return group.items.some(item => active(item.path)) }
function navigate(path: string) { openGroup.value = null; void router.push(path) }
async function logout() {
  openGroup.value = null
  await auth.logout()
  await router.push('/login')
}
watch(() => route.path, () => { openGroup.value = null })
function onOutsideClick(event: PointerEvent) {
  if (event.target instanceof Node && !navRoot.value?.contains(event.target)) openGroup.value = null
}
onMounted(() => document.addEventListener('pointerdown', onOutsideClick))
onUnmounted(() => document.removeEventListener('pointerdown', onOutsideClick))
</script>

<template>
  <nav ref="navRoot" class="desktop-nav" :aria-label="pick('Main navigation', 'مرکزی نیویگیشن')" @keydown.esc="openGroup = null" @focusout="event => { if (!navRoot?.contains(event.relatedTarget as Node)) openGroup = null }">
    <div class="desktop-menubar" :aria-label="pick('Other tools', 'دیگر ٹولز')">
    <button v-if="route.path !== '/'" type="button" class="nav-button dashboard-return" :title="pick('Back to Dashboard (Alt+D)', 'ڈیش بورڈ پر واپس (Alt+D)')" aria-keyshortcuts="Alt+D" @click="navigate('/')">
      <span aria-hidden="true">⌂</span>{{ pick('Back to Dashboard', 'ڈیش بورڈ پر واپس') }}
    </button>
    <div v-for="group in visibleGroups" :key="group.en" class="nav-group">
      <button type="button" class="nav-button" :class="{ active: groupActive(group) }" :aria-expanded="openGroup === group.en" :aria-controls="`nav-group-${group.en.replace(/ /g, '-')}`" @click="openGroup = openGroup === group.en ? null : group.en">
        {{ pick(group.en, group.ur) }}
        <svg class="nav-chevron" aria-hidden="true" viewBox="0 0 12 12" fill="none"><path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div v-if="openGroup === group.en" :id="`nav-group-${group.en.replace(/ /g, '-')}`" class="nav-menu">
        <div v-if="group.en === 'General Settings'" class="account-summary">
          <span class="account-avatar" aria-hidden="true">{{ auth.currentUser?.full_name?.charAt(0).toUpperCase() }}</span>
          <div><strong>{{ auth.currentUser?.full_name }}</strong><small>{{ t(auth.currentUser?.role as UserRole) }}</small></div>
        </div>
        <button v-for="item in group.items" :key="item.path" type="button" class="nav-menu-item" :aria-current="active(item.path) ? 'page' : undefined" @click="navigate(item.path)">
          <span aria-hidden="true">{{ item.icon }}</span>{{ pick(item.en, item.ur) }}
        </button>
        <button v-if="group.en === 'General Settings'" type="button" class="nav-menu-item" :title="pick('Log out (Ctrl+Shift+L asks for confirmation)', 'لاگ آؤٹ (Ctrl+Shift+L تصدیق کے ساتھ)')" aria-keyshortcuts="Control+Shift+L" @click="logout">
          <span aria-hidden="true">↪</span>{{ t('logout') }}
        </button>
      </div>
    </div>
    </div>
  </nav>
</template>

<style scoped>
.desktop-nav { display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
.desktop-menubar { display: flex; flex-wrap: wrap; align-items: center; gap: .15rem; width: 100%; }
.nav-group { position: relative; }
.nav-button, .nav-menu-item { display: flex; align-items: center; gap: .55rem; color: var(--color-text-secondary); border: 1px solid transparent; background: transparent; border-radius: var(--radius); cursor: pointer; white-space: nowrap; font-size: .875rem; font-weight: 600; }
.nav-button { padding: .125rem .55rem; gap: .4rem; font-size: .8rem; line-height: 1.25; font-weight: 500; min-height: 24px; }
.nav-chevron { display: block; width: .65rem; height: .65rem; flex-shrink: 0; }
.dashboard-return { border-color: var(--color-border); color: var(--color-primary); margin-inline-end: .35rem; }
.nav-button:hover, .nav-menu-item:hover { color: var(--color-text-primary); background: var(--color-hover); }
.nav-button.active { background: var(--color-primary); color: white; }
.nav-button.active:hover { background: var(--color-primary-hover); color: white; }
.nav-icon { font-size: 1.05rem; line-height: 1; }
.nav-menu { position: absolute; top: calc(100% + .45rem); inset-inline-start: 0; z-index: 70; min-width: 12.5rem; padding: .35rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); box-shadow: var(--shadow-lg); }
.nav-menu-item { width: 100%; padding: .7rem .8rem; text-align: start; }
.account-summary { display: flex; align-items: center; gap: .6rem; padding: .65rem .8rem; margin-bottom: .3rem; border-bottom: 1px solid var(--color-border); color: var(--color-text-primary); }
.account-avatar { display: grid; place-items: center; flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 50%; background: var(--color-primary); color: white; font-weight: 700; }
.account-summary strong, .account-summary small { display: block; }
.account-summary strong { max-width: 16rem; overflow-wrap: anywhere; font-size: .8rem; }
.account-summary small { color: var(--color-text-secondary); font-size: .7rem; }
.nav-menu-item[aria-current='page'] { color: var(--color-primary); background: var(--color-hover); }
.nav-button:focus-visible, .nav-menu-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 700px) { .nav-menu { min-width: 10rem; max-width: calc(100vw - 3rem); } .nav-group:last-child .nav-menu { inset-inline-start: auto; inset-inline-end: 0; } }
</style>
