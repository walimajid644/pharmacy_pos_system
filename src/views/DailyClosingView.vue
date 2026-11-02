<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { executeQuery, executeUpdate } from '@/lib/database'
import { formatCurrency, generateUUID } from '@/lib/utils'
import { localDateKey, localDayBounds } from '@/lib/businessDay'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

interface DailySales {
  total_sales: number
  total_cash: number
  total_card: number
  total_credit: number
  total_mobile: number
  invoice_count: number
}

interface DailyClosing {
  id: string
  closing_date: string
  total_sales: number
  total_cash: number
  total_card: number
  closed_by: string
  closing_time: string
  created_at: string
  closed_by_name?: string
  notes?: string | null
}

const toast = useToast()
const authStore = useAuthStore()
const loading = ref(false)
const showClosingForm = ref(false)
const todayDate = ref(localDateKey())

const salesData = ref<DailySales>({
  total_sales: 0,
  total_cash: 0,
  total_card: 0,
  total_credit: 0,
  total_mobile: 0,
  invoice_count: 0,
})

const closingHistory = ref<DailyClosing[]>([])
const todayClosed = ref(false)

// Closing form data
const actualCash = ref(0)
const actualCard = ref(0)
const notes = ref('')

const cashDifference = computed(() => actualCash.value - salesData.value.total_cash)
const cardDifference = computed(() => actualCard.value - salesData.value.total_card)

onMounted(async () => {
  await Promise.all([
    loadTodaySales(),
    loadClosingHistory(),
    checkTodayClosed()
  ])
})

async function loadTodaySales() {
  loading.value = true
  try {
    const [startOfDay, endOfDay] = localDayBounds(todayDate.value)

    const result = await executeQuery<DailySales>(
      `SELECT 
        COALESCE(COUNT(*), 0) as invoice_count,
        COALESCE(SUM(net_amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN net_amount ELSE 0 END), 0) as total_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN net_amount ELSE 0 END), 0) as total_card,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN net_amount ELSE 0 END),0) AS total_credit,
        COALESCE(SUM(CASE WHEN payment_method = 'mobile' THEN net_amount ELSE 0 END), 0) as total_mobile
      FROM sales_invoices
      WHERE invoice_date >= ? AND invoice_date < ?
        AND status = 'completed'`,
      [startOfDay, endOfDay]
    )

    if (result.length > 0) {
      salesData.value = result[0]
      // Pre-fill actual amounts with expected amounts
      actualCash.value = salesData.value.total_cash
      actualCard.value = salesData.value.total_card
    }
  } catch (error) {
    console.error('Error loading today sales:', error)
    toast.error('Failed to load sales data')
  } finally {
    loading.value = false
  }
}

async function loadClosingHistory() {
  try {
    const data = await executeQuery<DailyClosing>(
      `SELECT 
        dc.*,
        u.full_name as closed_by_name
      FROM daily_closing dc
      JOIN users u ON dc.closed_by = u.id
      ORDER BY dc.closing_date DESC, dc.closing_time DESC
      LIMIT 30`
    )
    closingHistory.value = data
  } catch (error) {
    console.error('Error loading closing history:', error)
  }
}

async function checkTodayClosed() {
  try {
    const result = await executeQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM daily_closing WHERE closing_date = ?',
      [todayDate.value]
    )
    todayClosed.value = (result[0]?.count || 0) > 0
  } catch (error) {
    console.error('Error checking closing status:', error)
  }
}

function openClosingForm() {
  if (salesData.value.invoice_count === 0) {
    toast.warning('No sales for today. Nothing to close.')
    return
  }
  showClosingForm.value = true
}

function cancelClosing() {
  showClosingForm.value = false
  actualCash.value = salesData.value.total_cash
  actualCard.value = salesData.value.total_card
  notes.value = ''
}

