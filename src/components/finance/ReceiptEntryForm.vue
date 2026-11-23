<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFinance } from '@/composables/useFinance';
import { executeQuery } from '@/lib/database';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/lib/i18n';
import Button from '@/components/ui/Button.vue';

type Form = ReturnType<typeof useFinance>['form']['value'];
type Customer = { id: string; name: string; current_balance: number };
type Invoice = { id: string; invoice_number: string; net_amount: number };
const form = defineModel<Form>({ required: true });
const props = defineProps<{
  customers: Customer[];
  bankAccounts: { id: string; name: string }[];
  busy: boolean;
  loading: boolean;
  today: string;
  save: (details: { invoice: string; cheque: string }) => Promise<string | undefined>;
}>();
const emit = defineEmits<{ history: [] }>();
const { pick, formatCurrency } = useI18n();
const settings = useSettingsStore();
const router = useRouter();
const withInvoice = ref(false);
const invoiceId = ref('');
const invoices = ref<Invoice[]>([]);
const invoicesLoading = ref(false);
const invoiceError = ref('');
const cheque = ref('');
const receiptNumber = ref('');
const customer = computed(() => props.customers.find((c) => c.id === form.value.customerId));
const invoice = computed(() => invoices.value.find((i) => i.id === invoiceId.value));
watch(
  () => form.value.customerId,
  async (id, _, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    invoiceId.value = '';
    invoices.value = [];
    invoiceError.value = '';
    invoicesLoading.value = !!id;
    if (!id) return;
    try {
      const rows = await executeQuery<Invoice>(
        "SELECT id, invoice_number, net_amount FROM sales_invoices WHERE customer_id = ? AND status = 'completed' ORDER BY invoice_date DESC",
        [id],
      );
      if (current) invoices.value = rows;
    } catch {
      if (current)
        invoiceError.value = pick(
          'Unable to load client invoices.',
          'کلائنٹ کی انوائس لوڈ نہیں ہو سکیں۔',
        );
    } finally {
      if (current) invoicesLoading.value = false;
    }
  },
  { immediate: true },
);
watch(withInvoice, () => {
  invoiceId.value = '';
});
function reset() {
  form.value = {
    ...form.value,
    requestId: crypto.randomUUID(),
    customerId: '',
    amount: '',
    description: '',
    reference: '',
    method: 'cash',
    bankAccountId: '',
    entryDate: props.today,
  };
  withInvoice.value = false;
  cheque.value = '';
  receiptNumber.value = '';
}
async function submit() {
  const number = await props.save({
    invoice: withInvoice.value ? invoice.value?.invoice_number || '' : '',
    cheque: cheque.value.trim(),
  });
  if (number) {
    receiptNumber.value = number;
    cheque.value = '';
    invoiceId.value = '';
    withInvoice.value = false;
  }
}
</script>

