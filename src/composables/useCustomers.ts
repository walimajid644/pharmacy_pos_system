import { reportDiagnostic } from '@/lib/diagnostics';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import type { Customer } from '@/lib/types';

export function useCustomers() {
  const label = useWorkspaceLabels();

  const auth = useAuthStore(),
    router = useRouter();

  const toast = useToast();

  const { pick, t } = useI18n();

  const customers = ref<Customer[]>([]);

  const searchQuery = ref('');

  const loading = ref(false);

  const showModal = ref(false);

  const editingCustomer = ref<Customer | null>(null);

  // Form state
  const formData = ref({
    first_name: '',
    last_name: '',
    phone_number: '',
    address: '',
    customer_type: 'retail' as 'retail' | 'wholesale',
    credit_limit: 0,
    is_active: true,
  });

  const filteredCustomers = computed(() => {
    if (!searchQuery.value) return customers.value;

    const query = searchQuery.value.toLowerCase();
    return customers.value.filter(
      (c) =>
        c.first_name.toLowerCase().includes(query) ||
        c.last_name.toLowerCase().includes(query) ||
        c.customer_code.toLowerCase().includes(query) ||
        (c.phone_number && c.phone_number.includes(query)),
    );
  });

  onMounted(async () => {
    await loadCustomers();
  });

  async function loadCustomers() {
    loading.value = true;
    try {
      customers.value = await executeQuery<Customer>(
        'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY last_name, first_name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'workspace');
      toast.error('Failed to load customers');
    } finally {
      loading.value = false;
    }
  }

  function openAddModal() {
    editingCustomer.value = null;
    formData.value = {
      first_name: '',
      last_name: '',
      phone_number: '',
      address: '',
      customer_type: 'retail',
      credit_limit: 0,
      is_active: true,
    };
    showModal.value = true;
  }

  function openEditModal(customer: Customer) {
    editingCustomer.value = customer;
    formData.value = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone_number: customer.phone_number || '',
      address: customer.address || '',
      customer_type: customer.customer_type,
      credit_limit: customer.credit_limit,
      is_active: customer.is_active,
    };
    showModal.value = true;
  }

  async function saveCustomer() {
    if (loading.value) return;
    loading.value = true;
    try {
      await invoke('save_customer', {
        request: {
          id: editingCustomer.value?.id || null,
          firstName: formData.value.first_name,
          lastName: formData.value.last_name,
          phoneNumber: formData.value.phone_number || null,
          address: formData.value.address || null,
          customerType: formData.value.customer_type,
          creditLimit: Number(formData.value.credit_limit),
          isActive: !!formData.value.is_active,
        },
      });
      showModal.value = false;
      toast.success(pick('Customer saved', 'گاہک محفوظ ہو گیا'));
      await loadCustomers();
    } catch (e) {
      toast.error(String(e));
    } finally {
      loading.value = false;
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (
      !confirm(
        pick(
          `Remove ${customer.first_name} ${customer.last_name} from active customers?`,
          `کیا ${customer.first_name} ${customer.last_name} کو فعال گاہکوں سے ہٹائیں؟`,
        ),
      )
    )
      return;
    loading.value = true;
    try {
      await invoke('archive_customer', { id: customer.id });
      toast.success('Customer deleted successfully');
      await loadCustomers();
    } catch {
      reportDiagnostic('operation_failed', 'workspace');
      toast.error('Failed to delete customer');
    } finally {
      loading.value = false;
    }
  }

  return {
    label,
    auth,
    router,
    pick,
    t,
    customers,
    searchQuery,
    loading,
    showModal,
    editingCustomer,
    formData,
    filteredCustomers,
    openAddModal,
    openEditModal,
    saveCustomer,
    deleteCustomer,
    formatCurrency,
  };
}
