<script setup lang="ts">
import { useCustomerLedger } from '@/composables/useCustomerLedger';

const {
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
} = useCustomerLedger();
</script>
<template>
  <div class="tool-terminal documents-terminal">
    <header class="tool-header">
      <div>
        <h1>{{ pick('Customer Credit / Udhar Ledger', 'گاہک کا کریڈٹ / ادھار کھاتہ') }}</h1>
        <p>
          {{
            pick(
              'Saved debits, collections, credit notes and current aging',
              'محفوظ ادھار، وصولیاں، کریڈٹ نوٹ اور موجودہ مدت وار بقایا',
            )
          }}
        </p>
      </div>
      <button :disabled="!statement || busy" @click="print">
        {{ pick('Print statement', 'کھاتہ پرنٹ کریں') }}
      </button>
    </header>
    <form class="commercial-filters" @submit.prevent="load">
      <label
        >{{ pick('Customer', 'گاہک')
        }}<select v-model="customerId" required>
          <option value="">{{ pick('Choose customer', 'گاہک منتخب کریں') }}</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.first_name }} {{ c.last_name }} · {{ c.customer_code }}
          </option>
        </select></label
      ><label>{{ pick('From', 'سے') }}<input v-model="from" type="date" /></label
      ><label>{{ pick('To', 'تک') }}<input v-model="to" type="date" :min="from" /></label
      ><button :disabled="busy">{{ pick('Load statement', 'کھاتہ دکھائیں') }}</button
      ><button
        v-if="auth.hasRole(['admin', 'manager', 'accountant'])"
        type="button"
        :disabled="!statement || busy || statement.customer.current_balance <= 0"
        :title="
          statement && statement.customer.current_balance <= 0
            ? pick('No outstanding debt to collect', 'وصولی کے لیے کوئی بقایا نہیں')
            : ''
        "
        @click="router.push({ path: '/payments', query: { customer: statement?.customer.id } })"
      >
        {{ pick('Collect payment', 'وصولی کریں') }}
      </button>
    </form>
    <p v-if="error" role="alert" class="commercial-error">{{ error }}</p>
    <p v-if="busy" role="status" class="commercial-hint">
      {{ pick('Loading customer statement…', 'گاہک کا کھاتہ لوڈ ہو رہا ہے…') }}
    </p>
    <section v-if="statement" class="credit-aging">
      <div>
        <small>{{ pick('Current balance', 'موجودہ بقایا') }}</small><strong>{{
          formatCurrency(statement.customer.current_balance)
        }}</strong>
      </div>
      <div>
        <small>{{ pick('Credit limit', 'کریڈٹ حد') }}</small><strong>{{
          formatCurrency(statement.customer.credit_limit)
        }}</strong>
      </div>
      <div>
        <small>0–29 {{ pick('days', 'دن') }}</small
        ><strong>{{ formatCurrency(statement.aging.current / 100) }}</strong>
      </div>
      <div>
        <small>30–59 {{ pick('days', 'دن') }}</small
        ><strong>{{ formatCurrency(statement.aging.days30 / 100) }}</strong>
      </div>
      <div>
        <small>60–89 {{ pick('days', 'دن') }}</small
        ><strong>{{ formatCurrency(statement.aging.days60 / 100) }}</strong>
      </div>
      <div>
        <small>90+ {{ pick('days', 'دن') }}</small
        ><strong>{{ formatCurrency(statement.aging.days90 / 100) }}</strong>
      </div>
      <div>
        <small>{{ pick('Opening / age unknown', 'ابتدائی / مدت نامعلوم') }}</small><strong>{{
          formatCurrency(statement.aging.unknown / 100)
        }}</strong>
      </div>
      <div>
        <small>{{ pick('Customer credit', 'گاہک کا کریڈٹ') }}</small><strong>{{
          formatCurrency(statement.aging.credit / 100)
        }}</strong>
      </div>
    </section>
    <p class="commercial-hint">
      {{
        pick(
          'Aging is current and applies active collections/credits to oldest debt first. Imported opening balances have unknown age. Statement date filters do not change current aging.',
          'مدت وار بقایا موجودہ ہے؛ وصولیاں اور کریڈٹ پہلے پرانے بقایا پر لاگو ہوتے ہیں۔ ابتدائی بقایا کی مدت نامعلوم ہے۔ تاریخ کا فلٹر موجودہ مدت وار بقایا نہیں بدلتا۔',
        )
      }}
    </p>
    <div class="commercial-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ pick('Date / reference', 'تاریخ / حوالہ') }}</th>
            <th>{{ pick('Type / description', 'قسم / تفصیل') }}</th>
            <th>{{ pick('Debit', 'ادھار') }}</th>
            <th>{{ pick('Credit', 'وصولی') }}</th>
            <th>{{ pick('Balance', 'بقایا') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="statement">
            <td colspan="4">{{ pick('Balance brought forward', 'پچھلا بقایا') }}</td>
            <td>{{ formatCurrency(broughtForward / 100) }}</td>
          </tr>
          <tr v-for="e in rows" :key="e.id">
            <td>
              {{ formatDateTime(e.occurred_at) }}<small>{{ e.reference }}</small>
            </td>
            <td>
              {{ kind(e.kind) }}<small>{{ e.description }}</small>
            </td>
            <td>{{ e.amount_cents > 0 ? formatCurrency(e.amount_cents / 100) : '—' }}</td>
            <td>{{ e.amount_cents < 0 ? formatCurrency(-e.amount_cents / 100) : '—' }}</td>
            <td>{{ formatCurrency(e.balance / 100) }}</td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="5" class="commercial-empty">
              {{
                pick(
                  'No ledger entries for this selection.',
                  'اس انتخاب کے لیے کھاتے میں کوئی اندراج نہیں۔',
                )
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer class="tool-summary">
      <small>{{
        pick(
          'Positive balance is owed by the customer; negative balance is credit on their account.',
          'مثبت بقایا گاہک کے ذمے ہے؛ منفی بقایا گاہک کا کریڈٹ ہے۔',
        )
      }}</small>
    </footer>
  </div>
  <Teleport to="body"
    ><section v-if="printing && statement" class="credit-ledger-print">
      <h1>{{ pick('Customer statement', 'گاہک کا کھاتہ') }}</h1>
      <h2>
        {{ statement.customer.first_name }} {{ statement.customer.last_name }} ·
        {{ statement.customer.customer_code }}
      </h2>
      <p>{{ from || '—' }} — {{ to || '—' }}</p>
      <table>
        <thead>
          <tr>
            <th>{{ pick('Date', 'تاریخ') }}</th>
            <th>{{ pick('Reference / type', 'حوالہ / قسم') }}</th>
            <th>{{ pick('Movement', 'رقم') }}</th>
            <th>{{ pick('Balance', 'بقایا') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="3">{{ pick('Brought forward', 'پچھلا بقایا') }}</td>
            <td>{{ formatCurrency(broughtForward / 100) }}</td>
          </tr>
          <tr v-for="e in rows" :key="e.id">
            <td>{{ formatDateTime(e.occurred_at) }}</td>
            <td>{{ e.reference }} · {{ kind(e.kind) }}</td>
            <td>{{ formatCurrency(e.amount_cents / 100) }}</td>
            <td>{{ formatCurrency(e.balance / 100) }}</td>
          </tr>
        </tbody>
      </table>
      <p>
        {{ pick('Current account balance', 'موجودہ کھاتہ بقایا') }}:
        {{ formatCurrency(statement.customer.current_balance) }}
      </p>
      <p>
        {{
          pick(
            'Aging: 0–29 / 30–59 / 60–89 / 90+ days; opening age unknown',
            'مدت وار بقایا: ۰–۲۹ / ۳۰–۵۹ / ۶۰–۸۹ / ۹۰+ دن؛ ابتدائی مدت نامعلوم',
          )
        }}:
        {{
          [
            statement.aging.current,
            statement.aging.days30,
            statement.aging.days60,
            statement.aging.days90,
            statement.aging.unknown,
          ]
            .map((n) => formatCurrency(n / 100))
            .join(' / ')
        }}
      </p>
    </section></Teleport
  >
</template>
<style>
.credit-aging {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  padding: 0.65rem;
}
.credit-aging > div {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.credit-aging small,
.credit-aging strong {
  display: block;
}
.credit-aging small {
  font-size: 0.68rem;
  color: var(--color-text-secondary);
}
.credit-aging strong {
  font-size: 0.9rem;
}
.credit-ledger-print {
  display: none;
}
@media print {
  body.printing-ledger > *:not(.credit-ledger-print) {
    display: none !important;
  }
  body.printing-ledger > .credit-ledger-print {
    display: block !important;
    background: white;
    color: black;
    padding: 12mm;
    font: 10pt Arial;
  }
  .credit-ledger-print table {
    width: 100%;
    border-collapse: collapse;
    margin: 8mm 0;
  }
  .credit-ledger-print :is(td, th) {
    padding: 2mm;
    border-bottom: 1px solid #aaa;
    text-align: start;
  }
  .credit-ledger-print h1 {
    font-size: 18pt;
  }
}
</style>
