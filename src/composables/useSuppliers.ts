import { reportDiagnostic } from '@/lib/diagnostics';
import { errorMessage } from '@/lib/errors';
import { ref, computed, onMounted } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import type { Supplier } from '@/lib/types';

export function useSuppliers() {
  const { t, pick, formatCurrency, formatNumber } = useI18n();

  const { showToast } = useToast();

  const suppliers = ref<Supplier[]>([]);

  const loading = ref(true);

  const searchQuery = ref('');

  const statusFilter = ref<'all' | 'active' | 'inactive'>('all');

  const showModal = ref(false);

  const isEditing = ref(false);

  const ledgerBalance = ref<Record<string, number>>({});

  const currentSupplier = ref<Partial<Supplier>>({
    supplier_code: '',
    name: '',
    contact_person: '',
    phone_number: '',
    email: '',
    address: '',
    city: '',
    country: 'Pakistan',
    tax_registration: '',
    payment_terms: 30,
    credit_limit: 0,
    current_balance: 0,
    is_active: true,
    notes: '',
  });

  const filteredSuppliers = computed(() => {
    let result = suppliers.value;

    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.supplier_code.toLowerCase().includes(query) ||
          s.contact_person?.toLowerCase().includes(query) ||
          s.phone_number?.includes(query) ||
          s.city?.toLowerCase().includes(query),
      );
    }

    // Status filter
    if (statusFilter.value !== 'all') {
      result = result.filter((s) => (statusFilter.value === 'active' ? s.is_active : !s.is_active));
    }

    return result;
  });

  onMounted(async () => {
    await loadSuppliers();
  });

  async function loadSuppliers() {
    loading.value = true;
    try {
      suppliers.value = await executeQuery<Supplier>(
        `SELECT * FROM suppliers 
         WHERE deleted_at IS NULL 
         ORDER BY created_at DESC`,
      );
      const balances = await executeQuery<{
        supplier_id: string;
        total_amount: number;
        ordered_value: number;
        received_value: number;
        paid_cents: number;
      }>(
        `SELECT po.supplier_id, po.total_amount,
         COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS ordered_value,
         COALESCE((SELECT SUM(CASE WHEN i.quantity_ordered > 0 THEN i.line_total * i.quantity_received / i.quantity_ordered ELSE 0 END) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS received_value,
         COALESCE((SELECT SUM(p.amount_cents) FROM supplier_payments p WHERE p.po_id = po.id), 0) AS paid_cents
         FROM purchase_orders po WHERE po.status IN ('partial', 'received')`,
      );
      ledgerBalance.value = {};
      for (const row of balances) {
        const accrued = Math.round(
          row.total_amount *
            100 *
            (row.ordered_value > 0 ? Math.min(1, row.received_value / row.ordered_value) : 0),
        );
        ledgerBalance.value[row.supplier_id] =
          (ledgerBalance.value[row.supplier_id] || 0) + Math.max(0, accrued - row.paid_cents) / 100;
      }
    } catch {
      showToast(pick('Error loading suppliers', 'سپلائرز لوڈ کرنے میں خرابی'), 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      loading.value = false;
    }
  }

  function openAddModal() {
    isEditing.value = false;
    currentSupplier.value = {
      supplier_code: '',
      name: '',
      contact_person: '',
      phone_number: '',
      email: '',
      address: '',
      city: '',
      country: 'Pakistan',
      payment_terms: 30,
      credit_limit: 0,
      current_balance: 0,
      is_active: true,
      notes: '',
    };
    showModal.value = true;
  }

  function openEditModal(supplier: Supplier) {
    isEditing.value = true;
    currentSupplier.value = { ...supplier };
    showModal.value = true;
  }

  async function saveSupplier() {
    const name = currentSupplier.value.name?.trim();
    const code = currentSupplier.value.supplier_code?.trim();
    if (!name || !code) {
      showToast(pick('Name and code are required', 'نام اور کوڈ ضروری ہیں'), 'error');
      return;
    }
    if (
      !Number.isInteger(Number(currentSupplier.value.payment_terms)) ||
      Number(currentSupplier.value.payment_terms) < 0 ||
      !Number.isFinite(Number(currentSupplier.value.credit_limit)) ||
      Number(currentSupplier.value.credit_limit) < 0
    ) {
      showToast(
        pick(
          'Payment terms and credit limit cannot be negative',
          'ادائیگی کی مدت اور کریڈٹ کی حد منفی نہیں ہو سکتی',
        ),
        'error',
      );
      return;
    }

    try {
      if (isEditing.value && currentSupplier.value.id) {
        // Update existing
        await executeUpdate(
          `UPDATE suppliers SET
            name = ?, contact_person = ?, phone_number = ?, email = ?,
            address = ?, city = ?, country = ?, tax_registration = ?,
            payment_terms = ?, credit_limit = ?, is_active = ?, notes = ?,
            updated_at = datetime('now')
           WHERE id = ?`,
          [
            name,
            currentSupplier.value.contact_person || null,
            currentSupplier.value.phone_number || null,
            currentSupplier.value.email || null,
            currentSupplier.value.address || null,
            currentSupplier.value.city || null,
            currentSupplier.value.country || 'Pakistan',
            currentSupplier.value.tax_registration || null,
            Number(currentSupplier.value.payment_terms),
            Number(currentSupplier.value.credit_limit),
            currentSupplier.value.is_active ? 1 : 0,
            currentSupplier.value.notes || null,
            currentSupplier.value.id,
          ],
        );
        showToast(
          pick('Supplier updated successfully', 'سپلائر کامیابی سے اپ ڈیٹ ہو گیا'),
          'success',
        );
      } else {
        // Create new
        const id = `sup-${Date.now()}`;
        await executeUpdate(
          `INSERT INTO suppliers (
            id, supplier_code, name, contact_person, phone_number, email,
            address, city, country, tax_registration, payment_terms,
            credit_limit, current_balance, is_active, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))`,
          [
            id,
            code,
            name,
            currentSupplier.value.contact_person || null,
            currentSupplier.value.phone_number || null,
            currentSupplier.value.email || null,
            currentSupplier.value.address || null,
            currentSupplier.value.city || null,
            currentSupplier.value.country || 'Pakistan',
            currentSupplier.value.tax_registration || null,
            Number(currentSupplier.value.payment_terms),
            Number(currentSupplier.value.credit_limit),
            currentSupplier.value.is_active ? 1 : 0,
            currentSupplier.value.notes || null,
          ],
        );
        showToast(
          pick('Supplier created successfully', 'سپلائر کامیابی سے شامل ہو گیا'),
          'success',
        );
      }

      showModal.value = false;
      await loadSuppliers();
    } catch (error: unknown) {
      if (errorMessage(error).includes('UNIQUE constraint')) {
        showToast(pick('Supplier code already exists', 'سپلائر کوڈ پہلے سے موجود ہے'), 'error');
      } else {
        showToast(pick('Error saving supplier', 'سپلائر محفوظ کرنے میں خرابی'), 'error');
      }
      reportDiagnostic('operation_failed', 'workspace');
    }
  }

  async function deleteSupplier(id: string) {
    if (
      !confirm(
        pick(
          'Are you sure you want to delete this supplier?',
          'کیا آپ واقعی اس سپلائر کو حذف کرنا چاہتے ہیں؟',
        ),
      )
    )
      return;

    try {
      await executeUpdate(`UPDATE suppliers SET deleted_at = datetime('now') WHERE id = ?`, [id]);
      showToast(pick('Supplier deleted successfully', 'سپلائر کامیابی سے حذف ہو گیا'), 'success');
      await loadSuppliers();
    } catch {
      showToast(pick('Error deleting supplier', 'سپلائر حذف کرنے میں خرابی'), 'error');
      reportDiagnostic('operation_failed', 'workspace');
    }
  }

  return {
    t,
    pick,
    formatCurrency,
    formatNumber,
    suppliers,
    loading,
    searchQuery,
    statusFilter,
    showModal,
    isEditing,
    ledgerBalance,
    currentSupplier,
    filteredSuppliers,
    openAddModal,
    openEditModal,
    saveSupplier,
    deleteSupplier,
  };
}
