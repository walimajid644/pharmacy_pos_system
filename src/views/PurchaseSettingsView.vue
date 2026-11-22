<script setup lang="ts">
import { onActionKeydown } from '@/lib/actionKeys';
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { onMounted, reactive, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import { useSettingsStore } from '@/stores/settings';
import { purchaseDefaults, purchasePreferences } from '@/lib/purchasePreferences';
import { useToast } from '@/composables/useToast';
import '@/assets/styles/finance-tools.css';
const store = useSettingsStore();
const form = reactive({ ...purchaseDefaults });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const { showToast } = useToast();
onMounted(async () => {
  await store.loadSettings();
  if (!store.settings)
    error.value = uiLabel('Could not load purchase settings. Reopen this screen.');
  else Object.assign(form, purchasePreferences(store.settings));
  loading.value = false;
});
async function save() {
  error.value = '';
  if (
    !Number.isInteger(Number(form.purchase_default_quantity)) ||
    Number(form.purchase_default_quantity) < 1 ||
    Number(form.purchase_default_quantity) > 1000000
  ) {
    error.value = uiLabel('Default quantity must be a whole number from 1 to 1,000,000.');
    return;
  }
  if (
    [form.purchase_default_tax, form.purchase_default_discount].some(
      (v) =>
        !Number.isFinite(Number(v)) || String(v).trim() === '' || Number(v) < 0 || Number(v) > 100,
    )
  ) {
    error.value = uiLabel('Tax and discount must be percentages from 0 to 100.');
    return;
  }
  saving.value = true;
  try {
    await store.updateSettings(
      Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)])),
    );
    showToast(uiLabel('Purchase form settings saved'), 'success');
  } catch {
    error.value = uiLabel(
      'Could not save purchase settings. Your changes are still on this screen.',
    );
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <section class="money-terminal purchase-settings" @keydown="onActionKeydown">
    <header class="money-toolbar">
      <h1>{{ uiLabel('Purchase Form Settings') }}</h1>
      <Button
        aria-keyshortcuts="Control+s"
        :title="uiLabel('Save settings (Ctrl+S)')"
        permission="settings.manage"
        :disabled="loading || saving || !store.settings"
        @click="save"
        >{{ uiLabel(saving ? 'Saving…' : 'Save Settings') }}</Button
      >
    </header>
    <p>
      {{
        uiLabel(
          'Defaults apply to newly added order lines. Existing saved orders keep their prices, tax and discounts.',
        )
      }}
    </p>
    <div v-if="!loading" class="preference-grid">
      <label
        >{{ uiLabel('Default quantity')
        }}<input
          v-model.number="form.purchase_default_quantity"
          type="number"
          min="1"
          max="1000000"
          step="1"
      /></label>
      <label
        >{{ uiLabel('Default tax %')
        }}<input
          v-model.number="form.purchase_default_tax"
          type="number"
          min="0"
          max="100"
          step="0.01"
      /></label>
      <label
        >{{ uiLabel('Default discount %')
        }}<input
          v-model.number="form.purchase_default_discount"
          type="number"
          min="0"
          max="100"
          step="0.01"
      /></label>
      <label class="money-check"
        ><input v-model="form.purchase_show_tax" type="checkbox" :true-value="1" :false-value="0" />
        {{ uiLabel('Show tax field on zero-tax lines') }}</label
      >
      <label class="money-check"
        ><input
          v-model="form.purchase_show_discount"
          type="checkbox"
          :true-value="1"
          :false-value="0"
        />
        {{ uiLabel('Show discount field on zero-discount lines') }}</label
      >
      <label class="money-check"
        ><input
          v-model="form.purchase_fill_remaining"
          type="checkbox"
          :true-value="1"
          :false-value="0"
        />
        {{ uiLabel('Prefill remaining quantities when receiving') }}</label
      >
    </div>
    <p>
      {{
        uiLabel(
          'Lines with a nonzero tax or discount always show that field. Receiving always requires a batch number and future expiry date.',
        )
      }}
    </p>
    <small>{{ uiLabel('Ctrl+S: Save settings') }}</small>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.purchase-settings {
  gap: 16px;
}
.preference-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  padding: 20px;
  background: var(--surface-card);
  border: 1px solid var(--border);
}
.preference-grid label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preference-grid .money-check {
  flex-direction: row;
  align-items: center;
}
input[type='number'] {
  padding: 8px;
  border: 1px solid var(--border);
  background: var(--surface-secondary);
  color: var(--text-primary);
}
p {
  font-size: 13px;
  color: var(--text-secondary);
}
[role='alert'] {
  color: var(--color-danger);
}
</style>
