<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { useFinance } from '@/composables/useFinance';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/lib/i18n';
import Button from '@/components/ui/Button.vue';

type Form = ReturnType<typeof useFinance>['form']['value'];
const form = defineModel<Form>({ required: true });
const props = defineProps<{
  expenseHeads: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
  busy: boolean;
  loading: boolean;
  today: string;
  save: () => Promise<string | undefined>;
}>();
const emit = defineEmits<{ history: [] }>();
const { pick } = useI18n();
const settings = useSettingsStore();
const router = useRouter();
const expenseNumber = ref('');
const headSelect = ref<HTMLSelectElement | null>(null);
function chooseHead() {
  headSelect.value?.focus();
  try {
    headSelect.value?.showPicker?.();
  } catch {
    /* The focused select remains available when native pickers are unsupported. */
  }
}
function reset() {
  form.value = {
    ...form.value,
    requestId: crypto.randomUUID(),
    customerId: '',
    category: props.expenseHeads.some((head) => head.name === form.value.category)
      ? form.value.category
      : props.expenseHeads[0]?.name || '',
    amount: '',
    description: '',
    reference: '',
    method: 'cash',
    bankAccountId: '',
    entryDate: props.today,
  };
  expenseNumber.value = '';
}
async function submit() {
  if (props.busy || props.loading) return;
  const number = await props.save();
  if (number) expenseNumber.value = number;
}
</script>

