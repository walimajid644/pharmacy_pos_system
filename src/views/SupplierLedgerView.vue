<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { executeQuery } from '@/lib/database'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'

type LedgerRow = { id: string; po_number: string; supplier_name: string; supplier_id: string; order_date: string; received_date: string | null; payment_terms: number; status: string; total_amount: number; ordered_value: number; received_value: number; paid_cents: number }
type Payment = { id: string; voucher_number: string; po_id: string; supplier_name: string; amount_cents: number; method: string; reference: string | null; paid_at: string }
type Receipt = { voucherNumber: string; amountCents: number; balanceCents: number }
const { pick, formatCurrency } = useI18n()
const toast = useToast()
const rows = ref<LedgerRow[]>([])
const payments = ref<Payment[]>([])
const loading = ref(false)
const saving = ref(false)
const selectedPo = ref('')
const amount = ref<number | null>(null)
const method = ref('cash')
const reference = ref('')
const notes = ref('')
const error = ref('')
const supplierFilter = ref('')
const printPayment = ref<Payment | null>(null)

function accruedCents(row: LedgerRow) {
  return Math.round(row.total_amount * 100 * (row.ordered_value > 0 ? Math.min(1, row.received_value / row.ordered_value) : 0))
}
function balanceCents(row: LedgerRow) { return Math.max(0, accruedCents(row) - row.paid_cents) }
function daysOverdue(row: LedgerRow) {
  const base = new Date(`${(row.received_date || row.order_date).slice(0, 10)}T00:00:00`)
  const due = new Date(base)
  due.setDate(due.getDate() + Number(row.payment_terms || 0))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
}
const visibleRows = computed(() => rows.value.filter(row => !supplierFilter.value || row.supplier_id === supplierFilter.value))
const suppliers = computed(() => [...new Map(rows.value.map(row => [row.supplier_id, row.supplier_name])).entries()])
const outstanding = computed(() => visibleRows.value.reduce((sum, row) => sum + balanceCents(row), 0))
const aging = computed(() => {
  const buckets = [0, 0, 0, 0, 0]
  for (const row of visibleRows.value) {
    const days = daysOverdue(row)
    buckets[days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4] += balanceCents(row)
  }
  return buckets
})

async function load() {
  loading.value = true; error.value = ''
  try {
    rows.value = await executeQuery<LedgerRow>(`SELECT po.id, po.po_number, po.supplier_id, s.name AS supplier_name, po.order_date, po.received_date, s.payment_terms, po.status, po.total_amount,
      COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS ordered_value,
      COALESCE((SELECT SUM(CASE WHEN i.quantity_ordered > 0 THEN i.line_total * i.quantity_received / i.quantity_ordered ELSE 0 END) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS received_value,
      COALESCE((SELECT SUM(p.amount_cents) FROM supplier_payments p WHERE p.po_id = po.id), 0) AS paid_cents
      FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.status IN ('partial', 'received') ORDER BY po.order_date DESC`)
    payments.value = await executeQuery<Payment>(`SELECT p.*, s.name AS supplier_name FROM supplier_payments p JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.paid_at DESC LIMIT 100`)
  } catch (e) { error.value = String(e); toast.error(error.value) }
  finally { loading.value = false }
}

async function save() {
  if (saving.value) return
  const row = rows.value.find(item => item.id === selectedPo.value)
  const cents = Math.round(Number(amount.value) * 100)
  if (!row || !Number.isFinite(cents) || cents <= 0) {
    error.value = pick('Choose a received order and an amount within its unpaid balance.', 'موصولہ آرڈر اور بقایا رقم کے اندر ادائیگی منتخب کریں۔')
    return
  }
  if (cents > balanceCents(row)) { error.value = pick(`Attempted ${formatCurrency(cents/100)}; outstanding ${formatCurrency(balanceCents(row)/100)}. Overpayment is not allowed. Reduce the amount or receive the remaining goods first.`, `ادائیگی ${formatCurrency(cents/100)}؛ بقایا ${formatCurrency(balanceCents(row)/100)}۔ بقایا سے زائد ادائیگی نہیں ہو سکتی۔ رقم کم کریں یا باقی مال وصول کریں۔`); return }
  saving.value = true; error.value = ''
  try {
    const result = await invoke<Receipt>('record_supplier_payment', { request: { poId: row.id, amountCents: cents, method: method.value, reference: reference.value, notes: notes.value } })
    toast.success(`${pick('Payment recorded', 'ادائیگی درج ہوئی')}: ${result.voucherNumber}`)
    amount.value = null; reference.value = ''; notes.value = ''
    await load()
  } catch (e) { error.value = String(e); toast.error(error.value) }
  finally { saving.value = false }
}

