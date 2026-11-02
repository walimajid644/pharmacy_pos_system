<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/lib/i18n'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { RefundMethod, ReturnReason, SalesInvoice } from '@/lib/types'

type InvoiceLine = { id: string; product_id: string; batch_id: string; product_name: string; batch_number: string; quantity: number; line_total: number; already_returned: number; return_now: number; restock: boolean }
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const { pick, t, formatNumber } = useI18n()
const search = ref('')
const invoice = ref<SalesInvoice | null>(null)
const lines = ref<InvoiceLine[]>([])
const reason = ref<ReturnReason>('defective')
const method = ref<RefundMethod>('cash')
const notes = ref('')
const saving = ref(false)
const reasons: ReturnReason[] = ['defective', 'wrong_item', 'expired', 'customer_changed_mind', 'duplicate_purchase', 'other']
const subtotal = computed(() => lines.value.reduce((sum, line) => sum + Number(line.line_total) * Number(line.return_now || 0) / Number(line.quantity), 0))
const invoiceLineTotal = computed(() => lines.value.reduce((sum, line) => sum + Number(line.line_total), 0))
const priorSubtotal = computed(() => lines.value.reduce((sum, line) => sum + Number(line.line_total) * Number(line.already_returned) / Number(line.quantity), 0))
const roundMoney = (value: number) => Math.round(value * 100) / 100
const refund = computed(() => invoice.value && invoiceLineTotal.value > 0
  ? roundMoney((priorSubtotal.value + subtotal.value) * Number(invoice.value.net_amount) / invoiceLineTotal.value)
    - roundMoney(priorSubtotal.value * Number(invoice.value.net_amount) / invoiceLineTotal.value) : 0)

async function findInvoice() {
  invoice.value = null
  lines.value = []
  if (!search.value.trim()) return
  try {
    const [found] = await executeQuery<SalesInvoice>(
      `SELECT * FROM sales_invoices WHERE invoice_number = ? AND status = 'completed'`, [search.value.trim()]
    )
    if (!found) { toast.warning(pick('Completed invoice not found', 'مکمل انوائس نہیں ملی')); return }
    invoice.value = found
    method.value=found.payment_method==='credit'?'credit_note':'cash'
    lines.value = (await executeQuery<InvoiceLine>(
      `SELECT sii.id, sii.product_id, sii.batch_id, p.name AS product_name,
        pb.batch_number, sii.quantity, sii.line_total,
        COALESCE((SELECT SUM(prior.quantity_returned) FROM sales_return_items prior
          JOIN sales_returns sr ON sr.id = prior.return_id
          WHERE prior.invoice_item_id = sii.id AND sr.status != 'rejected'), 0) AS already_returned
       FROM sales_invoice_items sii JOIN products p ON p.id = sii.product_id
       JOIN product_batches pb ON pb.id = sii.batch_id WHERE sii.invoice_id = ?`, [found.id]
    )).map(line => ({ ...line, return_now: 0, restock: false }))
  } catch (error) { console.error(error); toast.error(pick('Could not load invoice', 'انوائس لوڈ نہیں ہو سکی')) }
}

async function save() {
  if (!invoice.value || !auth.currentUser) return
  const chosen = lines.value.filter(line => Number(line.return_now) > 0)
  if (!chosen.length || lines.value.some(line => !Number.isInteger(Number(line.return_now)) || Number(line.return_now) < 0 || Number(line.return_now) > Number(line.quantity) - Number(line.already_returned))) {
    toast.warning(pick('Choose whole quantities within the remaining sold amount', 'باقی فروخت شدہ تعداد کے اندر پوری تعداد منتخب کریں'))
    return
  }
  saving.value = true
  try {
    await invoke('submit_sales_return', { request: {
      userId: auth.currentUser.id,
      timestamp: new Date().toISOString(),
      invoiceId: invoice.value.id,
      reason: reason.value,
      notes: notes.value || null,
      refundMethod: method.value,
      items: chosen.map(line => ({ invoiceItemId: line.id, quantity: Number(line.return_now), restock: line.restock }))
    } })
    toast.success(pick('Return submitted for approval', 'واپسی منظوری کے لیے جمع ہو گئی'))
    router.push('/sales-returns')
  } catch (error) {
    console.error(error)
    toast.error(pick('Could not save return', 'واپسی محفوظ نہیں ہو سکی'))
  } finally { saving.value = false }
}
</script>

