import { computed, onMounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';

export function useSupplierLedger() {
  type LedgerRow = {
    id: string;
    po_number: string;
    supplier_name: string;
    supplier_id: string;
    order_date: string;
    received_date: string | null;
    payment_terms: number;
    status: string;
    total_amount: number;
    ordered_value: number;
    received_value: number;
    paid_cents: number;
  };

  type Payment = {
    id: string;
    voucher_number: string;
    po_id: string;
    supplier_name: string;
    amount_cents: number;
    method: string;
    reference: string | null;
    paid_at: string;
  };

  type Receipt = { voucherNumber: string; amountCents: number; balanceCents: number };

  const { pick, formatCurrency } = useI18n();

  const toast = useToast();

  const rows = ref<LedgerRow[]>([]);

  const payments = ref<Payment[]>([]);

  const loading = ref(false);

  const saving = ref(false);

  const selectedPo = ref('');

  const amount = ref<number | null>(null);

  const method = ref('cash');

  const reference = ref('');

  const notes = ref('');

  const error = ref('');

  const supplierFilter = ref('');

  const printPayment = ref<Payment | null>(null);

  function accruedCents(row: LedgerRow) {
    return Math.round(
      row.total_amount *
        100 *
        (row.ordered_value > 0 ? Math.min(1, row.received_value / row.ordered_value) : 0),
    );
  }

  function balanceCents(row: LedgerRow) {
    return Math.max(0, accruedCents(row) - row.paid_cents);
  }

  function daysOverdue(row: LedgerRow) {
    const base = new Date(`${(row.received_date || row.order_date).slice(0, 10)}T00:00:00`);
    const due = new Date(base);
    due.setDate(due.getDate() + Number(row.payment_terms || 0));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
  }

  const visibleRows = computed(() =>
    rows.value.filter((row) => !supplierFilter.value || row.supplier_id === supplierFilter.value),
  );

  const suppliers = computed(() => [
    ...new Map(rows.value.map((row) => [row.supplier_id, row.supplier_name])).entries(),
  ]);

  const outstanding = computed(() =>
    visibleRows.value.reduce((sum, row) => sum + balanceCents(row), 0),
  );

  const aging = computed(() => {
    const buckets = [0, 0, 0, 0, 0];
    for (const row of visibleRows.value) {
      const days = daysOverdue(row);
      buckets[days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4] +=
        balanceCents(row);
    }
    return buckets;
  });

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      rows.value =
        await executeQuery<LedgerRow>(`SELECT po.id, po.po_number, po.supplier_id, s.name AS supplier_name, po.order_date, po.received_date, s.payment_terms, po.status, po.total_amount,
        COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS ordered_value,
        COALESCE((SELECT SUM(CASE WHEN i.quantity_ordered > 0 THEN i.line_total * i.quantity_received / i.quantity_ordered ELSE 0 END) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS received_value,
        COALESCE((SELECT SUM(p.amount_cents) FROM supplier_payments p WHERE p.po_id = po.id), 0) AS paid_cents
        FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.status IN ('partial', 'received') ORDER BY po.order_date DESC`);
      payments.value = await executeQuery<Payment>(
        `SELECT p.*, s.name AS supplier_name FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.paid_at DESC LIMIT 100`,
      );
    } catch (e) {
      error.value = String(e);
      toast.error(error.value);
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    if (saving.value) return;
    const row = rows.value.find((item) => item.id === selectedPo.value);
    const cents = Math.round(Number(amount.value) * 100);
    if (!row || !Number.isFinite(cents) || cents <= 0) {
      error.value = pick(
        'Choose a received order and an amount within its unpaid balance.',
        'موصولہ آرڈر اور بقایا رقم کے اندر ادائیگی منتخب کریں۔',
      );
      return;
    }
    if (cents > balanceCents(row)) {
      error.value = pick(
        `Attempted ${formatCurrency(cents / 100)}; outstanding ${formatCurrency(balanceCents(row) / 100)}. Overpayment is not allowed. Reduce the amount or receive the remaining goods first.`,
        `ادائیگی ${formatCurrency(cents / 100)}؛ بقایا ${formatCurrency(balanceCents(row) / 100)}۔ بقایا سے زائد ادائیگی نہیں ہو سکتی۔ رقم کم کریں یا باقی مال وصول کریں۔`,
      );
      return;
    }
    saving.value = true;
    error.value = '';
    try {
      const result = await invoke<Receipt>('record_supplier_payment', {
        request: {
          poId: row.id,
          amountCents: cents,
          method: method.value,
          reference: reference.value,
          notes: notes.value,
        },
      });
      toast.success(`${pick('Payment recorded', 'ادائیگی درج ہوئی')}: ${result.voucherNumber}`);
      amount.value = null;
      reference.value = '';
      notes.value = '';
      await load();
    } catch (e) {
      error.value = String(e);
      toast.error(error.value);
    } finally {
      saving.value = false;
    }
  }

  function printVoucher(payment: Payment) {
    printPayment.value = payment;
    setTimeout(() => {
      document.body.classList.add('printing-supplier-voucher');
      const cleanup = () => {
        document.body.classList.remove('printing-supplier-voucher');
        printPayment.value = null;
      };
      window.addEventListener('afterprint', cleanup, { once: true });
      try {
        window.print();
      } catch {
        cleanup();
      }
    }, 0);
  }

  onMounted(load);

  return {
    pick,
    formatCurrency,
    payments,
    loading,
    saving,
    selectedPo,
    amount,
    method,
    reference,
    notes,
    error,
    supplierFilter,
    printPayment,
    accruedCents,
    balanceCents,
    daysOverdue,
    visibleRows,
    suppliers,
    outstanding,
    aging,
    load,
    save,
    printVoucher,
  };
}
