<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels'
const label=useWorkspaceLabels()
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { executeQuery } from '@/lib/database'
import {csvCell} from '@/lib/csv'
import { formatCurrency } from '@/lib/utils'
import { localDateKey, localDayBounds } from '@/lib/businessDay'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

const router=useRouter(),{pick,formatDate}=useI18n()
const toast = useToast()
const settingsStore = useSettingsStore()
const auth = useAuthStore()
const loading = ref(false)
const selectedReport = ref<string | null>(null)
const dateFrom = ref('')
const dateTo = ref('')

// Report data
const dailySalesData = ref<any[]>([])
const salesByProductData = ref<any[]>([])
const lowStockData = ref<any[]>([])
const nearExpiryData = ref<any[]>([])
const stockValuationData = ref<any[]>([])

function selectedDayRange(): [string, string] | null {
  if (!dateFrom.value || !dateTo.value || dateFrom.value > dateTo.value) {
    toast.warning('Choose a valid date range')
    return null
  }
  try {
    const [start] = localDayBounds(dateFrom.value)
    const [, end] = localDayBounds(dateTo.value)
    return [start, end]
  } catch {
    toast.warning('Choose a valid date range')
    return null
  }
}

onMounted(() => {
  // Set default date range (last 30 days)
  const today = new Date()
  const monthAgo = new Date()
  monthAgo.setDate(today.getDate() - 30)
  
  dateTo.value = localDateKey(today)
  dateFrom.value = localDateKey(monthAgo)
})

async function generateDailySalesReport() {
  const range = selectedDayRange()
  if (!range) return
  const [rangeStart, rangeEnd] = range
  loading.value = true
  selectedReport.value = 'daily-sales'
  
  try {
    const data = await executeQuery<any>(
      `SELECT 
        DATE(invoice_date, 'localtime') as sale_date,
        COUNT(*) as invoice_count,
        SUM(net_amount) as total_sales,
        SUM(CASE WHEN payment_method = 'cash' THEN net_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN net_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'mobile' THEN net_amount ELSE 0 END) as mobile_sales
      FROM sales_invoices
      WHERE invoice_date >= ? AND invoice_date < ?
        AND status = 'completed'
      GROUP BY DATE(invoice_date, 'localtime')
      ORDER BY sale_date DESC`,
      [rangeStart, rangeEnd]
    )
    dailySalesData.value = data
    
    if (data.length === 0) {
      toast.info('No sales found for selected date range')
    }
  } catch (error) {
    console.error('Error generating daily sales report:', error)
    toast.error('Failed to generate report')
  } finally {
    loading.value = false
  }
}

async function generateSalesByProductReport() {
  const range = selectedDayRange()
  if (!range) return
  const [rangeStart, rangeEnd] = range
  loading.value = true
  selectedReport.value = 'sales-by-product'
  
  try {
    const data = await executeQuery<any>(
      `SELECT 
        p.name as product_name,
        p.sku,
        SUM(sii.quantity) as total_quantity,
        COUNT(DISTINCT si.id) as invoice_count,
        SUM(sii.line_total) as total_sales
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.invoice_id = si.id
      JOIN products p ON sii.product_id = p.id
      WHERE si.invoice_date >= ? AND si.invoice_date < ?
        AND si.status = 'completed'
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_sales DESC
      LIMIT 50`,
      [rangeStart, rangeEnd]
    )
    salesByProductData.value = data
    
    if (data.length === 0) {
      toast.info('No sales found for selected date range')
    }
  } catch (error) {
    console.error('Error generating sales by product report:', error)
    toast.error('Failed to generate report')
  } finally {
    loading.value = false
  }
}

