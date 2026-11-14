import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { useI18n } from '@/lib/i18n';
import { localDayBounds } from '@/lib/businessDay';
import { useAuthStore } from '@/stores/auth';

export function useCustomerLedger() {
  const { pick, formatCurrency, formatDateTime } = useI18n(),
    auth = useAuthStore(),
    router = useRouter(),
    route = useRoute();

  type Customer = {
    id: string;
    first_name: string;
    last_name: string;
    customer_code: string;
    current_balance: number;
    credit_limit: number;
  };

  type Entry = {
    id: string;
    kind: string;
    reference: string;
    amount_cents: number;
    occurred_at: string;
    description: string;
    balance: number;
  };

  type Statement = {
    customer: Customer;
    entries: Entry[];
    aging: {
      current: number;
      days30: number;
      days60: number;
      days90: number;
      unknown: number;
      credit: number;
    };
  };

  const customers = ref<Customer[]>([]),
    customerId = ref(String(route.query.customer || '')),
    statement = ref<Statement | null>(null),
    busy = ref(false),
    error = ref(''),
    from = ref(''),
    to = ref(''),
    printing = ref(false);

  let statementRequest = 0;

  watch(
    customerId,
    () => {
      statementRequest++;
      statement.value = null;
      error.value = '';
      busy.value = false;
    },
    { flush: 'sync' },
  );

  const rows = computed(() => {
    let balance = 0;
    return (statement.value?.entries || [])
      .map((e) => ({ ...e, balance: (balance += e.amount_cents) }))
      .filter(
        (e) =>
          (!from.value || new Date(e.occurred_at) >= new Date(from.value + 'T00:00:00')) &&
          (!to.value || new Date(e.occurred_at) < new Date(localDayBounds(to.value)[1])),
      );
  });

  const broughtForward = computed(() =>
    from.value
      ? (statement.value?.entries || [])
          .filter((e) => new Date(e.occurred_at) < new Date(from.value + 'T00:00:00'))
          .reduce((n, e) => n + e.amount_cents, 0)
      : 0,
  );

  onMounted(async () => {
    try {
      customers.value = await executeQuery<Customer>(
        'SELECT id,first_name,last_name,customer_code,current_balance,credit_limit FROM customers ORDER BY first_name,last_name',
      );
      if (customerId.value) await load();
    } catch (e) {
      error.value = String(e);
    }
  });

  async function load() {
    const id = customerId.value,
      request = ++statementRequest;
    statement.value = null;
    error.value = '';
    if (!id) {
      busy.value = false;
      return;
    }
    busy.value = true;
    try {
      const result = await invoke<Statement>('customer_statement', { customerId: id });
      if (request !== statementRequest || customerId.value !== id) return;
      if (result.customer.id !== id)
        throw new Error(
          pick(
            'Statement customer changed. Select the customer and load again.',
            'کھاتے کا گاہک بدل گیا ہے۔ گاہک منتخب کر کے دوبارہ لوڈ کریں۔',
          ),
        );
      statement.value = result;
    } catch (e) {
      if (request === statementRequest) error.value = String(e);
    } finally {
      if (request === statementRequest) busy.value = false;
    }
  }

  function kind(value: string) {
    return (
      (
        {
          opening: pick('Opening / age unknown', 'ابتدائی / مدت نامعلوم'),
          credit_sale: pick('Credit sale', 'ادھار فروخت'),
          payment: pick('Collection', 'وصولی'),
          void_payment: pick('Voided collection', 'منسوخ وصولی'),
          credit_return: pick('Return credit', 'واپسی کریڈٹ'),
        } as Record<string, string>
      )[value] || value
    );
  }

  async function print() {
    const { nextTick } = await import('vue');
    printing.value = true;
    await nextTick();
    document.body.classList.add('printing-ledger');
    const clean = () => {
      document.body.classList.remove('printing-ledger');
      printing.value = false;
    };
    window.addEventListener('afterprint', clean, { once: true });
    try {
      window.print();
    } catch (e) {
      clean();
      error.value = String(e);
    }
  }

  return {
    pick,
    formatCurrency,
    formatDateTime,
    auth,
    router,
    customers,
    customerId,
    statement,
    busy,
    error,
    from,
    to,
    printing,
    rows,
    broughtForward,
    load,
    kind,
    print,
  };
}