<template>
  <section class="receipt-entry" :aria-label="pick('Receipt entry', 'رسید کا اندراج')">
    <header class="receipt-brandbar">
      <div class="receipt-brand">
        <span aria-hidden="true">✚</span>
        <div>
          <strong>{{ settings.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{
            pick('Customer Receipt', 'گاہک کی رسید')
          }}</small>
        </div>
      </div>
      <span class="receipt-caption">{{ pick('Receipt', 'رسید') }}</span>
    </header>
    <form class="receipt-form" @submit.prevent="submit">
      <fieldset :disabled="busy || loading" class="receipt-body">
        <aside class="receipt-sidebar">
          <svg class="receipt-illustration" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <path
              d="M23 12h54v76l-9-6-9 6-9-6-9 6-9-6-9 6V12Z"
              stroke="currentColor"
              stroke-width="3"
            />
            <path
              d="M34 29h32M34 40h32M34 51h19M34 66h32"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
          <Button
            type="button"
            variant="outline"
            :disabled="!customer || busy"
            @click="router.push({ path: '/customer-ledger', query: { customer: form.customerId } })"
            >{{ pick('Client Card', 'کلائنٹ کارڈ') }}</Button
          >
        </aside>
        <div class="receipt-fields-grid">
          <label class="receipt-field"
            ><span>{{ pick('Receipt ID', 'رسید نمبر') }}</span
            ><input
              :value="receiptNumber"
              :placeholder="pick('Assigned on save', 'محفوظ کرنے پر نمبر')"
              readonly
              aria-label="Receipt ID"
          /></label>
          <label class="receipt-field"
            ><span>{{ pick('Date', 'تاریخ') }}</span
            ><input
              v-model="form.entryDate"
              type="date"
              required
              :max="today"
              aria-label="Receipt date"
          /></label>
          <label class="receipt-field"
            ><span>{{ pick('Ref. No', 'حوالہ نمبر') }}</span
            ><input v-model="form.reference" maxlength="100" aria-label="Receipt reference"
          /></label>
          <label class="receipt-field"
            ><span>{{ pick('Payment', 'ادائیگی') }}</span
            ><select v-model="form.method" aria-label="Receipt payment method">
              <option value="cash">{{ pick('Cash', 'نقد') }}</option>
              <option value="bank">{{ pick('Bank', 'بینک') }}</option>
              <option value="mobile">{{ pick('Mobile', 'موبائل') }}</option>
            </select></label
          >
          <fieldset class="receipt-type">
            <legend>{{ pick('Receipt Type', 'رسید کی قسم') }}</legend>
            <label
              ><input v-model="withInvoice" type="radio" :value="true" />{{
                pick('With Invoice Reference', 'انوائس کے حوالے کے ساتھ')
              }}</label
            ><label
              ><input v-model="withInvoice" type="radio" :value="false" />{{
                pick('Without Invoice Reference', 'انوائس کے حوالے کے بغیر')
              }}</label
            >
          </fieldset>
          <label class="receipt-field receipt-invoice"
            ><span>{{ pick('Invoice No', 'انوائس نمبر') }}</span
            ><select
              v-model="invoiceId"
              :disabled="!withInvoice || !customer || invoicesLoading"
              :required="withInvoice"
              aria-label="Receipt invoice"
            >
              <option value="">
                {{
                  invoicesLoading
                    ? pick('Loading…', 'لوڈ ہو رہا ہے…')
                    : pick('Select client invoice', 'کلائنٹ کی انوائس منتخب کریں')
                }}
              </option>
              <option v-for="item in invoices" :key="item.id" :value="item.id">
                {{ item.invoice_number }}
              </option>
            </select></label
          >
          <label class="receipt-field"
            ><span>{{ pick('Invoice Amount', 'انوائس کی رقم') }}</span
            ><input
              :value="invoice ? formatCurrency(invoice.net_amount) : ''"
              readonly
              aria-label="Invoice amount"
          /></label>
          <p v-if="invoiceError && withInvoice" class="receipt-note receipt-error" role="alert">
            {{ invoiceError }}
          </p>
          <label class="receipt-field receipt-client"
            ><span>{{ pick('Client', 'کلائنٹ') }} <b aria-hidden="true">*</b></span
            ><input
              class="receipt-client-code"
              :value="customer?.name.includes(' · ') ? customer.name.split(' · ').pop() : ''"
              readonly
              aria-label="Client code"
            /><select v-model="form.customerId" required aria-label="Receipt client">
              <option value="">{{ pick('Select client', 'کلائنٹ منتخب کریں') }}</option>
              <option v-for="client in customers" :key="client.id" :value="client.id">
                {{ client.name }}
              </option>
            </select></label
          >
          <label class="receipt-field"
            ><span>{{ pick('Amount', 'رقم') }} <b aria-hidden="true">*</b></span
            ><input
              v-model="form.amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              :max="customer?.current_balance"
              aria-label="Receipt amount"
          /></label>
          <label class="receipt-field"
            ><span>{{ pick('Balance', 'بقایا') }}</span
            ><input
              :value="formatCurrency(customer?.current_balance || 0)"
              readonly
              aria-label="Client balance"
          /></label>
          <label v-if="form.method === 'bank'" class="receipt-field"
            ><span>{{ pick('Bank account', 'بینک کھاتا') }}</span
            ><select v-model="form.bankAccountId" required aria-label="Receipt bank account">
              <option value="">{{ pick('Select bank account', 'بینک کھاتا منتخب کریں') }}</option>
              <option v-for="bank in bankAccounts" :key="bank.id" :value="bank.id">
                {{ bank.name }}
              </option>
            </select></label
          >
          <label class="receipt-field receipt-cheque"
            ><span>{{ pick('Cheque / Draft No', 'چیک / ڈرافٹ نمبر') }}</span
            ><input v-model="cheque" maxlength="100" aria-label="Cheque or draft number"
          /></label>
          <label class="receipt-field receipt-remarks"
            ><span>{{ pick('Remarks', 'ریمارکس') }}</span
            ><textarea
              v-model="form.description"
              maxlength="300"
              rows="3"
              aria-label="Receipt remarks"
            />
          </label>
          <p v-if="receiptNumber" class="receipt-note" role="status">
            {{ pick('Saved receipt:', 'محفوظ شدہ رسید:') }} {{ receiptNumber }}
          </p>
        </div>
      </fieldset>
      <footer class="receipt-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="reset"
          ><span aria-hidden="true">＋</span>{{ pick('New', 'نئی') }}</Button
        >
        <Button type="button" variant="outline" :disabled="busy" @click="reset"
          ><span aria-hidden="true">↶</span>{{ pick('Undo', 'واپس') }}</Button
        >
        <Button type="button" variant="outline" :disabled="busy" @click="emit('history')"
          ><span aria-hidden="true">⌕</span>{{ pick('Search / History', 'تلاش / تاریخ') }}</Button
        >
        <Button type="button" variant="outline" :disabled="busy" @click="router.push('/')">{{
          pick('Exit', 'بند کریں')
        }}</Button>
        <Button type="submit" permission="finance.receipts" :disabled="busy || loading">{{
          busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save', 'محفوظ کریں')
        }}</Button>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.workspace-body .compact-workspace.compact-workspace .receipt-entry .receipt-remarks textarea {
  height: 68px;
  min-height: 68px;
  resize: none;
}
.workspace-body .compact-workspace.compact-workspace .receipt-entry .receipt-client-code {
  flex: 0 0 55px;
  width: 55px;
}

.receipt-entry {
  display: flex;
  flex-direction: column;
  width: min(850px, 100%);
  min-height: 0;
  margin: auto;
  color: var(--text-primary);
  border: 1px solid var(--border);
  background: var(--surface-card);
  border-radius: var(--radius-md);
  overflow: auto;
}
.receipt-brandbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
}
.receipt-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.receipt-brand > span {
  color: var(--color-primary);
  font-size: 32px;
}
.receipt-brand strong {
  display: block;
  font-size: 20px;
}
.receipt-brand small {
  display: block;
  color: var(--text-secondary);
  font-size: 11px;
}
.receipt-caption {
  color: var(--color-primary);
  font-size: 20px;
}
.receipt-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.receipt-body {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 20px;
  border: 0;
  margin: 0;
  padding: 16px 18px;
  min-width: 0;
}
.receipt-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding-top: 18px;
}
.receipt-illustration {
  width: 92px;
  height: 100px;
  color: var(--color-primary);
  background: var(--surface-page);
  border-radius: var(--radius-md);
  padding: 10px;
}
.receipt-fields-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-content: start;
  align-items: center;
  gap: 10px 18px;
}
.receipt-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.receipt-field > span {
  flex: 0 0 90px;
  text-align: right;
  font-weight: 600;
}
.receipt-field :is(input, select, textarea) {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  min-height: 28px;
}
.receipt-field input:read-only {
  background: var(--surface-page);
  color: var(--text-secondary);
}
.receipt-field :is(input, select, textarea):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.receipt-field b {
  color: var(--color-danger);
}
.receipt-type {
  grid-column: 1/-1;
  margin: 0 0 2px 98px;
  border: 1px solid var(--border);
  padding: 5px 8px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 15px;
  font-size: 11px;
}
.receipt-type legend {
  color: var(--text-secondary);
  padding: 0 4px;
}
.receipt-type label {
  display: flex;
  align-items: center;
  gap: 5px;
}
.receipt-type input {
  accent-color: var(--color-primary);
}
.receipt-client,
.receipt-remarks,
.receipt-note {
  grid-column: 1/-1;
}
.receipt-client {
  margin-top: 6px;
}
.receipt-cheque {
  grid-column: 2;
}
.receipt-remarks {
  align-items: start;
}
.receipt-remarks span {
  padding-top: 5px;
}
.receipt-remarks textarea {
  resize: vertical;
  min-height: 68px;
}
.receipt-note {
  margin-left: 98px;
  color: var(--text-secondary);
  font-size: 11px;
}
.receipt-error {
  color: var(--color-danger);
}
.receipt-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-page);
}
.receipt-actions :deep(button),
.receipt-sidebar :deep(button) {
  min-height: 34px;
  height: auto;
  padding: 5px 10px;
  font-size: 12px;
}
@media (max-width: 760px) {
  .receipt-body {
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 8px;
    padding: 10px;
  }
  .receipt-field > span {
    flex-basis: 75px;
  }
  .receipt-fields-grid {
    gap: 7px;
  }
  .receipt-type {
    margin-left: 83px;
  }
  .receipt-illustration {
    width: 70px;
  }
}
@media (max-width: 560px) {
  .receipt-sidebar {
    display: none;
  }
  .receipt-body {
    grid-template-columns: 1fr;
  }
  .receipt-fields-grid {
    grid-template-columns: 1fr;
  }
  .receipt-field,
  .receipt-cheque {
    grid-column: 1;
  }
  .receipt-type {
    margin-left: 0;
  }
  .receipt-brand strong {
    font-size: 16px;
  }
}
@media (max-height: 650px) {
  .receipt-brandbar {
    padding: 6px 14px;
  }
  .receipt-body {
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .receipt-fields-grid {
    gap: 6px 12px;
  }
  .receipt-field :is(input, select) {
    min-height: 25px;
  }
  .receipt-remarks textarea {
    min-height: 50px;
  }
  .receipt-actions {
    padding: 6px 12px;
  }
}
</style>
