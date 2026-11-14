import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { useToast } from '@/composables/useToast';

export function useCommercialDocuments() {
  const label = useWorkspaceLabels();

  const route = useRoute(),
    router = useRouter(),
    toast = useToast(),
    { formatCurrency, pick } = useI18n();

  const kind = computed(() => (route.path === '/estimates' ? 'estimate' : 'preorder')),
    title = computed(() =>
      kind.value === 'estimate' ? label('Estimates') : label('Customer Pre-orders'),
    );

  type Doc = {
    id: string;
    number: string;
    kind: string;
    customer_id: string | null;
    customer_name: string;
    document_date: string;
    due_date: string | null;
    notes: string;
    status: string;
    subtotal_cents: number;
    invoice_id: string | null;
    invoice_number?: string;
  };

  type Product = {
    id: string;
    name: string;
    sku: string;
    unit_price: number;
    pack_size: number;
    sell_by_loose_unit: boolean;
  };

  type Line = { productId: string; quantity: number; price: number };

  type Customer = { id: string; name: string };

  const documents = ref<Doc[]>([]),
    products = ref<Product[]>([]),
    customers = ref<Customer[]>([]),
    loading = ref(false),
    busy = ref(false),
    error = ref(''),
    editing = ref(false),
    query = ref(''),
    filter = ref('all'),
    productQuery = ref(''),
    productId = ref(''),
    printing = ref<Doc | null>(null),
    printLines = ref<Array<{ name: string; quantity: number; unit_price_cents: number }>>([]);

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const blank = () => ({
    id: null as string | null,
    customerId: '',
    customerName: '',
    documentDate: today(),
    dueDate: '',
    notes: '',
    items: [] as Line[],
  });

  const form = ref(blank());

  const editorDialog = ref<HTMLElement | null>(null);

  useDialogKeyboard(editorDialog, () => {
    if (!busy.value) editing.value = false;
  });

  const expired = (d: Doc) => d.kind === 'estimate' && !!d.due_date && d.due_date < today();

  const total = computed(
    () =>
      form.value.items.reduce(
        (sum, l) => sum + Math.round(Number(l.price) * 100) * Number(l.quantity),
        0,
      ) / 100,
  );

  const visible = computed(() =>
    documents.value.filter(
      (d) =>
        (filter.value === 'all' || d.status === filter.value) &&
        `${d.number} ${d.customer_name} ${d.notes}`
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    ),
  );

  const matches = computed(() =>
    products.value.filter((p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(productQuery.value.toLowerCase()),
    ),
  );

  onMounted(load);
  watch(
    () => route.path,
    () => {
      editing.value = false;
      filter.value = 'all';
      query.value = '';
      void load();
    },
  );

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      const [docs, ps, cs] = await Promise.all([
        executeQuery<Doc>(
          'SELECT d.*,i.invoice_number FROM commercial_documents d LEFT JOIN sales_dashboard i ON i.id=d.invoice_id WHERE d.kind=? ORDER BY d.created_at DESC',
          [kind.value],
        ),
        executeQuery<Product>(
          'SELECT id,name,sku,unit_price,pack_size,sell_by_loose_unit FROM products WHERE deleted_at IS NULL AND is_active=1 ORDER BY name',
        ),
        executeQuery<Customer>(
          "SELECT id,first_name || ' ' || last_name || ' · ' || customer_code AS name FROM customers WHERE deleted_at IS NULL AND is_active=1 ORDER BY first_name",
        ),
      ]);
      documents.value = docs;
      products.value = ps;
      customers.value = cs;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  function create() {
    form.value = blank();
    productId.value = '';
    productQuery.value = '';
    editing.value = true;
  }

  function chooseCustomer() {
    const c = customers.value.find((c) => c.id === form.value.customerId);
    if (c) form.value.customerName = c.name;
  }

  function add() {
    const p = products.value.find((p) => p.id === productId.value);
    if (!p) return;
    if (form.value.items.some((l) => l.productId === p.id)) {
      toast.warning('This item is already on the document');
      return;
    }
    form.value.items.push({
      productId: p.id,
      quantity: p.sell_by_loose_unit ? 1 : p.pack_size,
      price: p.unit_price,
    });
    productId.value = '';
  }

  async function edit(d: Doc) {
    try {
      const items = await executeQuery<{
        product_id: string;
        quantity: number;
        unit_price_cents: number;
      }>(
        'SELECT product_id,quantity,unit_price_cents FROM commercial_document_items WHERE document_id=?',
        [d.id],
      );
      form.value = {
        id: d.id,
        customerId: d.customer_id || '',
        customerName: d.customer_name,
        documentDate: d.document_date,
        dueDate: d.due_date || '',
        notes: d.notes,
        items: items.map((l) => ({
          productId: l.product_id,
          quantity: l.quantity,
          price: l.unit_price_cents / 100,
        })),
      };
      editing.value = true;
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function save() {
    busy.value = true;
    try {
      if (!form.value.items.length) throw new Error('Add at least one item');
      for (const l of form.value.items) {
        if (
          !Number.isInteger(Number(l.quantity)) ||
          Number(l.quantity) < 1 ||
          !Number.isFinite(Number(l.price)) ||
          Number(l.price) < 0 ||
          Math.abs(Number(l.price) * 100 - Math.round(Number(l.price) * 100)) > 0.00001
        )
          throw new Error('Use whole unit quantities and prices with at most two decimals');
      }
      await invoke('save_commercial_document', {
        request: {
          ...form.value,
          kind: kind.value,
          customerId: form.value.customerId || null,
          dueDate: form.value.dueDate || null,
          items: form.value.items.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPriceCents: Math.round(Number(l.price) * 100),
          })),
        },
      });
      editing.value = false;
      toast.success('Document saved');
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      busy.value = false;
    }
  }

  async function cancel(d: Doc) {
    if (!confirm(`Cancel ${d.number}?`)) return;
    busy.value = true;
    try {
      await invoke('cancel_commercial_document', { id: d.id });
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      busy.value = false;
    }
  }

  async function print(d: Doc) {
    try {
      printLines.value = await executeQuery(
        'SELECT p.name,l.quantity,l.unit_price_cents FROM commercial_document_items l JOIN products p ON p.id=l.product_id WHERE l.document_id=?',
        [d.id],
      );
      printing.value = d;
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
    } catch (e) {
      toast.error(String(e));
    }
  }

  function checkout(d: Doc) {
    void router.push({ path: '/pos', query: { document: d.id } });
  }

  return {
    label,
    formatCurrency,
    pick,
    kind,
    title,
    documents,
    products,
    customers,
    loading,
    busy,
    error,
    editing,
    query,
    filter,
    productQuery,
    productId,
    printing,
    printLines,
    form,
    editorDialog,
    expired,
    total,
    visible,
    matches,
    load,
    create,
    chooseCustomer,
    add,
    edit,
    save,
    cancel,
    print,
    checkout,
    ref,
  };
}
