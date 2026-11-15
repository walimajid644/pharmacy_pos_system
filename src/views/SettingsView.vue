<script setup lang="ts">
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import AppearanceSettings from '@/components/settings/AppearanceSettings.vue';
import CompanySettings from '@/components/settings/CompanySettings.vue';
import TaxSettings from '@/components/settings/TaxSettings.vue';
import InventorySettings from '@/components/settings/InventorySettings.vue';
import ReceiptSettings from '@/components/settings/ReceiptSettings.vue';
import { useSettingsForm } from '@/composables/useSettingsForm';

const {
  theme,
  setTheme,
  language,
  setLanguage,
  numberFormat,
  setNumberFormat,
  dateFormat,
  setDateFormat,
  formatDate,
  formatCurrency,
  pick,
  loading,
  activeTab,
  formData,
  saveSettings,
} = useSettingsForm();
</script>

<template>
  <div class="tool-terminal compact-workspace p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b">
        <h1 class="text-2xl font-bold">{{ pick('Settings', 'ترتیبات') }}</h1>
        <p class="text-sm text-gray-600 mt-1">
          {{
            pick(
              'Configure display and business information',
              'ڈسپلے اور کاروبار کی معلومات ترتیب دیں',
            )
          }}
        </p>
      </div>

      <!-- Tabs -->
      <div class="border-b">
        <div class="flex px-6">
          <button
            @click="activeTab = 'company'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'company'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary hover:text-primary',
            ]"
          >
            {{ pick('Company Info', 'کمپنی کی معلومات') }}
          </button>
          <button
            @click="activeTab = 'tax'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'tax'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary hover:text-primary',
            ]"
          >
            {{ pick('Tax & Currency', 'ٹیکس اور کرنسی') }}
          </button>
          <button
            @click="activeTab = 'inventory'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'inventory'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary hover:text-primary',
            ]"
          >
            {{ pick('Inventory', 'اسٹاک') }}
          </button>
          <button
            @click="activeTab = 'receipt'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'receipt'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary hover:text-primary',
            ]"
          >
            {{ pick('Receipt', 'رسید') }}
          </button>
          <button
            @click="activeTab = 'appearance'"
            :class="[
              'px-4 py-3 font-medium border-b-2 transition-colors',
              activeTab === 'appearance'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-secondary hover:text-primary',
            ]"
          >
            {{ pick('Appearance & Language', 'ظاہری شکل اور زبان') }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="tool-table-scroll flex-1 overflow-auto p-6">
        <AppearanceSettings
          :theme="theme"
          :set-theme="setTheme"
          :language="language"
          :set-language="setLanguage"
          :number-format="numberFormat"
          :set-number-format="setNumberFormat"
          :date-format="dateFormat"
          :set-date-format="setDateFormat"
          :format-date="formatDate"
          :format-currency="formatCurrency"
          :pick="pick"
          :active-tab="activeTab"
        />
        <!-- Company Info Tab -->
        <CompanySettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
        <!-- Tax & Currency Tab -->
        <TaxSettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
        <!-- Inventory Tab -->
        <InventorySettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
        <!-- Receipt Tab -->
        <ReceiptSettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
      </div>

      <!-- Save Button -->
      <div class="p-6 border-t flex justify-end">
        <Button @click="saveSettings" :disabled="loading" size="lg">
          {{
            loading
              ? pick('Saving...', 'محفوظ ہو رہا ہے...')
              : pick('Save Settings', 'ترتیبات محفوظ کریں')
          }}
        </Button>
      </div>
    </Card>
  </div>
</template>
