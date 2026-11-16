import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, onMounted, computed, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useRoute } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import { executeQuery } from '@/lib/database';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/composables/useToast';
import type { Customer, AppSettings } from '@/lib/types';

export function useSalesHistory() {
  interface SalesInvoice {
    id: string;
    invoice_number: string;
    customer_id: string | null;
    cashier_id: string;
    invoice_date: string;
    total_amount: number;
    tax_amount: number;
    discount_amount: number;
    net_amount: number;
    payment_method: string;
    status: string;
    notes: string | null;
    received_amount: number | null;
    change_amount: number | null;
    previous_balance: number | null;
    created_at: string;
    updated_at: string;
    customer_name?: string;
    customer_phone?: string | null;
    patient_name?: string | null;
    doctor_name?: string | null;
    prescription_note?: string | null;
    cashier_name?: string;
  }

  interface InvoiceItem {
    id: string;
    invoice_id: string;
    product_id: string;
    batch_id: string;
    quantity: number;
    sale_quantity: number | null;
    bonus_quantity: number;
    bonus_units: number;
    cost_price: number | null;
    is_loose_sale: boolean;
    unit_price: number;
    discount_percent: number;
    line_total: number;
    created_at: string;
    product_name?: string;
    batch_number?: string;
    drap_registration_number?: string | null;
    controlled_substance?: number;
  }

  const toast = useToast();

  const { pick, t, formatNumber } = useI18n();

  const route = useRoute();

  const invoices = ref<SalesInvoice[]>([]);

  const customers = ref<Customer[]>([]);

  const loading = ref(false);

  const showDetailModal = ref(false);

  const selectedInvoice = ref<SalesInvoice | null>(null);

  const invoiceItems = ref<InvoiceItem[]>([]);

  const printMode = ref<'invoice' | 'receipt' | null>(null);

  const digitalText = ref('');

  function salePrice(item: InvoiceItem) {
    return item.sale_quantity
      ? (item.unit_price * (item.quantity - (item.bonus_units || 0))) / item.sale_quantity
      : item.unit_price;
  }

  const shop = ref<Pick<
    AppSettings,
    | 'company_name'
    | 'company_address'
    | 'company_phone'
    | 'receipt_header'
    | 'receipt_footer'
    | 'show_drap'
  > | null>(null);

  // Filters
  const dateFrom = ref('');

  const dateTo = ref('');

  const searchQuery = ref('');

  const selectedCustomer = ref('');

  const selectedPaymentMethod = ref('');

  const filteredInvoices = computed(() => {
    let filtered = invoices.value;

    // Date range filter
    if (dateFrom.value) {
      filtered = filtered.filter((inv) => inv.invoice_date >= dateFrom.value);
    }
    if (dateTo.value) {
      filtered = filtered.filter((inv) => inv.invoice_date <= dateTo.value + 'T23:59:59');
    }

    // Search filter (invoice number or customer name)
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(query) ||
          (inv.customer_name && inv.customer_name.toLowerCase().includes(query)),
      );
    }

    // Customer filter
    if (selectedCustomer.value) {
      filtered = filtered.filter((inv) => inv.customer_id === selectedCustomer.value);
    }

    // Payment method filter
    if (selectedPaymentMethod.value) {
      filtered = filtered.filter((inv) => inv.payment_method === selectedPaymentMethod.value);
    }

    return filtered;
  });

  const totalSales = computed(() => {
    return filteredInvoices.value.reduce((sum, inv) => sum + inv.net_amount, 0);
  });

  const totalInvoices = computed(() => filteredInvoices.value.length);

  onMounted(async () => {
    // Set default date range (last 7 days)
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);

    dateTo.value = today.toISOString().split('T')[0];
    dateFrom.value = weekAgo.toISOString().split('T')[0];
    if (typeof route.query.invoice === 'string') {
      searchQuery.value = route.query.invoice;
      dateFrom.value = '';
      dateTo.value = '';
    }

    await Promise.all([loadInvoices(), loadCustomers(), loadShop()]);
  });

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

  async function loadInvoices() {
    loading.value = true;
    try {
      const data = await executeQuery<SalesInvoice>(
        `SELECT 
          si.*,
          COALESCE(si.customer_name_snapshot,c.first_name || ' ' || c.last_name, 'Walk-in') as customer_name,
          COALESCE(si.customer_phone_snapshot,c.phone_number) AS customer_phone,
          COALESCE(si.cashier_name_snapshot,u.full_name) as cashier_name
        FROM sales_invoices si
        LEFT JOIN customers c ON si.customer_id = c.id
        LEFT JOIN users u ON si.cashier_id = u.id
        ORDER BY si.invoice_date DESC, si.created_at DESC
        LIMIT 1000`,
      );
      invoices.value = data;
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Failed to load sales history');
    } finally {
      loading.value = false;
    }
  }

  async function loadCustomers() {
    try {
      customers.value = await executeQuery<Customer>(
        'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY first_name, last_name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'pos');
    }
  }

  async function viewInvoiceDetails(invoice: SalesInvoice) {
    selectedInvoice.value = invoice;
    loading.value = true;

    try {
      const items = await executeQuery<InvoiceItem>(
        `SELECT 
          sii.*,
          COALESCE(sii.product_name_snapshot,p.name) as product_name,
          sii.drap_snapshot AS drap_registration_number,
          sii.controlled_snapshot AS controlled_substance,
          COALESCE(sii.batch_number_snapshot,pb.batch_number) AS batch_number
        FROM sales_invoice_items sii
        JOIN products p ON sii.product_id = p.id
        JOIN product_batches pb ON sii.batch_id = pb.id
        WHERE sii.invoice_id = ?
        ORDER BY sii.created_at`,
        [invoice.id],
      );
      invoiceItems.value = items;
      digitalText.value = buildDigitalText(invoice, items);
      showDetailModal.value = true;
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error('Failed to load invoice details');
    } finally {
      loading.value = false;
    }
  }

  function buildDigitalText(invoice: SalesInvoice, items: InvoiceItem[]) {
    const lines = [
      shop.value?.company_name || 'Pharmacy POS',
      `Invoice ${invoice.invoice_number}`,
      formatDateTime(invoice.invoice_date),
    ];
    for (const item of items)
      lines.push(
        `${item.product_name} x${item.sale_quantity ?? item.quantity}${item.bonus_quantity ? ` + ${item.bonus_quantity} free` : ''}: ${formatCurrency(item.line_total)}`,
      );
    lines.push(
      `${invoice.payment_method === 'credit' ? 'Credit / Udhar total' : 'Total paid'}: ${formatCurrency(invoice.net_amount)}`,
    );
    if (invoice.received_amount != null)
      lines.push(
        `Received: ${formatCurrency(invoice.received_amount)}`,
        `Change: ${formatCurrency(invoice.change_amount ?? 0)}`,
      );
    if (invoice.notes) lines.push(`Remarks: ${invoice.notes}`);
    lines.push('Thank you for your purchase.');
    return lines.join('\n');
  }

  async function copySms() {
    if (!digitalText.value) return;
    try {
      await navigator.clipboard.writeText(digitalText.value);
      toast.success(
        pick(
          'Receipt text copied. Paste it into your SMS app.',
          'رسید کا متن کاپی ہو گیا۔ اسے SMS ایپ میں پیسٹ کریں۔',
        ),
      );
    } catch {
      toast.error(
        pick(
          'Copy failed. Select and copy the receipt text below.',
          'کاپی نہیں ہوا۔ نیچے سے رسید کا متن منتخب کر کے کاپی کریں۔',
        ),
      );
    }
  }

  async function sendWhatsApp() {
    if (!selectedInvoice.value?.customer_phone) {
      toast.error(
        pick('Add a phone number to this customer first.', 'پہلے اس گاہک کا فون نمبر درج کریں۔'),
      );
      return;
    }
    try {
      await invoke('open_whatsapp_receipt', {
        phone: selectedInvoice.value.customer_phone,
        message: digitalText.value,
      });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function closeDetailModal() {
    showDetailModal.value = false;
    selectedInvoice.value = null;
    invoiceItems.value = [];
  }

  function getPaymentMethodBadge(method: string) {
    const badges: Record<string, { label: string; class: string }> = {
      credit: {
        label: pick('Credit / Udhar', 'کریڈٹ / ادھار'),
        class: 'bg-banner-warning-bg border-banner-warning-border text-warning-text',
      },
      cash: {
        label: 'Cash',
        class: 'bg-banner-success-bg border-banner-success-border text-success-text',
      },
      card: { label: 'Card', class: 'bg-banner-info-bg border-banner-info-border text-info-text' },
      mobile: { label: 'Mobile', class: 'bg-secondary-50 text-secondary-800' },
    };
    return badges[method] || { label: method, class: 'bg-surface-page text-muted' };
  }

  function clearFilters() {
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);

    dateTo.value = today.toISOString().split('T')[0];
    dateFrom.value = weekAgo.toISOString().split('T')[0];
    searchQuery.value = '';
    selectedCustomer.value = '';
    selectedPaymentMethod.value = '';
  }

  async function printInvoice(mode: 'invoice' | 'receipt') {
    if (!selectedInvoice.value || !invoiceItems.value.length) {
      toast.error('Open an invoice with items before printing');
      return;
    }
    await loadShop();
    printMode.value = mode;
    await nextTick();
    const pageStyle = document.createElement('style');
    pageStyle.textContent =
      mode === 'receipt'
        ? '@page { size: 80mm 297mm; margin: 3mm; }'
        : '@page { size: A4; margin: 12mm; }';
    document.head.appendChild(pageStyle);
    document.body.classList.add('printing-invoice');
    const cleanup = () => {
      pageStyle.remove();
      document.body.classList.remove('printing-invoice');
      printMode.value = null;
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

  return {
    pick,
    t,
    formatNumber,
    invoices,
    customers,
    loading,
    showDetailModal,
    selectedInvoice,
    invoiceItems,
    printMode,
    digitalText,
    salePrice,
    shop,
    dateFrom,
    dateTo,
    searchQuery,
    selectedCustomer,
    selectedPaymentMethod,
    filteredInvoices,
    totalSales,
    totalInvoices,
    viewInvoiceDetails,
    copySms,
    sendWhatsApp,
    closeDetailModal,
    getPaymentMethodBadge,
    clearFilters,
    printInvoice,
    formatCurrency,
    formatDate,
    formatDateTime,
  };
}
