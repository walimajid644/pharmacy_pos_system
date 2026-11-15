import { RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/lib/i18n';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

export function useDashboardWorkspace() {
  const router = useRouter();

  const route = useRoute();

  const authStore = useAuthStore();

  const settingsStore = useSettingsStore();

  const { t, pick } = useI18n();

  const shortcutHelpOpen = ref(false);

  // Every tool in the authenticated dashboard uses the same desktop window.
  const workspaceMode = computed(() => route.path !== '/');

  const workspaceDialog = ref<HTMLElement | null>(null);

  let workspaceTrigger: HTMLElement | null = null;

  watch(
    () => route.path,
    async (path, previousPath) => {
      if (path !== '/' && (!previousPath || previousPath === '/')) {
        workspaceTrigger =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      await nextTick();
      if (path !== '/') workspaceDialog.value?.focus();
      else if (previousPath && previousPath !== '/') {
        const target = workspaceTrigger?.isConnected
          ? workspaceTrigger
          : document.querySelector<HTMLElement>('.desktop-nav .nav-button');
        target?.focus();
        workspaceTrigger = null;
      }
    },
    { flush: 'post', immediate: true },
  );

  function closeWorkspace() {
    void router.push('/');
  }

  function onWorkspaceKeydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('[role="dialog"]') !== event.currentTarget) return;
    if (
      event.key === 'Escape' &&
      (event.target as HTMLElement).closest('[role="dialog"]') === event.currentTarget
    ) {
      event.preventDefault();
      closeWorkspace();
    } else if (event.key === 'Tab') {
      const panel = event.currentTarget as HTMLElement;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const pageTitle = computed(() => {
    const titles: [string, string, string][] = [
      ['/catalog-import', 'Catalog Import', 'فہرست کی درآمد'],
      ['/catalog-bulk', 'Bulk Catalog Setup', 'فہرست کی اجتماعی ترتیب'],
      ['/controlled-sales', 'Controlled Sales', 'کنٹرول شدہ فروخت'],
      ['/fbr-sandbox', 'FBR DI Sandbox Check', 'FBR DI سینڈ باکس جانچ'],
      ['/customer-ledger', 'Customer Udhar Ledger', 'گاہک کا ادھار کھاتہ'],
      ['/expiry-actions', 'Expiry & Quarantine', 'میعاد اور قرنطینہ'],
      ['/cashier-performance', 'Cashier Performance', 'کیشئر کی کارکردگی'],
      ['/purchase-suggestions', 'Purchase Suggestions', 'خریداری کی تجاویز'],
      ['/audit-log', 'Audit Log', 'پڑتال ریکارڈ'],
      ['/payments', 'Payments & Receipts', 'ادائیگیاں اور وصولیاں'],
      ['/expenses', 'Expenses', 'اخراجات'],
      ['/estimates', 'Estimates', 'تخمینے'],
      ['/preorders', 'Customer Pre-orders', 'گاہک کے پیشگی آرڈر'],
      ['/item-search', 'Advanced Item Search', 'تفصیلی مصنوعات تلاش'],
      ['/pos', 'Sales', 'فروخت'],
      ['/products', 'Products', 'مصنوعات'],
      ['/customers', 'Customers', 'گاہک'],
      ['/sales-history', 'Sales History', 'فروخت کی تاریخ'],
      ['/daily-closing', 'Daily Closing', 'روزانہ بندش'],
      ['/reports', 'Reports', 'رپورٹس'],
      ['/shifts', 'Cash Drawer', 'کیش دراز'],
      ['/suppliers', 'Suppliers', 'سپلائرز'],
      ['/purchase-orders', 'Purchases', 'خریداری'],
      ['/supplier-ledger', 'Supplier Ledger', 'سپلائر کھاتہ'],
      ['/backups', 'Backups', 'بیک اپ'],
      ['/stock-adjustments', 'Stock Adjustments', 'اسٹاک ایڈجسٹمنٹ'],
      ['/sales-returns', 'Sales Returns', 'فروخت کی واپسی'],
      ['/users', 'Users', 'صارفین'],
      ['/settings', 'Settings', 'ترتیبات'],
    ];
    const match = titles.find(([path]) => route.path === path || route.path.startsWith(`${path}/`));
    return match ? pick(match[1], match[2]) : t('dashboard');
  });

  onMounted(async () => {
    window.addEventListener('keydown', onShortcut);
    await settingsStore.loadSettings();
  });

  onUnmounted(() => window.removeEventListener('keydown', onShortcut));

  async function logout() {
    await authStore.logout();
    router.push('/login');
  }

  async function focusOnRoute(path: string, selector: string) {
    shortcutHelpOpen.value = false;
    if (router.currentRoute.value.path !== path) await router.push(path);
    await nextTick();
    document.querySelector<HTMLInputElement>(selector)?.focus();
  }

  function onShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    if (event.key === 'Escape' && shortcutHelpOpen.value) {
      shortcutHelpOpen.value = false;
      return;
    }
    if (event.key === 'F1') {
      event.preventDefault();
      shortcutHelpOpen.value = !shortcutHelpOpen.value;
    } else if (event.key === 'F2' && authStore.hasRole(['admin', 'manager', 'cashier'])) {
      event.preventDefault();
      void focusOnRoute('/pos', '#pos-product-search');
    } else if (event.key === 'F3' && authStore.hasRole(['admin', 'manager', 'cashier'])) {
      event.preventDefault();
      void focusOnRoute('/pos', '#pos-customer');
    } else if (event.key === 'F4' && authStore.hasRole(['admin', 'manager'])) {
      event.preventDefault();
      void focusOnRoute('/products', '#products-search');
    } else if (event.altKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      shortcutHelpOpen.value = false;
      void router.push('/');
    } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      if (confirm(pick('Log out of Pharmacy POS?', 'فارمیسی پی او ایس سے لاگ آؤٹ کریں؟')))
        void logout();
    }
  }

  return {
    authStore,
    t,
    pick,
    shortcutHelpOpen,
    workspaceMode,
    workspaceDialog,
    closeWorkspace,
    onWorkspaceKeydown,
    pageTitle,
    RouterView,
    ref,
  };
}