async function submitClosing() {
  if (todayClosed.value || !authStore.currentUser) return
  if (!Number.isFinite(Number(actualCash.value)) || Number(actualCash.value) < 0 ||
      !Number.isFinite(Number(actualCard.value)) || Number(actualCard.value) < 0) {
    toast.warning('Enter nonnegative cash and card amounts')
    return
  }

  loading.value = true
  try {
    const now = new Date().toISOString()
    const id = generateUUID()

    await executeUpdate(
      `INSERT INTO daily_closing 
       (id, closing_date, total_sales, total_cash, total_card, closed_by, closing_time, created_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        todayDate.value,
        salesData.value.total_sales,
        actualCash.value,
        actualCard.value,
        authStore.currentUser?.id,
        now,
        now,
        notes.value.trim() || null,
      ]
    )

    toast.success('Day closed successfully!')
    showClosingForm.value = false
    todayClosed.value = true
    await loadClosingHistory()
  } catch (error: any) {
    console.error('Error closing day:', error)
    toast.error('Failed to close day: ' + error.message)
  } finally {
    loading.value = false
  }
}

function getDifferenceClass(diff: number) {
  if (diff === 0) return 'text-green-600'
  if (Math.abs(diff) < 10) return 'text-yellow-600'
  return 'text-red-600'
}
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <!-- Today's Sales -->
      <div class="flex flex-col">
        <Card class="flex-1 flex flex-col">
          <div class="tool-header p-6 border-b">
            <h1 class="text-2xl font-bold">Daily Closing</h1>
            <p class="text-sm text-gray-600 mt-1">{{ new Date(todayDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}</p>
          </div>

          <div class="flex-1 p-6 space-y-6">
            <!-- Status -->
            <div v-if="todayClosed" class="p-4 bg-green-50 border border-green-200 rounded-md">
              <div class="flex items-center gap-2">
                <span class="text-2xl">✅</span>
                <div>
                  <div class="font-semibold text-green-800">Day Already Closed</div>
                  <div class="text-sm text-green-700">This day has been closed and reconciled</div>
                </div>
              </div>
            </div>

            <div v-else-if="salesData.invoice_count === 0" class="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div class="flex items-center gap-2">
                <span class="text-2xl">ℹ️</span>
                <div>
                  <div class="font-semibold text-yellow-800">No Sales Today</div>
                  <div class="text-sm text-yellow-700">No transactions recorded for today</div>
                </div>
              </div>
            </div>

            <div v-else class="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div class="flex items-center gap-2">
                <span class="text-2xl">📊</span>
                <div>
                  <div class="font-semibold text-blue-800">Ready to Close</div>
                  <div class="text-sm text-blue-700">Review sales and close the day</div>
                </div>
              </div>
            </div>

            <!-- Sales Summary -->
            <div>
              <h2 class="font-semibold mb-4">Today's Sales Summary</h2>
              
              <div class="space-y-3">
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                  <span class="text-gray-700">Total Invoices</span>
                  <span class="text-2xl font-bold">{{ salesData.invoice_count }}</span>
                </div>

                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                  <span class="text-gray-700">Total Sales</span>
                  <span class="text-2xl font-bold text-blue-600">{{ formatCurrency(salesData.total_sales) }}</span>
                </div>

                <div class="border-t pt-3 space-y-2"><div class="flex justify-between text-sm"><span>Credit / Udhar · ادھار</span><strong>{{ formatCurrency(salesData.total_credit) }}</strong></div><small>Credit sales are invoiced, not cash collected. · ادھار فروخت نقد وصولی نہیں ہے۔</small>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">💵 Cash</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_cash) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">💳 Card</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_card) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">📱 Mobile</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_mobile) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Close Day Button -->
            <div v-if="!todayClosed && !showClosingForm">
              <Button 
                @click="openClosingForm" 
                size="lg" 
                class="w-full"
                :disabled="salesData.invoice_count === 0"
              >
                🔒 Close Day
              </Button>
            </div>

            <!-- Closing Form -->
            <div v-if="showClosingForm" class="space-y-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <h3 class="font-semibold">Cash Reconciliation</h3>
              
              <div>
                <label class="block text-sm font-medium mb-2">
                  Actual Cash (Expected: {{ formatCurrency(salesData.total_cash) }})
                </label>
                <Input 
                  v-model.number="actualCash" 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                />
                <div v-if="cashDifference !== 0" :class="['text-sm mt-1 font-semibold', getDifferenceClass(cashDifference)]">
                  {{ cashDifference > 0 ? 'Over' : 'Short' }} by {{ formatCurrency(Math.abs(cashDifference)) }}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">
                  Actual Card (Expected: {{ formatCurrency(salesData.total_card) }})
                </label>
                <Input 
                  v-model.number="actualCard" 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                />
                <div v-if="cardDifference !== 0" :class="['text-sm mt-1 font-semibold', getDifferenceClass(cardDifference)]">
                  {{ cardDifference > 0 ? 'Over' : 'Short' }} by {{ formatCurrency(Math.abs(cardDifference)) }}
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">Notes (Optional)</label>
                <textarea 
                  v-model="notes" 
                  class="w-full border rounded-md p-2 text-sm"
                  rows="2"
                  placeholder="Any notes about discrepancies or issues..."
                ></textarea>
              </div>

              <div class="flex gap-3">
                <Button @click="submitClosing" :disabled="loading" class="flex-1">
                  {{ loading ? 'Closing...' : 'Confirm & Close Day' }}
                </Button>
                <Button variant="outline" @click="cancelClosing" :disabled="loading">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- Closing History -->
      <div class="flex flex-col">
        <Card class="flex-1 flex flex-col">
          <div class="p-6 border-b">
            <h2 class="text-lg font-semibold">Closing History</h2>
            <p class="text-sm text-gray-600 mt-1">Last 30 days</p>
          </div>

          <div class="flex-1 overflow-auto p-6">
            <div v-if="closingHistory.length === 0" class="text-center py-12 text-gray-500">
              No closing history yet
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="closing in closingHistory"
                :key="closing.id"
                class="p-4 border rounded-md hover:bg-gray-50"
              >
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <div class="font-semibold">
                      {{ new Date(closing.closing_date).toLocaleDateString() }}
                    </div>
                    <div class="text-sm text-gray-600">
                      Closed by: {{ closing.closed_by_name }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ new Date(closing.closing_time).toLocaleTimeString() }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-blue-600">
                      {{ formatCurrency(closing.total_sales) }}
                    </div>
                  </div>
                </div>

                <div class="flex gap-4 text-sm pt-2 border-t">
                  <div>
                    <span class="text-gray-600">Cash:</span>
                    <span class="font-semibold ml-1">{{ formatCurrency(closing.total_cash) }}</span>
                  </div>
                  <div>
                    <span class="text-gray-600">Card:</span>
                    <span class="font-semibold ml-1">{{ formatCurrency(closing.total_card) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
