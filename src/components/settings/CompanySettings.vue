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
  <div v-if="activeTab === 'company'" class="max-w-2xl space-y-6">
    <div>
      <label for="field-companysettings-1" class="block text-sm font-medium mb-2"
        >{{ pick('Company Name', 'کمپنی کا نام') }} *</label
      >
      <Input
        id="field-companysettings-1"
        v-model="formData.company_name"
        placeholder="e.g. City Pharmacy"
      />
      <p class="text-xs text-gray-500 mt-1">
        {{ pick('Displayed on receipts and reports', 'رسیدوں اور رپورٹوں میں ظاہر ہوتا ہے') }}
      </p>
    </div>

    <div>
      <label for="field-companysettings-2" class="block text-sm font-medium mb-2">{{
        pick('Address', 'پتہ')
      }}</label>
      <textarea
        id="field-companysettings-2"
        v-model="formData.company_address"
        class="w-full border rounded-md p-2 text-sm"
        rows="3"
        placeholder="Street address, city, postal code"
      ></textarea>
    </div>

    <div>
      <label for="field-companysettings-3" class="block text-sm font-medium mb-2">{{
        pick('Phone Number', 'فون نمبر')
      }}</label>
      <Input
        id="field-companysettings-3"
        v-model="formData.company_phone"
        placeholder="e.g. 042-12345678"
      />
    </div>
  </div>
</template>
