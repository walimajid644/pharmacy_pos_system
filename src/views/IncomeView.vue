<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { executeQuery } from '@/lib/database';
import { localDateKey } from '@/lib/businessDay';
import { useI18n } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useFinancePrint } from '@/composables/useFinancePrint';
import CompactPages from '@/components/ui/CompactPages.vue';
import '@/assets/styles/finance-tools.css';
type Entry = {
  id: string;
  number: string;
  head_name: string;
  description: string;
  amount_cents: number;
  method: string;
  bank_name: string | null;
  entry_date: string;
  reference: string;
  status: string;
  void_reason: string | null;
};
const { pick, formatCurrency } = useI18n(),
  settings = useSettingsStore(),
  { printing, print } = useFinancePrint();
const from = ref(localDateKey().slice(0, 7) + '-01'),
  to = ref(localDateKey()),
  query = ref(''),
  entries = ref<Entry[]>([]),
  total = ref(0),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref(''),
  truncated = ref(false);
const heads = ref<{ id: string; name: string }[]>([]),
  banks = ref<{ id: string; name: string }[]>([]),
  voiding = ref<Entry | null>(null),
  reason = ref(''),
  printEntry = ref<Entry | null>(null);
const form = reactive({
  requestId: crypto.randomUUID(),
  headId: '',
  description: '',
  amount: '',
  method: 'cash',
  bankAccountId: '',
  entryDate: localDateKey(),
  reference: '',
});
const visible = computed(() =>
  entries.value.filter((e) =>
    `${e.number} ${e.head_name} ${e.description} ${e.reference}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
let version = 0;
async function load() {
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const [h, b, e, t] = await Promise.all([
      executeQuery<{ id: string; name: string }>(
        'SELECT id,name FROM income_heads WHERE is_active=1 AND deleted_at IS NULL ORDER BY name',
      ),
      executeQuery<{ id: string; name: string }>(
        'SELECT id,name FROM bank_accounts WHERE is_active=1 AND deleted_at IS NULL ORDER BY name',
      ),
      executeQuery<Entry>(
        `SELECT i.*,b.name AS bank_name FROM income_entries i LEFT JOIN bank_accounts b ON b.id=i.bank_account_id WHERE i.entry_date>=? AND i.entry_date<=? ORDER BY i.entry_date DESC,i.created_at DESC LIMIT 1001`,
        [from.value, to.value],
      ),
      executeQuery<{ total: number }>(
        "SELECT COALESCE(SUM(amount_cents),0) AS total FROM income_entries WHERE status='posted' AND entry_date>=? AND entry_date<=?",
        [from.value, to.value],
      ),
    ]);
    if (current === version) {
      heads.value = h;
      banks.value = b;
      entries.value = e.slice(0, 1000);
      truncated.value = e.length > 1000;
      total.value = t[0]?.total || 0;
    }
  } catch (e) {
    if (current === version) error.value = String(e);
  } finally {
    if (current === version) loading.value = false;
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const n = Number(form.amount),
      cents = Math.round(n * 100);
    if (!Number.isFinite(n) || n <= 0 || Math.abs(cents - n * 100) > 0.00001)
      throw new Error('Enter a positive amount with at most two decimals');
    const number = await invoke<string>('record_income_entry', {
      request: {
        requestId: form.requestId,
        headId: form.headId,
        description: form.description,
        amountCents: cents,
        method: form.method,
        bankAccountId: form.method === 'bank' ? form.bankAccountId : null,
        entryDate: form.entryDate,
        reference: form.reference,
      },
    });
    form.requestId = crypto.randomUUID();
    form.amount = '';
    form.description = '';
    form.reference = '';
    message.value = pick('Income saved', 'آمدنی محفوظ ہوئی') + ': ' + number;
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
      source: 'income',
      id: voiding.value.id,
      reason: reason.value,
    });
    voiding.value = null;
    reason.value = '';
    message.value = pick('Income voided', 'آمدنی منسوخ ہوئی');
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function printVoucher(entry: Entry) {
  printEntry.value = { ...entry };
  try {
    await print();
  } catch (e) {
    error.value = String(e);
  }
}
watch([from, to], () => {
  void load();
});
onMounted(load);
</script>
<template>
  <main class="tool-terminal compact-workspace money-terminal income-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Incomes', 'آمدنی') }}</h1>
        <p>
          {{
            pick(
              'Record non-sales income. Transfers and deposits are recorded in Bank Transactions.',
              'فروخت کے علاوہ آمدنی درج کریں۔ بینک منتقلی بینک لین دین میں درج کریں۔',
            )
          }}
        </p>
      </div>
      <button :disabled="busy || loading || printing || !auth.can('income.post')" @click="load">
        {{ pick('Refresh', 'تازہ کریں') }}
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="money-toolbar">
      <label
        >{{ pick('From', 'سے')
        }}<input v-model="from" type="date" :disabled="busy || printing" /></label
      ><label
        >{{ pick('To', 'تک')
        }}<input
          v-model="to"
          type="date"
          :disabled="busy || printing"
          :max="localDateKey()" /></label
      ><label>{{ pick('Search', 'تلاش') }}<input v-model="query" type="search" /></label
      ><strong
        >{{ pick('Posted total for date range', 'مدت کی آمدنی') }}:
        {{ formatCurrency(total / 100) }}</strong
      >
    </div>
    <small v-if="truncated">{{
      pick(
        'Showing 1000 entries. Narrow the dates for the full list. Total includes the full date range.',
        'مکمل فہرست کے لیے تاریخیں محدود کریں۔ کل رقم مکمل مدت کی ہے۔',
      )
    }}</small>
    <div class="money-body">
      <section class="money-list">
        <CompactPages :items="visible" :row-height="52" :header-height="32" v-slot="{ rows }"
          ><table>
            <thead>
              <tr>
                <th>{{ pick('Voucher / date', 'واؤچر / تاریخ') }}</th>
                <th>{{ pick('Head / description', 'مد / تفصیل') }}</th>
                <th>{{ pick('Amount', 'رقم') }}</th>
                <th>{{ pick('Method', 'طریقہ') }}</th>
                <th>{{ pick('Actions', 'اختیارات') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item } in rows" :key="item.id">
                <td>
                  {{ item.number }}<small>{{ item.entry_date }}</small>
                </td>
                <td :title="item.description">
                  {{ item.head_name }}<small>{{ item.description }}</small>
                </td>
                <td>
                  {{ formatCurrency(item.amount_cents / 100) }}<small>{{ item.status }}</small>
                </td>
                <td>
                  {{ item.method }}<small>{{ item.bank_name }}</small>
                </td>
                <td>
                  <button :disabled="printing" @click="printVoucher(item)">
                    {{ pick('Print', 'پرنٹ') }}</button><button
                    v-if="item.status === 'posted' && auth.can('income.void')"
                    :disabled="busy || printing"
                    @click="
                      voiding = item;
                      reason = '';
                    "
                  >
                    {{ pick('Void', 'منسوخ') }}
                  </button>
                </td>
              </tr>
              <tr v-if="!visible.length">
                <td colspan="5">
                  {{
                    loading
                      ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                      : pick('No income entries in this range.', 'اس مدت میں کوئی آمدنی نہیں۔')
                  }}
                </td>
              </tr>
            </tbody>
          </table></CompactPages
        >
      </section>
      <form v-if="voiding" class="money-editor income-void" @submit.prevent="voidEntry">
        <h2>{{ pick('Void income', 'آمدنی منسوخ کریں') }}</h2>
        <p>{{ voiding.number }} · {{ formatCurrency(voiding.amount_cents / 100) }}</p>
        <label
          >{{ pick('Reason', 'وجہ')
          }}<textarea v-model="reason" required maxlength="500" rows="3" /></label
        ><button class="money-save" :disabled="busy || printing">
          {{ pick('Confirm void', 'منسوخی کی تصدیق') }}</button
        ><button type="button" :disabled="busy" @click="voiding = null">
          {{ pick('Cancel', 'واپس') }}
        </button>
      </form>
      <form v-else class="money-editor income-form" @submit.prevent="save">
        <h2>{{ pick('Record income', 'آمدنی درج کریں') }}</h2>
        <label
          >{{ pick('Income head', 'آمدنی کی مد')
          }}<select v-model="form.headId" required :disabled="busy || printing">
            <option value="" disabled>{{ pick('Choose head', 'مد منتخب کریں') }}</option>
            <option v-for="head in heads" :key="head.id" :value="head.id">{{ head.name }}</option>
          </select></label
        ><label
          >{{ pick('Description', 'تفصیل')
          }}<input v-model="form.description" required maxlength="500" :disabled="busy || printing"
        /></label>
        <div class="money-pair">
          <label
            >{{ pick('Amount (Rs)', 'رقم')
            }}<input
              v-model="form.amount"
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              :disabled="busy || printing" /></label
          ><label
            >{{ pick('Date', 'تاریخ')
            }}<input
              v-model="form.entryDate"
              type="date"
              :max="localDateKey()"
              required
              :disabled="busy || printing"
          /></label>
        </div>
        <label
          >{{ pick('Method', 'طریقہ')
          }}<select v-model="form.method" :disabled="busy || printing">
            <option value="cash">{{ pick('Cash drawer', 'کیش دراز') }}</option>
            <option value="bank">{{ pick('Bank', 'بینک') }}</option>
            <option value="mobile">{{ pick('Mobile', 'موبائل') }}</option>
          </select></label
        ><label v-if="form.method === 'bank'"
          >{{ pick('Bank account', 'بینک کھاتا')
          }}<select v-model="form.bankAccountId" required :disabled="busy || printing">
            <option value="" disabled>{{ pick('Select bank', 'بینک منتخب کریں') }}</option>
            <option v-for="bank in banks" :key="bank.id" :value="bank.id">{{ bank.name }}</option>
          </select></label
        ><label
          >{{ pick('Reference', 'حوالہ')
          }}<input v-model="form.reference" maxlength="100" required :disabled="busy || printing"
        /></label>
        <p>
          {{
            pick(
              'Cash income increases the open drawer balance. Bank income appears in the selected bank statement.',
              'نقد آمدنی دراز میں اور بینک آمدنی منتخب کھاتے میں درج ہوگی۔',
            )
          }}
        </p>
        <button
          class="money-save"
          :disabled="busy || loading || printing || !auth.can('income.post')"
        >
          {{ busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save income', 'آمدنی محفوظ کریں') }}
        </button>
      </form>
    </div>
  </main>
  <Teleport to="body"
    ><article v-if="printing && printEntry" class="finance-print-root">
      <h1>{{ settings.settings?.company_name || 'Pharmacy POS' }}</h1>
      <h2>{{ uiLabel('Income voucher ·') }} {{ printEntry.status }}</h2>
      <p>{{ printEntry.number }} · {{ printEntry.entry_date }}</p>
      <p>{{ printEntry.head_name }} · {{ printEntry.description }}</p>
      <p>
        {{ uiLabel('Amount:') }} {{ formatCurrency(printEntry.amount_cents / 100) }} ·
        {{ printEntry.method }}
        {{ printEntry.bank_name || '' }}
      </p>
      <p>{{ uiLabel('Reference:') }} {{ printEntry.reference }}</p>
      <p v-if="printEntry.void_reason">
        {{ uiLabel('Void reason:') }} {{ printEntry.void_reason }}
      </p>
    </article></Teleport
  >
</template>
