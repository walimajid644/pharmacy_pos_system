import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { onMounted, ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { useRouter } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';

export function useAdvancedItemSearch() {
  const label = useWorkspaceLabels();

  const router = useRouter(),
    toast = useToast(),
    auth = useAuthStore(),
    { formatCurrency } = useI18n();

  type Option = { id: string; name: string };

  type Item = {
    id: string;
    name: string;
    generic_name: string | null;
    sku: string;
    barcode: string | null;
    unit_price: number;
    pack_size: number;
    category: string | null;
    manufacturer: string | null;
    stock: number;
    expired_stock: number;
    reorder_level: number;
    next_expiry: string | null;
    is_active: number;
    drap_registration_number: string | null;
  };

  type Batch = {
    id: string;
    batch_number: string;
    expiry_date: string;
    quantity_in_stock: number;
    loose_open_remaining: number;
  };

  const filters = ref({
      q: '',
      field: 'all',
      category: '',
      manufacturer: '',
      stock: 'all',
      expiry: 'all',
      min: '',
      max: '',
      status: 'active',
      controlled: false,
    }),
    categories = ref<Option[]>([]),
    manufacturers = ref<Option[]>([]),
    items = ref<Item[]>([]),
    batches = ref<Batch[]>([]),
    selected = ref<Item | null>(null),
    loading = ref(false),
    error = ref(''),
    page = ref(0),
    count = ref(0);

  const batchDialog = ref<HTMLElement | null>(null);

  useDialogKeyboard(batchDialog, () => {
    selected.value = null;
  });

  onMounted(async () => {
    try {
      [categories.value, manufacturers.value] = await Promise.all([
        executeQuery<Option>(
          'SELECT id,name FROM categories WHERE deleted_at IS NULL AND is_active=1 ORDER BY name',
        ),
        executeQuery<Option>(
          'SELECT id,name FROM manufacturers WHERE deleted_at IS NULL AND is_active=1 ORDER BY name',
        ),
      ]);
      await search();
    } catch (e) {
      error.value = String(e);
    }
  });

  async function search(reset = true) {
    if (loading.value) return;
    loading.value = true;
    error.value = '';
    if (reset) page.value = 0;
    try {
      const f = filters.value;
      if (
        (f.min !== '' && (!Number.isFinite(Number(f.min)) || Number(f.min) < 0)) ||
        (f.max !== '' && (!Number.isFinite(Number(f.max)) || Number(f.max) < 0)) ||
        (f.min !== '' && f.max !== '' && Number(f.min) > Number(f.max))
      )
        throw new Error('Check the minimum and maximum prices');
      let where = 'p.deleted_at IS NULL';
      const values: unknown[] = [];
      const fields: Record<string, string> = {
        name: 'p.name',
        generic: 'p.generic_name',
        sku: 'p.sku',
        barcode: 'p.barcode',
        registration: 'p.drap_registration_number',
      };
      const terms = f.q.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      for (const term of terms) {
        const cols = fields[f.field]
          ? [fields[f.field]]
          : ['p.name', 'p.generic_name', 'p.sku', 'p.barcode', 'p.drap_registration_number'];
        where += ' AND (' + cols.map((c) => `COALESCE(${c},'') LIKE ?`).join(' OR ') + ')';
        cols.forEach(() => values.push(`%${term}%`));
      }
      if (f.category) {
        where += ' AND p.category_id=?';
        values.push(f.category);
      }
      if (f.manufacturer) {
        where += ' AND p.manufacturer_id=?';
        values.push(f.manufacturer);
      }
      if (f.status !== 'all') {
        where += ' AND p.is_active=?';
        values.push(f.status === 'active' ? 1 : 0);
      }
      if (f.controlled) where += ' AND p.controlled_substance=1';
      if (f.min !== '') {
        where += ' AND p.unit_price>=?';
        values.push(Number(f.min));
      }
      if (f.max !== '') {
        where += ' AND p.unit_price<=?';
        values.push(Number(f.max));
      }
      if (f.expiry === 'near')
        where +=
          " AND EXISTS (SELECT 1 FROM product_batches x WHERE x.product_id=p.id AND x.quantity_in_stock>0 AND x.expiry_date BETWEEN date('now','localtime') AND date('now','localtime','+60 days'))";
      if (f.expiry === 'expired')
        where +=
          " AND EXISTS (SELECT 1 FROM product_batches x WHERE x.product_id=p.id AND x.quantity_in_stock>0 AND x.expiry_date<date('now','localtime'))";
      const base = `SELECT p.id,p.name,p.generic_name,p.sku,p.barcode,p.unit_price,p.pack_size,p.reorder_level,p.is_active,p.drap_registration_number,c.name AS category,m.name AS manufacturer,
   COALESCE(SUM(CASE WHEN b.expiry_date>=date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) AS stock,
   COALESCE(SUM(CASE WHEN b.expiry_date<date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) AS expired_stock,
   MIN(CASE WHEN b.expiry_date>=date('now','localtime') AND b.quantity_in_stock>0 THEN b.expiry_date END) AS next_expiry
   FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN product_batches b ON b.product_id=p.id WHERE ${where} GROUP BY p.id`;
      const stock =
        f.stock === 'low'
          ? 'stock<=reorder_level'
          : f.stock === 'in'
            ? 'stock>0'
            : f.stock === 'out'
              ? 'stock=0'
              : '1=1';
      const outer = `SELECT * FROM (${base}) WHERE ${stock}`;
      const totals = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) AS total FROM (${outer})`,
        values,
      );
      count.value = totals[0]?.total || 0;
      items.value = await executeQuery<Item>(`${outer} ORDER BY name,id LIMIT 100 OFFSET ?`, [
        ...values,
        page.value * 100,
      ]);
      selected.value = null;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function show(item: Item) {
    try {
      batches.value = await executeQuery<Batch>(
        'SELECT id,batch_number,expiry_date,quantity_in_stock,loose_open_remaining FROM product_batches WHERE product_id=? ORDER BY expiry_date,id',
        [item.id],
      );
      selected.value = item;
    } catch (e) {
      toast.error(String(e));
    }
  }

  function clear() {
    filters.value = {
      q: '',
      field: 'all',
      category: '',
      manufacturer: '',
      stock: 'all',
      expiry: 'all',
      min: '',
      max: '',
      status: 'active',
      controlled: false,
    };
    void search();
  }

  function turn(direction: number) {
    page.value += direction;
    void search(false);
  }

  return {
    label,
    router,
    auth,
    formatCurrency,
    filters,
    categories,
    manufacturers,
    items,
    batches,
    selected,
    loading,
    error,
    page,
    count,
    batchDialog,
    search,
    show,
    clear,
    turn,
    ref,
  };
}