function printVoucher(payment: Payment) {
  printPayment.value = payment
  setTimeout(() => {
    document.body.classList.add('printing-supplier-voucher')
    const cleanup = () => { document.body.classList.remove('printing-supplier-voucher'); printPayment.value = null }
    window.addEventListener('afterprint', cleanup, { once: true })
    try { window.print() } catch { cleanup() }
  }, 0)
}
onMounted(load)
</script>

<template>
  <div class="tool-terminal ledger-page">
    <header class="tool-header "><h2>{{ pick('Supplier Ledger', 'سپلائر کھاتہ') }}</h2><button type="button" @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button></header>
    <p>{{ pick('Balances use goods actually received. Due dates use supplier payment terms.', 'بقایا صرف موصولہ مال پر مبنی ہے۔ ادائیگی کی تاریخ سپلائر کی مدت سے بنتی ہے۔') }}</p>
    <p v-if="error" role="alert" class="ledger-error">{{ error }}</p>
    <div v-if="loading">{{ pick('Loading ledger…', 'کھاتہ لوڈ ہو رہا ہے…') }}</div>
    <template v-else>
      <div class="ledger-summary">
        <div><small>{{ pick('Outstanding', 'کل بقایا') }}</small><strong>{{ formatCurrency(outstanding / 100) }}</strong></div>
        <div v-for="(value, index) in aging" :key="index"><small>{{ [pick('Not overdue', 'ابھی واجب نہیں'), '1–30', '31–60', '61–90', '90+'][index] }}</small><strong>{{ formatCurrency(value / 100) }}</strong></div>
      </div>
      <label>{{ pick('Supplier', 'سپلائر') }} <select v-model="supplierFilter"><option value="">{{ pick('All suppliers', 'تمام سپلائرز') }}</option><option v-for="[id, name] in suppliers" :key="id" :value="id">{{ name }}</option></select></label>
      <div class="ledger-table-wrap"><table><thead><tr><th>{{ pick('Supplier / PO', 'سپلائر / آرڈر') }}</th><th>{{ pick('Received value', 'موصولہ مالیت') }}</th><th>{{ pick('Paid', 'ادا شدہ') }}</th><th>{{ pick('Balance', 'بقایا') }}</th><th>{{ pick('Days overdue', 'تاخیر کے دن') }}</th></tr></thead><tbody>
        <tr v-for="row in visibleRows" :key="row.id"><td>{{ row.supplier_name }}<small>{{ row.po_number }} · {{ row.status }}</small></td><td>{{ formatCurrency(accruedCents(row) / 100) }}</td><td>{{ formatCurrency(row.paid_cents / 100) }}</td><td><strong>{{ formatCurrency(balanceCents(row) / 100) }}</strong></td><td>{{ daysOverdue(row) }}</td></tr>
        <tr v-if="!visibleRows.length"><td colspan="5">{{ pick('No received purchase orders', 'ابھی کوئی موصولہ آرڈر نہیں') }}</td></tr>
      </tbody></table></div>
      <form class="ledger-form" @submit.prevent="save"><h3>{{ pick('Record payment', 'ادائیگی درج کریں') }}</h3>
        <label>{{ pick('Purchase order', 'خریداری آرڈر') }} <select v-model="selectedPo" required><option value="" disabled>{{ pick('Select order', 'آرڈر منتخب کریں') }}</option><option v-for="row in visibleRows.filter(item => balanceCents(item) > 0)" :key="row.id" :value="row.id">{{ row.supplier_name }} · {{ row.po_number }} · {{ formatCurrency(balanceCents(row) / 100) }}</option></select></label>
        <label>{{ pick('Amount (Rs)', 'رقم (روپے)') }} <input v-model.number="amount" type="number" min="0.01" step="0.01" required /></label>
        <label>{{ pick('Method', 'طریقہ') }} <select v-model="method"><option value="cash">{{ pick('Cash', 'نقد') }}</option><option value="bank">{{ pick('Bank', 'بینک') }}</option><option value="mobile">{{ pick('Mobile transfer', 'موبائل ٹرانسفر') }}</option></select></label>
        <label>{{ pick('Reference', 'حوالہ') }} <input v-model="reference" maxlength="100" /></label>
        <label>{{ pick('Notes', 'نوٹس') }} <input v-model="notes" maxlength="500" /></label>
        <button type="submit" :disabled="saving">{{ saving ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save payment', 'ادائیگی محفوظ کریں') }}</button>
      </form>
      <h3>{{ pick('Recent payment vouchers', 'حالیہ ادائیگی واؤچر') }}</h3>
      <div class="ledger-table-wrap"><table><thead><tr><th>{{ pick('Voucher', 'واؤچر') }}</th><th>{{ pick('Supplier', 'سپلائر') }}</th><th>{{ pick('Date', 'تاریخ') }}</th><th>{{ pick('Amount', 'رقم') }}</th><th></th></tr></thead><tbody><tr v-for="payment in payments" :key="payment.id"><td>{{ payment.voucher_number }}</td><td>{{ payment.supplier_name }}</td><td>{{ payment.paid_at.slice(0, 10) }}</td><td>{{ formatCurrency(payment.amount_cents / 100) }}</td><td><button type="button" @click="printVoucher(payment)">{{ pick('Print', 'پرنٹ') }}</button></td></tr><tr v-if="!payments.length"><td colspan="5">{{ pick('No payments yet', 'ابھی کوئی ادائیگی نہیں') }}</td></tr></tbody></table></div>
    </template>
  </div>
  <Teleport to="body"><section v-if="printPayment" class="supplier-voucher"><h1>{{ pick('Supplier Payment Voucher', 'سپلائر ادائیگی واؤچر') }}</h1><p>{{ printPayment.voucher_number }}</p><p>{{ printPayment.supplier_name }}</p><p>{{ printPayment.paid_at }}</p><p>{{ pick('Amount', 'رقم') }}: {{ formatCurrency(printPayment.amount_cents / 100) }}</p><p>{{ pick('Method', 'طریقہ') }}: {{ printPayment.method }}</p><p v-if="printPayment.reference">{{ pick('Reference', 'حوالہ') }}: {{ printPayment.reference }}</p></section></Teleport>
</template>

<style scoped>
.ledger-page{padding:2rem;max-width:1400px;margin:auto;color:var(--color-text-primary)}header{display:flex;align-items:center;justify-content:space-between}.ledger-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.75rem;margin:1.5rem 0}.ledger-summary>div,.ledger-form{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius);padding:1rem}.ledger-summary small,.ledger-summary strong{display:block}.ledger-summary strong{font-size:1.3rem;margin-top:.4rem}.ledger-table-wrap{overflow:auto;margin:1rem 0 2rem}table{width:100%;border-collapse:collapse;background:var(--color-surface)}th,td{padding:.8rem;border-bottom:1px solid var(--color-border);text-align:start;white-space:nowrap}td small{display:block;color:var(--color-text-secondary)}.ledger-form{display:flex;flex-wrap:wrap;align-items:end;gap:1rem;margin-bottom:2rem}.ledger-form h3{width:100%;margin:0}.ledger-form label{display:grid;gap:.3rem}input,select,button{padding:.55rem;border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);color:var(--color-text-primary)}button{cursor:pointer}button[type=submit]{background:var(--color-primary);color:white}.ledger-error{color:var(--color-danger)}@media(max-width:1100px){.ledger-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
<style>.supplier-voucher{display:none}@media print{body.printing-supplier-voucher>*:not(.supplier-voucher){display:none!important}body.printing-supplier-voucher>.supplier-voucher{display:block!important;color:#000;background:#fff;padding:1cm;font-family:Arial,sans-serif}}</style>
