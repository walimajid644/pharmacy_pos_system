<script setup lang="ts">
import { ref } from 'vue';
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
  aging,
  load,
  save,
  printVoucher,
} = useSupplierLedger();
const ledgerTab = ref<'balances' | 'payment' | 'vouchers'>('balances');
</script>

<template>
  <div class="tool-terminal compact-workspace ledger-page">
    <header class="tool-header">
      <h2>{{ pick('Supplier Ledger', 'سپلائر کھاتہ') }}</h2>
      <button type="button" @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button>
    </header>
    <p>
      {{
        pick(
          'Balances use goods actually received. Due dates use supplier payment terms.',
          'بقایا صرف موصولہ مال پر مبنی ہے۔ ادائیگی کی تاریخ سپلائر کی مدت سے بنتی ہے۔',
        )
      }}
    </p>
    <p v-if="error" role="alert" class="ledger-error">{{ error }}</p>
    <div v-if="loading">{{ pick('Loading ledger…', 'کھاتہ لوڈ ہو رہا ہے…') }}</div>
    <template v-else>
      <div class="ledger-summary">
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
      <label
        >{{ pick('Supplier', 'سپلائر') }}
        <select v-model="supplierFilter">
          <option value="">{{ pick('All suppliers', 'تمام سپلائرز') }}</option>
          <option v-for="[id, name] in suppliers" :key="id" :value="id">{{ name }}</option>
        </select></label
      >
      <nav class="commercial-tabs" :aria-label="pick('Ledger sections', 'کھاتے کے حصے')">
        <button
          type="button"
          :aria-pressed="ledgerTab === 'balances'"
          @click="ledgerTab = 'balances'"
        >
          {{ pick('Balances', 'بقایا') }}
        </button>
        <button
          type="button"
          :aria-pressed="ledgerTab === 'payment'"
          @click="ledgerTab = 'payment'"
        >
          {{ pick('Record payment', 'ادائیگی درج کریں') }}
        </button>
        <button
          type="button"
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
                <th>{{ pick('Received value', 'موصولہ مالیت') }}</th>
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
                <td>{{ daysOverdue(row) }}</td>
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
      <form v-show="ledgerTab === 'payment'" class="ledger-form" @submit.prevent="save">
        <h3>{{ pick('Record payment', 'ادائیگی درج کریں') }}</h3>
        <label
          >{{ pick('Purchase order', 'خریداری آرڈر') }}
          <select v-model="selectedPo" required>
            <option value="" disabled>{{ pick('Select order', 'آرڈر منتخب کریں') }}</option>
            <option
              v-for="row in visibleRows.filter((item) => balanceCents(item) > 0)"
              :key="row.id"
              :value="row.id"
            >
              {{ row.supplier_name }} · {{ row.po_number }} ·
              {{ formatCurrency(balanceCents(row) / 100) }}
            </option>
          </select></label
        >
        <label
          >{{ pick('Amount (Rs)', 'رقم (روپے)') }}
          <input v-model.number="amount" type="number" min="0.01" step="0.01" required
        /></label>
        <label
          >{{ pick('Method', 'طریقہ') }}
          <select v-model="method">
            <option value="cash">{{ pick('Cash', 'نقد') }}</option>
            <option value="bank">{{ pick('Bank', 'بینک') }}</option>
            <option value="mobile">{{ pick('Mobile transfer', 'موبائل ٹرانسفر') }}</option>
          </select></label
        >
        <label
          >{{ pick('Reference', 'حوالہ') }} <input v-model="reference" maxlength="100"
        /></label>
        <label>{{ pick('Notes', 'نوٹس') }} <input v-model="notes" maxlength="500" /></label>
        <button type="submit" :disabled="saving">
          {{
            saving
              ? pick('Saving…', 'محفوظ ہو رہا ہے…')
              : pick('Save payment', 'ادائیگی محفوظ کریں')
          }}
        </button>
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
