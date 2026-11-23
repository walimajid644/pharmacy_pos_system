<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';
import { localDateKey } from '@/lib/businessDay';
import CompactPages from '@/components/ui/CompactPages.vue';
import { useSupplierLedger } from '@/composables/useSupplierLedger';

const {
  pick,
  formatCurrency,
  payments,
  loading,
  saving,
  selectedPo,
  amount,
  method,
  bankAccounts,
  bankAccountId,
  reference,
  notes,
  error,
  supplierFilter,
  printPayment,
  accruedCents,
  balanceCents,
  daysOverdue,
  visibleRows,
  suppliers,
  outstanding,
  openingOutstanding,
  aging,
  load,
  save,
  printVoucher,
} = useSupplierLedger();
const props = defineProps<{ paymentEntry?: boolean }>();
const ledgerTab = ref<'balances' | 'payment' | 'vouchers'>(
  props.paymentEntry ? 'payment' : 'balances',
);
const router = useRouter();
const settings = useSettingsStore();
const paymentNumber = ref('');
const paymentDate = ref(localDateKey());
const chequeNumber = ref('');
const selectedRow = computed(() => visibleRows.value.find((row) => row.id === selectedPo.value));
const payableRows = computed(() => visibleRows.value.filter((row) => balanceCents(row) > 0));
watch(supplierFilter, () => {
  if (!selectedRow.value)
    selectedPo.value = payableRows.value.length === 1 ? payableRows.value[0].id : '';
});
watch(selectedPo, () => {
  const row = selectedRow.value;
  if (row && !supplierFilter.value) supplierFilter.value = row.supplier_id;
});
function resetPayment() {
  selectedPo.value = '';
  supplierFilter.value = '';
  amount.value = null;
  method.value = 'cash';
  bankAccountId.value = '';
  reference.value = '';
  notes.value = '';
  chequeNumber.value = '';
  paymentNumber.value = '';
  paymentDate.value = localDateKey();
  error.value = '';
}
async function savePayment() {
  if (saving.value) return;
  const remarks = notes.value;
  notes.value = [
    chequeNumber.value.trim() ? `Cheque / Draft: ${chequeNumber.value.trim()}` : '',
    remarks.trim(),
  ]
    .filter(Boolean)
    .join(' · ');
  if (new TextEncoder().encode(notes.value).length > 500) {
    notes.value = remarks;
    error.value = pick(
      'Payment details are too long; shorten the remarks.',
      'ادائیگی کی تفصیلات بہت طویل ہیں؛ ریمارکس مختصر کریں۔',
    );
    return;
  }
  const result = await save();
  if (result) {
    paymentNumber.value = result.voucherNumber;
    paymentDate.value = localDateKey();
    chequeNumber.value = '';
  } else notes.value = remarks;
}
</script>

