<script setup lang="ts">
import type { Theme } from '@/lib/theme';
import type { Language, NumberFormat, DateFormat } from '@/lib/i18n';
import type { Ref } from 'vue';
import type { useSettingsForm } from '@/composables/useSettingsForm';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSettingsForm>;
defineProps<{
  theme: ViewValue<State['theme']>;
  setTheme: ViewValue<State['setTheme']>;
  language: ViewValue<State['language']>;
  setLanguage: ViewValue<State['setLanguage']>;
  numberFormat: ViewValue<State['numberFormat']>;
  setNumberFormat: ViewValue<State['setNumberFormat']>;
  dateFormat: ViewValue<State['dateFormat']>;
  setDateFormat: ViewValue<State['setDateFormat']>;
  formatDate: ViewValue<State['formatDate']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  pick: ViewValue<State['pick']>;
  activeTab: ViewValue<State['activeTab']>;
}>();
</script>

<template>
  <div v-if="activeTab === 'appearance'" class="settings-fields max-w-2xl space-y-5">
    <label class="block text-sm font-medium"
      >{{ pick('Theme', 'تھیم') }}
      <select
        :value="theme"
        class="mt-2 block w-full rounded border bg-background p-2"
        @change="setTheme(($event.target as HTMLSelectElement).value as Theme)"
      >
        <option value="light">{{ pick('Light', 'روشن') }}</option>
        <option value="dark">{{ pick('Dark', 'تاریک') }}</option>
        <option value="auto">{{ pick('Follow Windows', 'ونڈوز کی ترتیب') }}</option>
      </select>
    </label>
    <label class="block text-sm font-medium"
      >{{ pick('Language', 'زبان') }}
      <select
        :value="language"
        class="mt-2 block w-full rounded border bg-background p-2"
        @change="setLanguage(($event.target as HTMLSelectElement).value as Language)"
      >
        <option value="en">English</option>
        <option value="ur">اردو</option>
        <option value="mixed">English / اردو</option>
      </select>
    </label>
    <label class="block text-sm font-medium"
      >{{ pick('Displayed digits', 'ظاہر ہونے والے ہندسے') }}
      <select
        :value="numberFormat"
        class="mt-2 block w-full rounded border bg-background p-2"
        @change="setNumberFormat(($event.target as HTMLSelectElement).value as NumberFormat)"
      >
        <option value="en">0123456789</option>
        <option value="ur">۰۱۲۳۴۵۶۷۸۹</option>
      </select>
    </label>
    <label class="block text-sm font-medium"
      >{{ pick('Displayed dates', 'تاریخ کی شکل') }}
      <select
        :value="dateFormat"
        class="mt-2 block w-full rounded border bg-background p-2"
        @change="setDateFormat(($event.target as HTMLSelectElement).value as DateFormat)"
      >
        <option value="dmy">{{ pick('Day / Month / Year', 'دن / مہینہ / سال') }}</option>
        <option value="mdy">{{ pick('Month / Day / Year', 'مہینہ / دن / سال') }}</option>
        <option value="iso">{{ pick('Year-Month-Day', 'سال-مہینہ-دن') }}</option>
      </select>
    </label>
    <div class="settings-note rounded border p-3 text-sm">
      {{ pick('Preview', 'نمونہ') }}: {{ formatCurrency(1234.5) }} · {{ formatDate('2026-10-25') }}
    </div>
  </div>
</template>