async function generateLowStockReport() {
  loading.value = true
  selectedReport.value = 'low-stock'
  
  try {
    const data = await executeQuery<any>(
      `SELECT 
        p.name as product_name,
        p.sku,
        p.reorder_level,
        COALESCE(SUM(pb.quantity_in_stock), 0) as current_stock,
        p.unit_price,
        (COALESCE(SUM(pb.quantity_in_stock), 0) * p.unit_price) as stock_value
      FROM products p
      LEFT JOIN product_batches pb ON p.id = pb.product_id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      GROUP BY p.id, p.name, p.sku, p.reorder_level, p.unit_price
      HAVING current_stock <= p.reorder_level
      ORDER BY current_stock ASC`
    )
    lowStockData.value = data
    
    if (data.length === 0) {
      toast.success('All products are well stocked!')
    }
  } catch (error) {
    console.error('Error generating low stock report:', error)
    toast.error('Failed to generate report')
  } finally {
    loading.value = false
  }
}

async function generateNearExpiryReport() {
  await settingsStore.loadSettings()
  loading.value = true
  selectedReport.value = 'near-expiry'
  
  try {
    const expiryLimit = new Date()
    expiryLimit.setDate(expiryLimit.getDate() + Number(settingsStore.settings?.near_expiry_days ?? 60))

    const data = await executeQuery<any>(
      `SELECT 
        pb.id AS batch_id,
        pb.product_id,
        p.name as product_name,
        p.sku,
        pb.batch_number,
        pb.expiry_date,
        pb.quantity_in_stock,
        COALESCE(h.held,0) AS quarantined_stock,
        p.unit_price,
        ((pb.quantity_in_stock+COALESCE(h.held,0)) * p.unit_price) as batch_value,
        CAST((JULIANDAY(pb.expiry_date) - JULIANDAY(date('now','localtime'))) AS INTEGER) as days_until_expiry
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id
      LEFT JOIN (SELECT batch_id,SUM(quantity) AS held FROM batch_holds WHERE status='held' GROUP BY batch_id) h ON h.batch_id=pb.id
      WHERE pb.expiry_date <= ?
        AND (pb.quantity_in_stock > 0 OR COALESCE(h.held,0)>0)
        AND p.deleted_at IS NULL
      ORDER BY pb.expiry_date ASC`,
      [localDateKey(expiryLimit)]
    )
    nearExpiryData.value = data
    
    if (data.length === 0) {
      toast.success('No batches expiring soon!')
    }
  } catch (error) {
    console.error('Error generating near expiry report:', error)
    toast.error('Failed to generate report')
  } finally {
    loading.value = false
  }
}

async function generateStockValuationReport() {
  loading.value = true
  selectedReport.value = 'stock-valuation'
  
  try {
    const data = await executeQuery<any>(
      `SELECT 
        p.name as product_name,
        p.sku,
        COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) as total_stock,
        COALESCE(SUM(h.held),0) AS quarantined_stock,
        p.cost_price,
        p.unit_price,
        (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.cost_price) as cost_value,
        (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.unit_price) as retail_value,
        ((COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.unit_price) - (COALESCE(SUM(pb.quantity_in_stock+COALESCE(h.held,0)), 0) * p.cost_price)) as potential_profit
      FROM products p
      LEFT JOIN product_batches pb ON p.id = pb.product_id
      LEFT JOIN (SELECT batch_id,SUM(quantity) AS held FROM batch_holds WHERE status='held' GROUP BY batch_id) h ON h.batch_id=pb.id
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      GROUP BY p.id, p.name, p.sku, p.cost_price, p.unit_price
      HAVING total_stock > 0
      ORDER BY retail_value DESC`
    )
    stockValuationData.value = data
    
    if (data.length === 0) {
      toast.info('No stock available')
    }
  } catch (error) {
    console.error('Error generating stock valuation report:', error)
    toast.error('Failed to generate report')
  } finally {
    loading.value = false
  }
}

function exportToCSV(reportName: string, data: any[]) {
  if (data.length === 0) {
    toast.warning('No data to export')
    return
  }

  try {
    // Get headers from first row
    const headers = Object.keys(data[0])
    
    // Create CSV content
    let csv = '\uFEFF'+headers.map(csvCell).join(',')+'\r\n'
    data.forEach(row=>{csv+=headers.map(header=>csvCell(row[header])).join(',')+'\r\n'})

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportName}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
    
    toast.success('Report exported successfully')
  } catch (error) {
    console.error('Error exporting CSV:', error)
    toast.error('Failed to export report')
  }
}