<template>
  <div
    class="tool-terminal compact-workspace ledger-page"
    :class="{ 'payment-active': ledgerTab === 'payment' }"
  >
    <header v-show="ledgerTab !== 'payment'" class="tool-header">
      <h2>{{ pick('Supplier Ledger', 'سپلائر کھاتہ') }}</h2>
      <button type="button" @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button>
    </header>
    <p v-show="ledgerTab !== 'payment'">
      {{
        pick(
          'Balances include received goods and openings. Opening age is unknown.',
          'بقایا موصولہ مال اور ابتدائی بیلنس پر مبنی ہے۔ ابتدائی بیلنس کی عمر نامعلوم ہے۔',
        )
      }}
      <span v-if="openingOutstanding">
        · {{ pick('Opening balance (age unknown)', 'ابتدائی بیلنس (عمر نامعلوم)') }}:
        {{ formatCurrency(openingOutstanding / 100) }}</span
      >
    </p>
    <p v-if="error" role="alert" class="ledger-error">{{ error }}</p>
    <div v-if="loading">{{ pick('Loading ledger…', 'کھاتہ لوڈ ہو رہا ہے…') }}</div>
    <template v-else>
      <div v-show="ledgerTab !== 'payment'" class="ledger-summary">
        <div>
          <small>{{ pick('Outstanding', 'کل بقایا') }}</small><strong>{{
            formatCurrency(outstanding / 100)
          }}</strong>
        </div>
        <div v-for="(value, index) in aging" :key="index">
          <small>{{
            [pick('Not overdue', 'ابھی واجب نہیں'), '1–30', '31–60', '61–90', '90+'][index]
          }}</small><strong>{{ formatCurrency(value / 100) }}</strong>
        </div>
      </div>
      <label v-show="ledgerTab !== 'payment'"
        >{{ pick('Supplier', 'سپلائر') }}
        <select v-model="supplierFilter">
          <option value="">{{ pick('All suppliers', 'تمام سپلائرز') }}</option>
          <option v-for="[id, name] in suppliers" :key="id" :value="id">{{ name }}</option>
        </select></label
      >
      <nav
        v-show="ledgerTab !== 'payment'"
        class="commercial-tabs"
        :aria-label="pick('Ledger sections', 'کھاتے کے حصے')"
      >
        <button
          type="button"
          :disabled="saving"
          :aria-pressed="ledgerTab === 'balances'"
          @click="ledgerTab = 'balances'"
        >
          {{ pick('Balances', 'بقایا') }}
        </button>
        <button
          type="button"
          :disabled="saving"
          :aria-pressed="ledgerTab === 'payment'"
          @click="ledgerTab = 'payment'"
        >
          {{ pick('Record payment', 'ادائیگی درج کریں') }}
        </button>
        <button
          type="button"
          :disabled="saving"
          :aria-pressed="ledgerTab === 'vouchers'"
          @click="ledgerTab = 'vouchers'"
        >
          {{ pick('Payment history', 'ادائیگی کی تاریخ') }}
        </button>
      </nav>
      <div v-show="ledgerTab === 'balances'" class="paged-table-host ledger-table-wrap">
        <CompactPages
          :items="visibleRows"
          :row-height="56"
          :header-height="36"
          v-slot="{ rows: pageRows }"
        >
          <table>
            <thead>
              <tr>
                <th>{{ pick('Supplier / PO', 'سپلائر / آرڈر') }}</th>
                <th>{{ pick('Received / opening', 'موصولہ / ابتدائی مالیت') }}</th>
                <th>{{ pick('Paid', 'ادا شدہ') }}</th>
                <th>{{ pick('Balance', 'بقایا') }}</th>
                <th>{{ pick('Days overdue', 'تاخیر کے دن') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item: row } in pageRows" :key="row.id">
                <td>
                  {{ row.supplier_name }}<small>{{ row.po_number }} · {{ row.status }}</small>
                </td>
                <td>{{ formatCurrency(accruedCents(row) / 100) }}</td>
                <td>{{ formatCurrency(row.paid_cents / 100) }}</td>
                <td>
                  <strong>{{ formatCurrency(balanceCents(row) / 100) }}</strong>
                </td>
                <td>{{ row.status === 'opening' ? '—' : daysOverdue(row) }}</td>
              </tr>
              <tr v-if="!visibleRows.length">
                <td colspan="5">
                  {{ pick('No received purchase orders', 'ابھی کوئی موصولہ آرڈر نہیں') }}
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>
      <form
        v-show="ledgerTab === 'payment'"
        class="ledger-form supplier-payment-form"
        @submit.prevent="savePayment"
      >
        <header class="payment-brandbar">
          <div class="payment-brand">
            <span aria-hidden="true">✚</span>
            <div>
              <strong>{{ settings.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{
                pick('Supplier Payment', 'سپلائر کی ادائیگی')
              }}</small>
            </div>
          </div>
          <h3>{{ pick('Payments', 'ادائیگیاں') }}</h3>
        </header>
        <fieldset class="payment-body" :disabled="saving || loading">
          <aside class="payment-sidebar" aria-hidden="true">
            <svg viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="48" stroke="currentColor" stroke-width="3" />
              <circle
                cx="60"
                cy="60"
                r="39"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-dasharray="3 4"
              />
              <path
                d="m39 49 14 14 27-28"
                stroke="currentColor"
                stroke-width="5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M32 80h56M39 87h42"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </aside>
          <div class="payment-fields">
            <label class="payment-field"
              ><span>{{ pick('Payment ID', 'ادائیگی نمبر') }}</span
              ><input
                :value="paymentNumber"
                :placeholder="pick('Assigned on save', 'محفوظ کرنے پر نمبر')"
                readonly
                aria-label="Payment ID"
            /></label>
            <label class="payment-field"
              ><span>{{ pick('Date', 'تاریخ') }}</span
              ><input :value="paymentDate" type="date" readonly aria-label="Payment date"
            /></label>
            <label class="payment-field"
              ><span>{{ pick('Ref. No', 'حوالہ نمبر') }}</span
              ><input v-model="reference" maxlength="100" aria-label="Payment reference"
            /></label>
            <label class="payment-field"
              ><span>{{ pick('Method', 'طریقہ') }}</span
              ><select v-model="method" aria-label="Payment method">
                <option value="cash">{{ pick('Cash', 'نقد') }}</option>
                <option value="bank">{{ pick('Bank', 'بینک') }}</option>
                <option value="mobile">{{ pick('Mobile transfer', 'موبائل ٹرانسفر') }}</option>
              </select></label
            >
            <label class="payment-field payment-supplier"
              ><span>{{ pick('Supplier', 'سپلائر') }} <b aria-hidden="true">*</b></span
              ><select v-model="supplierFilter" required aria-label="Payment supplier">
                <option value="">{{ pick('Select supplier', 'سپلائر منتخب کریں') }}</option>
                <option v-for="[id, name] in suppliers" :key="id" :value="id">{{ name }}</option>
              </select></label
            >
            <label class="payment-field payment-order"
              ><span
                >{{ pick('Order / Opening', 'آرڈر / ابتدائی بیلنس') }}
                <b aria-hidden="true">*</b></span
              ><select v-model="selectedPo" required aria-label="Payment order or opening">
                <option value="" disabled>
                  {{ pick('Select order or opening', 'آرڈر یا ابتدائی بیلنس منتخب کریں') }}
                </option>
                <option v-for="row in payableRows" :key="row.id" :value="row.id">
                  {{ row.po_number }} · {{ formatCurrency(balanceCents(row) / 100) }}
                </option>
              </select></label
            >
            <label class="payment-field"
              ><span>{{ pick('Amount', 'رقم') }} <b aria-hidden="true">*</b></span
              ><input
                v-model.number="amount"
                type="number"
                min="0.01"
                step="0.01"
                :max="selectedRow ? balanceCents(selectedRow) / 100 : undefined"
                required
                aria-label="Payment amount"
            /></label>
            <label class="payment-field"
              ><span>{{ pick('Balance', 'بقایا') }}</span
              ><input
                :value="formatCurrency(selectedRow ? balanceCents(selectedRow) / 100 : 0)"
                readonly
                aria-label="Payment balance"
            /></label>
            <label class="payment-field payment-cheque"
              ><span>{{ pick('Cheque / Draft No', 'چیک / ڈرافٹ نمبر') }}</span
              ><input v-model="chequeNumber" maxlength="100" aria-label="Payment cheque or draft"
            /></label>
            <label class="payment-field payment-bank"
              ><span>{{ pick('Bank', 'بینک') }}</span
              ><select
                v-model="bankAccountId"
                :required="method === 'bank'"
                :disabled="method !== 'bank'"
                aria-label="Payment bank account"
              >
                <option value="">{{ pick('Select bank account', 'بینک کھاتا منتخب کریں') }}</option>
                <option v-for="bank in bankAccounts" :key="bank.id" :value="bank.id">
                  {{ bank.name }}
                </option>
              </select></label
            >
            <label class="payment-field payment-remarks"
              ><span>{{ pick('Remarks', 'ریمارکس') }}</span
              ><textarea v-model="notes" maxlength="300" rows="3" aria-label="Payment remarks" />
            </label>
            <p v-if="paymentNumber" class="payment-status" role="status">
              {{ pick('Saved payment:', 'محفوظ شدہ ادائیگی:') }} {{ paymentNumber }}
            </p>
          </div>
        </fieldset>
        <footer class="payment-actions">
          <button type="button" :disabled="saving" @click="ledgerTab = 'balances'">
            {{ pick('Balances', 'بقایا') }}
          </button>
          <button type="button" :disabled="saving" @click="resetPayment">
            <span aria-hidden="true">＋</span> {{ pick('New', 'نئی') }}
          </button>
          <button type="button" :disabled="saving" @click="resetPayment">
            <span aria-hidden="true">↶</span> {{ pick('Undo', 'واپس') }}
          </button>
          <button type="button" :disabled="saving" @click="ledgerTab = 'vouchers'">
            <span aria-hidden="true">⌕</span> {{ pick('Search / History', 'تلاش / تاریخ') }}
          </button>
          <button type="button" :disabled="saving" @click="router.push('/')">
            {{ pick('Exit', 'بند کریں') }}
          </button>
          <button
            type="submit"
            class="payment-save bg-primary"
            :disabled="saving || !auth.can('supplier.pay')"
          >
            {{
              saving
                ? pick('Saving…', 'محفوظ ہو رہا ہے…')
                : pick('Save payment', 'ادائیگی محفوظ کریں')
            }}
          </button>
        </footer>
      </form>
      <h3 v-show="ledgerTab === 'vouchers'">
        {{ pick('Recent payment vouchers', 'حالیہ ادائیگی واؤچر') }}
      </h3>
      <div v-show="ledgerTab === 'vouchers'" class="paged-table-host ledger-table-wrap">
        <CompactPages
          :items="payments"
          :row-height="56"
          :header-height="36"
          v-slot="{ rows: pageRows }"
        >
          <table>
            <thead>
              <tr>
                <th>{{ pick('Voucher', 'واؤچر') }}</th>
                <th>{{ pick('Supplier', 'سپلائر') }}</th>
                <th>{{ pick('Date', 'تاریخ') }}</th>
                <th>{{ pick('Amount', 'رقم') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item: payment } in pageRows" :key="payment.id">
                <td>{{ payment.voucher_number }}</td>
                <td>{{ payment.supplier_name }}</td>
                <td>{{ payment.paid_at.slice(0, 10) }}</td>
                <td>{{ formatCurrency(payment.amount_cents / 100) }}</td>
                <td>
                  <button type="button" @click="printVoucher(payment)">
                    {{ pick('Print', 'پرنٹ') }}
                  </button>
                </td>
              </tr>
              <tr v-if="!payments.length">
                <td colspan="5">{{ pick('No payments yet', 'ابھی کوئی ادائیگی نہیں') }}</td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>
    </template>
  </div>
  <Teleport to="body"
    ><section v-if="printPayment" class="supplier-voucher">
      <h1>{{ pick('Supplier Payment Voucher', 'سپلائر ادائیگی واؤچر') }}</h1>
      <p>{{ printPayment.voucher_number }}</p>
      <p>{{ printPayment.supplier_name }}</p>
      <p>{{ printPayment.paid_at }}</p>
      <p>{{ pick('Amount', 'رقم') }}: {{ formatCurrency(printPayment.amount_cents / 100) }}</p>
      <p>{{ pick('Method', 'طریقہ') }}: {{ printPayment.method }}</p>
      <p v-if="printPayment.reference">
        {{ pick('Reference', 'حوالہ') }}: {{ printPayment.reference }}
      </p>
    </section></Teleport
  >
</template>

<style scoped>
.ledger-page {
  padding: 2rem;
  max-width: 1400px;
  margin: auto;
  color: var(--color-text-primary);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ledger-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1.5rem 0;
}
.ledger-summary > div,
.ledger-form {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1rem;
}
.ledger-summary small,
.ledger-summary strong {
  display: block;
}
.ledger-summary strong {
  font-size: 1.3rem;
  margin-top: 0.4rem;
}
.ledger-table-wrap {
  overflow: auto;
  margin: 1rem 0 2rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
}
th,
td {
  padding: 0.8rem;
  border-bottom: 1px solid var(--color-border);
  text-align: start;
  white-space: nowrap;
}
td small {
  display: block;
  color: var(--color-text-secondary);
}
.ledger-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 1rem;
  margin-bottom: 2rem;
}
.ledger-form h3 {
  width: 100%;
  margin: 0;
}
.ledger-form label {
  display: grid;
  gap: 0.3rem;
}
input,
select,
button {
  padding: 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text-primary);
}
button {
  cursor: pointer;
}
button[type='submit'] {
  background: var(--color-primary);
  color: white;
}
.ledger-error {
  color: var(--color-danger);
}
@media (max-width: 1100px) {
  .ledger-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.workspace-body .compact-workspace.compact-workspace.ledger-page.payment-active {
  padding: 0;
  width: 100%;
  max-width: none;
  margin: 0;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .supplier-payment-form {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  width: min(850px, 100%);
  min-height: 0;
  gap: 0;
  padding: 0;
  margin: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  overflow: auto;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brandbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brand > span {
  color: var(--color-primary);
  font-size: 32px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brand strong {
  display: block;
  font-size: 20px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brand small {
  display: block;
  color: var(--text-secondary);
  font-size: 11px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brandbar h3 {
  width: auto;
  color: var(--color-primary);
  font-size: 20px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-body {
  display: grid;
  grid-template-columns: 145px minmax(0, 1fr);
  gap: 18px;
  padding: 14px 16px;
  border: 0;
  margin: 0;
  min-width: 0;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-sidebar {
  padding-top: 10px;
  color: var(--color-primary);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-sidebar svg {
  display: block;
  width: 140px;
  max-width: 100%;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--surface-page);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-fields {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 9px 16px;
  align-items: center;
  align-content: start;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  min-width: 0;
  font-size: 12px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field > span {
  flex: 0 0 90px;
  text-align: right;
  font-weight: 600;
}
.workspace-body
  .compact-workspace.compact-workspace.ledger-page
  .payment-field
  :is(input, select, textarea) {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 3px 6px;
  min-height: 25px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  background: var(--surface-card);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field input:read-only,
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field select:disabled {
  background: var(--surface-page);
  color: var(--text-secondary);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field b {
  color: var(--color-danger);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-supplier,
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-order,
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-bank,
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-remarks,
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-status {
  grid-column: 1/-1;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-cheque {
  grid-column: 2;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-remarks {
  align-items: start;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-remarks > span {
  padding-top: 5px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-remarks textarea {
  height: 64px;
  min-height: 64px;
  resize: none;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-status {
  margin: 0 0 0 98px;
  color: var(--text-secondary);
  font-size: 11px;
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-page);
}
.workspace-body .compact-workspace.compact-workspace.ledger-page .payment-actions button {
  height: 30px;
  padding: 4px 9px;
}
@media (max-width: 760px) {
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-body {
    grid-template-columns: 95px minmax(0, 1fr);
    gap: 8px;
    padding: 10px;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field > span {
    flex-basis: 75px;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-fields {
    gap: 7px;
  }
}
@media (max-width: 560px) {
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-sidebar {
    display: none;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-body {
    grid-template-columns: 1fr;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-fields {
    grid-template-columns: 1fr;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-field {
    grid-column: 1;
  }
}
@media (max-height: 650px) {
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-brandbar {
    padding: 5px 12px;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-body {
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-fields {
    gap: 6px 12px;
  }
  .workspace-body .compact-workspace.compact-workspace.ledger-page .payment-actions {
    padding: 6px 12px;
  }
}
</style>
<style>
.supplier-voucher {
  display: none;
}
@media print {
  body.printing-supplier-voucher > *:not(.supplier-voucher) {
    display: none !important;
  }
  body.printing-supplier-voucher > .supplier-voucher {
    display: block !important;
    color: #000;
    background: #fff;
    padding: 1cm;
    font-family: Arial, sans-serif;
  }
}
</style>
