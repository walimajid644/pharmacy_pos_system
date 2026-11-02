<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRoute } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { executeQuery } from '@/lib/database'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { useToast } from '@/composables/useToast'
import type { Customer, AppSettings } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

interface SalesInvoice {
  id: string
  invoice_number: string
  customer_id: string | null
  cashier_id: string
  invoice_date: string
  total_amount: number
  tax_amount: number
  discount_amount: number
  net_amount: number
  payment_method: string
  status: string
  notes: string | null
  received_amount: number | null
  change_amount: number | null
  previous_balance: number | null
  created_at: string
  updated_at: string
  customer_name?: string
  customer_phone?: string | null
  patient_name?: string | null
  doctor_name?: string | null
  prescription_note?: string | null
  cashier_name?: string
}

interface InvoiceItem {
  id: string
  invoice_id: string
  product_id: string
  batch_id: string
  quantity: number
  sale_quantity: number | null
  bonus_quantity: number
  bonus_units: number
  cost_price: number | null
  is_loose_sale: boolean
  unit_price: number
  discount_percent: number
  line_total: number
  created_at: string
  product_name?: string
  batch_number?: string
  drap_registration_number?: string | null
  controlled_substance?: number
}

const toast = useToast()
const { pick, t, formatNumber } = useI18n()
const route = useRoute()
const invoices = ref<SalesInvoice[]>([])
const customers = ref<Customer[]>([])
const loading = ref(false)
const showDetailModal = ref(false)
const selectedInvoice = ref<SalesInvoice | null>(null)
const invoiceItems = ref<InvoiceItem[]>([])
const printMode = ref<'invoice' | 'receipt' | null>(null)
const digitalText = ref('')
function salePrice(item: InvoiceItem) {
  return item.sale_quantity ? item.unit_price * (item.quantity - (item.bonus_units || 0)) / item.sale_quantity : item.unit_price
}
const shop = ref<Pick<AppSettings, 'company_name' | 'company_address' | 'company_phone' | 'receipt_header' | 'receipt_footer' | 'show_drap'> | null>(null)

// Filters
const dateFrom = ref('')
const dateTo = ref('')
const searchQuery = ref('')
const selectedCustomer = ref('')
const selectedPaymentMethod = ref('')

const filteredInvoices = computed(() => {
  let filtered = invoices.value

  // Date range filter
  if (dateFrom.value) {
    filtered = filtered.filter(inv => inv.invoice_date >= dateFrom.value)
  }
  if (dateTo.value) {
    filtered = filtered.filter(inv => inv.invoice_date <= dateTo.value + 'T23:59:59')
  }

  // Search filter (invoice number or customer name)
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(inv =>
      inv.invoice_number.toLowerCase().includes(query) ||
      (inv.customer_name && inv.customer_name.toLowerCase().includes(query))
    )
  }

  // Customer filter
  if (selectedCustomer.value) {
    filtered = filtered.filter(inv => inv.customer_id === selectedCustomer.value)
  }

  // Payment method filter
  if (selectedPaymentMethod.value) {
    filtered = filtered.filter(inv => inv.payment_method === selectedPaymentMethod.value)
  }

  return filtered
})

const totalSales = computed(() => {
  return filteredInvoices.value.reduce((sum, inv) => sum + inv.net_amount, 0)
})

const totalInvoices = computed(() => filteredInvoices.value.length)

onMounted(async () => {
  // Set default date range (last 7 days)
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(today.getDate() - 7)
  
  dateTo.value = today.toISOString().split('T')[0]
  dateFrom.value = weekAgo.toISOString().split('T')[0]
  if (typeof route.query.invoice === 'string') {
    searchQuery.value = route.query.invoice
    dateFrom.value = ''
    dateTo.value = ''
  }

  await Promise.all([
    loadInvoices(),
    loadCustomers(),
    loadShop()
  ])
})

async function loadShop() {
  try {
    const rows = await executeQuery<AppSettings>('SELECT company_name, company_address, company_phone, receipt_header, receipt_footer, show_drap FROM app_settings LIMIT 1')
    shop.value = rows[0] || null
  } catch (error) {
    console.error('Error loading pharmacy details:', error)
  }
}

