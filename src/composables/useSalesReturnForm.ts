import { reportDiagnostic } from '@/lib/diagnostics';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RefundMethod, ReturnReason, SalesInvoice } from '@/lib/types';

export function useSalesReturnForm() {
  type InvoiceLine = {
    id: string;
    product_id: string;
    batch_id: string;
    product_name: string;
    batch_number: string;
    quantity: number;
    line_total: number;
    already_returned: number;
    return_now: number;
    restock: boolean;
  };

  const router = useRouter();

  const auth = useAuthStore();

  const toast = useToast();

  const { pick, t, formatNumber } = useI18n();

  const search = ref('');

  const invoice = ref<SalesInvoice | null>(null);

  const lines = ref<InvoiceLine[]>([]);

  const reason = ref<ReturnReason>('defective');

  const method = ref<RefundMethod>('cash');

  const notes = ref('');

  const saving = ref(false);

  const reasons: ReturnReason[] = [
    'defective',
    'wrong_item',
    'expired',
    'customer_changed_mind',
    'duplicate_purchase',
    'other',
  ];

  const subtotal = computed(() =>
    lines.value.reduce(
      (sum, line) =>
        sum + (Number(line.line_total) * Number(line.return_now || 0)) / Number(line.quantity),
      0,
    ),
  );

  const invoiceLineTotal = computed(() =>
    lines.value.reduce((sum, line) => sum + Number(line.line_total), 0),
  );

  const priorSubtotal = computed(() =>
    lines.value.reduce(
      (sum, line) =>
        sum + (Number(line.line_total) * Number(line.already_returned)) / Number(line.quantity),
      0,
    ),
  );

  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  const refund = computed(() =>
    invoice.value && invoiceLineTotal.value > 0
      ? roundMoney(
          ((priorSubtotal.value + subtotal.value) * Number(invoice.value.net_amount)) /
            invoiceLineTotal.value,
        ) -
        roundMoney(
          (priorSubtotal.value * Number(invoice.value.net_amount)) / invoiceLineTotal.value,
        )
      : 0,
  );

  async function findInvoice() {
    invoice.value = null;
    lines.value = [];
    if (!search.value.trim()) return;
    try {
      const [found] = await executeQuery<SalesInvoice>(
        `SELECT * FROM sales_invoices WHERE invoice_number = ? AND status = 'completed'`,
        [search.value.trim()],
      );
      if (!found) {
        toast.warning(pick('Completed invoice not found', 'مکمل انوائس نہیں ملی'));
        return;
      }
      invoice.value = found;
      method.value = found.payment_method === 'credit' ? 'credit_note' : 'cash';
      lines.value = (
        await executeQuery<InvoiceLine>(
          `SELECT sii.id, sii.product_id, sii.batch_id, p.name AS product_name,
          pb.batch_number, sii.quantity, sii.line_total,
          COALESCE((SELECT SUM(prior.quantity_returned) FROM sales_return_items prior
            JOIN sales_returns sr ON sr.id = prior.return_id
            WHERE prior.invoice_item_id = sii.id AND sr.status != 'rejected'), 0) AS already_returned
         FROM sales_invoice_items sii JOIN products p ON p.id = sii.product_id
         JOIN product_batches pb ON pb.id = sii.batch_id WHERE sii.invoice_id = ?`,
          [found.id],
        )
      ).map((line) => ({ ...line, return_now: 0, restock: false }));
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error(pick('Could not load invoice', 'انوائس لوڈ نہیں ہو سکی'));
    }
  }

  async function save() {
    if (!invoice.value || !auth.currentUser) return;
    const chosen = lines.value.filter((line) => Number(line.return_now) > 0);
    if (
      !chosen.length ||
      lines.value.some(
        (line) =>
          !Number.isInteger(Number(line.return_now)) ||
          Number(line.return_now) < 0 ||
          Number(line.return_now) > Number(line.quantity) - Number(line.already_returned),
      )
    ) {
      toast.warning(
        pick(
          'Choose whole quantities within the remaining sold amount',
          'باقی فروخت شدہ تعداد کے اندر پوری تعداد منتخب کریں',
        ),
      );
      return;
    }
    saving.value = true;
    try {
      await invoke('submit_sales_return', {
        request: {
          userId: auth.currentUser.id,
          timestamp: new Date().toISOString(),
          invoiceId: invoice.value.id,
          reason: reason.value,
          notes: notes.value || null,
          refundMethod: method.value,
          items: chosen.map((line) => ({
            invoiceItemId: line.id,
            quantity: Number(line.return_now),
            restock: line.restock,
          })),
        },
      });
      toast.success(pick('Return submitted for approval', 'واپسی منظوری کے لیے جمع ہو گئی'));
      router.push('/sales-returns');
    } catch {
      reportDiagnostic('operation_failed', 'pos');
      toast.error(pick('Could not save return', 'واپسی محفوظ نہیں ہو سکی'));
    } finally {
      saving.value = false;
    }
  }

  return {
    router,
    pick,
    t,
    formatNumber,
    search,
    invoice,
    lines,
    reason,
    method,
    notes,
    saving,
    reasons,
    refund,
    findInvoice,
    save,
    formatCurrency,
    formatDate,
  };
}
