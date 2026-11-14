import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { isExpired, isNearExpiry } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';

export function useExpiryActions() {
  const { pick, formatDateTime, formatNumber } = useI18n(),
    router = useRouter(),
    route = useRoute(),
    settings = useSettingsStore();

  const nearExpiryDays = computed(() => Number(settings.settings?.near_expiry_days ?? 60));

  type Batch = {
    id: string;
    product_id: string;
    name: string;
    sku: string;
    batch_number: string;
    expiry_date: string;
    quantity_in_stock: number;
    held: number;
  };

  type Hold = {
    id: string;
    batch_id: string;
    quantity: number;
    reason: string;
    status: string;
    created_at: string;
    created_by_name: string;
    name: string;
    batch_number: string;
    expiry_date: string;
    resolved_by_name: string | null;
    resolution_notes: string | null;
  };

  const batches = ref<Batch[]>([]),
    holds = ref<Hold[]>([]),
    tab = ref('batches'),
    query = ref(''),
    filter = ref('near'),
    selectedId = ref(String(route.query.batch || '')),
    quantity = ref(1),
    reason = ref(''),
    requestId = ref(crypto.randomUUID()),
    busy = ref(false),
    error = ref(''),
    notice = ref(''),
    selectedHold = ref<Hold | null>(null),
    resolution = ref('written_off'),
    resolutionNotes = ref(''),
    dialog = ref<HTMLElement | null>(null);

  useDialogKeyboard(dialog, () => {
    if (!busy.value) selectedHold.value = null;
  });

  const selected = computed(() => batches.value.find((b) => b.id === selectedId.value));

  const visible = computed(() =>
    batches.value.filter(
      (b) =>
        `${b.name} ${b.sku} ${b.batch_number}`.toLowerCase().includes(query.value.toLowerCase()) &&
        (filter.value === 'all' ||
          (filter.value === 'held'
            ? b.held > 0
            : filter.value === 'expired'
              ? isExpired(b.expiry_date)
              : isExpired(b.expiry_date) || isNearExpiry(b.expiry_date, nearExpiryDays.value))),
    ),
  );

  onMounted(async () => {
    await settings.loadSettings();
    await load();
  });

  async function load() {
    error.value = '';
    try {
      [batches.value, holds.value] = await Promise.all([
        executeQuery<Batch>(
          "SELECT b.*,p.name,p.sku,COALESCE((SELECT SUM(quantity) FROM batch_holds h WHERE h.batch_id=b.id AND h.status='held'),0) AS held FROM product_batches b JOIN products p ON p.id=b.product_id WHERE p.deleted_at IS NULL AND (b.quantity_in_stock>0 OR EXISTS(SELECT 1 FROM batch_holds h WHERE h.batch_id=b.id AND h.status='held')) ORDER BY b.expiry_date,p.name",
        ),
        executeQuery<Hold>(
          'SELECT h.*,p.name,b.batch_number,b.expiry_date,u.full_name AS created_by_name,a.full_name AS resolved_by_name FROM batch_holds h JOIN product_batches b ON b.id=h.batch_id JOIN products p ON p.id=b.product_id JOIN users u ON u.id=h.created_by LEFT JOIN users a ON a.id=h.resolved_by ORDER BY h.created_at DESC',
        ),
      ]);
      if (selectedId.value) filter.value = 'all';
    } catch (e) {
      error.value = String(e);
    }
  }

  function adjustment(action: string) {
    if (!selected.value) return;
    void router.push({
      path: '/stock-adjustments/new',
      query: { batch: selected.value.id, reason: action },
    });
  }

  async function quarantine() {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    notice.value = '';
    try {
      await invoke('hold_batch', {
        request: {
          requestId: requestId.value,
          batchId: selectedId.value,
          quantity: Number(quantity.value),
          reason: reason.value,
        },
      });
      requestId.value = crypto.randomUUID();
      quantity.value = 1;
      reason.value = '';
      notice.value = pick(
        'Units quarantined and excluded from sale immediately.',
        'اکائیاں قرنطینہ میں منتقل ہوئیں اور فوری طور پر فروخت سے خارج ہیں۔',
      );
      await load();
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  async function resolve() {
    if (!selectedHold.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      await invoke('resolve_batch_hold', {
        id: selectedHold.value.id,
        action: resolution.value,
        notes: resolutionNotes.value,
      });
      selectedHold.value = null;
      await load();
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  return {
    pick,
    formatDateTime,
    formatNumber,
    nearExpiryDays,
    batches,
    holds,
    tab,
    query,
    filter,
    selectedId,
    quantity,
    reason,
    busy,
    error,
    notice,
    selectedHold,
    resolution,
    resolutionNotes,
    dialog,
    selected,
    visible,
    load,
    adjustment,
    quarantine,
    resolve,
    ref,
    isExpired,
    isNearExpiry,
  };
}
