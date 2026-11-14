import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/composables/useToast';
import type { PurchaseOrder } from '@/lib/types';

export function usePurchaseOrders() {
  const router = useRouter();

  const route = useRoute();

  const { formatCurrency, pick } = useI18n();

  const { showToast } = useToast();

  interface POWithSupplier extends PurchaseOrder {
    supplier_name: string;
  }

  const purchaseOrders = ref<POWithSupplier[]>([]);

  const loading = ref(true);

  const searchQuery = ref('');

  const statusFilter = ref<
    'all' | 'receivable' | 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  >(route.query.status === 'receivable' ? 'receivable' : 'all');

  const dateFrom = ref('');

  const dateTo = ref('');

  const filteredPOs = computed(() => {
    let result = purchaseOrders.value;

    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(
        (po) =>
          po.po_number.toLowerCase().includes(query) ||
          po.supplier_name.toLowerCase().includes(query),
      );
    }

    // Status filter
    if (statusFilter.value !== 'all') {
      result = result.filter((po) =>
        statusFilter.value === 'receivable'
          ? po.status === 'sent' || po.status === 'partial'
          : po.status === statusFilter.value,
      );
    }

    // Date filter
    if (dateFrom.value) {
      result = result.filter((po) => po.order_date >= dateFrom.value);
    }
    if (dateTo.value) {
      result = result.filter((po) => po.order_date <= dateTo.value);
    }

    return result;
  });

  const statusCounts = computed(() => {
    const counts = {
      all: purchaseOrders.value.length,
      receivable: 0,
      draft: 0,
      sent: 0,
      partial: 0,
      received: 0,
      cancelled: 0,
    };
    purchaseOrders.value.forEach((po) => {
      counts[po.status]++;
    });
    counts.receivable = counts.sent + counts.partial;
    return counts;
  });

  onMounted(async () => {
    await loadPurchaseOrders();
  });

  async function loadPurchaseOrders() {
    loading.value = true;
    try {
      purchaseOrders.value = await executeQuery<POWithSupplier>(
        `SELECT po.*, s.name as supplier_name
         FROM purchase_orders po
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         ORDER BY po.order_date DESC, po.created_at DESC`,
      );
    } catch {
      showToast('Error loading purchase orders', 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      loading.value = false;
    }
  }

  function getStatusVariant(status: string) {
    switch (status) {
      case 'draft':
        return 'neutral';
      case 'sent':
        return 'primary';
      case 'partial':
        return 'warning';
      case 'received':
        return 'success';
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  function createNewPO() {
    router.push('/purchase-orders/new');
  }

  function viewPO(id: string) {
    router.push(`/purchase-orders/${id}`);
  }

  function receivePO(id: string) {
    router.push(`/purchase-orders/${id}/receive`);
  }

  async function cancelPO(id: string) {
    if (!confirm('Are you sure you want to cancel this purchase order?')) return;

    try {
      await invoke('cancel_purchase_order', { poId: id });
      showToast('Purchase order cancelled', 'success');
      await loadPurchaseOrders();
    } catch {
      showToast('Error cancelling purchase order', 'error');
      reportDiagnostic('operation_failed', 'workspace');
    }
  }

  return {
    router,
    formatCurrency,
    pick,
    purchaseOrders,
    loading,
    searchQuery,
    statusFilter,
    dateFrom,
    dateTo,
    filteredPOs,
    statusCounts,
    getStatusVariant,
    createNewPO,
    viewPO,
    receivePO,
    cancelPO,
    formatDate,
  };
}
