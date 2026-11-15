import { reportDiagnostic } from '@/lib/diagnostics';
import type {
  DailySalesRow,
  ProductSalesRow,
  LowStockRow,
  NearExpiryRow,
  StockValuationRow,
} from '@/lib/reportTypes';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { useRouter } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { executeQuery } from '@/lib/database';
import { csvCell } from '@/lib/csv';
import { formatCurrency } from '@/lib/utils';
import { localDateKey, localDayBounds } from '@/lib/businessDay';
import { useToast } from '@/composables/useToast';

export function useReports() {
  const label = useWorkspaceLabels();

  const router = useRouter(),
    { pick, formatDate } = useI18n();

  const toast = useToast();

  const settingsStore = useSettingsStore();

  const auth = useAuthStore();

  const loading = ref(false);

  const selectedReport = ref<string | null>(null);

  const dateFrom = ref('');

  const dateTo = ref('');

  // Report data
  const dailySalesData = ref<DailySalesRow[]>([]);

  const salesByProductData = ref<ProductSalesRow[]>([]);

  const lowStockData = ref<LowStockRow[]>([]);

  const nearExpiryData = ref<NearExpiryRow[]>([]);

  const stockValuationData = ref<StockValuationRow[]>([]);

  function selectedDayRange(): [string, string] | null {
    if (!dateFrom.value || !dateTo.value || dateFrom.value > dateTo.value) {
      toast.warning('Choose a valid date range');
      return null;
    }
    try {
      const [start] = localDayBounds(dateFrom.value);
      const [, end] = localDayBounds(dateTo.value);
      return [start, end];
    } catch {
      toast.warning('Choose a valid date range');
      return null;
    }
  }

  onMounted(() => {
    // Set default date range (last 30 days)
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(today.getDate() - 30);

    dateTo.value = localDateKey(today);
    dateFrom.value = localDateKey(monthAgo);
  });

  async function generateDailySalesReport() {
    const range = selectedDayRange();
    if (!range) return;
    const [rangeStart, rangeEnd] = range;
    loading.value = true;
    selectedReport.value = 'daily-sales';

    try {
      const data = await executeQuery<DailySalesRow>(
        `SELECT 
          DATE(invoice_date, 'localtime') as sale_date,
          COUNT(*) as invoice_count,
          SUM(net_amount) as total_sales,
          SUM(CASE WHEN payment_method = 'cash' THEN net_amount ELSE 0 END) as cash_sales,
          SUM(CASE WHEN payment_method = 'card' THEN net_amount ELSE 0 END) as card_sales,
          SUM(CASE WHEN payment_method = 'mobile' THEN net_amount ELSE 0 END) as mobile_sales
        FROM sales_invoices
        WHERE invoice_date >= ? AND invoice_date < ?
          AND status = 'completed'
        GROUP BY DATE(invoice_date, 'localtime')
        ORDER BY sale_date DESC`,
        [rangeStart, rangeEnd],
      );
      dailySalesData.value = data;

      if (data.length === 0) {
        toast.info('No sales found for selected date range');
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to generate report');
    } finally {
      loading.value = false;
    }
  }

  async function generateSalesByProductReport() {
    const range = selectedDayRange();
    if (!range) return;
    const [rangeStart, rangeEnd] = range;
    loading.value = true;
    selectedReport.value = 'sales-by-product';

    try {
      const data = await executeQuery<ProductSalesRow>(
        `SELECT 
          p.name as product_name,
          p.sku,
          SUM(sii.quantity) as total_quantity,
          COUNT(DISTINCT si.id) as invoice_count,
          SUM(sii.line_total) as total_sales
        FROM sales_invoice_items sii
        JOIN sales_invoices si ON sii.invoice_id = si.id
        JOIN products p ON sii.product_id = p.id
        WHERE si.invoice_date >= ? AND si.invoice_date < ?
          AND si.status = 'completed'
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_sales DESC
        LIMIT 50`,
        [rangeStart, rangeEnd],
      );
      salesByProductData.value = data;

      if (data.length === 0) {
        toast.info('No sales found for selected date range');
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to generate report');
    } finally {
      loading.value = false;
    }
  }

  async function generateLowStockReport() {
    loading.value = true;
    selectedReport.value = 'low-stock';

    try {
      const data = await executeQuery<LowStockRow>(
        `SELECT 
          p.name as product_name,
          p.sku,
          p.reorder_level,
          COALESCE(SUM(pb.quantity_in_stock), 0) as current_stock,
          p.unit_price,
          (COALESCE(SUM(pb.quantity_in_stock), 0) * p.unit_price) as stock_value
        FROM products p
        LEFT JOIN product_batches pb ON p.id = pb.product_id
        WHERE p.deleted_at IS NULL AND p.is_active = 1
        GROUP BY p.id, p.name, p.sku, p.reorder_level, p.unit_price
        HAVING current_stock <= p.reorder_level
        ORDER BY current_stock ASC`,
      );
      lowStockData.value = data;

      if (data.length === 0) {
        toast.success('All products are well stocked!');
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to generate report');
    } finally {
      loading.value = false;
    }
  }

  async function generateNearExpiryReport() {
    await settingsStore.loadSettings();
    loading.value = true;
    selectedReport.value = 'near-expiry';

    try {
      const expiryLimit = new Date();
      expiryLimit.setDate(
        expiryLimit.getDate() + Number(settingsStore.settings?.near_expiry_days ?? 60),
      );

      const data = await executeQuery<NearExpiryRow>(
        `SELECT 
          pb.id AS batch_id,
          pb.product_id,
          p.name as product_name,
          p.sku,
          pb.batch_number,
          pb.expiry_date,
          pb.quantity_in_stock,
          COALESCE(h.held,0) AS quarantined_stock,
          p.unit_price,
          ((pb.quantity_in_stock+COALESCE(h.held,0)) * p.unit_price) as batch_value,
          CAST((JULIANDAY(pb.expiry_date) - JULIANDAY(date('now','localtime'))) AS INTEGER) as days_until_expiry
        FROM product_batches pb
        JOIN products p ON pb.product_id = p.id
        LEFT JOIN (SELECT batch_id,SUM(quantity) AS held FROM batch_holds WHERE status='held' GROUP BY batch_id) h ON h.batch_id=pb.id
        WHERE pb.expiry_date <= ?
          AND (pb.quantity_in_stock > 0 OR COALESCE(h.held,0)>0)
          AND p.deleted_at IS NULL
        ORDER BY pb.expiry_date ASC`,
        [localDateKey(expiryLimit)],
      );
      nearExpiryData.value = data;

      if (data.length === 0) {
        toast.success('No batches expiring soon!');
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to generate report');
    } finally {
      loading.value = false;
    }
  }

  async function generateStockValuationReport() {
    loading.value = true;
    selectedReport.value = 'stock-valuation';

    try {
      const data = await executeQuery<StockValuationRow>(
        `SELECT 
          p.name as product_name,
          p.sku,
          COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) as total_stock,
          COALESCE(SUM(h.held),0) AS quarantined_stock,
          p.cost_price,
          p.unit_price,
          (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.cost_price) as cost_value,
          (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.unit_price) as retail_value,
          ((COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.unit_price) - (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.cost_price)) as potential_profit
        FROM products p
        LEFT JOIN product_batches pb ON p.id = pb.product_id
        LEFT JOIN (SELECT batch_id,SUM(quantity) AS held FROM batch_holds WHERE status='held' GROUP BY batch_id) h ON h.batch_id=pb.id
        WHERE p.deleted_at IS NULL AND p.is_active = 1
        GROUP BY p.id, p.name, p.sku, p.cost_price, p.unit_price
        HAVING total_stock != 0
        ORDER BY retail_value DESC`,
      );
      stockValuationData.value = data;

      if (data.length === 0) {
        toast.info('No stock available');
      }
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to generate report');
    } finally {
      loading.value = false;
    }
  }

  function exportToCSV<T extends object>(reportName: string, data: T[]) {
    if (data.length === 0) {
      toast.warning('No data to export');
      return;
    }

    try {
      // Get headers from first row
      const headers = Object.keys(data[0]) as Array<keyof T>;

      // Create CSV content
      let csv = '\uFEFF' + headers.map(csvCell).join(',') + '\r\n';
      data.forEach((row) => {
        csv += headers.map((header) => csvCell(row[header])).join(',') + '\r\n';
      });

      // Create download link
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportName}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success('Report exported successfully');
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      toast.error('Failed to export report');
    }
  }

  function getDaysClass(days: number) {
    if (days < 0) return 'text-red-600 font-bold';
    if (days <= 30) return 'text-red-600';
    if (days <= 60) return 'text-yellow-600';
    return 'text-gray-600';
  }

  return {
    label,
    router,
    pick,
    formatDate,
    settingsStore,
    auth,
    loading,
    selectedReport,
    dateFrom,
    dateTo,
    dailySalesData,
    salesByProductData,
    lowStockData,
    nearExpiryData,
    stockValuationData,
    generateDailySalesReport,
    generateSalesByProductReport,
    generateLowStockReport,
    generateNearExpiryReport,
    generateStockValuationReport,
    exportToCSV,
    getDaysClass,
    formatCurrency,
  };
}
