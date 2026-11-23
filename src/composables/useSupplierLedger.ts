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
    receipt_adjustment?: number;
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
  let paymentRequestId = crypto.randomUUID();

  const amount = ref<number | null>(null);

  const method = ref('cash');
  const bankAccountId = ref('');
  const bankAccounts = ref<{ id: string; name: string }[]>([]);

  const reference = ref('');

  const notes = ref('');

  const error = ref('');

  const supplierFilter = ref('');

  const printPayment = ref<Payment | null>(null);

  function accruedCents(row: LedgerRow) {
    return Math.round(
      row.total_amount *
        100 *
        (row.ordered_value > 0 ? Math.min(1, row.received_value / row.ordered_value) : 0) +
        (row.receipt_adjustment || 0) * 100,
    );
  }

  function balanceCents(row: LedgerRow) {
    return row.status === 'opening'
      ? accruedCents(row) - row.paid_cents
      : Math.max(0, accruedCents(row) - row.paid_cents);
  }

  function daysOverdue(row: LedgerRow) {
    if (row.status === 'opening') return 0;
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

  const openingOutstanding = computed(() =>
    visibleRows.value
      .filter((row) => row.status === 'opening')
      .reduce((sum, row) => sum + balanceCents(row), 0),
  );

  const aging = computed(() => {
    const buckets = [0, 0, 0, 0, 0];
    for (const row of visibleRows.value) {
      if (row.status === 'opening') continue;
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
      bankAccounts.value = await executeQuery<{ id: string; name: string }>(
        'SELECT id,name FROM bank_accounts WHERE is_active=1 AND deleted_at IS NULL ORDER BY name',
      );
      rows.value =
        await executeQuery<LedgerRow>(`SELECT po.id, po.po_number, po.supplier_id, s.name AS supplier_name, po.order_date, po.received_date, s.payment_terms, po.status, po.total_amount,
        COALESCE((SELECT SUM(pr.net_payable - COALESCE((SELECT SUM(ri.quantity * i.line_total / NULLIF(i.quantity_ordered, 0)) FROM purchase_receipt_items ri JOIN purchase_order_items i ON i.id = ri.po_item_id WHERE ri.receipt_id = pr.id), 0) * CASE WHEN (SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id) > 0 THEN po.total_amount / (SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id) ELSE 0 END) FROM purchase_receipts pr WHERE pr.po_id = po.id), 0.0) AS receipt_adjustment,
        COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS ordered_value,
        COALESCE((SELECT SUM(CASE WHEN i.quantity_ordered > 0 THEN i.line_total * i.quantity_received / i.quantity_ordered ELSE 0 END) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS received_value,
        COALESCE((SELECT SUM(p.amount_cents) FROM supplier_payments p WHERE p.po_id = po.id), 0) AS paid_cents
        FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.status IN ('partial', 'received') UNION ALL SELECT o.id,'Opening · '||o.reference,o.supplier_id,s.name,o.entry_date,NULL,0,'opening',o.amount_cents/100.0,0,1,1,o.paid_cents FROM supplier_opening_outstanding o JOIN suppliers s ON s.id=o.supplier_id ORDER BY order_date DESC`);
      payments.value = await executeQuery<Payment>(
        `SELECT p.id,p.voucher_number,p.po_id,s.name AS supplier_name,p.amount_cents,p.method,p.reference,p.paid_at FROM supplier_payments p JOIN suppliers s ON s.id=p.supplier_id UNION ALL SELECT p.id,p.voucher_number,p.opening_id,s.name,p.amount_cents,p.method,p.reference,p.paid_at FROM supplier_opening_payments p JOIN suppliers s ON s.id=p.supplier_id ORDER BY paid_at DESC LIMIT 100`,
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
          requestId: paymentRequestId,
          poId: row.id,
          amountCents: cents,
          method: method.value,
          bankAccountId: method.value === 'bank' ? bankAccountId.value || null : null,
          reference: reference.value,
          notes: notes.value,
        },
      });
      toast.success(`${pick('Payment recorded', 'ادائیگی درج ہوئی')}: ${result.voucherNumber}`);
      paymentRequestId = crypto.randomUUID();
      amount.value = null;
      reference.value = '';
      notes.value = '';
      await load();
      return result;
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
    bankAccounts,
    bankAccountId,
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
    openingOutstanding,
    aging,
    load,
    save,
    printVoucher,
  };
}
