import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { localDayBounds, localDateKey } from '@/lib/businessDay';
import { usePurchaseDraftStore } from '@/stores/purchaseDraft';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';

export function usePurchaseSuggestions() {
  const { pick, formatCurrency } = useI18n(),
    router = useRouter(),
    draft = usePurchaseDraftStore();

  type Row = {
    productId: string;
    name: string;
    sku: string;
    packSize: number;
    available: number;
    incoming: number;
    recentUnits: number;
    dailyRate: number;
    daysCover: number | null;
    reorderLevel: number;
    targetStock: number;
    suggestedUnits: number;
    estimatedCost: number;
    urgency: number;
    supplierName: string | null;
  };

  const rows = ref<Row[]>([]),
    suppliers = ref<{ id: string; name: string }[]>([]),
    lookback = ref(30),
    coverage = ref(30),
    lead = ref(7),
    loadedPeriod = ref(''),
    busy = ref(false),
    error = ref(''),
    query = ref(''),
    page = ref(0),
    selected = ref<Record<string, number>>({}),
    review = ref(false),
    supplierId = ref(''),
    dialog = ref<HTMLElement | null>(null);

  useDialogKeyboard(dialog, () => {
    review.value = false;
  });

  const visible = computed(() =>
    rows.value.filter((r) =>
      `${r.name} ${r.sku} ${r.supplierName || ''}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
    ),
  );

  const paged = computed(() => visible.value.slice(page.value * 100, (page.value + 1) * 100));

  const chosen = computed(() => rows.value.filter((r) => selected.value[r.productId] > 0));

  const cost = computed(() =>
    chosen.value.reduce((s, r) => s + selected.value[r.productId] * r.estimatedCost, 0),
  );

  onMounted(async () => {
    try {
      suppliers.value = await executeQuery(
        'SELECT id,name FROM suppliers WHERE is_active=1 AND deleted_at IS NULL ORDER BY name',
      );
      await load();
    } catch (e) {
      error.value = String(e);
    }
  });

  async function load() {
    busy.value = true;
    error.value = '';
    try {
      const end = localDayBounds(localDateKey())[0];
      const first = new Date();
      first.setDate(first.getDate() - Number(lookback.value));
      const start = localDayBounds(localDateKey(first))[0];
      rows.value = await invoke<Row[]>('purchase_suggestions', {
        request: {
          start,
          end,
          lookbackDays: Number(lookback.value),
          coverageDays: Number(coverage.value),
          leadDays: Number(lead.value),
        },
      });
      loadedPeriod.value = `${localDateKey(first)} → ${localDateKey()}`;
      selected.value = {};
      page.value = 0;
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  function toggle(r: Row, checked: boolean) {
    if (checked) selected.value[r.productId] = r.suggestedUnits;
    else delete selected.value[r.productId];
  }

  function startReview() {
    if (chosen.value.length > 100) {
      error.value = pick(
        'Choose up to 100 lines per draft.',
        'ایک مسودے کے لیے زیادہ سے زیادہ ۱۰۰ آئٹم منتخب کریں۔',
      );
      return;
    }
    error.value = '';
    review.value = true;
  }

  function openDraft() {
    if (!supplierId.value || !chosen.value.length) return;
    if (
      chosen.value.some(
        (r) =>
          !Number.isSafeInteger(Number(selected.value[r.productId])) ||
          selected.value[r.productId] < 1,
      )
    ) {
      error.value = pick(
        'Use positive whole-unit quantities.',
        'مثبت پوری اکائیوں کی تعداد درج کریں۔',
      );
      return;
    }
    draft.stage({
      supplierId: supplierId.value,
      items: chosen.value.map((r) => ({
        productId: r.productId,
        quantity: Number(selected.value[r.productId]),
      })),
      notes: `Reviewed purchase suggestions; completed-day lookback ${loadedPeriod.value}; cover ${coverage.value} days + lead ${lead.value} days. Verify quantities, supplier costs and open orders.`,
    });
    review.value = false;
    void router.push({ path: '/purchase-orders/new', query: { suggestions: '1' } });
  }

  function urgency(r: Row) {
    return r.urgency === 0
      ? pick('Out of stock', 'اسٹاک ختم')
      : r.urgency === 1
        ? pick('At / below reorder', 'آرڈر حد پر / کم')
        : r.urgency === 2
          ? pick('Lead-time risk', 'رسد میں تاخیر کا خطرہ')
          : pick('Coverage gap', 'اسٹاک مدت کم');
  }

  return {
    pick,
    formatCurrency,
    draft,
    suppliers,
    lookback,
    coverage,
    lead,
    loadedPeriod,
    busy,
    error,
    query,
    page,
    selected,
    review,
    supplierId,
    dialog,
    visible,
    paged,
    chosen,
    cost,
    load,
    toggle,
    startReview,
    openDraft,
    urgency,
    ref,
  };
}
