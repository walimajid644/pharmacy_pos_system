<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { executeQuery, executeUpdate } from '@/lib/database'
import { generateUUID } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { useTheme, type Theme } from '@/lib/theme'
import { useI18n, type Language, type NumberFormat, type DateFormat } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'

const toast = useToast()
const settingsStore = useSettingsStore()
const { theme, setTheme } = useTheme()
const { language, setLanguage, numberFormat, setNumberFormat, dateFormat, setDateFormat, formatDate, formatCurrency, pick } = useI18n()
const loading = ref(false)
const activeTab = ref<'company' | 'tax' | 'inventory' | 'receipt' | 'appearance'>('company')

// Form state
const formData = ref({
  id: '',
  company_name: '',
  company_address: '',
  company_phone: '',
  tax_rate: 0,
  currency_symbol: 'Rs',
  low_stock_threshold: 10,
  near_expiry_days: 60,
  receipt_header: '',
  receipt_footer: '',
  show_drap: true,
})

onMounted(async () => {
  await loadSettings()
})

async function loadSettings() {
  loading.value = true
  try {
    const settings = await executeQuery<any>(
      'SELECT * FROM app_settings LIMIT 1'
    )
    
    if (settings.length > 0) {
      const s = settings[0]
      formData.value = {
        id: s.id,
        company_name: s.company_name || '',
        company_address: s.company_address || '',
        company_phone: s.company_phone || '',
        tax_rate: s.tax_rate ?? 0,
        currency_symbol: s.currency_symbol || 'Rs',
        low_stock_threshold: s.low_stock_threshold ?? 10,
        near_expiry_days: s.near_expiry_days ?? 60,
        receipt_header: s.receipt_header || '',
        receipt_footer: s.receipt_footer || '',
        show_drap: s.show_drap !== 0,
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  if (!formData.value.company_name) {
    toast.warning('Company name is required')
    return
  }

  if (formData.value.tax_rate < 0 || formData.value.tax_rate > 100) {
    toast.error('Tax rate must be between 0 and 100')
    return
  }
  if (!Number.isInteger(formData.value.near_expiry_days) || formData.value.near_expiry_days < 1 || formData.value.near_expiry_days > 3650) {
    toast.error('Near-expiry warning must be between 1 and 3650 days')
    return
  }

  loading.value = true
  try {
    const now = new Date().toISOString()
    
    if (formData.value.id) {
      // Update existing settings
      await executeUpdate(
        `UPDATE app_settings SET 
          company_name = ?, company_address = ?, company_phone = ?,
          tax_rate = ?, currency_symbol = ?,
          low_stock_threshold = ?, near_expiry_days = ?,
          receipt_header = ?, receipt_footer = ?, show_drap = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          formData.value.company_name,
          formData.value.company_address,
          formData.value.company_phone,
          formData.value.tax_rate,
          formData.value.currency_symbol,
          formData.value.low_stock_threshold,
          formData.value.near_expiry_days,
          formData.value.receipt_header,
          formData.value.receipt_footer,
          formData.value.show_drap ? 1 : 0,
          now,
          formData.value.id
        ]
      )
    } else {
      // Create new settings
      const id = generateUUID()
      await executeUpdate(
        `INSERT INTO app_settings (
          id, company_name, company_address, company_phone,
          tax_rate, currency_symbol,
          low_stock_threshold, near_expiry_days,
          receipt_header, receipt_footer, show_drap,
          theme, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          formData.value.company_name,
          formData.value.company_address,
          formData.value.company_phone,
          formData.value.tax_rate,
          formData.value.currency_symbol,
          formData.value.low_stock_threshold,
          formData.value.near_expiry_days,
          formData.value.receipt_header,
          formData.value.receipt_footer,
          formData.value.show_drap ? 1 : 0,
          'light',
          now,
          now
        ]
      )
      formData.value.id = id
    }

    // Reload settings in store
    await settingsStore.loadSettings()
    
    toast.success('Settings saved successfully')
  } catch (error: any) {
    console.error('Error saving settings:', error)
    toast.error('Failed to save settings: ' + error.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b">
        <h1 class="text-2xl font-bold">{{ pick('Settings', 'ترتیبات') }}</h1>
        <p class="text-sm text-gray-600 mt-1">{{ pick('Configure display and business information', 'ڈسپلے اور کاروبار کی معلومات ترتیب دیں') }}</p>
      </div>

      <!-- Tabs -->
      <div class="border-b">
        <div class="flex px-6">
          <button
            @click="activeTab = 'company'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'company'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            ]"
          >
            {{ pick('Company Info', 'کمپنی کی معلومات') }}
          </button>
          <button
            @click="activeTab = 'tax'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'tax'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            ]"
          >
            {{ pick('Tax & Currency', 'ٹیکس اور کرنسی') }}
          </button>
          <button
            @click="activeTab = 'inventory'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'inventory'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            ]"
          >
            {{ pick('Inventory', 'اسٹاک') }}
          </button>
          <button
            @click="activeTab = 'receipt'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'receipt'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            ]"
          >
            {{ pick('Receipt', 'رسید') }}
          </button>
          <button
            @click="activeTab = 'appearance'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'appearance'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            ]"
          >
            {{ pick('Appearance & Language', 'ظاہری شکل اور زبان') }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="tool-table-scroll flex-1 overflow-auto p-6">
        <div v-if="activeTab === 'appearance'" class="max-w-2xl space-y-5">
          <p class="text-sm text-muted-foreground">{{ pick('Display preferences apply immediately on this desktop.', 'ڈسپلے کی ترتیبات اس کمپیوٹر پر فوراً لاگو ہوتی ہیں۔') }}</p>
          <label class="block text-sm font-medium">{{ pick('Theme', 'تھیم') }}
            <select :value="theme" class="mt-2 block w-full rounded border bg-background p-2" @change="setTheme(($event.target as HTMLSelectElement).value as Theme)">
              <option value="light">{{ pick('Light', 'روشن') }}</option><option value="dark">{{ pick('Dark', 'تاریک') }}</option><option value="auto">{{ pick('Follow Windows', 'ونڈوز کی ترتیب') }}</option>
            </select>
          </label>
          <label class="block text-sm font-medium">{{ pick('Language', 'زبان') }}
            <select :value="language" class="mt-2 block w-full rounded border bg-background p-2" @change="setLanguage(($event.target as HTMLSelectElement).value as Language)">
              <option value="en">English</option><option value="ur">اردو</option><option value="mixed">English / اردو</option>
            </select>
          </label>
          <label class="block text-sm font-medium">{{ pick('Displayed digits', 'ظاہر ہونے والے ہندسے') }}
            <select :value="numberFormat" class="mt-2 block w-full rounded border bg-background p-2" @change="setNumberFormat(($event.target as HTMLSelectElement).value as NumberFormat)">
              <option value="en">0123456789</option><option value="ur">۰۱۲۳۴۵۶۷۸۹</option>
            </select>
          </label>
          <label class="block text-sm font-medium">{{ pick('Displayed dates', 'تاریخ کی شکل') }}
            <select :value="dateFormat" class="mt-2 block w-full rounded border bg-background p-2" @change="setDateFormat(($event.target as HTMLSelectElement).value as DateFormat)">
              <option value="dmy">{{ pick('Day / Month / Year', 'دن / مہینہ / سال') }}</option><option value="mdy">{{ pick('Month / Day / Year', 'مہینہ / دن / سال') }}</option><option value="iso">{{ pick('Year-Month-Day', 'سال-مہینہ-دن') }}</option>
            </select>
          </label>
          <div class="rounded border p-3 text-sm">{{ pick('Preview', 'نمونہ') }}: {{ formatCurrency(1234.5) }} · {{ formatDate('2026-10-25') }}</div>
        </div>
        <!-- Company Info Tab -->
        <div v-if="activeTab === 'company'" class="max-w-2xl space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Company Name', 'کمپنی کا نام') }} *</label>
            <Input 
              v-model="formData.company_name" 
              placeholder="e.g. City Pharmacy"
            />
            <p class="text-xs text-gray-500 mt-1">{{ pick('Displayed on receipts and reports', 'رسیدوں اور رپورٹوں میں ظاہر ہوتا ہے') }}</p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Address', 'پتہ') }}</label>
            <textarea 
              v-model="formData.company_address" 
              class="w-full border rounded-md p-2 text-sm"
              rows="3"
              placeholder="Street address, city, postal code"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Phone Number', 'فون نمبر') }}</label>
            <Input 
              v-model="formData.company_phone" 
              placeholder="e.g. 042-12345678"
            />
          </div>
        </div>

        <!-- Tax & Currency Tab -->
        <div v-if="activeTab === 'tax'" class="max-w-2xl space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Tax Rate', 'ٹیکس کی شرح') }} (%) *</label>
            <Input 
              v-model.number="formData.tax_rate" 
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="e.g. 17"
            />
            <p class="text-xs text-gray-500 mt-1">
              Applied to all sales. Pakistan GST is typically 17-18%
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Currency Symbol', 'کرنسی کی علامت') }}</label>
            <Input 
              v-model="formData.currency_symbol" 
              placeholder="e.g. Rs, $, €"
              maxlength="5"
            />
            <p class="text-xs text-gray-500 mt-1">
              Used in price displays and reports
            </p>
          </div>

          <div class="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div class="flex items-start gap-3">
              <span class="text-2xl">ℹ️</span>
              <div>
                <div class="font-semibold text-blue-900">Price Format</div>
                <div class="text-sm text-blue-800 mt-1">
                  Prices will be displayed as: {{ formData.currency_symbol }} 1,234.56
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Inventory Tab -->
        <div v-if="activeTab === 'inventory'" class="max-w-2xl space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Low Stock Threshold', 'کم اسٹاک کی حد') }}</label>
            <Input 
              v-model.number="formData.low_stock_threshold" 
              type="number"
              min="0"
              placeholder="e.g. 10"
            />
            <p class="text-xs text-gray-500 mt-1">
              Alert when product stock falls below this level (default reorder level for new products)
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Near-Expiry Warning', 'قریب المیعاد انتباہ') }} ({{ pick('Days', 'دن') }})</label>
            <Input 
              v-model.number="formData.near_expiry_days" 
              type="number"
              min="1"
              max="3650"
              placeholder="e.g. 60"
            />
            <p class="text-xs text-gray-500 mt-1">
              Alert when products expire within this many days
            </p>
          </div>

          <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <div class="flex items-start gap-3">
              <span class="text-2xl">⚠️</span>
              <div>
                <div class="font-semibold text-yellow-900">Alert Settings</div>
                <div class="text-sm text-yellow-800 mt-1">
                  These settings control when alerts appear on the dashboard and in reports.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Receipt Tab -->
        <div v-if="activeTab === 'receipt'" class="max-w-2xl space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Receipt Header', 'رسید کا عنوان') }}</label>
            <textarea 
              v-model="formData.receipt_header" 
              class="w-full border rounded-md p-2 text-sm font-mono"
              rows="3"
              placeholder="Welcome to City Pharmacy&#10;Your Health, Our Priority"
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">
              Printed at the top of receipts (optional)
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Receipt Footer', 'رسید کا اختتام') }}</label>
            <textarea 
              v-model="formData.receipt_footer" 
              class="w-full border rounded-md p-2 text-sm font-mono"
              rows="3"
              placeholder="Thank you for your business!&#10;Exchange policy: 7 days with receipt"
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">
              Printed at the bottom of receipts (optional)
            </p>
          </div>

          <div>
            <label class="flex items-center gap-2">
              <input v-model="formData.show_drap" type="checkbox" />
              <span class="text-sm font-medium">{{ pick('Show DRAP Registration on Receipts', 'رسید پر ڈریپ رجسٹریشن دکھائیں') }}</span>
            </label>
            <p class="text-xs text-gray-500 mt-1 ml-6">
              Display Drug Regulatory Authority of Pakistan registration numbers for controlled substances
            </p>
          </div>

          <div class="p-4 bg-gray-50 border border-gray-200 rounded-md">
            <div class="font-semibold mb-2">{{ pick('Receipt Preview', 'رسید کا نمونہ') }}</div>
            <div class="text-xs font-mono bg-white p-3 border rounded">
              <div class="text-center mb-2">{{ formData.company_name || 'Company Name' }}</div>
              <div v-if="formData.receipt_header" class="text-center text-gray-600 mb-2 whitespace-pre-line">
                {{ formData.receipt_header }}
              </div>
              <div class="border-t border-dashed my-2"></div>
              <div>Date: 25/10/2026 14:30</div>
              <div>Invoice: INV-001</div>
              <div class="border-t border-dashed my-2"></div>
              <div>Panadol 500mg     x2    Rs 5.00</div>
              <div>Brufen 400mg      x1    Rs 8.50</div>
              <div class="border-t border-dashed my-2"></div>
              <div>Subtotal:              Rs 13.50</div>
              <div>Tax ({{ formData.tax_rate }}%):                Rs 2.30</div>
              <div class="font-bold">Total:                  Rs 15.80</div>
              <div class="border-t border-dashed my-2"></div>
              <div v-if="formData.receipt_footer" class="text-center text-gray-600 mt-2 whitespace-pre-line">
                {{ formData.receipt_footer }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div class="p-6 border-t flex justify-end">
        <Button @click="saveSettings" :disabled="loading" size="lg">
          {{ loading ? pick('Saving...', 'محفوظ ہو رہا ہے...') : pick('Save Settings', 'ترتیبات محفوظ کریں') }}
        </Button>
      </div>
    </Card>
  </div>
</template>
