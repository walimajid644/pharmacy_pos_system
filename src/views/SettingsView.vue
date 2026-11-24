<script setup lang="ts">
import { computed, nextTick } from 'vue';
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

const tabs = computed(() => [
  {
    id: 'company' as const,
    label: pick('Company Info', 'کمپنی کی معلومات'),
    description: pick(
      'Business details shown on your receipts and reports.',
      'رسیدوں اور رپورٹوں پر ظاہر ہونے والی کاروباری معلومات۔',
    ),
  },
  {
    id: 'tax' as const,
    label: pick('Tax & Currency', 'ٹیکس اور کرنسی'),
    description: pick(
      'Set the default sales tax and currency symbol.',
      'فروخت کے لیے ٹیکس اور کرنسی کی علامت مقرر کریں۔',
    ),
  },
  {
    id: 'inventory' as const,
    label: pick('Inventory', 'اسٹاک'),
    description: pick(
      'Choose when low stock and expiry warnings appear.',
      'کم اسٹاک اور میعاد کے انتباہات کی حدود مقرر کریں۔',
    ),
  },
  {
    id: 'receipt' as const,
    label: pick('Receipt', 'رسید'),
    description: pick(
      'Customize your printed receipts and preview your changes.',
      'پرنٹ ہونے والی رسید کی ترتیبات اور نمونہ دیکھیں۔',
    ),
  },
  {
    id: 'appearance' as const,
    label: pick('Appearance & Language', 'ظاہری شکل اور زبان'),
    description: pick(
      'Personalize the display on this desktop.',
      'اس کمپیوٹر پر ڈسپلے کی ترتیبات منتخب کریں۔',
    ),
  },
]);
const currentTab = computed(() => tabs.value.find((tab) => tab.id === activeTab.value)!);

async function onTabKeydown(event: KeyboardEvent) {
  const index = tabs.value.findIndex((tab) => tab.id === activeTab.value);
  const direction = document.documentElement.dir === 'rtl' ? -1 : 1;
  let target = index;
  if (event.key === 'ArrowRight') target += direction;
  else if (event.key === 'ArrowLeft') target -= direction;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = tabs.value.length - 1;
  else return;
  event.preventDefault();
  activeTab.value = tabs.value[(target + tabs.value.length) % tabs.value.length].id;
  await nextTick();
  document.getElementById(`settings-tab-${activeTab.value}`)?.focus();
}
function onSaveKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!loading.value && activeTab.value !== 'appearance') void saveSettings();
  }
}
</script>

