import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, onUnmounted } from 'vue';
import { executeQuery } from '@/lib/database';
import { useToast } from '@/composables/useToast';
import type { CustomerOption } from '@/lib/pos';

export function usePosCustomer() {
  const toast = useToast();
  const selectedCustomer = ref<CustomerOption | null>(null);

  const selectedCustomerId = ref<string | null>(null);

  const customerSearch = ref('');

  const customerOptions = ref<CustomerOption[]>([]);

  const customerOpen = ref(false);

  const customerLoading = ref(false);

  const highlightedCustomerIndex = ref(0);

  let customerSearchTimer: ReturnType<typeof setTimeout> | null = null;

  let customerQueryId = 0;

  function customerLabel(customer: CustomerOption) {
    return `${customer.first_name} ${customer.last_name} · ${customer.customer_code}`;
  }

  async function loadCustomerOptions(term: string) {
    const queryId = ++customerQueryId;
    customerLoading.value = true;
    try {
      const pattern = `%${term.trim()}%`;
      const rows = await executeQuery<CustomerOption>(
        `SELECT id, customer_code, first_name, last_name, phone_number, current_balance, credit_limit, customer_type FROM customers
         WHERE is_active = 1 AND deleted_at IS NULL
           AND (first_name LIKE ? OR last_name LIKE ? OR customer_code LIKE ?
                OR COALESCE(phone_number, '') LIKE ?)
         ORDER BY last_name, first_name LIMIT 20`,
        [pattern, pattern, pattern, pattern],
      );
      if (queryId === customerQueryId) {
        customerOptions.value = rows;
        highlightedCustomerIndex.value = selectedCustomerId.value
          ? -1
          : term.trim()
            ? rows.length
              ? 1
              : -1
            : 0;
      }
    } catch {
      if (queryId === customerQueryId) {
        reportDiagnostic('operation_failed', 'pos');
        toast.error('Could not search customers');
      }
    } finally {
      if (queryId === customerQueryId) customerLoading.value = false;
    }
  }

  function openCustomerPicker() {
    customerOpen.value = true;
    highlightedCustomerIndex.value = selectedCustomerId.value ? -1 : 0;
    customerOptions.value = [];
    void loadCustomerOptions(selectedCustomerId.value ? '' : customerSearch.value);
  }

  function onCustomerInput() {
    customerQueryId++;
    selectedCustomerId.value = null;
    selectedCustomer.value = null;
    customerOpen.value = true;
    customerOptions.value = [];
    customerLoading.value = true;
    highlightedCustomerIndex.value = -1;
    if (customerSearchTimer) clearTimeout(customerSearchTimer);
    customerSearchTimer = setTimeout(() => void loadCustomerOptions(customerSearch.value), 150);
  }

  function chooseCustomer(customer: CustomerOption | null) {
    if (customerSearchTimer) clearTimeout(customerSearchTimer);
    customerQueryId++;
    selectedCustomerId.value = customer?.id ?? null;
    selectedCustomer.value = customer;
    customerSearch.value = customer ? customerLabel(customer) : '';
    customerOptions.value = [];
    customerLoading.value = false;
    customerOpen.value = false;
  }

  function onCustomerKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && customerOpen.value) {
      event.preventDefault();
      event.stopPropagation();
      customerOpen.value = false;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      customerOpen.value = true;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      highlightedCustomerIndex.value = Math.max(
        0,
        Math.min(customerOptions.value.length, highlightedCustomerIndex.value + direction),
      );
    } else if (event.key === 'Enter' && customerOpen.value && highlightedCustomerIndex.value >= 0) {
      event.preventDefault();
      chooseCustomer(
        highlightedCustomerIndex.value === 0
          ? null
          : (customerOptions.value[highlightedCustomerIndex.value - 1] ?? null),
      );
    }
  }

  onUnmounted(() => {
    if (customerSearchTimer) clearTimeout(customerSearchTimer);
    customerQueryId++;
  });

  return {
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
  };
}
