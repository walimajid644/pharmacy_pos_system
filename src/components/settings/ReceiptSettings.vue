<script setup lang="ts">
import type { Ref } from 'vue';
import type { useSettingsForm } from '@/composables/useSettingsForm';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSettingsForm>;
defineProps<{
  pick: ViewValue<State['pick']>;
  activeTab: ViewValue<State['activeTab']>;
}>();
const formData = defineModel<ViewValue<State['formData']>>('formData', { required: true });
</script>

<template>
  <div v-if="activeTab === 'receipt'" class="settings-fields max-w-2xl space-y-6">
    <div>
      <label for="field-receiptsettings-1" class="block text-sm font-medium mb-2">{{
        pick('Receipt Header', 'رسید کا عنوان')
      }}</label>
      <textarea
        id="field-receiptsettings-1"
        v-model="formData.receipt_header"
        class="w-full border rounded-md p-2 text-sm font-mono"
        rows="3"
        placeholder="Welcome to City Pharmacy&#10;Your Health, Our Priority"
      ></textarea>
      <p class="text-xs text-gray-500 mt-1">Printed at the top of receipts (optional)</p>
    </div>

    <div>
      <label for="field-receiptsettings-2" class="block text-sm font-medium mb-2">{{
        pick('Receipt Footer', 'رسید کا اختتام')
      }}</label>
      <textarea
        id="field-receiptsettings-2"
        v-model="formData.receipt_footer"
        class="w-full border rounded-md p-2 text-sm font-mono"
        rows="3"
        placeholder="Thank you for your business!&#10;Exchange policy: 7 days with receipt"
      ></textarea>
      <p class="text-xs text-gray-500 mt-1">Printed at the bottom of receipts (optional)</p>
    </div>

    <div>
      <label class="flex items-center gap-2">
        <input v-model="formData.show_drap" type="checkbox" />
        <span class="text-sm font-medium">{{
          pick('Show DRAP Registration on Receipts', 'رسید پر ڈریپ رجسٹریشن دکھائیں')
        }}</span>
      </label>
      <p class="text-xs text-gray-500 mt-1 ml-6">
        Display Drug Regulatory Authority of Pakistan registration numbers for controlled substances
      </p>
    </div>

    <div class="p-4 bg-gray-50 border border-gray-200 rounded-md">
      <div class="font-semibold mb-2">{{ pick('Receipt Preview', 'رسید کا نمونہ') }}</div>
      <div class="text-xs font-mono bg-white p-3 border rounded">
        <div class="text-center mb-2">{{ formData.company_name || 'Company Name' }}</div>
        <div
          v-if="formData.receipt_header"
          class="text-center text-gray-600 mb-2 whitespace-pre-line"
        >
          {{ formData.receipt_header }}
        </div>
        <div class="border-t border-dashed my-2"></div>
        <div>Date: 25/10/2026 14:30</div>
        <div>Invoice: INV-001</div>
        <div class="border-t border-dashed my-2"></div>
        <div>Panadol 500mg x2 Rs 5.00</div>
        <div>Brufen 400mg x1 Rs 8.50</div>
        <div class="border-t border-dashed my-2"></div>
        <div>Subtotal: Rs 13.50</div>
        <div>Tax ({{ formData.tax_rate }}%): Rs 2.30</div>
        <div class="font-bold">Total: Rs 15.80</div>
        <div class="border-t border-dashed my-2"></div>
        <div
          v-if="formData.receipt_footer"
          class="text-center text-gray-600 mt-2 whitespace-pre-line"
        >
          {{ formData.receipt_footer }}
        </div>
      </div>
    </div>
  </div>
</template>
