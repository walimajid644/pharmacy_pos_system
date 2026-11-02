<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from '@/lib/i18n'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import DesktopNav from '@/components/DesktopNav.vue'
import HomeView from '@/views/HomeView.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const { t, pick } = useI18n()
const shortcutHelpOpen = ref(false)
// Every tool in the authenticated dashboard uses the same desktop window.
const workspaceMode = computed(() => route.path !== '/')
const workspaceDialog = ref<HTMLElement | null>(null)
let workspaceTrigger: HTMLElement | null = null
watch(() => route.path, async (path, previousPath) => {
  if (path !== '/' && (!previousPath || previousPath === '/')) {
    workspaceTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  await nextTick()
  if (path !== '/') workspaceDialog.value?.focus()
  else if (previousPath && previousPath !== '/') {
    const target = workspaceTrigger?.isConnected ? workspaceTrigger : document.querySelector<HTMLElement>('.desktop-nav .nav-button')
    target?.focus()
    workspaceTrigger = null
  }
}, { flush: 'post', immediate: true })
function closeWorkspace() { void router.push('/') }
function onWorkspaceKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('[role="dialog"]') !== event.currentTarget) return
  if (event.key === 'Escape' && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) return
  if (event.key === 'Escape' && (event.target as HTMLElement).closest('[role="dialog"]') === event.currentTarget) {
    event.preventDefault()
    closeWorkspace()
  } else if (event.key === 'Tab') {
    const panel = event.currentTarget as HTMLElement
    const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}
const pageTitle = computed(() => {
  const titles: [string, string, string][] = [
    ['/catalog-import','Catalog Import','فہرست کی درآمد'],['/catalog-bulk','Bulk Catalog Setup','فہرست کی اجتماعی ترتیب'],['/controlled-sales','Controlled Sales','کنٹرول شدہ فروخت'],['/fbr-sandbox','FBR DI Sandbox Check','FBR DI سینڈ باکس جانچ'],
    ['/customer-ledger','Customer Udhar Ledger','گاہک کا ادھار کھاتہ'],['/expiry-actions','Expiry & Quarantine','میعاد اور قرنطینہ'],['/cashier-performance','Cashier Performance','کیشئر کی کارکردگی'],
    ['/purchase-suggestions','Purchase Suggestions','خریداری کی تجاویز'],['/audit-log','Audit Log','پڑتال ریکارڈ'],
    ['/payments', 'Payments & Receipts', 'ادائیگیاں اور وصولیاں'], ['/expenses', 'Expenses', 'اخراجات'],
    ['/estimates', 'Estimates', 'تخمینے'], ['/preorders', 'Customer Pre-orders', 'گاہک کے پیشگی آرڈر'], ['/item-search', 'Advanced Item Search', 'تفصیلی مصنوعات تلاش'],
    ['/pos', 'Sales', 'فروخت'], ['/products', 'Products', 'مصنوعات'],
    ['/customers', 'Customers', 'گاہک'], ['/sales-history', 'Sales History', 'فروخت کی تاریخ'],
    ['/daily-closing', 'Daily Closing', 'روزانہ بندش'], ['/reports', 'Reports', 'رپورٹس'],
    ['/shifts', 'Cash Drawer', 'کیش دراز'],
    ['/suppliers', 'Suppliers', 'سپلائرز'], ['/purchase-orders', 'Purchases', 'خریداری'],
    ['/supplier-ledger', 'Supplier Ledger', 'سپلائر کھاتہ'], ['/backups', 'Backups', 'بیک اپ'],
    ['/stock-adjustments', 'Stock Adjustments', 'اسٹاک ایڈجسٹمنٹ'],
    ['/sales-returns', 'Sales Returns', 'فروخت کی واپسی'],
    ['/users', 'Users', 'صارفین'], ['/settings', 'Settings', 'ترتیبات'],
  ]
  const match = titles.find(([path]) => route.path === path || route.path.startsWith(`${path}/`))
  return match ? pick(match[1], match[2]) : t('dashboard')
})

onMounted(async () => {
  window.addEventListener('keydown', onShortcut)
  await settingsStore.loadSettings()
})
onUnmounted(() => window.removeEventListener('keydown', onShortcut))

async function logout() {
  await authStore.logout()
  router.push('/login')
}

async function focusOnRoute(path: string, selector: string) {
  shortcutHelpOpen.value = false
  if (router.currentRoute.value.path !== path) await router.push(path)
  await nextTick()
  document.querySelector<HTMLInputElement>(selector)?.focus()
}

function onShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing) return
  if (event.key === 'Escape' && shortcutHelpOpen.value) {
    shortcutHelpOpen.value = false
    return
  }
  if (event.key === 'F1') {
    event.preventDefault()
    shortcutHelpOpen.value = !shortcutHelpOpen.value
  } else if (event.key === 'F2' && authStore.hasRole(['admin', 'manager', 'cashier'])) {
    event.preventDefault()
    void focusOnRoute('/pos', '#pos-product-search')
  } else if (event.key === 'F3' && authStore.hasRole(['admin', 'manager', 'cashier'])) {
    event.preventDefault()
    void focusOnRoute('/pos', '#pos-customer')
  } else if (event.key === 'F4' && authStore.hasRole(['admin', 'manager'])) {
    event.preventDefault()
    void focusOnRoute('/products', '#products-search')
  } else if (event.altKey && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    shortcutHelpOpen.value = false
    void router.push('/')
  } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    if (confirm(pick('Log out of Pharmacy POS?', 'فارمیسی پی او ایس سے لاگ آؤٹ کریں؟'))) void logout()
  }
}
</script>

