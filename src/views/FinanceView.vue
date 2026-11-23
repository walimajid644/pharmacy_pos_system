<script setup lang="ts">
import { ref, watch } from 'vue';
import ExpenseEntryForm from '@/components/finance/ExpenseEntryForm.vue';
import ReceiptEntryForm from '@/components/finance/ReceiptEntryForm.vue';
import { useToast } from '@/composables/useToast';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import CompactPages from '@/components/ui/CompactPages.vue';
import { bindTemplateRef } from '@/lib/templateRefs';
import SupplierLedgerView from './SupplierLedgerView.vue';
import { useFinance } from '@/composables/useFinance';

const {
  label,
  formatCurrency,
  pick,
  expense,
  customers,
  expenseHeads,
  bankAccounts,
  busy,
  loading,
  error,
  supplierMode,
  today,
  form,
  query,
  from,
  to,
  selected,
  reason,
  printing,
  voidDialog,
  voidError,
  closedCash,
  visible,
  total,
  load,
  save,
  voidEntry,
  printEntry,
} = useFinance();
const bindvoidDialog = bindTemplateRef(voidDialog);
const receiptHistory = ref(false);
const expenseHistory = ref(false);
watch(expense, () => {
  expenseHistory.value = false;
});
const toast = useToast();
async function saveReceipt(details: { invoice: string; cheque: string }) {
  if (busy.value) return;
  const remarks = form.value.description;
  form.value.description =
    [
      details.invoice ? `Invoice: ${details.invoice}` : '',
      details.cheque ? `Cheque / Draft: ${details.cheque}` : '',
      remarks.trim(),
    ]
      .filter(Boolean)
      .join(' · ') || 'Customer balance receipt';
  if (new TextEncoder().encode(form.value.description).length > 500) {
    form.value.description = remarks;
    toast.error('Receipt details are too long; shorten the remarks');
    return;
  }
  const number = await save();
  if (!number) form.value.description = remarks;
  return number;
}
</script>
<template>
  <div
    class="tool-terminal compact-workspace finance-terminal"
    :class="{
      'receipt-workspace': !expense && !receiptHistory && !supplierMode,
      'supplier-payment-workspace': supplierMode && !expense,
      'expense-workspace': expense && !expenseHistory,
    }"
  >
    <header class="tool-header">
      <div>
        <h1>{{ expense ? label('Expenses') : label('Payments & Receipts') }}</h1>
        <p>
          {{
            expense
              ? 'Record business spending and track cash outflows'
              : 'Record customer receipts and review payment history'
          }}
        </p>
      </div>
      <button :disabled="loading" @click="load">{{ label('Refresh') }}</button>
    </header>
    <div v-if="!expense" class="commercial-tabs">
      <button
        :aria-pressed="!supplierMode && !receiptHistory"
        :disabled="busy"
        @click="
          supplierMode = false;
          receiptHistory = false;
        "
      >
        {{ pick('Receipt', 'رسید') }}</button><button
        :aria-pressed="!supplierMode && receiptHistory"
        :disabled="busy"
        @click="
          supplierMode = false;
          receiptHistory = true;
          load();
        "
      >
        {{ label('Receipts & history') }}</button
      ><button :aria-pressed="supplierMode" :disabled="busy" @click="supplierMode = true">
        {{ label('Pay supplier') }}
      </button>
    </div>
    <div v-if="expense" class="commercial-tabs">
      <button
        type="button"
        :disabled="busy"
        :aria-pressed="!expenseHistory"
        @click="expenseHistory = false"
      >
        {{ pick('Expense Details', 'اخراجات کی تفصیل') }}
      </button>
      <button
        type="button"
        :disabled="busy"
        :aria-pressed="expenseHistory"
        @click="
          expenseHistory = true;
          load();
        "
      >
        {{ pick('Expense history', 'اخراجات کی تاریخ') }}
      </button>
    </div>
    <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
    <ReceiptEntryForm
      v-if="!expense"
      v-show="!supplierMode && !receiptHistory"
      v-model="form"
      :customers="customers"
      :bank-accounts="bankAccounts"
      :busy="busy"
      :loading="loading"
      :today="today()"
      :save="saveReceipt"
      @history="receiptHistory = true"
    />
    <ExpenseEntryForm
      v-if="expense"
      v-show="!expenseHistory"
      v-model="form"
      :expense-heads="expenseHeads"
      :bank-accounts="bankAccounts"
      :busy="busy"
      :loading="loading"
      :today="today()"
      :save="save"
      @history="expenseHistory = true"
    />
    <SupplierLedgerView v-if="supplierMode && !expense" payment-entry />
    <div
      v-else-if="expense ? expenseHistory : receiptHistory"
      class="commercial-split"
      :class="{ 'receipt-history': !expense, 'expense-history': expense }"
    >
      <section class="commercial-main">
        <div class="commercial-filters">
          <input
            v-model="query"
            type="search"
            :placeholder="label('Search number, party, category or reference')"
            aria-label="Search entries"
          /><label>{{ label('From') }}<input v-model="from" type="date" /></label
          ><label>{{ label('To') }}<input v-model="to" type="date" /></label
          ><button
            @click="
              query = '';
              from = '';
              to = '';
            "
          >
            {{ label('Clear') }}
          </button>
        </div>
        <div class="paged-table-host commercial-table-scroll">
          <p v-if="loading" role="status">{{ uiLabel('Loading entries…') }}</p>
          <CompactPages
            v-else
            :items="visible"
            :row-height="56"
            :header-height="36"
            v-slot="{ rows: pageRows }"
          >
            <table>
              <thead>
                <tr>
                  <th>{{ label('Voucher / date') }}</th>
                  <th>{{ label('Party / description') }}</th>
                  <th>{{ label('Type') }}</th>
                  <th>{{ label('Method') }}</th>
                  <th>{{ label('Amount') }}</th>
                  <th>{{ label('Status') }}</th>
                  <th>{{ label('Actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ item: e } in pageRows" :key="e.kind + e.id">
                  <td>
                    {{ e.number }}<small>{{ e.entry_date.slice(0, 10) }}</small>
                  </td>
                  <td>
                    {{ e.party
                    }}<small>{{ e.category }} · {{ e.description }} {{ e.reference }}</small
                    ><small v-if="e.void_reason"
                      >{{ uiLabel('Voided:') }} {{ e.void_reason }}</small
                    >
                  </td>
                  <td>{{ e.kind }}</td>
                  <td>{{ e.method }}</td>
                  <td>{{ formatCurrency(e.amount_cents / 100) }}</td>
                  <td>{{ e.status }}</td>
                  <td>
                    <button @click="printEntry(e)">{{ label('Print') }}</button>
                    <button
                      v-if="['receipt', 'expense'].includes(e.kind) && e.status === 'posted'"
                      @click="
                        selected = e;
                        reason = '';
                        voidError = '';
                      "
                    >
                      {{ label('Void') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!visible.length">
                  <td colspan="7" class="commercial-empty">
                    {{ label('No entries match these filters.') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </CompactPages>
        </div>
        <footer class="tool-summary">
          <div>
            <small>{{ label('Entries shown') }}</small><strong>{{ visible.length }}</strong>
          </div>
          <div v-if="!expense">
            <small>{{ label('Receipts / sales') }}</small><strong>{{
              formatCurrency(total('in'))
            }}</strong>
          </div>
          <div>
            <small>{{
              expense ? label('Expenses') : 'Payments / expenses / refunds'
            }}</small><strong>{{ formatCurrency(total('out')) }}</strong>
          </div>
        </footer>
      </section>
    </div>
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @pointerdown.self.prevent
    >
      <form
        :ref="bindvoidDialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="pick('Void entry', 'اندراج منسوخ کریں')"
        class="commercial-dialog"
        @submit.prevent="voidEntry"
      >
        <h2>{{ uiLabel('Void') }} {{ selected.number }}</h2>
        <p>
          {{
            uiLabel(
              'This preserves the original entry and reverses its balance effect. Cash entries can only be voided while their drawer is open.',
            )
          }}
        </p>
        <p v-if="closedCash" role="alert" class="commercial-error">
          {{
            pick(
              'This cash voucher belongs to a closed drawer and cannot be voided. Keep the voucher and ask a manager or accountant to reconcile a correction in the current period.',
              'اس نقد واؤچر کی کیش شفٹ بند ہو چکی ہے۔ اسے منسوخ نہیں کیا جا سکتا۔ واؤچر محفوظ رکھیں اور موجودہ مدت میں درستگی کے لیے منیجر یا اکاؤنٹنٹ سے رابطہ کریں۔',
            )
          }}
        </p>
        <p v-if="voidError" role="alert" class="commercial-error">{{ voidError }}</p>
        <label>{{ label('Reason') }}<textarea v-model="reason" required maxlength="500" /></label>
        <div>
          <button type="button" :disabled="busy" @click="selected = null">
            {{ label('Cancel') }}
          </button>
          <button :disabled="busy || closedCash" class="bg-destructive">
            {{ label('Confirm void') }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <Teleport to="body"
    ><section v-if="printing" class="commercial-print">
      <h1>{{ expense ? 'Expense voucher' : 'Payment / receipt voucher' }}</h1>
      <h2>{{ printing.number }}</h2>
      <p>{{ printing.entry_date }} · {{ printing.status }}</p>
      <p>{{ printing.party }}</p>
      <p>{{ printing.description }}</p>
      <p>{{ printing.method }} · {{ printing.reference }}</p>
      <h2>{{ formatCurrency(printing.amount_cents / 100) }}</h2>
      <p v-if="printing.void_reason">{{ uiLabel('VOID:') }} {{ printing.void_reason }}</p>
    </section></Teleport
  >
</template>

<style scoped>
.receipt-workspace > .tool-header,
.supplier-payment-workspace > .tool-header,
.expense-workspace > .tool-header {
  display: none;
}
.workspace-body .tool-terminal.compact-workspace > .receipt-entry,
.workspace-body .tool-terminal.compact-workspace > .expense-entry {
  margin: auto;
}

.workspace-body .tool-terminal.compact-workspace .commercial-split.receipt-history,
.workspace-body .tool-terminal.compact-workspace .commercial-split.expense-history {
  grid-template-columns: minmax(0, 1fr);
}
</style>
