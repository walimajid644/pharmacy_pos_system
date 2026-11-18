import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CashierShift, Customer, Product, ProductBatch, CartItem } from '@/lib/types';
import { roundSaleMoney as money, type SaleReceipt, type CustomerOption } from '@/lib/pos';
import SavedSaleActions from '@/components/SavedSaleActions.vue';
import { usePosCustomer } from '@/composables/usePosCustomer';
import { usePosProductSearch } from '@/composables/usePosProductSearch';
import { usePosCartLines } from '@/composables/usePosCartLines';
import { usePosSourceDocument } from '@/composables/usePosSourceDocument';
import { usePosItemEntry } from '@/composables/usePosItemEntry';

export function usePosTerminal() {
  const toast = useToast();

  const { t, pick, formatNumber } = useI18n();

  const cartStore = useCartStore();
  // Every opening is a new sale; saved invoices remain in sales history.
  cartStore.clearCart();
  let disposed = false;

  const settingsStore = useSettingsStore();

  const authStore = useAuthStore();

  const router = useRouter();

  const route = useRoute();

  const shift = ref<CashierShift | null>(null);

  const patientName = ref('');

  const doctorName = ref('');

  const prescriptionNote = ref('');

  const hasControlled = computed(() => cartStore.items.some((i) => i.product.controlled_substance));

  const prescriptionMissing = computed(
    () =>
      hasControlled.value &&
      !(patientName.value.trim() && doctorName.value.trim()) &&
      !prescriptionNote.value.trim(),
  );

  const saleRemarks = ref('');

  const cashReceived = ref<number | string>('');

  const showCost = ref(true);

  const checkoutLoading = ref(false);

  const invoiceNumber = ref('');
  let invoiceQueryId = 0;
  async function loadInvoiceNumber() {
    const queryId = ++invoiceQueryId;
    try {
      const next = await invoke<string>('next_invoice_number');
      if (!disposed && queryId === invoiceQueryId) invoiceNumber.value = next;
    } catch {
      if (!disposed && queryId === invoiceQueryId) invoiceNumber.value = '';
      reportDiagnostic('operation_failed', 'pos');
    }
  }

  const lastReceipt = ref<SaleReceipt | null>(null);

  const lastInvoiceId = ref<string | null>(null);

  const savedActions = ref<InstanceType<typeof SavedSaleActions> | null>(null);

  const {
    selectedCustomer,
    selectedCustomerId,
    customerSearch,
    customerOptions,
    customerOpen,
    customerLoading,
    highlightedCustomerIndex,
    openCustomerPicker,
    onCustomerInput,
    chooseCustomer,
    onCustomerKeydown,
  } = usePosCustomer();
  const {
    searchQuery,
    productSearchOpen,
    openProductSearch,
    resetProductSearch,
    searchResults,
    searchLoading,
    searchError,
    highlightedProductIndex,
    searchInput,
    onProductSearchInput,
    handleBarcodeInput,
  } = usePosProductSearch((product, loose) => selectProductForEntry(product, loose));
  const {
    lineGross,
    lineDiscount,
    lineMargin,
    addToCart,
    removeFromCart,
    updateQuantities,
    onLineDiscountAmountChange,
    onLineDiscountChange,
    getBatchWarning,
  } = usePosCartLines(() => {
    resetProductSearch();
    searchInput.value?.focus();
  });
  const {
    pendingProduct,
    itemCode,
    itemCodeInput,
    entryQuantityInput,
    entryQuantity,
    entryBonus,
    entryDiscount,
    entryLoose,
    entryError,
    entryPrice,
    entryStock,
    selectProductForEntry,
    commitEntry,
    clearEntry,
  } = usePosItemEntry(addToCart, resetProductSearch);

  function onItemCodeKeydown(event: KeyboardEvent) {
    if (
      event.key !== 'Enter' ||
      event.repeat ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    searchQuery.value =
      pendingProduct.value && itemCode.value === pendingProduct.value.sku ? '' : itemCode.value;
    openProductSearch(event);
  }
  function clearItemEntry() {
    clearEntry();
    resetProductSearch();
    itemCodeInput.value?.focus({ preventScroll: true });
  }

  interface PosDraftState {
    items: CartItem[];
    discountAmount: number;
    customer: CustomerOption | null;
    paymentMethod: string;
    cashReceived: number | string;
    patientName: string;
    doctorName: string;
    prescriptionNote: string;
    saleRemarks: string;
  }

  interface RecentInvoiceSummary {
    id: string;
    invoice_number: string;
    invoice_date: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone?: string | null;
    net_amount: number;
    total_amount?: number;
    tax_amount?: number;
    discount_amount?: number;
    received_amount?: number | null;
    change_amount?: number | null;
    payment_method: string;
    patient_name?: string | null;
    doctor_name?: string | null;
    prescription_note?: string | null;
    notes?: string | null;
    customer_type?: string | null;
  }

  const recentInvoices = ref<RecentInvoiceSummary[]>([]);
  const historyIndex = ref<number>(-1);
  const viewingHistoryInvoice = ref<RecentInvoiceSummary | null>(null);
  const draftState = ref<PosDraftState | null>(null);

  const canGoBackward = computed(
    () => recentInvoices.value.length > 0 && historyIndex.value < recentInvoices.value.length - 1,
  );
  const canGoForward = computed(() => historyIndex.value >= 0);

  async function loadRecentInvoices() {
    try {
      const cashierId = authStore.currentUser?.id;
      const isCashierOnly = authStore.currentUser?.role === 'cashier';
      const query =
        isCashierOnly && cashierId
          ? `SELECT si.id, si.invoice_number, si.invoice_date, si.customer_id,
                  COALESCE(si.customer_name_snapshot, c.first_name || ' ' || c.last_name, 'Walk-in') AS customer_name,
                  si.net_amount, si.payment_method
           FROM sales_invoices si
           LEFT JOIN customers c ON c.id = si.customer_id
           WHERE si.status = 'completed' AND si.cashier_id = ?
           ORDER BY si.rowid DESC
           LIMIT 50`
          : `SELECT si.id, si.invoice_number, si.invoice_date, si.customer_id,
                  COALESCE(si.customer_name_snapshot, c.first_name || ' ' || c.last_name, 'Walk-in') AS customer_name,
                  si.net_amount, si.payment_method
           FROM sales_invoices si
           LEFT JOIN customers c ON c.id = si.customer_id
           WHERE si.status = 'completed'
           ORDER BY si.rowid DESC
           LIMIT 50`;
      const params = isCashierOnly && cashierId ? [cashierId] : [];
      recentInvoices.value = await executeQuery<RecentInvoiceSummary>(query, params);
    } catch {
      recentInvoices.value = [];
    }
  }

  async function loadHistorySale(invoiceId: string) {
    try {
      const [inv] = await executeQuery<RecentInvoiceSummary>(
        `SELECT si.*,
                COALESCE(si.customer_name_snapshot, c.first_name || ' ' || c.last_name, 'Walk-in') AS customer_name,
                COALESCE(si.customer_phone_snapshot, c.phone_number) AS customer_phone,
                COALESCE(si.cashier_name_snapshot, u.full_name) AS cashier_name,
                c.customer_type
         FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
         LEFT JOIN users u ON u.id = si.cashier_id
         WHERE si.id = ?`,
        [invoiceId],
      );
      if (!inv) return;
      viewingHistoryInvoice.value = inv;

      const rawItems = await executeQuery<{
        id: string;
        product_id: string;
        batch_id: string;
        quantity: number;
        sale_quantity: number | null;
        bonus_quantity: number;
        is_loose_sale: number | boolean;
        unit_price: number;
        discount_percent: number;
        line_total: number;
        product_name: string;
        sku: string;
        pack_size: number;
        sell_by_loose_unit: number | boolean;
        controlled_substance: number | boolean;
        wholesale_price: number | null;
        cost_price: number | null;
        batch_number: string;
        expiry_date: string;
        quantity_in_stock: number;
        cost_price_at_batch: number;
        loose_open_remaining: number;
      }>(
        `SELECT sii.*,
                COALESCE(sii.product_name_snapshot, p.name) AS product_name,
                COALESCE(p.sku, '') AS sku,
                COALESCE(p.pack_size, 1) AS pack_size,
                COALESCE(p.sell_by_loose_unit, 0) AS sell_by_loose_unit,
                COALESCE(p.controlled_substance, 0) AS controlled_substance,
                p.wholesale_price,
                COALESCE(p.cost_price, 0) AS cost_price,
                COALESCE(sii.batch_number_snapshot, pb.batch_number, '') AS batch_number,
                COALESCE(pb.expiry_date, '') AS expiry_date,
                COALESCE(pb.quantity_in_stock, 0) AS quantity_in_stock,
                COALESCE(pb.cost_price_at_batch, sii.cost_price, 0) AS cost_price_at_batch,
                COALESCE(pb.loose_open_remaining, 0) AS loose_open_remaining
         FROM sales_invoice_items sii
         LEFT JOIN products p ON p.id = sii.product_id
         LEFT JOIN product_batches pb ON pb.id = sii.batch_id
         WHERE sii.invoice_id = ?
         ORDER BY sii.rowid`,
        [invoiceId],
      );

      cartStore.clearCart();
      cartStore.setCustomerType((inv.customer_type as 'retail' | 'wholesale') || 'retail');
      for (const line of rawItems) {
        const product: Product = {
          id: line.product_id,
          name: line.product_name,
          generic_name: null,
          sku: line.sku,
          barcode: null,
          category_id: null,
          manufacturer_id: null,
          unit_price: line.unit_price,
          wholesale_price: line.wholesale_price,
          cost_price: line.cost_price || 0,
          pack_size: line.pack_size,
          sell_by_loose_unit: Boolean(line.sell_by_loose_unit),
          drap_registration_number: null,
          controlled_substance: Boolean(line.controlled_substance),
          reorder_level: 0,
          is_active: true,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        };
        const batch: ProductBatch = {
          id: line.batch_id,
          product_id: line.product_id,
          batch_number: line.batch_number,
          expiry_date: line.expiry_date,
          quantity_in_stock: line.quantity_in_stock,
          loose_open_remaining: line.loose_open_remaining,
          cost_price_at_batch: line.cost_price_at_batch,
          received_date: '',
          created_at: '',
          updated_at: '',
        };
        cartStore.addItem(
          product,
          batch,
          line.quantity,
          Boolean(line.is_loose_sale),
          false,
          line.bonus_quantity,
          line.discount_percent,
        );
      }
      cartStore.setDiscountAmount(Number(inv.discount_amount) || 0);

      invoiceNumber.value = inv.invoice_number;
      if (inv.customer_id) {
        const [cust] = await executeQuery<Customer>('SELECT * FROM customers WHERE id = ?', [
          inv.customer_id,
        ]);
        if (cust) {
          chooseCustomer(cust);
        } else {
          chooseCustomer({
            id: inv.customer_id,
            first_name: inv.customer_name?.split(' ')[0] || '',
            last_name: inv.customer_name?.split(' ').slice(1).join(' ') || '',
            customer_code: '',
            phone_number: inv.customer_phone || '',
            credit_limit: 0,
            current_balance: 0,
            customer_type: (inv.customer_type as 'retail' | 'wholesale') || 'retail',
          });
        }
      } else {
        chooseCustomer(null);
      }
      paymentMethod.value = inv.payment_method || 'cash';
      cashReceived.value = inv.received_amount != null ? String(inv.received_amount) : '';
      patientName.value = inv.patient_name || '';
      doctorName.value = inv.doctor_name || '';
      prescriptionNote.value = inv.prescription_note || '';
      saleRemarks.value = inv.notes || '';
      lastReceipt.value = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        subtotal: Number(inv.total_amount) || 0,
        taxAmount: Number(inv.tax_amount) || 0,
        discountAmount: Number(inv.discount_amount) || 0,
        netAmount: Number(inv.net_amount) || 0,
        receivedAmount: Number(inv.received_amount) || Number(inv.net_amount) || 0,
        changeAmount: Number(inv.change_amount) || 0,
      };
      lastInvoiceId.value = inv.id;
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error(pick('Could not load previous sale', 'پچھلی فروخت لوڈ نہیں ہو سکی'));
    }
  }

  async function goBackward() {
    if (checkoutLoading.value) return;
    await loadRecentInvoices();
    if (!recentInvoices.value.length) {
      toast.warning(pick('No previous sales available', 'کوئی پچھلی فروخت دستیاب نہیں'));
      return;
    }
    if (historyIndex.value === -1) {
      draftState.value = {
        items: [...cartStore.items],
        discountAmount: cartStore.discountAmount,
        customer: selectedCustomer.value,
        paymentMethod: paymentMethod.value,
        cashReceived: cashReceived.value,
        patientName: patientName.value,
        doctorName: doctorName.value,
        prescriptionNote: prescriptionNote.value,
        saleRemarks: saleRemarks.value,
      };
      historyIndex.value = 0;
    } else if (historyIndex.value < recentInvoices.value.length - 1) {
      historyIndex.value++;
    } else {
      toast.info(pick('Reached the oldest recorded sale', 'سب سے پرانی محفوظ فروخت تک پہنچ گئے'));
      return;
    }
    await loadHistorySale(recentInvoices.value[historyIndex.value].id);
  }

  async function goForward() {
    if (checkoutLoading.value) return;
    if (historyIndex.value > 0) {
      historyIndex.value--;
      await loadHistorySale(recentInvoices.value[historyIndex.value].id);
    } else if (historyIndex.value === 0) {
      exitHistoryView();
    }
  }

  function editViewingSale() {
    if (!viewingHistoryInvoice.value) return;
    const num = viewingHistoryInvoice.value.invoice_number;
    viewingHistoryInvoice.value = null;
    historyIndex.value = -1;
    draftState.value = null;
    void loadInvoiceNumber();
    void nextTick(() => {
      itemCodeInput.value?.focus({ preventScroll: true });
    });
    toast.info(
      pick(
        `Loaded invoice #${num} for editing`,
        `انوائس #${num} ترمیم کے لیے لوڈ ہو گئی`,
      ),
    );
  }

  function exitHistoryView() {
    if (historyIndex.value === -1) return;
    historyIndex.value = -1;
    viewingHistoryInvoice.value = null;
    if (draftState.value) {
      cartStore.clearCart();
      cartStore.setCustomerType(draftState.value.customer?.customer_type || 'retail');
      for (const it of draftState.value.items) {
        cartStore.addItem(
          it.product,
          it.batch,
          it.quantity,
          it.isLooseSale,
          it.confirmBreak,
          it.bonusQuantity,
          it.discount,
        );
      }
      cartStore.setDiscountAmount(draftState.value.discountAmount);
      chooseCustomer(draftState.value.customer);
      paymentMethod.value = draftState.value.paymentMethod;
      cashReceived.value = draftState.value.cashReceived;
      patientName.value = draftState.value.patientName;
      doctorName.value = draftState.value.doctorName;
      prescriptionNote.value = draftState.value.prescriptionNote;
      saleRemarks.value = draftState.value.saleRemarks;
      draftState.value = null;
    } else {
      resetSale();
    }
    void loadInvoiceNumber();
    void nextTick(() => {
      itemCodeInput.value?.focus({ preventScroll: true });
    });
  }

  function resetSale() {
    if (checkoutLoading.value) return;
    historyIndex.value = -1;
    viewingHistoryInvoice.value = null;
    draftState.value = null;
    cartStore.clearCart();
    clearItemEntry();
    chooseCustomer(null);
    customerOpen.value = false;
    paymentMethod.value = 'cash';
    cashReceived.value = '';
    patientName.value = '';
    doctorName.value = '';
    prescriptionNote.value = '';
    saleRemarks.value = '';
    sourceDocumentId.value = null;
    sourceDocumentNumber.value = '';
    sourceDocumentKind.value = '';
    sourceDocumentError.value = '';
    sourcePriceChanges.value = 0;
    if (route.query.document) {
      void router.replace({ query: {} });
    }
    void loadInvoiceNumber();
    void nextTick(() => {
      itemCodeInput.value?.focus({ preventScroll: true });
    });
  }
  const {
    sourceDocumentId,
    sourceDocumentNumber,
    sourceDocumentKind,
    sourceDocumentLoading,
    sourceDocumentError,
    sourcePriceChanges,
    loadSourceDocument,
  } = usePosSourceDocument(chooseCustomer, (remarks) => {
    saleRemarks.value = remarks;
  });
  const paymentMethod = ref('cash');

  const creditAllowed = computed(
    () =>
      !!selectedCustomer.value &&
      money(Number(selectedCustomer.value.current_balance) + total.value) <=
        Number(selectedCustomer.value.credit_limit),
  );

  watch(
    selectedCustomer,
    (customer) => {
      cartStore.setCustomerType(customer?.customer_type || 'retail');
      if (!customer && paymentMethod.value === 'credit') paymentMethod.value = 'cash';
    },
    { flush: 'sync' },
  );

  const subtotal = computed(() => cartStore.subtotal);

  const taxAmount = computed(() => cartStore.taxAmount);

  const total = computed(() => cartStore.total);

  const tendered = computed(() =>
    paymentMethod.value === 'cash' && cashReceived.value !== ''
      ? money(Number(cashReceived.value))
      : total.value,
  );

  const validTender = computed(
    () => Number.isFinite(tendered.value) && tendered.value >= total.value && tendered.value >= 0,
  );

  const changeDue = computed(() => (validTender.value ? money(tendered.value - total.value) : 0));

  const maxInvoiceDiscount = computed(
    () => Math.round((subtotal.value + taxAmount.value) * 100) / 100,
  );

  watch(
    () => settingsStore.settings?.tax_rate,
    (rate) => cartStore.setTaxRate(Number(rate ?? 0)),
    { immediate: true },
  );

  watch(maxInvoiceDiscount, (maximum) => {
    if (cartStore.discountAmount > maximum) cartStore.setDiscountAmount(maximum);
  });

  onMounted(() => {
    void nextTick(() => itemCodeInput.value?.focus({ preventScroll: true }));
    void loadShift();
    void loadInvoiceNumber();
    void loadRecentInvoices();
    if (typeof route.query.document === 'string') void loadSourceDocument(route.query.document);
    if (route.query.undo === '1') {
      void router.replace({ query: {} });
      void goBackward();
    }
    window.addEventListener('keydown', onPaymentShortcut, true);
  });

  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener('keydown', onPaymentShortcut, true);
    resetProductSearch();
    cartStore.clearCart();
  });

  async function loadShift() {
    try {
      shift.value = await invoke<CashierShift | null>('current_shift');
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      shift.value = null;
    }
  }

  function onPaymentShortcut(event: KeyboardEvent) {
    if (event.repeat || event.isComposing) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'n'
    ) {
      event.preventDefault();
      event.stopPropagation();
      resetSale();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'u'
    ) {
      event.preventDefault();
      event.stopPropagation();
      void goBackward();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'e' &&
      viewingHistoryInvoice.value
    ) {
      event.preventDefault();
      event.stopPropagation();
      editViewingSale();
      return;
    }
    if (event.key === 'Escape' && viewingHistoryInvoice.value && !productSearchOpen.value) {
      event.preventDefault();
      event.stopPropagation();
      exitHistoryView();
      return;
    }
    const isArrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (isArrow && !productSearchOpen.value && !customerOpen.value) {
      const target = event.target as HTMLElement | null;
      const isEditableInput =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      const allowArrowNav = event.altKey || viewingHistoryInvoice.value || !isEditableInput;
      if (allowArrowNav) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          void goBackward();
          return;
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          void goForward();
          return;
        }
      }
    }
    if (productSearchOpen.value) return;
    const method = ({ F8: 'cash', F9: 'card', F10: 'mobile' } as Record<string, string>)[event.key];
    if (method) {
      event.preventDefault();
      paymentMethod.value = method;
    }
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      void checkout();
    }
  }

  function onInvoiceDiscountChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const discount = Number(input.value);
    if (!Number.isFinite(discount) || discount < 0 || discount > maxInvoiceDiscount.value) {
      toast.warning(
        `Invoice discount must be between 0 and ${formatCurrency(maxInvoiceDiscount.value)}`,
      );
      input.value = cartStore.discountAmount.toFixed(2);
      return;
    }
    cartStore.setDiscountAmount(Math.round(discount * 100) / 100);
    input.value = cartStore.discountAmount.toFixed(2);
  }

  async function checkout() {
    if (checkoutLoading.value || sourceDocumentLoading.value) return;
    if (viewingHistoryInvoice.value) {
      toast.warning(
        pick(
          'Click Edit to modify this previous sale before checkout.',
          'فروخت مکمل کرنے سے پہلے ترمیم (Edit) پر کلک کریں۔',
        ),
      );
      return;
    }
    if (pendingProduct.value) {
      toast.warning(
        pick(
          'Add the selected item with Enter or ↓, or clear it before payment.',
          'منتخب آئٹم Enter یا ↓ سے شامل کریں یا ادائیگی سے پہلے صاف کریں۔',
        ),
      );
      entryQuantityInput.value?.focus({ preventScroll: true });
      return;
    }
    if (paymentMethod.value === 'credit' && !creditAllowed.value) {
      toast.warning(
        pick(
          'Select a registered customer with sufficient credit limit. Collect a payment or ask a manager to review the limit.',
          'مناسب کریڈٹ حد والا رجسٹرڈ گاہک منتخب کریں۔ وصولی کریں یا منیجر سے حد درست کروائیں۔',
        ),
      );
      return;
    }
    if (prescriptionMissing.value) {
      toast.warning(
        pick(
          'Add both patient and doctor, or a prescription note/reference for controlled products.',
          'کنٹرول شدہ دوا کے لیے مریض اور ڈاکٹر دونوں، یا نسخے کا نوٹ / حوالہ درج کریں۔',
        ),
      );
      return;
    }
    if (!validTender.value) {
      toast.warning('Cash received must cover the sale total');
      return;
    }
    await loadShift();
    if (disposed || checkoutLoading.value) return;
    if (!shift.value || shift.value.cashierId !== authStore.currentUser?.id) {
      toast.warning(
        pick('Open your cash drawer shift before selling.', 'فروخت سے پہلے اپنی کیش شفٹ کھولیں۔'),
      );
      return;
    }
    if (cartStore.items.length === 0) {
      toast.warning('Cart is empty');
      return;
    }

    if (!authStore.currentUser) {
      toast.error('Please sign in before completing a sale');
      return;
    }
    if (customerSearch.value.trim() && !selectedCustomerId.value) {
      toast.warning('Select a customer from the list or clear the search for a walk-in sale');
      return;
    }
    if (cartStore.discountAmount > maxInvoiceDiscount.value) {
      toast.warning('Invoice discount exceeds the amount due');
      return;
    }

    checkoutLoading.value = true;
    try {
      const receipt = await invoke<SaleReceipt>('checkout_sale', {
        request: {
          cashierId: authStore.currentUser.id,
          sourceDocumentId: sourceDocumentId.value,
          customerId: selectedCustomerId.value,
          patientName: patientName.value.trim() || null,
          doctorName: doctorName.value.trim() || null,
          prescriptionNote: prescriptionNote.value.trim() || null,
          notes: saleRemarks.value.trim() || null,
          receivedAmount: paymentMethod.value === 'credit' ? 0 : tendered.value,
          paymentMethod: paymentMethod.value,
          orderDiscount: cartStore.discountAmount,
          expectedSubtotal: subtotal.value,
          expectedTaxAmount: taxAmount.value,
          expectedNetAmount: total.value,
          timestamp: new Date().toISOString(),
          items: cartStore.items.map((item) => ({
            productId: item.product.id,
            batchId: item.batch.id,
            quantity: item.quantity,
            bonusQuantity: item.bonusQuantity,
            isLooseSale: item.isLooseSale,
            discountPercent: item.discount,
            confirmBreak: item.confirmBreak,
          })),
        },
      });
      if (disposed) return;
      lastReceipt.value = receipt;
      lastInvoiceId.value = receipt.invoiceId;
      invoiceNumber.value = String(Number(receipt.invoiceNumber) + 1);
      void loadInvoiceNumber();
      void loadRecentInvoices();
      sourceDocumentId.value = null;
      sourceDocumentNumber.value = '';
      toast.success(
        `Sale completed! ${receipt.invoiceNumber} · ${formatCurrency(receipt.netAmount)}`,
      );
      cartStore.clearCart();
      chooseCustomer(null);
      paymentMethod.value = 'cash';
      patientName.value = '';
      doctorName.value = '';
      prescriptionNote.value = '';
      saleRemarks.value = '';
      cashReceived.value = '';
      searchInput.value?.focus();
    } catch (error) {
      if (disposed) return;
      reportDiagnostic('operation_failed', 'pos');
      toast.error(
        String(error).includes('Selected customer is unavailable')
          ? 'This customer is no longer active. Choose another customer or a walk-in sale.'
          : String(error).includes('Sale total changed')
            ? 'Price or tax changed. Refresh POS and rebuild the cart before checkout.'
            : String(error),
      );
    } finally {
      checkoutLoading.value = false;
    }
  }

  return {
    invoiceNumber,
    pendingProduct,
    itemCode,
    itemCodeInput,
    entryQuantityInput,
    entryQuantity,
    entryBonus,
    entryDiscount,
    entryLoose,
    entryError,
    entryPrice,
    entryStock,
    selectProductForEntry,
    commitEntry,
    clearItemEntry,
    resetSale,
    onItemCodeKeydown,
    t,
    pick,
    formatNumber,
    cartStore,
    settingsStore,
    authStore,
    router,
    sourceDocumentId,
    sourceDocumentNumber,
    sourceDocumentKind,
    sourceDocumentLoading,
    sourceDocumentError,
    sourcePriceChanges,
    shift,
    patientName,
    doctorName,
    prescriptionNote,
    hasControlled,
    prescriptionMissing,
    saleRemarks,
    cashReceived,
    showCost,
    selectedCustomer,
    searchQuery,
    productSearchOpen,
    openProductSearch,
    resetProductSearch,
    searchResults,
    searchLoading,
    searchError,
    highlightedProductIndex,
    searchInput,
    checkoutLoading,
    lastReceipt,
    lastInvoiceId,
    savedActions,
    selectedCustomerId,
    customerSearch,
    customerOptions,
    customerOpen,
    customerLoading,
    highlightedCustomerIndex,
    paymentMethod,
    creditAllowed,
    subtotal,
    taxAmount,
    total,
    money,
    validTender,
    changeDue,
    lineGross,
    lineDiscount,
    lineMargin,
    maxInvoiceDiscount,
    openCustomerPicker,
    onCustomerInput,
    chooseCustomer,
    onCustomerKeydown,
    onProductSearchInput,
    addToCart,
    removeFromCart,
    updateQuantities,
    onLineDiscountAmountChange,
    onLineDiscountChange,
    onInvoiceDiscountChange,
    getBatchWarning,
    checkout,
    handleBarcodeInput,
    recentInvoices,
    historyIndex,
    viewingHistoryInvoice,
    canGoBackward,
    canGoForward,
    goBackward,
    goForward,
    editViewingSale,
    exitHistoryView,
    ref,
    formatCurrency,
    formatDate,
  };
}
