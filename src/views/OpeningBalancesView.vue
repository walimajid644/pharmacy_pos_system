<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { localDateKey } from '@/lib/businessDay';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';

type Kind = 'customer' | 'supplier' | 'bank';
type Account = { id: string; name: string; existing: number };
type Opening = {
  id: string;
  kind: Kind;
  name: string;
  amount_cents: number;
  entry_date: string;
  reference: string;
  notes: string;
};
const router = useRouter(),
  { pick, formatCurrency } = useI18n();
const kind = ref<Kind>('customer'),
  accounts = ref<Account[]>([]),
  entries = ref<Opening[]>([]);
const loading = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref(''),
  query = ref('');
const form = reactive({
  requestId: crypto.randomUUID(),
  entityId: '',
  amount: '',
  entryDate: localDateKey(),
  reference: '',
  notes: '',
});
const direction = ref('positive');
const selected = computed(() => accounts.value.find((a) => a.id === form.entityId));
const amountCents = computed(
  () => Math.round(Number(form.amount) * 100) * (direction.value === 'positive' ? 1 : -1),
);
const visible = computed(() =>
  entries.value.filter(
    (e) =>
      e.kind === kind.value &&
      `${e.name} ${e.reference}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
let version = 0;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const sql =
      kind.value === 'customer'
        ? "SELECT c.id,c.first_name||' '||c.last_name||' · '||c.customer_code AS name,(SELECT COUNT(*) FROM customer_ledger l WHERE l.customer_id=c.id AND l.kind='opening') AS existing FROM customers c WHERE c.is_active=1 AND c.deleted_at IS NULL ORDER BY c.first_name"
        : kind.value === 'supplier'
          ? "SELECT s.id,s.name||' · '||s.supplier_code AS name,(SELECT COUNT(*) FROM opening_balances o WHERE o.kind='supplier' AND o.entity_id=s.id) AS existing FROM suppliers s WHERE s.is_active=1 AND s.deleted_at IS NULL ORDER BY s.name"
          : "SELECT b.id,b.name,(SELECT COUNT(*) FROM opening_balances o WHERE o.kind='bank' AND o.entity_id=b.id) AS existing FROM bank_accounts b WHERE b.is_active=1 AND b.deleted_at IS NULL ORDER BY b.name";
    const [a, e] = await Promise.all([
      executeQuery<Account>(sql),
      executeQuery<Opening>(
        `SELECT o.*,CASE o.kind WHEN 'customer' THEN (SELECT first_name||' '||last_name FROM customers WHERE id=o.entity_id) WHEN 'supplier' THEN (SELECT name FROM suppliers WHERE id=o.entity_id) ELSE (SELECT name FROM bank_accounts WHERE id=o.entity_id) END AS name FROM opening_balances o ORDER BY o.entry_date DESC,o.created_at DESC`,
      ),
    ]);
    if (current === version) {
      accounts.value = a;
      entries.value = e;
    }
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(kind, () => {
  form.entityId = '';
  form.amount = '';
  form.reference = '';
  form.notes = '';
  form.requestId = crypto.randomUUID();
  direction.value = 'positive';
  message.value = '';
  void load();
});
async function save() {
  if (busy.value || loading.value) return;
  error.value = '';
  message.value = '';
  const n = Number(form.amount);
  if (
    !selected.value ||
    selected.value.existing ||
    !Number.isFinite(n) ||
    n <= 0 ||
    n > 100000000 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  ) {
    error.value = pick(
      'Choose an account without an opening and enter a positive amount with at most two decimals.',
      'بغیر ابتدائی بیلنس والا کھاتا اور درست رقم منتخب کریں۔',
    );
    return;
  }
  busy.value = true;
  try {
    await invoke('record_opening_balance', {
      request: {
        requestId: form.requestId,
        kind: kind.value,
        entityId: form.entityId,
        amountCents: amountCents.value,
        entryDate: form.entryDate,
        reference: form.reference,
        notes: form.notes,
      },
    });
    message.value = pick('Opening balance saved.', 'ابتدائی بیلنس محفوظ ہو گیا۔');
    form.requestId = crypto.randomUUID();
    form.entityId = '';
    form.amount = '';
    form.reference = '';
    form.notes = '';
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <main class="tool-terminal compact-workspace opening-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Opening Balances', 'ابتدائی بیلنس') }}</h1>
        <p>
          {{
            pick(
              'Record balances brought forward when starting this system.',
              'نظام شروع کرتے وقت سابقہ بیلنس درج کریں۔',
            )
          }}
        </p>
      </div>
      <div class="opening-actions">
        <button :disabled="busy" @click="router.push('/bank-accounts')">
          {{ pick('Bank accounts', 'بینک کھاتے') }}</button><button
          :disabled="busy || loading"
          @click="load"
        >
          {{ pick('Refresh', 'تازہ کریں') }}
        </button>
      </div>
    </header>
    <nav class="opening-actions">
      <button
        v-for="k in ['customer', 'supplier', 'bank'] as const"
        :key="k"
        :aria-pressed="kind === k"
        :disabled="busy"
        @click="kind = k"
      >
        {{
          k === 'customer'
            ? pick('Customers', 'گاہک')
            : k === 'supplier'
              ? pick('Suppliers', 'سپلائرز')
              : pick('Banks', 'بینک')
        }}
      </button>
    </nav>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="opening-body">
      <section class="opening-list">
        <label
          >{{ pick('Search saved openings', 'محفوظ بیلنس تلاش کریں')
          }}<input v-model="query" type="search"
        /></label>
        <CompactPages :items="visible" :row-height="48" :header-height="32" v-slot="{ rows }"
          ><table>
            <thead>
              <tr>
                <th>{{ pick('Account / reference', 'کھاتا / حوالہ') }}</th>
                <th>{{ pick('Date', 'تاریخ') }}</th>
                <th>{{ pick('Signed balance', 'بیلنس') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item } in rows" :key="item.id">
                <td :title="item.notes">
                  {{ item.name }}<small>{{ item.reference }}</small>
                </td>
                <td>{{ item.entry_date }}</td>
                <td>{{ formatCurrency(item.amount_cents / 100) }}</td>
              </tr>
              <tr v-if="!visible.length">
                <td colspan="3">
                  {{
                    loading
                      ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                      : pick('No opening balances recorded.', 'کوئی ابتدائی بیلنس درج نہیں۔')
                  }}
                </td>
              </tr>
            </tbody>
          </table></CompactPages
        >
      </section>
      <form class="opening-form" @submit.prevent="save">
        <h2>{{ pick('New opening', 'نیا ابتدائی بیلنس') }}</h2>
        <label
          >{{ pick('Account', 'کھاتا')
          }}<select v-model="form.entityId" required :disabled="busy || loading">
            <option value="" disabled>{{ pick('Select account', 'کھاتا منتخب کریں') }}</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id" :disabled="!!a.existing">
              {{ a.name }}{{ a.existing ? ' · Opening recorded' : '' }}
            </option>
          </select></label
        >
        <label
          >{{ pick('Balance direction', 'بیلنس کی سمت')
          }}<select v-model="direction" :disabled="busy">
            <option value="positive">
              {{
                kind === 'customer'
                  ? pick('Customer owes us (+)', 'گاہک ہمارا مقروض (+)')
                  : kind === 'supplier'
                    ? pick('We owe supplier (+)', 'ہم سپلائر کے مقروض (+)')
                    : pick('Funds in bank (+)', 'بینک میں رقم (+)')
              }}
            </option>
            <option value="negative">
              {{
                kind === 'customer'
                  ? pick('We owe customer (−)', 'ہم گاہک کے مقروض (−)')
                  : kind === 'supplier'
                    ? pick('Supplier owes us / advance (−)', 'سپلائر کے پاس پیشگی رقم (−)')
                    : pick('Bank overdraft (−)', 'بینک اوور ڈرافٹ (−)')
              }}
            </option>
          </select></label
        >
        <div class="opening-pair">
          <label
            >{{ pick('Amount (Rs)', 'رقم')
            }}<input
              v-model="form.amount"
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              :disabled="busy" /></label
          ><label
            >{{ pick('As of date', 'تاریخ')
            }}<input
              v-model="form.entryDate"
              type="date"
              required
              :max="localDateKey()"
              :disabled="busy"
          /></label>
        </div>
        <label
          >{{ pick('Reference', 'حوالہ')
          }}<input v-model="form.reference" required maxlength="100" :disabled="busy" /></label
        ><label
          >{{ pick('Notes', 'نوٹس') }}<input v-model="form.notes" maxlength="500" :disabled="busy"
        /></label>
        <p>
          {{
            pick(
              'One opening per account. Saved openings are permanent and appear in the audit log.',
              'ہر کھاتے کا ایک ابتدائی بیلنس۔ محفوظ اندراج مستقل اور آڈٹ میں درج ہے۔',
            )
          }}
        </p>
        <strong
          >{{ pick('Opening to record', 'درج ہونے والا بیلنس') }}:
          {{ formatCurrency(amountCents / 100 || 0) }}</strong
        ><button type="submit" :disabled="busy || loading || !form.entityId">
          {{
            busy
              ? pick('Saving…', 'محفوظ ہو رہا ہے…')
              : pick('Save opening balance', 'ابتدائی بیلنس محفوظ کریں')
          }}
        </button>
      </form>
    </div>
  </main>
</template>
<style scoped>
.opening-terminal {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}
.opening-actions {
  display: flex;
  gap: 6px;
}
.opening-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
}
.opening-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.opening-terminal label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
}
.opening-terminal input,
.opening-terminal select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 5px;
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-primary);
  border-radius: 4px;
}
.opening-terminal button {
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 5px;
  background: var(--surface-secondary);
  color: var(--text-primary);
}
.opening-terminal button[aria-pressed='true'],
.opening-form button {
  background: var(--color-primary-600);
  color: var(--text-inverse);
}
.opening-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-height: 0;
}
.opening-form p {
  font-size: 11px;
}
.opening-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.opening-terminal table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.opening-terminal td,
.opening-terminal th {
  text-align: start;
  padding: 6px;
  border-bottom: 1px solid var(--border);
}
.opening-terminal small {
  display: block;
  color: var(--text-secondary);
}
.opening-terminal [role='alert'] {
  color: var(--color-danger-600);
}
</style>
