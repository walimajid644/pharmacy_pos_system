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
  <div v-if="activeTab === 'inventory'" class="settings-fields max-w-2xl space-y-6">
    <div>
      <label for="field-inventorysettings-1" class="block text-sm font-medium mb-2">{{
        pick('Low Stock Threshold', 'کم اسٹاک کی حد')
      }}</label>
      <Input
        id="field-inventorysettings-1"
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
      <label for="field-inventorysettings-2" class="block text-sm font-medium mb-2"
        >{{ pick('Near-Expiry Warning', 'قریب المیعاد انتباہ') }} ({{ pick('Days', 'دن') }})</label
      >
      <Input
        id="field-inventorysettings-2"
        v-model.number="formData.near_expiry_days"
        type="number"
        min="1"
        max="3650"
        placeholder="e.g. 60"
      />
      <p class="text-xs text-muted mt-1">Alert when products expire within this many days</p>
    </div>

    <div class="p-4 bg-warning-bg border border-warning rounded-md">
      <div class="flex items-start gap-3">
        <span class="text-2xl">⚠️</span>
        <div>
          <div class="font-semibold text-warning-text">Alert Settings</div>
          <div class="text-sm text-warning-text mt-1">
            These settings control when alerts appear on the dashboard and in reports.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
