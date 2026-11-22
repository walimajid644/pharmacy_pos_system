<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { localDateKey } from '@/lib/businessDay';
import { useI18n } from '@/lib/i18n';
import { useFinancePrint } from '@/composables/useFinancePrint';
import CompactPages from '@/components/ui/CompactPages.vue';
import '@/assets/styles/finance-tools.css';
type Account = { id: string; name: string; is_active: number };
type Line = {
  entry_key: string;
  account_id: string;
  entry_date: string;
  number: string;
  description: string;
  amount_cents: number;
  source: string;
  source_id: string;
  cleared: number;
};
type Legacy = {
  source: string;
  id: string;
  number: string;
  entry_date: string;
  description: string;
  amount_cents: number;
};
type Reconciliation = {
  id: string;
  statement_date: string;
  statement_balance_cents: number;
  book_balance_cents: number;
  reference: string;
};
type Statement = {
  accounts: Account[];
  entries: Line[];
  beforeCents: number;
  closingCents: number;
  clearedCents: number;
  truncated: boolean;
  unassigned: Legacy[];
  unassignedTruncated: boolean;
  reconciliations: Reconciliation[];
};
const { pick, formatCurrency } = useI18n(),
  { printing, print } = useFinancePrint();
const accountId = ref(''),
  from = ref(localDateKey().slice(0, 7) + '-01'),
  to = ref(localDateKey()),
  tab = ref('statement');
const data = ref<Statement>({
  accounts: [],
  entries: [],
  beforeCents: 0,
  closingCents: 0,
  clearedCents: 0,
  truncated: false,
  unassigned: [],
  unassignedTruncated: false,
  reconciliations: [],
});
const loading = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref(''),
  selected = ref<string[]>([]),
  voiding = ref<Line | null>(null),
  reason = ref('');
