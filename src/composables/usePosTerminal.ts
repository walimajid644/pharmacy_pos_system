import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { invoke } from '@tauri-apps/api/core';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CashierShift } from '@/lib/types';
import { roundSaleMoney as money, type SaleReceipt } from '@/lib/pos';
import SavedSaleActions from '@/components/SavedSaleActions.vue';
import { usePosCustomer } from '@/composables/usePosCustomer';
import { usePosProductSearch } from '@/composables/usePosProductSearch';
import { usePosCartLines } from '@/composables/usePosCartLines';
import { usePosSourceDocument } from '@/composables/usePosSourceDocument';

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
  } = usePosProductSearch((product, loose) => addToCart(product, loose));
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
    void nextTick(() => searchInput.value?.focus());
    void loadShift();
    if (typeof route.query.document === 'string') void loadSourceDocument(route.query.document);
    window.addEventListener('keydown', onPaymentShortcut);
  });

  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener('keydown', onPaymentShortcut);
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
    if (event.repeat || event.isComposing || productSearchOpen.value) return;
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
    ref,
    formatCurrency,
    formatDate,
  };
}
