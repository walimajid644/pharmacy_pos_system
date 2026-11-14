import { reportDiagnostic } from '@/lib/diagnostics';
import { onMounted, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import type { AppSettings, SalesReturn, SalesReturnItem } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export function useSalesReturns() {
  const router = useRouter();

  const auth = useAuthStore();

  const toast = useToast();

  const { pick, t, formatNumber } = useI18n();

  const returns = ref<(SalesReturn & { invoice_number: string })[]>([]);

  const selected = ref<(SalesReturn & { invoice_number: string }) | null>(null);

  const items = ref<
    (SalesReturnItem & {
      product_name: string;
      drap_registration_number: string | null;
      controlled_substance: number;
    })[]
  >([]);

  const busy = ref(false);

  const loading = ref(false);

  const printing = ref(false);

  const shop = ref<Pick<
    AppSettings,
    | 'company_name'
    | 'company_address'
    | 'company_phone'
    | 'receipt_header'
    | 'receipt_footer'
    | 'show_drap'
  > | null>(null);

  async function loadShop() {
    try {
      const rows = await executeQuery<AppSettings>(
        'SELECT company_name, company_address, company_phone, receipt_header, receipt_footer, show_drap FROM app_settings LIMIT 1',
      );
      shop.value = rows[0] || null;
    } catch {
      reportDiagnostic('operation_failed', 'pos');
    }
  }

  async function printReturn() {
    if (!selected.value || selected.value.status !== 'refunded' || !items.value.length) return;
    await loadShop();
    printing.value = true;
    await nextTick();
    document.body.classList.add('printing-return');
    const cleanup = () => {
      document.body.classList.remove('printing-return');
      printing.value = false;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Could not open the print dialog');
    }
  }

  async function load() {
    loading.value = true;
    try {
      returns.value = await executeQuery<SalesReturn & { invoice_number: string }>(
        `SELECT sr.*, si.invoice_number FROM sales_returns sr
         JOIN sales_invoices si ON si.id = sr.original_invoice_id
         ORDER BY sr.created_at DESC`,
      );
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Could not load returns');
    } finally {
      loading.value = false;
    }
  }

  async function select(value: SalesReturn & { invoice_number: string }) {
    selected.value = value;
    items.value = [];
    try {
      const rows = await executeQuery<
        SalesReturnItem & {
          product_name: string;
          drap_registration_number: string | null;
          controlled_substance: number;
        }
      >(
        `SELECT sri.*, p.name AS product_name, p.drap_registration_number, p.controlled_substance FROM sales_return_items sri
         JOIN products p ON p.id = sri.product_id WHERE sri.return_id = ?`,
        [value.id],
      );
      if (selected.value?.id === value.id) items.value = rows;
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Could not load return items');
    }
  }

  async function changeStatus(status: 'approved' | 'rejected' | 'refunded') {
    if (!selected.value || !auth.currentUser) return;
    const prior = status === 'refunded' ? 'approved' : 'pending';
    if (selected.value.status !== prior) return;
    if (
      !confirm(
        `${status === 'refunded' ? 'Confirm the refund was paid and' : 'Mark this return as'} ${status}?`,
      )
    )
      return;
    busy.value = true;
    try {
      await invoke('decide_sales_return', {
        request: {
          recordId: selected.value.id,
          timestamp: new Date().toISOString(),
          action: status,
        },
      });
      toast.success(status === 'refunded' ? 'Refund recorded' : `Return ${status}`);
      selected.value = null;
      await load();
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Could not update return. Check quantities and status.');
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => {
    void Promise.all([load(), loadShop()]);
  });

  return {
    router,
    pick,
    t,
    formatNumber,
    returns,
    selected,
    items,
    busy,
    loading,
    printing,
    shop,
    printReturn,
    select,
    changeStatus,
    formatCurrency,
    formatDate,
  };
}