const form = reactive({
  requestId: crypto.randomUUID(),
  kind: 'deposit',
  toAccountId: '',
  amount: '',
  entryDate: localDateKey(),
  reference: '',
  notes: '',
  cashDrawer: false,
});
const reconciliation = reactive({ requestId: crypto.randomUUID(), balance: '', reference: '' });
const account = computed(() => data.value.accounts.find((a) => a.id === accountId.value));
const lines = computed(() => {
  let balance = data.value.beforeCents;
  return data.value.entries.map((e) => ({ ...e, balanceCents: (balance += e.amount_cents) }));
});
const proposedClear = computed(
  () =>
    data.value.clearedCents +
    data.value.entries
      .filter((e) => selected.value.includes(e.entry_key) && !e.cleared)
      .reduce((n, e) => n + e.amount_cents, 0),
);
const difference = computed(
  () => Math.round(Number(reconciliation.balance) * 100) - proposedClear.value,
);
let version = 0;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const result = await invoke<Statement>('bank_statement', {
      accountId: accountId.value,
      fromDate: from.value,
      toDate: to.value,
    });
    if (current === version) {
      data.value = result;
      selected.value = [];
      if (!accountId.value && result.accounts.length) accountId.value = result.accounts[0].id;
    }
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
function cents(value: string | number, signed = false) {
  const n = Number(value),
    v = Math.round(n * 100);
  if (
    !String(value).trim() ||
    !Number.isFinite(n) ||
    !Number.isSafeInteger(v) ||
    Math.abs(n * 100 - v) > 0.00001 ||
    (!signed && v <= 0)
  )
    throw new Error('Enter an amount with at most two decimals');
  return v;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const number = await invoke<string>('record_bank_transaction', {
      request: {
        requestId: form.requestId,
        kind: form.kind,
        accountId: accountId.value,
        toAccountId: form.kind === 'transfer' ? form.toAccountId : null,
        amountCents: cents(form.amount),
        entryDate: form.entryDate,
        reference: form.reference,
        notes: form.notes,
        cashDrawer: form.kind === 'transfer' ? false : form.cashDrawer,
      },
    });
    form.requestId = crypto.randomUUID();
    form.amount = '';
    form.reference = '';
    form.notes = '';
    message.value = pick('Bank movement saved', 'بینک لین دین محفوظ ہوا') + ': ' + number;
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function reconcile() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await invoke('reconcile_bank_statement', {
      request: {
        requestId: reconciliation.requestId,
        accountId: accountId.value,
        statementDate: to.value,
        statementBalanceCents: cents(reconciliation.balance, true),
        reference: reconciliation.reference,
        entryKeys: selected.value,
      },
    });
    reconciliation.requestId = crypto.randomUUID();
    reconciliation.balance = '';
    reconciliation.reference = '';
    message.value = pick('Bank statement reconciled', 'بینک اسٹیٹمنٹ کی مطابقت مکمل');
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function assign(entry: Legacy) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await invoke('assign_bank_voucher', {
      source: entry.source,
      id: entry.id,
      accountId: accountId.value,
    });
    message.value = pick(
      'Voucher assigned without reposting',
      'واؤچر دوبارہ درج کیے بغیر منسلک ہوا',
    );
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function voidEntry() {
  if (!voiding.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await invoke('void_finance_posting', {
      source: 'bank',
      id: voiding.value.source_id,
      reason: reason.value,
    });
    voiding.value = null;
    reason.value = '';
    message.value = pick('Bank movement voided', 'بینک اندراج منسوخ ہوا');
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function printStatement() {
  try {
    await print();
  } catch (e) {
    error.value = String(e);
  }
}
watch([accountId, from, to], () => {
  voiding.value = null;
  selected.value = [];
  reconciliation.requestId = crypto.randomUUID();
  void load();
});
onMounted(load);
</script>
<template>
  <main class="tool-terminal compact-workspace money-terminal bank-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Bank Transactions', 'بینک لین دین') }}</h1>
        <p>
          {{
            pick(
              'Account movements, statements and reconciliation',
              'کھاتے کا لین دین، اسٹیٹمنٹ اور مطابقت',
            )
          }}
        </p>
      </div>
      <button :disabled="busy || loading || printing" @click="load">
        {{ pick('Refresh', 'تازہ کریں') }}
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="money-toolbar bank-filters">
      <label
        >{{ pick('Bank account', 'بینک کھاتا')
        }}<select v-model="accountId" :disabled="busy || printing">
          <option value="" disabled>{{ pick('Select account', 'کھاتا منتخب کریں') }}</option>
          <option v-for="a in data.accounts" :key="a.id" :value="a.id">
            {{ a.name }}{{ a.is_active ? '' : ' · Inactive' }}
          </option>
        </select></label
      ><label
        >{{ pick('From', 'سے')
        }}<input v-model="from" type="date" :disabled="busy || printing" /></label
      ><label
        >{{ pick('To / statement date', 'تک / اسٹیٹمنٹ کی تاریخ')
        }}<input
          v-model="to"
          type="date"
          :max="localDateKey()"
          :disabled="busy || printing" /></label
      ><button
        :disabled="loading || busy || printing || !accountId || data.truncated"
        @click="printStatement"
      >
        {{ pick('Print statement', 'اسٹیٹمنٹ پرنٹ کریں') }}
      </button>
    </div>
    <nav class="money-toolbar">
      <button
        v-for="t in ['statement', 'movement', 'unassigned', 'history']"
        :key="t"
        :aria-pressed="tab === t"
        :disabled="busy || printing"
        @click="
          tab = t;
          voiding = null;
        "
      >
        {{
          t === 'statement'
            ? pick('Statement / reconcile', 'اسٹیٹمنٹ / مطابقت')
            : t === 'movement'
              ? pick('New movement', 'نیا لین دین')
              : t === 'unassigned'
                ? pick('Unassigned bank vouchers', 'غیر منسلک بینک واؤچر')
                : pick('Reconciliation history', 'مطابقت کی تاریخ')
        }}
      </button>
    </nav>
    <div class="money-summary">
      <span
        >{{ pick('Balance before range', 'مدت سے پہلے') }}:
        {{ formatCurrency(data.beforeCents / 100) }}</span
      ><strong
        >{{ pick('Book closing balance', 'اختتامی بیلنس') }}:
        {{ formatCurrency(data.closingCents / 100) }}</strong
      >
    </div>
    <small v-if="data.unassigned.length">{{
      pick(
        'Unassigned bank vouchers are excluded. Assign each to its actual account without recording another movement.',
        'غیر منسلک واؤچر شامل نہیں۔ دوبارہ رقم درج کیے بغیر اصل کھاتے سے منسلک کریں۔',
      )
    }}</small><small v-if="data.truncated">{{
      pick(
        'More than 2000 entries. Narrow the date range to view and print the full statement.',
        'مکمل اسٹیٹمنٹ کے لیے تاریخیں محدود کریں۔',
      )
    }}</small>
    <section v-if="tab === 'history'" class="money-list">
      <CompactPages
        :items="data.reconciliations"
        :row-height="44"
        :header-height="32"
        v-slot="{ rows }"
        ><table>
          <thead>
            <tr>
              <th>{{ pick('Statement date', 'اسٹیٹمنٹ تاریخ') }}</th>
              <th>{{ pick('Reference', 'حوالہ') }}</th>
              <th>{{ pick('Statement balance', 'اسٹیٹمنٹ بیلنس') }}</th>
              <th>{{ pick('Book balance', 'کھاتے کا بیلنس') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item } in rows" :key="item.id">
              <td>{{ item.statement_date }}</td>
              <td>{{ item.reference }}</td>
              <td>{{ formatCurrency(item.statement_balance_cents / 100) }}</td>
              <td>{{ formatCurrency(item.book_balance_cents / 100) }}</td>
            </tr>
            <tr v-if="!data.reconciliations.length">
              <td colspan="4">
                {{ pick('No reconciliations recorded.', 'کوئی مطابقت درج نہیں۔') }}
              </td>
            </tr>
          </tbody>
        </table></CompactPages
      >
    </section>
    <section v-else-if="tab === 'unassigned'" class="money-list">
      <small>{{
        pick(
          'Showing up to 200 bank vouchers through the To date. Link to the selected bank account.',
          'منتخب تاریخ تک 200 بینک واؤچر۔ منتخب کھاتے سے منسلک کریں۔',
        )
      }}</small><CompactPages
        :items="data.unassigned"
        :row-height="48"
        :header-height="32"
        v-slot="{ rows }"
        ><table>
          <thead>
            <tr>
              <th>{{ pick('Voucher', 'واؤچر') }}</th>
              <th>{{ pick('Date', 'تاریخ') }}</th>
              <th>{{ pick('Description', 'تفصیل') }}</th>
              <th>{{ pick('Signed amount', 'رقم') }}</th>
              <th>{{ pick('Account assignment', 'کھاتے سے منسلک') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ item } in rows" :key="item.source + item.id">
              <td>{{ item.number }}</td>
              <td>{{ item.entry_date }}</td>
              <td>{{ item.description }}</td>
              <td>{{ formatCurrency(item.amount_cents / 100) }}</td>
              <td>
                <button
                  :disabled="busy || loading || !account?.is_active || !auth.can('banking.assign')"
                  @click="assign(item)"
                >
                  {{ pick('Assign to', 'منسلک کریں') }} {{ account?.name }}
                </button>
              </td>
            </tr>
            <tr v-if="!data.unassigned.length">
              <td colspan="5">
                {{ pick('All bank vouchers have an account.', 'تمام بینک واؤچر منسلک ہیں۔') }}
              </td>
            </tr>
          </tbody>
        </table></CompactPages
      >
    </section>
    <div v-else class="money-body">
      <section class="money-list">
        <CompactPages :items="lines" :row-height="48" :header-height="32" v-slot="{ rows }"
          ><table class="bank-statement-table">
            <thead>
              <tr>
                <th>{{ pick('Clear', 'کلیئر') }}</th>
                <th>{{ pick('Date / voucher', 'تاریخ / واؤچر') }}</th>
                <th>{{ pick('Description', 'تفصیل') }}</th>
                <th>{{ pick('Amount', 'رقم') }}</th>
                <th>{{ pick('Balance', 'بیلنس') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item } in rows" :key="item.entry_key">
                <td>
                  <span v-if="item.cleared">✓</span
                  ><input
                    v-else
                    v-model="selected"
                    type="checkbox"
                    :value="item.entry_key"
                    :aria-label="'Clear ' + item.number"
                    :disabled="busy || loading || printing"
                  />
                </td>
                <td>
                  {{ item.entry_date }}<small>{{ item.number }}</small>
                </td>
                <td :title="item.description">{{ item.description }}</td>
                <td>{{ formatCurrency(item.amount_cents / 100) }}</td>
                <td>{{ formatCurrency(item.balanceCents / 100) }}</td>
                <td>
                  <button
                    v-if="item.source === 'bank' && auth.can('banking.void')"
                    :disabled="busy || loading || printing"
                    @click="
                      voiding = item;
                      reason = '';
                    "
                  >
                    {{ pick('Void', 'منسوخ') }}
                  </button>
                </td>
              </tr>
              <tr v-if="!lines.length">
                <td colspan="6">
                  {{
                    loading
                      ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                      : pick('No bank entries in this range.', 'اس مدت میں کوئی بینک اندراج نہیں۔')
                  }}
                </td>
              </tr>
            </tbody>
          </table></CompactPages
        >
      </section>
      <form v-if="voiding" class="money-editor bank-void" @submit.prevent="voidEntry">
        <h2>{{ pick('Void bank movement', 'بینک لین دین منسوخ کریں') }}</h2>
        <p>{{ voiding.number }}</p>
        <p>
          {{
            pick(
              'Voiding a transfer reverses both accounts. Reconciled or closed-drawer entries cannot be voided.',
              'منتقلی کی منسوخی دونوں کھاتوں پر اثر ڈالتی ہے۔ مطابقت شدہ اندراج منسوخ نہیں ہوگا۔',
            )
          }}
        </p>
        <label
          >{{ pick('Reason', 'وجہ')
          }}<textarea v-model="reason" required maxlength="500" rows="3" /></label
        ><button class="money-save" :disabled="busy">
          {{ pick('Confirm void', 'منسوخی کی تصدیق') }}</button
        ><button type="button" :disabled="busy" @click="voiding = null">
          {{ pick('Cancel', 'واپس') }}
        </button>
      </form>
      <form v-else-if="tab === 'movement'" class="money-editor bank-form" @submit.prevent="save">
        <h2>{{ pick('Record bank movement', 'بینک لین دین درج کریں') }}</h2>
        <label
          >{{ pick('Type', 'قسم')
          }}<select v-model="form.kind" :disabled="busy || printing">
            <option value="deposit">{{ pick('Deposit', 'جمع') }}</option>
            <option value="withdrawal">{{ pick('Withdrawal', 'نکاسی') }}</option>
            <option value="transfer">
              {{ pick('Transfer to another bank', 'دوسرے بینک میں منتقلی') }}
            </option>
          </select></label
        ><label v-if="form.kind === 'transfer'"
          >{{ pick('To account', 'وصول کنندہ کھاتا')
          }}<select v-model="form.toAccountId" required :disabled="busy || printing">
            <option value="" disabled>{{ pick('Select account', 'کھاتا منتخب کریں') }}</option>
            <option
              v-for="a in data.accounts.filter((a) => a.is_active && a.id !== accountId)"
              :key="a.id"
              :value="a.id"
            >
              {{ a.name }}
            </option>
          </select></label
        >
        <div class="money-pair">
          <label
            >{{ pick('Amount (Rs)', 'رقم')
            }}<input
              v-model="form.amount"
              type="number"
              min="0.01"
              step="0.01"
              max="100000000"
              required
              :disabled="busy || printing" /></label
          ><label
            >{{ pick('Date', 'تاریخ')
            }}<input
              v-model="form.entryDate"
              type="date"
              required
              :max="localDateKey()"
              :disabled="busy || printing"
          /></label>
        </div>
        <label v-if="form.kind !== 'transfer'"
          >{{ pick('Counterpart', 'دوسری جانب')
          }}<select v-model="form.cashDrawer" :disabled="busy || printing">
            <option :value="false">{{ pick('External funds', 'بیرونی رقم') }}</option>
            <option :value="true">{{ pick('Cash drawer', 'کیش دراز') }}</option>
          </select></label
        ><label
          >{{ pick('Reference', 'حوالہ')
          }}<input
            v-model="form.reference"
            maxlength="100"
            required
            :disabled="busy || printing" /></label
        ><label
          >{{ pick('Notes', 'نوٹس')
          }}<input v-model="form.notes" maxlength="500" :disabled="busy || printing"
        /></label>
        <p>
          {{
            pick(
              'Use Incomes or Expenses for earnings and costs. Deposits and transfers only move money.',
              'آمدنی اور اخراجات ان کے اپنے فارم میں درج کریں۔ یہاں صرف رقم منتقل ہوتی ہے۔',
            )
          }}
        </p>
        <button
          class="money-save"
          :disabled="
            busy || loading || printing || !account?.is_active || !auth.can('banking.post')
          "
        >
          {{
            busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save movement', 'لین دین محفوظ کریں')
          }}
        </button>
      </form>
      <form v-else class="money-editor bank-reconcile" @submit.prevent="reconcile">
        <h2>{{ pick('Reconcile statement', 'اسٹیٹمنٹ کی مطابقت') }}</h2>
        <p>
          {{
            pick(
              'Tick the entries that appear on your bank statement through the To date. Opening balances are already cleared.',
              'منتخب تاریخ تک اسٹیٹمنٹ میں موجود اندراجات نشان زد کریں۔ ابتدائی بیلنس کلیئر ہے۔',
            )
          }}
        </p>
        <strong
          >{{ pick('Cleared balance', 'کلیئر بیلنس') }}:
          {{ formatCurrency(proposedClear / 100) }}</strong
        ><label
          >{{ pick('Bank statement closing balance', 'بینک اسٹیٹمنٹ کا اختتامی بیلنس')
          }}<input
            v-model="reconciliation.balance"
            type="number"
            step="0.01"
            required
            :disabled="busy || printing" /></label
        ><label
          >{{ pick('Statement reference', 'اسٹیٹمنٹ حوالہ')
          }}<input
            v-model="reconciliation.reference"
            maxlength="100"
            required
            :disabled="busy || printing" /></label
        ><strong
          >{{ pick('Difference', 'فرق') }}: {{ formatCurrency(difference / 100 || 0) }}</strong
        >
        <p>
          {{
            pick(
              'Difference must be zero. Saving closes this bank period to backdated postings and voids. Older uncleared entries may require an earlier From date.',
              'فرق صفر ہونا چاہیے۔ محفوظ کرنے کے بعد اس مدت میں سابقہ تبدیلی بند ہوگی۔',
            )
          }}
        </p>
        <button
          class="money-save"
          :disabled="
            busy ||
            loading ||
            printing ||
            data.truncated ||
            !account?.is_active ||
            reconciliation.balance === '' ||
            difference !== 0 ||
            !auth.can('banking.reconcile')
          "
        >
          {{ pick('Save reconciliation', 'مطابقت محفوظ کریں') }}
        </button>
      </form>
    </div>
  </main>
  <Teleport to="body"
    ><article v-if="printing" class="finance-print-root">
      <h1>{{ uiLabel('Bank statement ·') }} {{ account?.name }}</h1>
      <p>{{ from || 'Beginning' }} — {{ to }}</p>
      <p>{{ uiLabel('Balance before range:') }} {{ formatCurrency(data.beforeCents / 100) }}</p>
      <table>
        <thead>
          <tr>
            <th>{{ uiLabel('Date') }}</th>
            <th>{{ uiLabel('Voucher') }}</th>
            <th>{{ uiLabel('Description') }}</th>
            <th>{{ uiLabel('Amount') }}</th>
            <th>{{ uiLabel('Balance') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.entry_key">
            <td>{{ line.entry_date }}</td>
            <td>{{ line.number }}</td>
            <td>{{ line.description }}</td>
            <td>{{ formatCurrency(line.amount_cents / 100) }}</td>
            <td>{{ formatCurrency(line.balanceCents / 100) }}</td>
          </tr>
        </tbody>
      </table>
      <h3>{{ uiLabel('Book closing balance:') }} {{ formatCurrency(data.closingCents / 100) }}</h3>
      <p v-if="data.unassigned.length">{{ uiLabel('Unassigned bank vouchers are excluded.') }}</p>
    </article></Teleport
  >
</template>
