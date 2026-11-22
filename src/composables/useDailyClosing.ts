import { reportDiagnostic } from '@/lib/diagnostics';
import { errorMessage } from '@/lib/errors';
import { ref, onMounted, computed } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { generateUUID } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { localDateKey, localDayBounds } from '@/lib/businessDay';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';

export function useDailyClosing() {
  const { formatCurrency } = useI18n();
  const uiLabel = useWorkspaceLabels();
  interface DailySales {
    total_sales: number;
    total_cash: number;
    total_card: number;
    total_credit: number;
    total_mobile: number;
    invoice_count: number;
  }

  interface DailyClosing {
    id: string;
    closing_date: string;
    total_sales: number;
    total_cash: number;
    total_card: number;
    closed_by: string;
    closing_time: string;
    created_at: string;
    closed_by_name?: string;
    notes?: string | null;
  }

  const toast = useToast();

  const authStore = useAuthStore();

  const loading = ref(false);

  const showClosingForm = ref(false);

  const todayDate = ref(localDateKey());

  const salesData = ref<DailySales>({
    total_sales: 0,
    total_cash: 0,
    total_card: 0,
    total_credit: 0,
    total_mobile: 0,
    invoice_count: 0,
  });

  const closingHistory = ref<DailyClosing[]>([]);

  const todayClosed = ref(false);

  // Closing form data
  const actualCash = ref(0);

  const actualCard = ref(0);

  const notes = ref('');

  const cashDifference = computed(() => actualCash.value - salesData.value.total_cash);

  const cardDifference = computed(() => actualCard.value - salesData.value.total_card);

  onMounted(async () => {
    await Promise.all([loadTodaySales(), loadClosingHistory(), checkTodayClosed()]);
  });

  async function loadTodaySales() {
    loading.value = true;
    try {
      const [startOfDay, endOfDay] = localDayBounds(todayDate.value);

      const result = await executeQuery<DailySales>(
        `SELECT 
          COALESCE(COUNT(*), 0) as invoice_count,
          COALESCE(SUM(net_amount), 0) as total_sales,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN net_amount ELSE 0 END), 0) as total_cash,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN net_amount ELSE 0 END), 0) as total_card,
          COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN net_amount ELSE 0 END),0) AS total_credit,
          COALESCE(SUM(CASE WHEN payment_method = 'mobile' THEN net_amount ELSE 0 END), 0) as total_mobile
        FROM sales_invoices
        WHERE invoice_date >= ? AND invoice_date < ?
          AND status = 'completed'`,
        [startOfDay, endOfDay],
      );

      if (result.length > 0) {
        salesData.value = result[0];
        // Pre-fill actual amounts with expected amounts
        actualCash.value = salesData.value.total_cash;
        actualCard.value = salesData.value.total_card;
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error(uiLabel('Failed to load sales data'));
    } finally {
      loading.value = false;
    }
  }

  async function loadClosingHistory() {
    try {
      const data = await executeQuery<DailyClosing>(
        `SELECT 
          dc.*,
          u.full_name as closed_by_name
        FROM daily_closing dc
        JOIN users u ON dc.closed_by = u.id
        ORDER BY dc.closing_date DESC, dc.closing_time DESC
        LIMIT 30`,
      );
      closingHistory.value = data;
    } catch {
      reportDiagnostic('operation_failed', 'reports');
    }
  }

  async function checkTodayClosed() {
    try {
      const result = await executeQuery<{ count: number }>(
        'SELECT COUNT(*) as count FROM daily_closing WHERE closing_date = ?',
        [todayDate.value],
      );
      todayClosed.value = (result[0]?.count || 0) > 0;
    } catch {
      reportDiagnostic('operation_failed', 'reports');
    }
  }

  function openClosingForm() {
    if (salesData.value.invoice_count === 0) {
      toast.warning(uiLabel('No sales for today. Nothing to close.'));
      return;
    }
    showClosingForm.value = true;
  }

  function cancelClosing() {
    showClosingForm.value = false;
    actualCash.value = salesData.value.total_cash;
    actualCard.value = salesData.value.total_card;
    notes.value = '';
  }

  async function submitClosing() {
    if (todayClosed.value || !authStore.currentUser) return;
    if (
      !Number.isFinite(Number(actualCash.value)) ||
      Number(actualCash.value) < 0 ||
      !Number.isFinite(Number(actualCard.value)) ||
      Number(actualCard.value) < 0
    ) {
      toast.warning(uiLabel('Enter nonnegative cash and card amounts'));
      return;
    }

    loading.value = true;
    try {
      const now = new Date().toISOString();
      const id = generateUUID();

      await executeUpdate(
        `INSERT INTO daily_closing 
         (id, closing_date, total_sales, total_cash, total_card, closed_by, closing_time, created_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          todayDate.value,
          salesData.value.total_sales,
          actualCash.value,
          actualCard.value,
          authStore.currentUser?.id,
          now,
          now,
          notes.value.trim() || null,
        ],
      );

      toast.success(uiLabel('Day closed successfully!'));
      showClosingForm.value = false;
      todayClosed.value = true;
      await loadClosingHistory();
    } catch (error: unknown) {
      reportDiagnostic('operation_failed', 'reports');
      toast.error(uiLabel('Failed to close day: ') + errorMessage(error));
    } finally {
      loading.value = false;
    }
  }

  function getDifferenceClass(diff: number) {
    if (diff === 0) return 'text-success';
    if (Math.abs(diff) < 10) return 'text-warning';
    return 'text-danger';
  }

  return {
    loading,
    showClosingForm,
    todayDate,
    salesData,
    closingHistory,
    todayClosed,
    actualCash,
    actualCard,
    notes,
    cashDifference,
    cardDifference,
    openClosingForm,
    cancelClosing,
    submitClosing,
    getDifferenceClass,
    formatCurrency,
  };
}
