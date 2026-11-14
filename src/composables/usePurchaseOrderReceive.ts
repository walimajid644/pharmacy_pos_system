import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/types';

export function usePurchaseOrderReceive() {
  const router = useRouter();

  const route = useRoute();

  const authStore = useAuthStore();

  const { formatCurrency } = useI18n();

  const { showToast } = useToast();

  const poId = route.params.id as string;

  const loading = ref(true);

  const saving = ref(false);

  const po = ref<(PurchaseOrder & { supplier_name: string }) | null>(null);

  interface ReceiveItem extends PurchaseOrderItem {
    product_name: string;
    receive_now: number;
    batch_number: string;
    expiry_date: string;
  }

  const receiveItems = ref<ReceiveItem[]>([]);

  onMounted(async () => {
    await loadPO();
  });

  async function loadPO() {
    loading.value = true;
    try {
      const [poData] = await executeQuery<PurchaseOrder & { supplier_name: string }>(
        `SELECT po.*, s.name as supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON po.supplier_id = s.id
         WHERE po.id = ?`,
        [poId],
      );

      if (!poData) {
        showToast('Purchase order not found', 'error');
        router.push('/purchase-orders');
        return;
      }

      po.value = poData;

      const items = await executeQuery<PurchaseOrderItem & { product_name: string }>(
        `SELECT poi.*, p.name as product_name
         FROM purchase_order_items poi
         JOIN products p ON poi.product_id = p.id
         WHERE poi.po_id = ?`,
        [poId],
      );

      receiveItems.value = items.map((item) => ({
        ...item,
        receive_now: item.quantity_ordered - item.quantity_received,
        batch_number: '',
        expiry_date: '',
      }));
    } catch {
      showToast('Error loading purchase order', 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      loading.value = false;
    }
  }

  const canReceive = computed(() => {
    return receiveItems.value.some((item) => item.receive_now > 0);
  });

  async function receiveGoods() {
    if (!po.value || !['sent', 'partial'].includes(po.value.status)) {
      showToast('Only sent or partially received orders can receive stock', 'error');
      return;
    }
    if (!authStore.currentUser || !validate()) return;

    saving.value = true;
    try {
      await invoke('receive_purchase_order', {
        request: {
          poId,
          userId: authStore.currentUser.id,
          timestamp: new Date().toISOString(),
          items: receiveItems.value
            .filter((item) => Number(item.receive_now) > 0)
            .map((item) => ({
              poItemId: item.id,
              quantity: Number(item.receive_now),
              batchNumber: item.batch_number,
              expiryDate: item.expiry_date,
            })),
        },
      });
      showToast('Goods received successfully', 'success');
      router.push('/purchase-orders');
    } catch {
      showToast('Error receiving goods', 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      saving.value = false;
    }
  }

  function validate(): boolean {
    if (!receiveItems.value.some((item) => Number(item.receive_now) > 0)) {
      showToast('Enter a quantity to receive', 'error');
      return false;
    }
    for (const item of receiveItems.value) {
      if (!Number.isInteger(Number(item.receive_now)) || Number(item.receive_now) < 0) {
        showToast('Receive quantities must be whole, non-negative numbers', 'error');
        return false;
      }
      if (item.receive_now > 0) {
        if (!item.batch_number) {
          showToast('Please enter batch number for all items to receive', 'error');
          return false;
        }
        if (!item.expiry_date) {
          showToast('Please enter expiry date for all items to receive', 'error');
          return false;
        }
        if (item.expiry_date <= new Date().toISOString().slice(0, 10)) {
          showToast('Expiry date must be in the future', 'error');
          return false;
        }
        if (item.receive_now > item.quantity_ordered - item.quantity_received) {
          showToast('Receive quantity cannot exceed ordered quantity', 'error');
          return false;
        }
      }
    }
    return true;
  }

  return {
    router,
    formatCurrency,
    loading,
    saving,
    po,
    receiveItems,
    canReceive,
    receiveGoods,
  };
}