<template>
  <section class="expense-entry" :aria-label="pick('Expense details', 'اخراجات کی تفصیل')">
    <header class="expense-brandbar">
      <div class="expense-brand">
        <span aria-hidden="true">✚</span>
        <div>
          <strong>{{ settings.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{
            pick('Business expenses', 'کاروباری اخراجات')
          }}</small>
        </div>
      </div>
      <h2>{{ pick('Expense Details', 'اخراجات کی تفصیل') }}</h2>
    </header>
    <form class="expense-form" @submit.prevent="submit">
      <fieldset class="expense-body" :disabled="busy || loading">
        <aside class="expense-sidebar" aria-hidden="true">
          <svg class="expense-illustration" viewBox="0 0 160 150" fill="none">
            <path
              d="m20 98 89-28 34 27-89 29-34-28Z"
              fill="var(--color-primary-50)"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="m20 106 34 28 89-29M20 114l34 28 89-29M63 85l34 28M76 81l34 28"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <ellipse
              cx="45"
              cy="55"
              rx="23"
              ry="8"
              fill="var(--color-primary-50)"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M22 55v28c0 11 46 11 46 0V55M22 64c0 11 46 11 46 0M22 73c0 11 46 11 46 0"
              stroke="currentColor"
              stroke-width="2"
            />
            <ellipse
              cx="91"
              cy="29"
              rx="23"
              ry="8"
              fill="var(--color-primary-50)"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M68 29v33c0 11 46 11 46 0V29M68 39c0 11 46 11 46 0M68 49c0 11 46 11 46 0"
              stroke="currentColor"
              stroke-width="2"
            />
          </svg>
        </aside>
        <div class="expense-fields">
          <label class="expense-field"
            ><span>{{ pick('Expense ID', 'اخراجات نمبر') }}</span
            ><input
              :value="expenseNumber"
              :placeholder="pick('Assigned on save', 'محفوظ کرنے پر نمبر')"
              readonly
              aria-label="Expense ID"
          /></label>
          <label class="expense-field expense-date"
            ><span>{{ pick('Date', 'تاریخ') }}</span
            ><input
              v-model="form.entryDate"
              type="date"
              required
              :max="today"
              aria-label="Expense date"
          /></label>
          <div class="expense-field expense-head">
            <label for="expense-head-select"
              >{{ pick('Expense Head', 'اخراجات کی مد') }} <b aria-hidden="true">*</b></label
            ><select
              id="expense-head-select"
              ref="headSelect"
              v-model="form.category"
              required
              aria-label="Expense head"
            >
              <option value="" disabled>
                {{ pick('Select expense head', 'اخراجات کی مد منتخب کریں') }}
              </option>
              <option v-for="head in expenseHeads" :key="head.id" :value="head.name">
                {{ head.name }}
              </option></select
            ><button
              type="button"
              :aria-label="pick('Choose expense head', 'اخراجات کی مد منتخب کریں')"
              @click="chooseHead"
            >
              …
            </button>
          </div>
          <label class="expense-field"
            ><span>{{ pick('Amount', 'رقم') }} <b aria-hidden="true">*</b></span
            ><input
              v-model="form.amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              aria-label="Expense amount"
          /></label>
          <label class="expense-field"
            ><span>{{ pick('Ref. No', 'حوالہ نمبر') }}</span
            ><input v-model="form.reference" maxlength="100" aria-label="Expense reference"
          /></label>
          <label class="expense-field expense-remarks"
            ><span>{{ pick('Remarks', 'ریمارکس') }} <b aria-hidden="true">*</b></span
            ><textarea
              v-model="form.description"
              required
              maxlength="500"
              rows="3"
              aria-label="Expense remarks"
            />
          </label>
          <label class="expense-field"
            ><span>{{ pick('Method', 'طریقہ') }}</span
            ><select v-model="form.method" aria-label="Expense payment method">
              <option value="cash">{{ pick('Cash drawer', 'نقد دراز') }}</option>
              <option value="bank">{{ pick('Bank', 'بینک') }}</option>
              <option value="mobile">{{ pick('Mobile', 'موبائل') }}</option>
            </select></label
          >
          <label v-if="form.method === 'bank'" class="expense-field"
            ><span>{{ pick('Bank account', 'بینک کھاتا') }} <b aria-hidden="true">*</b></span
            ><select v-model="form.bankAccountId" required aria-label="Expense bank account">
              <option value="" disabled>
                {{ pick('Select bank account', 'بینک کھاتا منتخب کریں') }}
              </option>
              <option v-for="bank in bankAccounts" :key="bank.id" :value="bank.id">
                {{ bank.name }}
              </option>
            </select></label
          >
          <p v-if="expenseNumber" class="expense-status" role="status">
            {{ pick('Saved expense:', 'محفوظ شدہ اخراجات:') }} {{ expenseNumber }}
          </p>
        </div>
      </fieldset>
      <footer class="expense-actions">
        <Button type="button" variant="outline" :disabled="busy" @click="reset"
          ><span aria-hidden="true">＋</span>{{ pick('New', 'نئے') }}</Button
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
        <Button type="submit" permission="finance.expenses" :disabled="busy || loading">{{
          busy ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save expense', 'اخراجات محفوظ کریں')
        }}</Button>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.expense-entry {
  display: flex;
  flex-direction: column;
  width: min(820px, 100%);
  min-height: 0;
  margin: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-primary);
  overflow: auto;
}
.expense-brandbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.expense-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}
.expense-brand > span {
  color: var(--color-primary);
  font-size: 32px;
}
.expense-brand strong {
  display: block;
  font-size: 20px;
}
.expense-brand small {
  display: block;
  color: var(--text-secondary);
  font-size: 11px;
}
.expense-brandbar h2 {
  color: var(--color-primary);
  font-size: 18px;
}
.expense-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.expense-body {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 20px;
  border: 0;
  margin: 0;
  padding: 20px 16px;
  min-width: 0;
}
.expense-sidebar {
  padding-top: 10px;
}
.expense-illustration {
  display: block;
  width: 100%;
  padding: 10px;
  color: var(--color-primary);
  background: var(--surface-page);
  border-radius: var(--radius-md);
}
.expense-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 9px;
}
.expense-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.expense-field > span,
.expense-head > label {
  flex: 0 0 100px;
  text-align: right;
  font-weight: 600;
}
.expense-field :is(input, select, textarea) {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  min-height: 27px;
}
.expense-field input:read-only {
  background: var(--surface-page);
  color: var(--text-secondary);
}
.expense-field b {
  color: var(--color-danger);
}
.expense-field :is(input, select, textarea):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.expense-head button {
  flex: 0 0 30px;
}
.expense-date input {
  flex: 0 1 230px;
}
.expense-remarks {
  align-items: start;
}
.expense-remarks > span {
  padding-top: 5px;
}
.workspace-body .compact-workspace.compact-workspace .expense-entry .expense-remarks textarea {
  height: 70px;
  min-height: 70px;
  resize: none;
}
.expense-status {
  margin-left: 108px;
  font-size: 11px;
  color: var(--text-secondary);
}
.expense-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-page);
}
.expense-actions :deep(button) {
  min-height: 32px;
  height: auto;
  padding: 5px 10px;
  font-size: 12px;
}
@media (max-width: 760px) {
  .expense-body {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 10px;
    padding: 14px 10px;
  }
  .expense-field > span,
  .expense-head > label {
    flex-basis: 85px;
  }
  .expense-brand strong {
    font-size: 18px;
  }
}
@media (max-width: 560px) {
  .expense-sidebar {
    display: none;
  }
  .expense-body {
    grid-template-columns: 1fr;
  }
  .expense-brandbar h2 {
    font-size: 14px;
  }
}
@media (max-height: 650px) {
  .expense-brandbar {
    padding: 7px 14px;
  }
  .expense-body {
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .expense-fields {
    gap: 6px;
  }
  .expense-actions {
    padding: 7px 12px;
  }
}
</style>