<template>
  <section class="settings-workspace" @keydown="onSaveKeydown">
    <header class="settings-header">
      <div class="settings-heading">
        <span class="settings-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          >
            <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
          </svg>
        </span>
        <div>
          <h1>{{ pick('Settings', 'ترتیبات') }}</h1>
          <p>
            {{
              pick(
                'Manage your pharmacy and desktop preferences.',
                'اپنی فارمیسی اور ڈیسک ٹاپ کی ترتیبات کا انتظام کریں۔',
              )
            }}
          </p>
        </div>
      </div>
    </header>

    <div class="settings-panel">
      <div
        class="settings-tabs"
        role="tablist"
        :aria-label="pick('Settings categories', 'ترتیبات کے زمرے')"
        @keydown="onTabKeydown"
      >
        <button
          v-for="tab in tabs"
          :id="`settings-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`settings-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <form class="settings-form" @submit.prevent="saveSettings">
        <div
          :id="`settings-panel-${activeTab}`"
          class="settings-content"
          role="tabpanel"
          :aria-labelledby="`settings-tab-${activeTab}`"
          :aria-busy="loading"
          tabindex="0"
        >
          <div class="settings-section-heading">
            <h2>{{ currentTab.label }}</h2>
            <p>{{ currentTab.description }}</p>
          </div>
          <fieldset :disabled="loading" class="settings-fieldset">
            <legend class="sr-only">{{ currentTab.label }}</legend>
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
            <CompanySettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
            <TaxSettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
            <InventorySettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
            <ReceiptSettings :pick="pick" :active-tab="activeTab" v-model:form-data="formData" />
          </fieldset>
        </div>
        <footer class="settings-footer">
          <p>
            {{
              activeTab === 'appearance'
                ? pick(
                    'Display preferences apply immediately on this desktop.',
                    'ڈسپلے کی ترتیبات اس کمپیوٹر پر فوراً لاگو ہوتی ہیں۔',
                  )
                : pick(
                    'Save to apply changes across your pharmacy.',
                    'فارمیسی کی ترتیبات لاگو کرنے کے لیے محفوظ کریں۔',
                  )
            }}
          </p>
          <div v-if="activeTab !== 'appearance'" class="settings-save">
            <kbd>Ctrl+S</kbd>
            <Button
              type="submit"
              permission="settings.manage"
              :loading="loading"
              :disabled="loading"
              size="sm"
              aria-keyshortcuts="Control+s Meta+s"
            >
              {{
                loading
                  ? pick('Saving...', 'محفوظ ہو رہا ہے...')
                  : pick('Save Settings', 'ترتیبات محفوظ کریں')
              }}
            </Button>
          </div>
          <span v-else class="settings-auto">{{
            pick('Applied automatically', 'خودکار طور پر لاگو')
          }}</span>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.settings-workspace {
  font:
    12px/1.4 Arial,
    Tahoma,
    sans-serif;
  font-variant-numeric: tabular-nums;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  min-width: 0;
  padding: 12px;
  color: var(--text-primary);
  background: var(--surface-page);
}
.settings-header {
  flex-shrink: 0;
  padding: 2px 0;
}
.settings-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.settings-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--color-primary-50);
  color: var(--selection-ink, var(--text-primary));
}
.settings-mark svg {
  width: 22px;
  height: 22px;
}
h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}
.settings-heading p,
.settings-section-heading p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.settings-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-card);
}
.settings-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 0 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface-secondary);
}
.settings-tabs button {
  flex-shrink: 0;
  padding: 12px 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.settings-tabs button:hover {
  background: var(--surface-page);
  color: var(--text-primary);
}
.settings-tabs button[aria-selected='true'] {
  color: var(--selection-ink, var(--text-primary));
  border-bottom-color: var(--color-primary-400);
  background: var(--surface-card);
}
.settings-tabs button:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: -4px;
}
.settings-form {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.settings-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}
.settings-content:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: -2px;
}
.settings-section-heading {
  margin-bottom: 20px;
}
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.settings-fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.settings-workspace :deep(.settings-fields) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 20px;
  width: 100%;
  max-width: 850px;
}
.settings-workspace :deep(.settings-fields > *) {
  min-width: 0;
  margin: 0;
}
.settings-workspace :deep(.settings-fields > p),
.settings-workspace :deep(.settings-note) {
  grid-column: 1 / -1;
}
.settings-workspace :deep(.settings-fields label) {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}
.settings-workspace :deep(.settings-fields p) {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
}
.settings-workspace :deep(.settings-fields :is(textarea, select, input:not([type='checkbox']))) {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: none;
}
.settings-workspace :deep(.settings-fields :is(textarea, select)) {
  padding: 8px 10px;
}
.settings-workspace :deep(.settings-fields textarea) {
  resize: vertical;
}
.settings-workspace :deep(.settings-fields :is(input, textarea, select):focus-visible) {
  outline: 2px solid var(--color-primary-400);
  outline-offset: 1px;
}
.settings-workspace :deep(input[type='checkbox']) {
  accent-color: var(--color-primary-600);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.settings-workspace :deep(.settings-note) {
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
}
.settings-footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-secondary);
}
.settings-footer p {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
}
.settings-save {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
kbd {
  font-family: inherit;
  color: var(--text-muted, var(--text-secondary));
  font-size: 11px;
}
.settings-auto {
  color: var(--selection-ink, var(--text-primary));
  font-size: 11px;
  white-space: nowrap;
}
.settings-content:has(.receipt-fields) {
  display: flex;
  flex-direction: column;
}
.settings-fieldset:has(.receipt-fields) {
  flex: 1;
  min-height: 0;
}
.settings-workspace :deep(.receipt-fields) {
  height: 100%;
  max-width: none;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.85fr);
}
@media (max-width: 680px) {
  .settings-content:has(.receipt-fields) {
    display: block;
  }
  .settings-workspace :deep(.receipt-fields) {
    height: auto;
  }
  .settings-workspace {
    padding: 8px;
    gap: 8px;
  }
  .settings-content {
    padding: 14px;
  }
  .settings-tabs {
    padding: 0 4px;
  }
  .settings-tabs button {
    padding: 10px;
  }
  .settings-workspace :deep(.settings-fields),
  .settings-content:has(.receipt-fields) {
    display: flex;
    flex-direction: column;
  }
  .settings-fieldset:has(.receipt-fields) {
    flex: 1;
    min-height: 0;
  }
  .settings-workspace :deep(.receipt-fields) {
    height: 100%;
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-footer {
    flex-wrap: wrap;
    padding: 10px 12px;
  }
  .settings-save {
    margin-inline-start: auto;
  }
  kbd {
    display: none;
  }
}
</style>