function getDaysClass(days: number) {
  if (days < 0) return 'text-red-600 font-bold'
  if (days <= 30) return 'text-red-600'
  if (days <= 60) return 'text-yellow-600'
  return 'text-gray-600'
}
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <header class="tool-header"><h1>{{ label('Reports') }}</h1></header>
    <div class="tool-report-grid grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <!-- Report Menu -->
      <div class="lg:col-span-1">
        <Card class="p-6">
          <h2 class="text-sm font-semibold mb-4">{{ label('Report filters') }}</h2>

          <!-- Date Range -->
          <div class="mb-6 space-y-3">
            <div>
              <label class="block text-sm font-medium mb-2">{{ label('From Date') }}</label>
              <Input v-model="dateFrom" type="date" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">{{ label('To Date') }}</label>
              <Input v-model="dateTo" type="date" />
            </div>
          </div>

<Button class="w-full mb-3" variant="outline" @click="router.push('/controlled-sales')">{{pick('Controlled Sales','کنٹرول شدہ فروخت')}}</Button><Button class="w-full mb-3" variant="outline" @click="router.push('/cashier-performance')">{{pick('Cashier Performance','کیشئر کی کارکردگی')}}</Button>
          <!-- Report Buttons -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-gray-600 uppercase">{{ label('Sales Reports') }}</h3>
            <Button 
              variant="outline" 
              class="w-full justify-start"
              @click="generateDailySalesReport"
              :disabled="loading"
            >
              📊 Daily Sales Summary
            </Button>
            <Button 
              variant="outline" 
              class="w-full justify-start"
              @click="generateSalesByProductReport"
              :disabled="loading"
            >
              📦 Sales by Product
            </Button>

            <h3 class="text-sm font-semibold text-gray-600 uppercase mt-6">{{ label('Inventory Reports') }}</h3>
            <Button 
              variant="outline" 
              class="w-full justify-start"
              @click="generateLowStockReport"
              :disabled="loading"
            >
              ⚠️ Low Stock Report
            </Button>
            <Button 
              variant="outline" 
              class="w-full justify-start"
              @click="generateNearExpiryReport"
              :disabled="loading"
            >
              ⏰ Near Expiry Report
            </Button>
            <Button 
              variant="outline" 
              class="w-full justify-start"
              @click="generateStockValuationReport"
              :disabled="loading"
            >
              💰 Stock Valuation
            </Button>
          </div>
        </Card>
      </div>

      <!-- Report Display -->
      <div class="lg:col-span-2">
        <Card class="h-full flex flex-col">
          <div v-if="!selectedReport" class="flex-1 flex items-center justify-center text-gray-500">
            <div class="text-center">
              <div class="text-6xl mb-4">📈</div>
              <div class="text-lg">Select a report to view</div>
            </div>
          </div>

          <!-- Daily Sales Report -->
          <div v-else-if="selectedReport === 'daily-sales'" class="flex-1 flex flex-col">
            <div class="p-6 border-b flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold">{{ label('Daily Sales Summary') }}</h2>
                <p class="text-sm text-gray-600">{{ dateFrom }} to {{ dateTo }}</p>
              </div>
              <Button variant="outline" size="sm" @click="exportToCSV('daily-sales', dailySalesData)">
                📥 Export CSV
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-6">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b bg-gray-50">
                    <th class="text-left p-3">{{ label('Date') }}</th>
                    <th class="text-right p-3">Invoices</th>
                    <th class="text-right p-3">Total Sales</th>
                    <th class="text-right p-3">Cash</th>
                    <th class="text-right p-3">Card</th>
                    <th class="text-right p-3">{{ label('Mobile') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in dailySalesData" :key="row.sale_date" class="border-b hover:bg-gray-50">
                    <td class="p-3">{{ new Date(row.sale_date).toLocaleDateString() }}</td>
                    <td class="p-3 text-right">{{ row.invoice_count }}</td>
                    <td class="p-3 text-right font-semibold">{{ formatCurrency(row.total_sales) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(row.cash_sales) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(row.card_sales) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(row.mobile_sales) }}</td>
                  </tr>
                </tbody>
                <tfoot v-if="dailySalesData.length > 0" class="border-t bg-gray-50">
                  <tr class="font-bold">
                    <td class="p-3">TOTAL</td>
                    <td class="p-3 text-right">{{ dailySalesData.reduce((sum, r) => sum + r.invoice_count, 0) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.total_sales, 0)) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.cash_sales, 0)) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.card_sales, 0)) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(dailySalesData.reduce((sum, r) => sum + r.mobile_sales, 0)) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- Sales by Product Report -->
          <div v-else-if="selectedReport === 'sales-by-product'" class="flex-1 flex flex-col">
            <div class="p-6 border-b flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold">Sales by Product</h2>
                <p class="text-sm text-gray-600">Top 50 products | {{ dateFrom }} to {{ dateTo }}</p>
              </div>
              <Button variant="outline" size="sm" @click="exportToCSV('sales-by-product', salesByProductData)">
                📥 Export CSV
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-6">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b bg-gray-50">
                    <th class="text-left p-3">{{ label('Product') }}</th>
                    <th class="text-left p-3">SKU</th>
                    <th class="text-right p-3">Qty Sold</th>
                    <th class="text-right p-3">Invoices</th>
                    <th class="text-right p-3">Total Sales</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in salesByProductData" :key="row.sku" class="border-b hover:bg-gray-50">
                    <td class="p-3">{{ row.product_name }}</td>
                    <td class="p-3 font-mono text-sm">{{ row.sku }}</td>
                    <td class="p-3 text-right">{{ row.total_quantity }}</td>
                    <td class="p-3 text-right">{{ row.invoice_count }}</td>
                    <td class="p-3 text-right font-semibold">{{ formatCurrency(row.total_sales) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Low Stock Report -->
          <div v-else-if="selectedReport === 'low-stock'" class="flex-1 flex flex-col">
            <div class="p-6 border-b flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold">Low Stock Report</h2>
                <p class="text-sm text-gray-600">Products below reorder level</p>
              </div>
              <Button variant="outline" size="sm" @click="exportToCSV('low-stock', lowStockData)">
                📥 Export CSV
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-6">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b bg-gray-50">
                    <th class="text-left p-3">{{ label('Product') }}</th>
                    <th class="text-left p-3">SKU</th>
                    <th class="text-right p-3">Current Stock</th>
                    <th class="text-right p-3">Reorder Level</th>
                    <th class="text-right p-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in lowStockData" :key="row.sku" class="border-b hover:bg-gray-50">
                    <td class="p-3">{{ row.product_name }}</td>
                    <td class="p-3 font-mono text-sm">{{ row.sku }}</td>
                    <td class="p-3 text-right font-bold text-red-600">{{ row.current_stock }}</td>
                    <td class="p-3 text-right">{{ row.reorder_level }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(row.stock_value) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Near Expiry Report -->
          <div v-else-if="selectedReport === 'near-expiry'" class="flex-1 flex flex-col">
            <div class="p-6 border-b flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold">{{pick('Near Expiry Report','قریب المیعاد رپورٹ')}}</h2>
                <p class="text-sm text-gray-600">{{pick('Expired batches and batches expiring within','میعاد ختم اور اس مدت میں ختم ہونے والے بیچ')}} {{ settingsStore.settings?.near_expiry_days ?? 60 }} {{pick('days · value includes quarantined stock','دن · قیمت میں قرنطینہ اسٹاک شامل ہے')}}</p>
              </div>
              <Button variant="outline" size="sm" @click="exportToCSV('near-expiry', nearExpiryData)">
                📥 Export CSV
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-6">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b bg-gray-50">
                    <th class="text-left p-3">{{ label('Product') }}</th>
                    <th class="text-left p-3">{{ label('Batch') }}</th>
                    <th class="text-left p-3">{{pick('Expiry date','تاریخِ میعاد')}}</th>
                    <th class="text-right p-3">{{pick('Days left','باقی دن')}}</th>
                    <th class="text-right p-3">{{pick('Outside quarantine','قرنطینہ سے باہر')}}</th><th>{{pick('Quarantined','قرنطینہ')}}</th>
                    <th class="text-right p-3">{{pick('Retail value','ریٹیل قیمت')}}</th><th>{{pick('Actions','کارروائیاں')}}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in nearExpiryData" :key="row.batch_id" class="border-b hover:bg-gray-50">
                    <td class="p-3">{{ row.product_name }}</td>
                    <td class="p-3 font-mono text-sm">{{ row.batch_number }}</td>
                    <td class="p-3 text-sm">{{ formatDate(row.expiry_date) }}</td>
                    <td class="p-3 text-right" :class="getDaysClass(row.days_until_expiry)">
                      {{ row.days_until_expiry }} {{pick('days','دن')}}<small class="block">{{row.days_until_expiry<0?pick('Expired','میعاد ختم'):pick('Near expiry','قریب المیعاد')}}</small>
                    </td>
                    <td class="p-3 text-right">{{ row.quantity_in_stock }}</td><td class="p-3"><span v-if="row.quarantined_stock" class="stock-badge held">{{pick('Quarantined','قرنطینہ')}}: {{row.quarantined_stock}}</span><span v-else>0</span></td>
                    <td class="p-3 text-right">{{ formatCurrency(row.batch_value) }}</td><td class="p-3"><Button v-if="auth.hasRole(['admin','manager'])" class="expiry-batch-action" variant="outline" size="sm" @click="router.push({path:'/expiry-actions',query:{batch:row.batch_id}})">{{pick('Batch actions','بیچ کی کارروائیاں')}}</Button><small v-else>{{pick('Ask a manager','منیجر سے رابطہ کریں')}}</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Stock Valuation Report -->
          <div v-else-if="selectedReport === 'stock-valuation'" class="flex-1 flex flex-col">
            <div class="p-6 border-b flex justify-between items-center">
              <div>
                <h2 class="text-xl font-bold">Stock Valuation Report</h2>
                <p class="text-sm text-gray-600">Current inventory value</p>
              </div>
              <Button variant="outline" size="sm" @click="exportToCSV('stock-valuation', stockValuationData)">
                📥 Export CSV
              </Button>
            </div>

            <div class="flex-1 overflow-auto p-6">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b bg-gray-50">
                    <th class="text-left p-3">{{ label('Product') }}</th>
                    <th class="text-right p-3">{{ label('Stock') }}</th>
                    <th class="text-right p-3">Cost Value</th>
                    <th class="text-right p-3">Retail Value</th>
                    <th class="text-right p-3">Potential Profit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in stockValuationData" :key="row.sku" class="border-b hover:bg-gray-50">
                    <td class="p-3">
                      <div>{{ row.product_name }}</div>
                      <div class="text-sm text-gray-600">{{ row.sku }}</div>
                    </td>
                    <td class="p-3 text-right">{{ row.total_stock }}<small v-if="row.quarantined_stock" class="block text-red-600">{{row.quarantined_stock}} {{pick('quarantined (included)','قرنطینہ (شامل)')}}</small></td>
                    <td class="p-3 text-right">{{ formatCurrency(row.cost_value) }}</td>
                    <td class="p-3 text-right font-semibold">{{ formatCurrency(row.retail_value) }}</td>
                    <td class="p-3 text-right text-green-600 font-semibold">{{ formatCurrency(row.potential_profit) }}</td>
                  </tr>
                </tbody>
                <tfoot v-if="stockValuationData.length > 0" class="border-t bg-gray-50">
                  <tr class="font-bold">
                    <td class="p-3">TOTAL</td>
                    <td class="p-3 text-right">{{ stockValuationData.reduce((sum, r) => sum + r.total_stock, 0) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.cost_value, 0)) }}</td>
                    <td class="p-3 text-right">{{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.retail_value, 0)) }}</td>
                    <td class="p-3 text-right text-green-600">{{ formatCurrency(stockValuationData.reduce((sum, r) => sum + r.potential_profit, 0)) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