async function loadInvoices() {
  loading.value = true
  try {
    const data = await executeQuery<SalesInvoice>(
      `SELECT 
        si.*,
        COALESCE(si.customer_name_snapshot,c.first_name || ' ' || c.last_name, 'Walk-in') as customer_name,
        COALESCE(si.customer_phone_snapshot,c.phone_number) AS customer_phone,
        COALESCE(si.cashier_name_snapshot,u.full_name) as cashier_name
      FROM sales_invoices si
      LEFT JOIN customers c ON si.customer_id = c.id
      LEFT JOIN users u ON si.cashier_id = u.id
      ORDER BY si.invoice_date DESC, si.created_at DESC
      LIMIT 1000`
    )
    invoices.value = data
  } catch (error) {
    console.error('Error loading invoices:', error)
    toast.error('Failed to load sales history')
  } finally {
    loading.value = false
  }
}

async function loadCustomers() {
  try {
    customers.value = await executeQuery<Customer>(
      'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY first_name, last_name'
    )
  } catch (error) {
    console.error('Error loading customers:', error)
  }
}

async function viewInvoiceDetails(invoice: SalesInvoice) {
  selectedInvoice.value = invoice
  loading.value = true
  
  try {
    const items = await executeQuery<InvoiceItem>(
      `SELECT 
        sii.*,
        COALESCE(sii.product_name_snapshot,p.name) as product_name,
        sii.drap_snapshot AS drap_registration_number,
        sii.controlled_snapshot AS controlled_substance,
        COALESCE(sii.batch_number_snapshot,pb.batch_number) AS batch_number
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN product_batches pb ON sii.batch_id = pb.id
      WHERE sii.invoice_id = ?
      ORDER BY sii.created_at`,
      [invoice.id]
    )
    invoiceItems.value = items
    digitalText.value = buildDigitalText(invoice, items)
    showDetailModal.value = true
  } catch (error) {
    console.error('Error loading invoice items:', error)
    toast.error('Failed to load invoice details')
  } finally {
    loading.value = false
  }
}

function buildDigitalText(invoice: SalesInvoice, items: InvoiceItem[]) {
  const lines = [shop.value?.company_name || 'Pharmacy POS', `Invoice ${invoice.invoice_number}`, formatDateTime(invoice.invoice_date)]
  for (const item of items) lines.push(`${item.product_name} x${item.sale_quantity ?? item.quantity}${item.bonus_quantity ? ` + ${item.bonus_quantity} free` : ''}: ${formatCurrency(item.line_total)}`)
  lines.push(`${invoice.payment_method==='credit'?'Credit / Udhar total':'Total paid'}: ${formatCurrency(invoice.net_amount)}`)
  if (invoice.received_amount != null) lines.push(`Received: ${formatCurrency(invoice.received_amount)}`, `Change: ${formatCurrency(invoice.change_amount ?? 0)}`)
  if (invoice.notes) lines.push(`Remarks: ${invoice.notes}`)
  lines.push('Thank you for your purchase.')
  return lines.join('\n')
}

async function copySms() {
  if (!digitalText.value) return
  try { await navigator.clipboard.writeText(digitalText.value); toast.success(pick('Receipt text copied. Paste it into your SMS app.', 'رسید کا متن کاپی ہو گیا۔ اسے SMS ایپ میں پیسٹ کریں۔')) }
  catch { toast.error(pick('Copy failed. Select and copy the receipt text below.', 'کاپی نہیں ہوا۔ نیچے سے رسید کا متن منتخب کر کے کاپی کریں۔')) }
}

async function sendWhatsApp() {
  if (!selectedInvoice.value?.customer_phone) { toast.error(pick('Add a phone number to this customer first.', 'پہلے اس گاہک کا فون نمبر درج کریں۔')); return }
  try { await invoke('open_whatsapp_receipt', { phone: selectedInvoice.value.customer_phone, message: digitalText.value }) }
  catch (e) { toast.error(String(e)) }
}

function closeDetailModal() {
  showDetailModal.value = false
  selectedInvoice.value = null
  invoiceItems.value = []
}