<template>
  <div class="tool-terminal max-w-5xl space-y-5 p-6"><header class="tool-header "><h2 class="text-2xl font-bold">{{ pick('New sales return', 'نئی فروخت واپسی') }}</h2><p class="text-muted-foreground">{{ pick('Find the original invoice and select returned quantities', 'اصل انوائس تلاش کریں اور واپس کی گئی تعداد منتخب کریں') }}</p></header>
    <div class="flex flex-wrap gap-3"><input v-model="search" class="rounded border bg-background p-2" :placeholder="pick('Invoice number', 'انوائس نمبر')" @keyup.enter="findInvoice" /><button class="rounded bg-primary px-4 py-2 text-primary-foreground" @click="findInvoice">{{ pick('Find invoice', 'انوائس تلاش کریں') }}</button></div>
    <form v-if="invoice" class="space-y-5 rounded-lg border bg-card p-5" @submit.prevent="save"><p><strong>{{ invoice.invoice_number }}</strong> · {{ formatDate(invoice.invoice_date) }} · {{ pick('Paid', 'ادا شدہ') }} {{ formatCurrency(invoice.net_amount) }}</p>
      <div class="grid gap-4 sm:grid-cols-2"><label>{{ pick('Reason', 'وجہ') }}<select v-model="reason" class="block w-full rounded border bg-background p-2"><option v-for="item in reasons" :key="item" :value="item">{{ t(item) }}</option></select></label><label>{{ t('refund_method') }}<select v-model="method" :disabled="invoice?.payment_method==='credit'" class="block w-full rounded border bg-background p-2"><option value="cash">{{ t('cash') }}</option><option value="card">{{ t('card') }}</option><option value="credit_note" :disabled="!invoice?.customer_id">{{ t('credit_note') }}</option></select></label></div>
      <label class="block">{{ pick('Notes', 'نوٹس') }}<textarea v-model="notes" class="block w-full rounded border bg-background p-2" /></label>
      <p class="text-sm">{{ pick('Return quantities use individual units, including free units. Refunds spread the paid line value across all delivered units.', 'واپسی تعداد انفرادی اکائیوں میں ہے، مفت اکائیوں سمیت۔ ادا شدہ رقم تمام دی گئی اکائیوں پر تقسیم ہوتی ہے۔') }}</p>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr><th class="p-2">{{ pick('Product', 'مصنوعات') }}</th><th class="p-2">{{ pick('Batch', 'بیچ') }}</th><th class="p-2">{{ pick('Available to return', 'واپسی کے لیے دستیاب') }}</th><th class="p-2">{{ pick('Return now', 'ابھی واپس کریں') }}</th><th class="p-2">{{ t('restock') }}</th></tr></thead><tbody><tr v-for="line in lines" :key="line.id" class="border-t"><td class="p-2">{{ line.product_name }}</td><td class="p-2"><bdi>{{ line.batch_number }}</bdi></td><td class="p-2">{{ formatNumber(Number(line.quantity) - Number(line.already_returned)) }}</td><td class="p-2"><input v-model.number="line.return_now" type="number" min="0" :max="Number(line.quantity) - Number(line.already_returned)" step="1" class="w-24 rounded border bg-background p-2" /></td><td class="p-2"><input v-model="line.restock" type="checkbox" /></td></tr></tbody></table></div>
      <p class="font-semibold">{{ pick('Estimated refund', 'متوقع واپسی رقم') }}: {{ formatCurrency(refund) }}</p><p class="text-sm text-muted-foreground">{{ pick("The refund includes a proportional share of the invoice's tax and discount. Confirm the amount before approval.", 'واپسی رقم میں انوائس کے ٹیکس اور رعایت کا متناسب حصہ شامل ہے۔ منظوری سے پہلے رقم کی تصدیق کریں۔') }}</p>
      <div class="flex gap-3"><button :disabled="saving" class="rounded bg-primary px-4 py-2 text-primary-foreground">{{ saving ? pick('Saving...', 'محفوظ ہو رہا ہے...') : pick('Submit for approval', 'منظوری کے لیے جمع کریں') }}</button><button type="button" class="rounded border px-4 py-2" @click="router.push('/sales-returns')">{{ t('cancel') }}</button></div>
    </form>
  </div>
</template>