<template>
  <div class="dashboard-layout dashboard-overview">
    <!-- Header -->
    <header class="dashboard-header" :inert="workspaceMode">
      <div class="header-content">
        <!-- Navigation -->
        <div class="nav-row"><DesktopNav /></div>

      </div>
    </header>

    <!-- Main content -->
    <main class="dashboard-main" :inert="workspaceMode">
      <HomeView />
    </main>
    <div v-if="workspaceMode" class="workspace-overlay" @click.self="closeWorkspace">
      <section ref="workspaceDialog" class="workspace-dialog" tabindex="-1" role="dialog" aria-modal="true" :aria-label="pageTitle" @keydown="onWorkspaceKeydown">
        <header class="workspace-titlebar"><div><strong>{{ pageTitle }}</strong><small>{{ pick('Desktop workspace', 'ڈیسک ٹاپ ورک اسپیس') }}</small></div><button type="button" class="workspace-close" :aria-label="pick('Close window', 'ونڈو بند کریں')" @click="closeWorkspace">×</button></header>
        <div class="workspace-body"><RouterView /></div>
      </section>
    </div>
    <div v-if="shortcutHelpOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" @click.self="shortcutHelpOpen = false">
      <section role="dialog" aria-modal="true" :aria-label="pick('Keyboard shortcuts', 'کی بورڈ شارٹ کٹس')" class="w-[30rem] rounded-lg border bg-background p-6 shadow-xl">
        <div class="mb-4 flex items-center justify-between"><h2 class="text-xl font-bold">{{ pick('Keyboard shortcuts', 'کی بورڈ شارٹ کٹس') }}</h2><button type="button" class="rounded border px-3 py-1" :title="pick('Close shortcut help (Esc)', 'شارٹ کٹ مدد بند کریں (Esc)')" aria-keyshortcuts="Escape" @click="shortcutHelpOpen = false">{{ pick('Close', 'بند کریں') }}</button></div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt>F1</dt><dd>{{ pick('Show or hide this help', 'مدد دکھائیں یا چھپائیں') }}</dd>
          <template v-if="authStore.hasRole(['admin', 'manager', 'cashier'])"><dt>F2</dt><dd>{{ pick('POS product or barcode search', 'پی او ایس مصنوعات یا بار کوڈ تلاش') }}</dd><dt>F3</dt><dd>{{ pick('POS customer selection', 'پی او ایس گاہک کا انتخاب') }}</dd></template>
          <template v-if="authStore.hasRole(['admin', 'manager'])"><dt>F4</dt><dd>{{ pick('Products search', 'مصنوعات کی تلاش') }}</dd></template>
          <dt>Alt+D</dt><dd>{{ t('dashboard') }}</dd>
          <dt>Ctrl+Shift+L</dt><dd>{{ pick('Log out (asks for confirmation)', 'لاگ آؤٹ (تصدیق کے ساتھ)') }}</dd>
          <dt>Esc</dt><dd>{{ pick('Close shortcut help', 'شارٹ کٹ مدد بند کریں') }}</dd>
        </dl>
      </section>
    </div>
  </div>
</template>


<style scoped>
.dashboard-layout { min-height: 100vh; background: var(--color-background); display: flex; flex-direction: column; }
.workspace-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.56)}
.workspace-dialog{display:flex;flex-direction:column;width:min(1125px,100%);height:min(935px,calc(100vh - 32px));min-height:350px;overflow:hidden;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);box-shadow:0 24px 70px rgba(0,0,0,.3)}
.workspace-titlebar{display:flex;align-items:center;justify-content:space-between;min-height:42px;padding:5px 10px 5px 16px;background:var(--color-surface);border-bottom:1px solid var(--color-border);color:var(--color-text-primary)}.workspace-titlebar strong,.workspace-titlebar small{display:block}.workspace-titlebar strong{font-size:.9rem}.workspace-titlebar small{font-size:.65rem;color:var(--color-text-secondary)}.workspace-close{display:grid;place-items:center;width:32px;height:30px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--color-text-primary);font-size:1.25rem;cursor:pointer}.workspace-close:hover{background:var(--color-hover);border-color:var(--color-border)}.workspace-close:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.workspace-body{flex:1;min-height:0;overflow:auto}.workspace-body :deep(.pos-terminal){height:100%;min-height:0}
.dashboard-header { position: sticky; top: 0; z-index: 50; background: var(--color-surface); border-bottom: 1px solid var(--color-border); box-shadow: var(--shadow-sm); }
.header-content { padding: .25rem 1.5rem .5rem; }
.nav-row { min-width: 0; }
.dashboard-main { flex: 1; min-width: 0; }
.dashboard-overview .dashboard-main { display: flex; flex-direction: column; }
@media (min-width: 1000px) and (min-height: 500px) {
  .dashboard-overview { height: 100dvh; min-height: 0; }
  .dashboard-overview .dashboard-header { flex-shrink: 0; }
  .dashboard-overview .dashboard-main { min-height: 0; }
}
@media (max-width: 1100px) { .header-content { padding-inline: 1rem; } }
</style>
