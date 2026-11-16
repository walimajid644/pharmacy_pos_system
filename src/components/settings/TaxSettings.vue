<script setup lang="ts">
import type { Ref } from 'vue';
import type { useSettingsForm } from '@/composables/useSettingsForm';
import Input from '@/components/ui/Input.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSettingsForm>;
defineProps<{
  pick: ViewValue<State['pick']>;
  activeTab: ViewValue<State['activeTab']>;
}>();
const formData = defineModel<ViewValue<State['formData']>>('formData', { required: true });
</script>

<template>
  <div v-if="activeTab === 'tax'" class="settings-fields max-w-2xl space-y-6">
    <div>
      <label for="field-taxsettings-1" class="block text-sm font-medium mb-2"
        >{{ pick('Tax Rate', 'ٹیکس کی شرح') }} (%) *</label
      >
      <Input
        id="field-taxsettings-1"
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
      <label for="field-taxsettings-2" class="block text-sm font-medium mb-2">{{
        pick('Currency Symbol', 'کرنسی کی علامت')
      }}</label>
      <Input
        id="field-taxsettings-2"
        v-model="formData.currency_symbol"
        placeholder="e.g. Rs, $, €"
        maxlength="5"
      />
      <p class="text-xs text-muted mt-1">Used in price displays and reports</p>
    </div>

    <div
      class="p-4 bg-banner-info-bg border-banner-info-border border border-banner-info-border rounded-md"
    >
      <div class="flex items-start gap-3">
        <span class="text-2xl">ℹ️</span>
        <div>
          <div class="font-semibold text-info-text">Price Format</div>
          <div class="text-sm text-info-text mt-1">
            Prices will be displayed as: {{ formData.currency_symbol }} 1,234.56
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