function getPaymentMethodBadge(method: string) {
  const badges: Record<string, { label: string; class: string }> = {
    credit: { label: pick('Credit / Udhar','کریڈٹ / ادھار'), class: 'bg-purple-100 text-purple-800' },
    cash: { label: 'Cash', class: 'bg-green-100 text-green-800' },
    card: { label: 'Card', class: 'bg-blue-100 text-blue-800' },
    mobile: { label: 'Mobile', class: 'bg-purple-100 text-purple-800' },
  }
  return badges[method] || { label: method, class: 'bg-gray-100 text-gray-800' }
}

function clearFilters() {
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(today.getDate() - 7)
  
  dateTo.value = today.toISOString().split('T')[0]
  dateFrom.value = weekAgo.toISOString().split('T')[0]
  searchQuery.value = ''
  selectedCustomer.value = ''
  selectedPaymentMethod.value = ''
}

async function printInvoice(mode: 'invoice' | 'receipt') {
  if (!selectedInvoice.value || !invoiceItems.value.length) {
    toast.error('Open an invoice with items before printing')
    return
  }
  await loadShop()
  printMode.value = mode
  await nextTick()
  const pageStyle = document.createElement('style')
  pageStyle.textContent = mode === 'receipt'
    ? '@page { size: 80mm 297mm; margin: 3mm; }'
    : '@page { size: A4; margin: 12mm; }'
  document.head.appendChild(pageStyle)
  document.body.classList.add('printing-invoice')
  const cleanup = () => {
    pageStyle.remove()
    document.body.classList.remove('printing-invoice')
    printMode.value = null
  }
  window.addEventListener('afterprint', cleanup, { once: true })
  try {
    window.print()
  } catch (error) {
    window.removeEventListener('afterprint', cleanup)
    cleanup()
    console.error('Printing failed:', error)
    toast.error('Could not open the print dialog')
  }
}
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b">
        <h1 class="text-2xl font-bold">{{ t('sales_history') }}</h1>
        <p class="text-sm text-gray-600 mt-1">{{ pick('View and search past sales transactions', 'پچھلی فروخت دیکھیں اور تلاش کریں') }}</p>
      </div>

      <!-- Filters -->
      <div class="tool-toolbar p-6 border-b space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('From Date', 'ابتدائی تاریخ') }}</label>
            <Input v-model="dateFrom" type="date" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('To Date', 'آخری تاریخ') }}</label>
            <Input v-model="dateTo" type="date" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Customer', 'گاہک') }}</label>
            <select v-model="selectedCustomer" class="w-full border rounded-md p-2">
              <option value="">{{ pick('All Customers', 'تمام گاہک') }}</option>
              <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                {{ customer.first_name }} {{ customer.last_name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ t('payment_method') }}</label>
            <select v-model="selectedPaymentMethod" class="w-full border rounded-md p-2">
              <option value="">{{ pick('All Methods', 'تمام طریقے') }}</option>
              <option value="cash">{{ t('cash') }}</option>
              <option value="card">{{ t('card') }}</option>
              <option value="credit">{{ pick('Credit / Udhar','کریڈٹ / ادھار') }}</option><option value="mobile">{{ t('mobile') }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ t('search') }}</label>
            <Input v-model="searchQuery" :placeholder="pick('Invoice # or customer...', 'انوائس نمبر یا گاہک...')" />
          </div>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="text-sm text-gray-600">
            <span class="font-semibold">{{ formatNumber(totalInvoices) }}</span> {{ pick('invoices', 'انوائسیں') }} |
            {{ t('total') }}: <span class="font-semibold">{{ formatCurrency(totalSales) }}</span>
          </div>
          <Button variant="outline" size="sm" @click="clearFilters">{{ pick('Clear Filters', 'فلٹر صاف کریں') }}</Button>
        </div>
      </div>

      <!-- Table -->
      <div class="tool-table-scroll flex-1 overflow-auto p-6">
        <div v-if="loading && invoices.length === 0" class="text-center py-12 text-gray-500">
          {{ pick('Loading sales history...', 'فروخت کی تاریخ لوڈ ہو رہی ہے...') }}
        </div>

        <div v-else-if="filteredInvoices.length === 0" class="text-center py-12 text-gray-500">
          {{ searchQuery || selectedCustomer || selectedPaymentMethod ? pick('No sales found matching filters', 'فلٹر کے مطابق کوئی فروخت نہیں ملی') : pick('No sales history yet', 'ابھی فروخت کی کوئی تاریخ نہیں') }}
        </div>

        <table v-else class="w-full border-collapse">
          <thead>
            <tr class="border-b bg-gray-50">
              <th class="text-left p-3 font-semibold">{{ pick('Date & Time', 'تاریخ اور وقت') }}</th>
              <th class="text-left p-3 font-semibold">{{ t('invoice_number') }}</th>
              <th class="text-left p-3 font-semibold">{{ pick('Customer', 'گاہک') }}</th>
              <th class="text-left p-3 font-semibold">{{ pick('Cashier', 'کیشئر') }}</th>
              <th class="text-center p-3 font-semibold">{{ pick('Payment', 'ادائیگی') }}</th>
              <th class="text-right p-3 font-semibold">{{ pick('Amount', 'رقم') }}</th>
              <th class="text-center p-3 font-semibold">{{ pick('Actions', 'اقدامات') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in filteredInvoices"
              :key="invoice.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="p-3 text-sm">
                <div>{{ formatDate(invoice.invoice_date) }}</div>
                <div class="text-gray-500">{{ formatDateTime(invoice.invoice_date).split(' ').slice(1).join(' ') }}</div>
              </td>
              <td class="p-3 font-mono text-sm">{{ invoice.invoice_number }}</td>
              <td class="p-3 text-sm">{{ invoice.customer_name }}</td>
              <td class="p-3 text-sm">{{ invoice.cashier_name }}</td>
              <td class="p-3 text-center">
                <span
                  :class="[
                    'inline-block px-2 py-1 text-xs rounded',
                    getPaymentMethodBadge(invoice.payment_method).class
                  ]"
                >
                  {{ t(invoice.payment_method as 'cash' | 'card' | 'mobile') }}
                </span>
              </td>
              <td class="p-3 text-right font-semibold">{{ formatCurrency(invoice.net_amount) }}</td>
              <td class="p-3 text-center">
                <Button variant="outline" size="sm" @click="viewInvoiceDetails(invoice)">
                  {{ pick('View Details', 'تفصیلات دیکھیں') }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- Invoice Detail Modal -->
    <div
      v-if="showDetailModal && selectedInvoice"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="closeDetailModal"
    >
      <Card class="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <!-- Modal Header -->
        <div class="p-6 border-b flex justify-between items-start">
          <div>
            <h2 class="text-xl font-bold">{{ pick('Invoice Details', 'انوائس کی تفصیلات') }}</h2>
            <p class="text-sm text-gray-600 mt-1">{{ selectedInvoice.invoice_number }}</p>
          </div>
          <Button variant="outline" @click="closeDetailModal">{{ pick('Close', 'بند کریں') }}</Button>
        </div>

        <!-- Invoice Info -->
        <div class="p-6 border-b bg-gray-50">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-gray-600">{{ pick('Date', 'تاریخ') }}</div>
              <div class="font-medium">{{ formatDate(selectedInvoice.invoice_date) }}</div>
            </div>
            <div>
              <div class="text-gray-600">{{ pick('Customer', 'گاہک') }}</div>
              <div class="font-medium">{{ selectedInvoice.customer_name }}</div>
            </div>
            <div>
              <div class="text-gray-600">{{ pick('Cashier', 'کیشئر') }}</div>
              <div class="font-medium">{{ selectedInvoice.cashier_name }}</div>
            </div>
            <div v-if="selectedInvoice.patient_name"><div class="text-gray-600">{{ pick('Patient', 'مریض') }}</div><div class="font-medium">{{ selectedInvoice.patient_name }}</div></div>
            <div v-if="selectedInvoice.doctor_name"><div class="text-gray-600">{{ pick('Doctor', 'ڈاکٹر') }}</div><div class="font-medium">{{ selectedInvoice.doctor_name }}</div></div>
            <div v-if="selectedInvoice.customer_id && selectedInvoice.previous_balance != null"><div class="text-gray-600">{{ pick('Previous balance (not collected)', 'سابقہ بقایا (وصول نہیں ہوا)') }}</div><div class="font-medium">{{ formatCurrency(selectedInvoice.previous_balance) }}</div></div>
            <div v-if="selectedInvoice.notes" class="col-span-2"><div class="text-gray-600">{{ pick('Remarks', 'نوٹس') }}</div><div class="whitespace-pre-wrap break-words">{{ selectedInvoice.notes }}</div></div>
            <div>
              <div class="text-gray-600">{{ t('payment_method') }}</div>
              <div class="font-medium capitalize">{{ t(selectedInvoice.payment_method as 'cash' | 'card' | 'mobile') }}</div>
            </div>
          </div>
        </div>

        <!-- Items -->
        <div class="flex-1 overflow-auto p-6">
          <h3 class="font-semibold mb-4">{{ t('items') }}</h3>
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b bg-gray-50">
                <th class="text-left p-3 font-semibold">{{ pick('Product', 'مصنوعات') }}</th>
                <th class="text-left p-3 font-semibold">{{ pick('Batch', 'بیچ') }}</th>
                <th class="text-right p-3 font-semibold">{{ pick('Qty', 'تعداد') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('unit_price') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('discount') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in invoiceItems"
                :key="item.id"
                class="border-b"
              >
                <td class="p-3">
                  <div>{{ item.product_name }}</div>
                  <div class="text-xs text-gray-500">{{ item.is_loose_sale ? pick('Loose sale', 'کھلی فروخت') : pick('Pack sale', 'پیک فروخت') }}</div>
                </td>
                <td class="p-3 text-sm font-mono">{{ item.batch_number }}</td>
                <td class="p-3 text-right">
                  {{ formatNumber(item.sale_quantity ?? item.quantity) }} {{ item.sale_quantity == null ? pick('units', 'اکائیاں') : item.is_loose_sale ? pick('loose units', 'کھلی اکائیاں') : pick('packs', 'پیک') }}
                  <div v-if="item.bonus_quantity" class="text-xs">+ {{ formatNumber(item.bonus_quantity) }} {{ pick('free', 'مفت') }}</div>
                  <div v-if="item.sale_quantity != null && !item.is_loose_sale" class="text-xs text-gray-500">{{ formatNumber(item.quantity) }} {{ pick('units', 'اکائیاں') }}</div>
                </td>
                <td class="p-3 text-right">{{ formatCurrency(salePrice(item)) }}</td>
                <td class="p-3 text-right">{{ formatNumber(item.discount_percent) }}%</td>
                <td class="p-3 text-right font-semibold">{{ formatCurrency(item.line_total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="p-6 border-t bg-gray-50">
          <div class="max-w-md ml-auto space-y-2">
            <div class="flex justify-between text-sm">
              <span>{{ pick('Subtotal after line discounts', 'آئٹم کی رعایت کے بعد ذیلی کل') }}:</span>
              <span>{{ formatCurrency(selectedInvoice.total_amount) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span>{{ t('tax') }}:</span>
              <span>{{ formatCurrency(selectedInvoice.tax_amount) }}</span>
            </div>
            <div v-if="selectedInvoice.discount_amount > 0" class="flex justify-between text-sm">
              <span>{{ pick('Invoice discount', 'انوائس پر رعایت') }}:</span>
              <span class="text-red-600">-{{ formatCurrency(selectedInvoice.discount_amount) }}</span>
            </div>
            <div class="flex justify-between text-lg font-bold pt-2 border-t">
              <span>{{ t('total') }}:</span>
              <span>{{ formatCurrency(selectedInvoice.net_amount) }}</span>
            </div>
            <div v-if="selectedInvoice.received_amount != null" class="flex justify-between text-sm"><span>{{ pick('Received', 'وصول') }}:</span><span>{{ formatCurrency(selectedInvoice.received_amount) }}</span></div>
            <div v-if="selectedInvoice.change_amount != null" class="flex justify-between text-sm"><span>{{ pick('Change returned', 'واپس دی گئی رقم') }}:</span><span>{{ formatCurrency(selectedInvoice.change_amount) }}</span></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="p-6 border-t"><h3 class="font-semibold">{{ pick('Digital receipt', 'ڈیجیٹل رسید') }}</h3><p class="text-sm">{{ pick('WhatsApp opens a draft for the saved customer number. SMS text can be copied below.', 'WhatsApp محفوظ نمبر پر مسودہ کھولتا ہے۔ SMS کا متن نیچے سے کاپی کریں۔') }}</p><textarea v-model="digitalText" class="mt-2 w-full rounded border bg-background p-2" rows="6" readonly aria-label="Digital receipt text"></textarea><div class="mt-2 flex gap-2"><Button variant="outline" @click="copySms">{{ pick('Copy for SMS', 'SMS کے لیے کاپی کریں') }}</Button><Button v-if="selectedInvoice.customer_phone" variant="outline" @click="sendWhatsApp">{{ pick('Open WhatsApp', 'WhatsApp کھولیں') }}</Button></div></div>
        <div class="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" @click="printInvoice('invoice')">
            {{ pick('Print Invoice', 'انوائس پرنٹ کریں') }}
          </Button>
          <Button variant="outline" @click="printInvoice('receipt')">
            {{ pick('Print 80mm Receipt', '۸۰ ملی میٹر رسید پرنٹ کریں') }}
          </Button>
          <Button variant="outline" @click="closeDetailModal">
            {{ pick('Close', 'بند کریں') }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
  <Teleport to="body">
    <section v-if="printMode && selectedInvoice" class="invoice-print-root" :class="printMode === 'receipt' ? 'thermal' : 'full-invoice'">
      <header class="print-header">
        <h1>{{ shop?.company_name || 'Pharmacy POS' }}</h1>
        <p v-if="shop?.company_address">{{ shop.company_address }}</p>
        <p v-if="shop?.company_phone">{{ shop.company_phone }}</p>
        <p v-if="printMode === 'receipt' && shop?.receipt_header" class="print-custom-text">{{ shop.receipt_header }}</p>
        <h2>{{ printMode === 'receipt' ? pick('Sales Receipt', 'فروخت کی رسید') : pick('Sales Invoice', 'فروخت کی انوائس') }}</h2>
      </header>
      <div class="print-meta">
        <div><strong>{{ pick('Invoice', 'انوائس') }}</strong><span>{{ selectedInvoice.invoice_number }}</span></div>
        <div><strong>{{ pick('Date', 'تاریخ') }}</strong><span>{{ formatDateTime(selectedInvoice.invoice_date) }}</span></div>
        <div><strong>{{ pick('Customer', 'گاہک') }}</strong><span>{{ selectedInvoice.customer_name || pick('Walk-in', 'عام گاہک') }}</span></div>
        <div v-if="selectedInvoice.patient_name"><strong>{{ pick('Patient', 'مریض') }}</strong><span>{{ selectedInvoice.patient_name }}</span></div>
        <p v-if="selectedInvoice.prescription_note">{{pick('Prescription','نسخہ')}}: {{selectedInvoice.prescription_note}}</p><div v-if="selectedInvoice.doctor_name"><strong>{{ pick('Doctor', 'ڈاکٹر') }}</strong><span>{{ selectedInvoice.doctor_name }}</span></div>
        <div><strong>{{ pick('Cashier', 'کیشئر') }}</strong><span>{{ selectedInvoice.cashier_name || '—' }}</span></div>
        <div><strong>{{ pick('Payment', 'ادائیگی') }}</strong><span>{{ t(selectedInvoice.payment_method as 'cash' | 'card' | 'mobile') }}</span></div>
      </div>
      <table class="print-items">
        <thead><tr><th>{{ pick('Product / batch', 'مصنوعات / بیچ') }}</th><th>{{ pick('Qty', 'تعداد') }}</th><th>{{ t('price') }}</th><th>{{ t('discount') }}</th><th>{{ t('total') }}</th></tr></thead>
        <tbody>
          <tr v-for="item in invoiceItems" :key="item.id">
            <td>{{ item.product_name }}<small>{{ pick('Batch', 'بیچ') }} {{ item.batch_number }}</small><small v-if="shop?.show_drap === 1 && item.controlled_substance && item.drap_registration_number">DRAP: {{ item.drap_registration_number }}</small></td>
            <td>{{ formatNumber(item.sale_quantity ?? item.quantity) }} {{ item.sale_quantity == null ? pick('units', 'اکائیاں') : item.is_loose_sale ? pick('loose', 'کھلی') : pick('packs', 'پیک') }}<small v-if="item.bonus_quantity">+ {{ formatNumber(item.bonus_quantity) }} {{ pick('free', 'مفت') }}</small></td>
            <td>{{ formatCurrency(salePrice(item)) }}</td>
            <td>{{ formatNumber(item.discount_percent) }}%</td>
            <td>{{ formatCurrency(item.line_total) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="print-totals">
        <div><span>{{ pick('Subtotal after line discounts', 'آئٹم کی رعایت کے بعد ذیلی کل') }}</span><span>{{ formatCurrency(selectedInvoice.total_amount) }}</span></div>
        <div><span>{{ t('tax') }}</span><span>{{ formatCurrency(selectedInvoice.tax_amount) }}</span></div>
        <div v-if="selectedInvoice.discount_amount"><span>{{ pick('Invoice discount', 'انوائس پر رعایت') }}</span><span>-{{ formatCurrency(selectedInvoice.discount_amount) }}</span></div>
        <div class="print-grand-total"><strong>{{ selectedInvoice.payment_method==='credit'?pick('Charged to account','کھاتے میں درج رقم'):pick('Paid', 'ادا شدہ') }}</strong><strong>{{ formatCurrency(selectedInvoice.net_amount) }}</strong></div>
        <div v-if="selectedInvoice.received_amount != null"><span>{{ pick('Received', 'وصول') }}</span><span>{{ formatCurrency(selectedInvoice.received_amount) }}</span></div>
        <div v-if="selectedInvoice.change_amount != null"><span>{{ pick('Change', 'واپسی') }}</span><span>{{ formatCurrency(selectedInvoice.change_amount) }}</span></div>
      </div>
      <p v-if="selectedInvoice.notes" class="print-custom-text">{{ pick('Remarks', 'نوٹس') }}: {{ selectedInvoice.notes }}</p>
      <p class="print-footer">{{ pick('Thank you for your purchase.', 'آپ کی خریداری کا شکریہ۔') }}</p>
      <p v-if="printMode === 'receipt' && shop?.receipt_footer" class="print-custom-text print-footer">{{ shop.receipt_footer }}</p>
    </section>
  </Teleport>
</template>

<style>
.invoice-print-root { display: none; }
@media print {
  body.printing-invoice > *:not(.invoice-print-root) { display: none !important; }
  body > .invoice-print-root { display: block !important; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 10pt; }
  .invoice-print-root.full-invoice { width: 100%; }
  .invoice-print-root.thermal { width: 72mm; font-size: 8pt; }
  .invoice-print-root .print-header { text-align: center; margin-bottom: 1em; }
  .invoice-print-root h1 { font-size: 1.5em; font-weight: bold; margin: 0 0 .3em; }
  .invoice-print-root h2 { font-size: 1.2em; font-weight: bold; margin: .7em 0; }
  .invoice-print-root .print-meta { margin-bottom: 1em; }
  .invoice-print-root .print-meta div, .invoice-print-root .print-totals div { display: flex; justify-content: space-between; gap: .5em; }
  .invoice-print-root .print-meta strong { font-weight: 600; }
  .invoice-print-root .print-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .invoice-print-root .print-items th, .invoice-print-root .print-items td { border-bottom: 1px solid #999; padding: .35em .2em; text-align: right; overflow-wrap: anywhere; }
  .invoice-print-root .print-items th:first-child, .invoice-print-root .print-items td:first-child { text-align: left; width: 32%; }
  .invoice-print-root .print-items small { display: block; font-size: .8em; }
  .invoice-print-root .print-totals { margin: 1em 0 0 auto; max-width: 70mm; }
  .invoice-print-root .print-totals div { padding: .2em 0; }
  .invoice-print-root .print-grand-total { border-top: 1px solid #000; font-size: 1.15em; }
  .invoice-print-root .print-footer { text-align: center; margin-top: 2em; }
  .invoice-print-root .print-custom-text { white-space: pre-line; overflow-wrap: anywhere; }
  .invoice-print-root.thermal .print-items th:nth-child(3), .invoice-print-root.thermal .print-items td:nth-child(3),
  .invoice-print-root.thermal .print-items th:nth-child(4), .invoice-print-root.thermal .print-items td:nth-child(4) { display: none; }
  .invoice-print-root.thermal .print-items th:first-child, .invoice-print-root.thermal .print-items td:first-child { width: 50%; }
}
</style>
