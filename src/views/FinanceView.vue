<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
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
  selectedCustomer,
  visible,
  total,
  load,
  save,
  voidEntry,
  printEntry,
} = useFinance();
const bindvoidDialog = bindTemplateRef(voidDialog);
</script>
<template>
  <div class="tool-terminal compact-workspace finance-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ expense ? label('Expenses') : label('Payments & Receipts') }}</h1>
        <p>
          {{
            expense
              ? 'Record business spending and track cash outflows'
              : 'Customer balance collections, supplier payments and sale receipts'
          }}
        </p>
      </div>
      <button :disabled="loading" @click="load">{{ label('Refresh') }}</button>
    </header>
    <div v-if="!expense" class="commercial-tabs">
      <button
        :aria-pressed="!supplierMode"
        @click="
          supplierMode = false;
          load();
        "
      >
        {{ label('Receipts & history') }}</button><button
        :aria-pressed="supplierMode"
        @click="supplierMode = true"
      >
        {{ label('Pay supplier') }}
      </button>
    </div>
    <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
    <SupplierLedgerView v-if="supplierMode && !expense" />
    <div v-else class="commercial-split">
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
      <aside class="commercial-dock">
        <h2>{{ expense ? label('Record expense') : label('Collect customer balance') }}</h2>
        <p class="commercial-hint">
          {{
            expense
              ? 'Cash expenses reduce the open drawer balance.'
              : 'Collections reduce an existing customer balance. Sale payments appear in history automatically.'
          }}
        </p>
        <form @submit.prevent="save">
          <label v-if="!expense"
            >{{ label('Customer')
            }}<select v-model="form.customerId" required>
              <option value="">{{ label('Select customer') }}</option>
              <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select></label
          >
          <p v-if="selectedCustomer && !expense">
            {{ uiLabel('Outstanding:') }}
            <strong>{{ formatCurrency(selectedCustomer.current_balance) }}</strong>
          </p>
          <label v-if="expense"
            >{{ label('Expense Head')
            }}<select v-model="form.category" required>
              <option value="" disabled>{{ label('Select expense head') }}</option>
              <option v-for="head in expenseHeads" :key="head.id" :value="head.name">
                {{ head.name }}
              </option>
            </select></label
          >
          <label
            >{{ label('Description')
            }}<input v-model="form.description" required maxlength="500" /></label
          ><label
            >{{ label('Amount (Rs)')
            }}<input v-model="form.amount" required type="number" min="0.01" step="0.01"
          /></label>
          <label
            >{{ label('Method')
            }}<select v-model="form.method">
              <option value="cash">{{ label('Cash drawer') }}</option>
              <option value="bank">{{ label('Bank') }}</option>
              <option value="mobile">{{ label('Mobile') }}</option>
            </select></label
          >
          <label v-if="form.method === 'bank'"
            >{{ pick('Bank account', 'بینک کھاتا')
            }}<select v-model="form.bankAccountId" required>
              <option value="" disabled>
                {{ pick('Select bank account', 'بینک کھاتا منتخب کریں') }}
              </option>
              <option v-for="bank in bankAccounts" :key="bank.id" :value="bank.id">
                {{ bank.name }}
              </option>
            </select></label
          >
          <label
            >{{ label('Date')
            }}<input v-model="form.entryDate" type="date" required :max="today()" /></label
          ><label>{{ label('Reference') }}<input v-model="form.reference" maxlength="100" /></label
          ><button
            class="bg-primary"
            :disabled="busy || !auth.can(expense ? 'finance.expenses' : 'finance.receipts')"
          >
            {{
              busy ? label('Saving…') : expense ? label('Save expense') : label('Record receipt')
            }}
          </button>
        </form>
      </aside>
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
