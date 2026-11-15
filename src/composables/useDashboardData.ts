import { reportDiagnostic } from '@/lib/diagnostics';
import { ref } from 'vue';
import { executeQuery } from '@/lib/database';
import { localDateKey, localDayBounds } from '@/lib/businessDay';
import { useSettingsStore } from '@/stores/settings';
import type { RecentBill, LowStockItem, NearExpiryItem } from '@/lib/dashboardTypes';

export function useDashboardData() {
  const settingsStore = useSettingsStore();
  // Stats
  const todaysSales = ref(0);
  const yesterdaySales = ref(0);
  const activeCustomers = ref(0);
  const billsToday = ref(0);
  const hourlySales = ref<number[]>(Array(24).fill(0));
  const recentBills = ref<RecentBill[]>([]);
  const totalProducts = ref(0);
  const lowStockCount = ref(0);
  const nearExpiryCount = ref(0);

  const lowStockItems = ref<LowStockItem[]>([]);
  const nearExpiryItems = ref<NearExpiryItem[]>([]);

  const loading = ref(true);
  const loadError = ref(false);
  let hasLoaded = false;
  let loadVersion = 0;
  async function loadDashboardData(options: { background?: boolean } = {}) {
    const version = ++loadVersion;
    const silent = options.background === true && hasLoaded;
    loading.value = !silent;
    if (!silent) loadError.value = false;
    try {
      const [dayStart, dayEnd] = localDayBounds(localDateKey());
      const todayInvoices = await executeQuery<{ invoice_date: string; net_amount: number }>(
        `SELECT invoice_date, net_amount FROM sales_dashboard
         WHERE invoice_date >= ? AND invoice_date < ? AND status = 'completed'`,
        [dayStart, dayEnd],
      );
      const nextTodaysSales = todayInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.net_amount),
        0,
      );
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const [yesterdayStart, yesterdayEnd] = localDayBounds(localDateKey(yesterday));
      const [previous] = await executeQuery<{ total: number }>(
        `SELECT COALESCE(SUM(net_amount), 0) AS total FROM sales_dashboard WHERE invoice_date >= ? AND invoice_date < ? AND status = 'completed'`,
        [yesterdayStart, yesterdayEnd],
      );
      const nextYesterdaySales = Number(previous?.total || 0);
      const [customers] = await executeQuery<{ count: number }>(
        `SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL`,
      );
      const nextActiveCustomers = Number(customers?.count || 0);
      const hours = Array(24).fill(0) as number[];
      for (const invoice of todayInvoices)
        hours[new Date(invoice.invoice_date).getHours()] += Number(invoice.net_amount);
      const nextRecentBills = await executeQuery<RecentBill>(
        `SELECT si.id, si.invoice_number, si.invoice_date, si.net_amount, si.payment_method,
                TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS customer_name
         FROM sales_dashboard si LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.status = 'completed' ORDER BY si.invoice_date DESC LIMIT 6`,
      );

      // Get total products
      const productsResult = await executeQuery<{ count: number }>(
        'SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL AND is_active = 1',
      );
      const nextTotalProducts = productsResult[0]?.count || 0;

      // Get low stock items
      const nextLowStockItems = await executeQuery<LowStockItem>(
        `SELECT p.*, 
                COALESCE(SUM(pb.quantity_in_stock), 0) as current_stock
         FROM products p
         LEFT JOIN product_batches pb ON p.id = pb.product_id AND (pb.expiry_date >= date('now', 'localtime') OR pb.quantity_in_stock<0 OR pb.id='unallocated-stock:'||pb.product_id)
         WHERE p.deleted_at IS NULL AND p.is_active = 1
         GROUP BY p.id
         HAVING current_stock <= p.reorder_level
         ORDER BY current_stock ASC
         LIMIT 10`,
      );
      const [lowCount] = await executeQuery<{ count: number }>(
        `SELECT COUNT(*) AS count FROM (
           SELECT p.id FROM products p LEFT JOIN product_batches pb ON pb.product_id = p.id AND (pb.expiry_date >= date('now', 'localtime') OR pb.quantity_in_stock<0 OR pb.id='unallocated-stock:'||pb.product_id)
           WHERE p.deleted_at IS NULL AND p.is_active = 1 GROUP BY p.id
           HAVING COALESCE(SUM(pb.quantity_in_stock), 0) <= p.reorder_level)`,
      );
      const nextLowStockCount = lowCount?.count || 0;

      // Get near-expiry items
      const nearExpiryDays = Number(settingsStore.settings?.near_expiry_days ?? 60);
      const expiryLimit = new Date();
      expiryLimit.setDate(expiryLimit.getDate() + nearExpiryDays);
      const expiryLimitKey = localDateKey(expiryLimit);
      const nextNearExpiryItems = await executeQuery<NearExpiryItem>(
        `SELECT pb.*, p.name, p.sku
         FROM product_batches pb
         JOIN products p ON pb.product_id = p.id
         WHERE p.deleted_at IS NULL 
           AND pb.quantity_in_stock > 0
           AND DATE(pb.expiry_date) <= DATE(?)
         ORDER BY pb.expiry_date ASC
         LIMIT 10`,
        [expiryLimitKey],
      );
      const [expiryCount] = await executeQuery<{ count: number }>(
        `SELECT COUNT(*) AS count FROM product_batches pb JOIN products p ON p.id = pb.product_id
         WHERE p.deleted_at IS NULL AND pb.quantity_in_stock > 0
           AND DATE(pb.expiry_date) <= DATE(?)`,
        [expiryLimitKey],
      );
      if (version !== loadVersion) return;
      // Keep the current dashboard intact until the complete refresh succeeds.
      todaysSales.value = nextTodaysSales;
      yesterdaySales.value = nextYesterdaySales;
      activeCustomers.value = nextActiveCustomers;
      billsToday.value = todayInvoices.length;
      hourlySales.value = hours;
      recentBills.value = nextRecentBills;
      totalProducts.value = nextTotalProducts;
      lowStockItems.value = nextLowStockItems;
      lowStockCount.value = nextLowStockCount;
      nearExpiryItems.value = nextNearExpiryItems;
      nearExpiryCount.value = expiryCount?.count || 0;
      hasLoaded = true;
      loadError.value = false;
    } catch {
      reportDiagnostic('operation_failed', 'reports');
      if (version === loadVersion && !silent) loadError.value = true;
    } finally {
      if (version === loadVersion) loading.value = false;
    }
  }

  return {
    todaysSales,
    yesterdaySales,
    activeCustomers,
    billsToday,
    hourlySales,
    recentBills,
    totalProducts,
    lowStockCount,
    nearExpiryCount,
    lowStockItems,
    nearExpiryItems,
    loading,
    loadError,
    loadDashboardData,
  };
}
