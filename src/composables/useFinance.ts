import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';

export function useFinance() {
  const label = useWorkspaceLabels();

  const route = useRoute(),
    { formatCurrency, pick } = useI18n(),
    toast = useToast();

  const expense = computed(() => route.path === '/expenses');

  type Customer = { id: string; name: string; current_balance: number };

  type Entry = {
    id: string;
    number: string;
    kind: string;
    party: string;
    category: string;
    description: string;
    amount_cents: number;
    method: string;
    entry_date: string;
    status: string;
    reference: string;
    void_reason: string | null;
    shift_status: string | null;
  };

  const customers = ref<Customer[]>([]),
    entries = ref<Entry[]>([]),
    busy = ref(false),
    loading = ref(false),
    error = ref(''),
    supplierMode = ref(false);

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const form = ref({
    requestId: crypto.randomUUID(),
    customerId: String(route.query.customer || ''),
    category: 'General',
    description: '',
    amount: '',
    method: 'cash',
    reference: '',
    entryDate: today(),
  });

  const query = ref(''),
    from = ref(''),
    to = ref(''),
    selected = ref<Entry | null>(null),
    reason = ref(''),
    printing = ref<Entry | null>(null);

  const voidDialog = ref<HTMLElement | null>(null),
    voidError = ref('');

  const closedCash = computed(
    () => selected.value?.method === 'cash' && selected.value.shift_status === 'closed',
  );

  useDialogKeyboard(voidDialog, () => {
    if (!busy.value) selected.value = null;
  });

  const selectedCustomer = computed(() =>
    customers.value.find((c) => c.id === form.value.customerId),
  );

  const visible = computed(() =>
    entries.value.filter(
      (e) =>
        (!expense.value || e.kind === 'expense') &&
        (!from.value || e.entry_date.slice(0, 10) >= from.value) &&
        (!to.value || e.entry_date.slice(0, 10) <= to.value) &&
        `${e.number} ${e.party} ${e.category} ${e.description} ${e.reference}`
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    ),
  );

  const total = (direction: 'in' | 'out') =>
    visible.value
      .filter(
        (e) =>
          e.status === 'posted' &&
          (direction === 'in'
            ? ['receipt', 'sale'].includes(e.kind)
            : ['expense', 'supplier', 'refund'].includes(e.kind) && e.method !== 'credit_note'),
      )
      .reduce((sum, e) => sum + e.amount_cents, 0) / 100;

  onMounted(load);

  watch(
    () => route.path,
    () => {
      supplierMode.value = false;
      form.value.requestId = crypto.randomUUID();
      form.value.amount = '';
      form.value.description = '';
      selected.value = null;
      void load();
    },
  );

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      customers.value = await executeQuery<Customer>(
        "SELECT id,first_name || ' ' || last_name || ' · ' || customer_code AS name,current_balance FROM customers WHERE deleted_at IS NULL AND (is_active=1 OR current_balance>0) ORDER BY first_name",
      );
      entries.value =
        await executeQuery<Entry>(`SELECT a.id,a.number,a.kind,COALESCE(c.first_name || ' ' || c.last_name,'Business expense') AS party,a.category,a.description,a.amount_cents,a.method,a.reference,a.entry_date,a.status,a.void_reason,sh.status AS shift_status FROM account_entries a LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN cashier_shifts sh ON sh.id=a.shift_id
   UNION ALL SELECT p.id,p.voucher_number,'supplier',s.name,'Supplier payment',COALESCE(p.notes,''),p.amount_cents,p.method,COALESCE(p.reference,''),p.paid_at,'posted',NULL,NULL FROM supplier_payments p JOIN suppliers s ON s.id=p.supplier_id
   UNION ALL SELECT i.id,i.invoice_number,'sale',COALESCE(c.first_name || ' ' || c.last_name,'Walk-in'),'Sale payment',COALESCE(i.notes,''),CAST(ROUND(i.net_amount*100) AS INTEGER),i.payment_method,'',i.invoice_date,'posted',NULL,NULL FROM sales_invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.status='completed' AND i.payment_method<>'credit'
   UNION ALL SELECT r.id,COALESCE(r.refund_reference,r.return_number),'refund',COALESCE(c.first_name || ' ' || c.last_name,'Walk-in'),'Sales refund',r.return_number,CAST(ROUND(r.refund_amount*100) AS INTEGER),r.refund_method,COALESCE(r.refund_reference,''),r.return_date,'posted',NULL,NULL FROM sales_returns r JOIN sales_invoices i ON i.id=r.original_invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE r.status='refunded' ORDER BY entry_date DESC`);
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    busy.value = true;
    try {
      const n = Number(form.value.amount),
        cents = Math.round(n * 100);
      if (!Number.isFinite(n) || n <= 0 || Math.abs(n * 100 - cents) > 0.00001)
        throw new Error('Enter a positive amount with at most two decimals');
      const number = await invoke<string>('record_account_entry', {
        request: {
          ...form.value,
          kind: expense.value ? 'expense' : 'receipt',
          customerId: expense.value ? null : form.value.customerId || null,
          amountCents: cents,
        },
      });
      toast.success(`${expense.value ? 'Expense' : 'Receipt'} saved: ${number}`);
      form.value.requestId = crypto.randomUUID();
      form.value.amount = '';
      form.value.description = '';
      form.value.reference = '';
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      busy.value = false;
    }
  }

  async function voidEntry() {
    if (!selected.value || closedCash.value) return;
    voidError.value = '';
    busy.value = true;
    try {
      await invoke('void_account_entry', { id: selected.value.id, reason: reason.value });
      selected.value = null;
      reason.value = '';
      await load();
    } catch (e) {
      voidError.value = String(e);
      toast.error(voidError.value);
    } finally {
      busy.value = false;
    }
  }

  async function printEntry(e: Entry) {
    printing.value = e;
    const { nextTick } = await import('vue');
    await nextTick();
    document.body.classList.add('printing-commercial');
    const clean = () => {
      document.body.classList.remove('printing-commercial');
      printing.value = null;
    };
    window.addEventListener('afterprint', clean, { once: true });
    try {
      window.print();
    } catch {
      clean();
    }
  }

  return {
    label,
    formatCurrency,
    pick,
    expense,
    customers,
    entries,
    busy,
    loading,
    error,
    supplierMode,
    today,
    form,
    query,
    from,
    to,
    selected,
    reason,
    printing,
    voidDialog,
    voidError,
    closedCash,
    selectedCustomer,
    visible,
    total,
    load,
    save,
    voidEntry,
    printEntry,
    ref,
  };
}
