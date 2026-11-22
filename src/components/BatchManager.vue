<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { reportDiagnostic } from '@/lib/diagnostics';

import { errorMessage } from '@/lib/errors';

import { useRouter } from 'vue-router';
import { useI18n } from '@/lib/i18n';
import { ref, onMounted, computed } from 'vue';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { formatCurrency, isNearExpiry, isExpired } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { useToast } from '@/composables/useToast';
import { isUnallocatedStockBatch } from '@/lib/pos';
import type { Product, ProductBatch } from '@/lib/types';
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

interface Props {
  product: Product;
  isOpen: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const router = useRouter(),
  { pick } = useI18n();
const toast = useToast();
const settingsStore = useSettingsStore();
const batches = ref<Array<ProductBatch & { quarantined: number }>>([]);
const loading = ref(false);
const showAddForm = ref(false);
const batchDialog = ref<HTMLElement | null>(null);
useDialogKeyboard(batchDialog, () => emit('close'));

const formData = ref({
  batch_number: '',
  expiry_date: '',
  quantity_in_stock: 0,
  cost_price_at_batch: props.product.cost_price,
  received_date: new Date().toISOString().split('T')[0],
});

const totalStock = computed(() => batches.value.reduce((sum, b) => sum + b.quantity_in_stock, 0));

onMounted(() => {
  void settingsStore.loadSettings();
  loadBatches();
});

async function loadBatches() {
  loading.value = true;
  try {
    batches.value = await executeQuery<ProductBatch & { quarantined: number }>(
      `SELECT b.*,COALESCE((SELECT SUM(quantity) FROM batch_holds h WHERE h.batch_id=b.id AND h.status='held'),0) AS quarantined FROM product_batches b 
       WHERE product_id = ? 
       ORDER BY expiry_date ASC`,
      [props.product.id],
    );
  } catch {
    reportDiagnostic('operation_failed', 'workspace');
    toast.error('Failed to load batches');
  } finally {
    loading.value = false;
  }
}

function getBatchStatus(batch: ProductBatch) {
  if (isUnallocatedStockBatch(batch) || batch.quantity_in_stock < 0) {
    return {
      label: pick('Negative / unallocated', 'منفی / غیر مختص'),
      class: 'bg-banner-warning-bg border-banner-warning-border text-warning-text',
    };
  }
  if (isExpired(batch.expiry_date)) {
    return {
      label: pick('Expired', 'میعاد ختم'),
      class: 'bg-banner-danger-bg border-banner-danger-border text-danger-text',
    };
  }
  if (isNearExpiry(batch.expiry_date, Number(settingsStore.settings?.near_expiry_days ?? 60))) {
    return {
      label: pick('Near expiry', 'قریب المیعاد'),
      class: 'bg-banner-warning-bg border-banner-warning-border text-warning-text',
    };
  }
  if (batch.quantity_in_stock === 0) {
    return { label: pick('Out of stock', 'اسٹاک ختم'), class: 'bg-surface-page text-muted' };
  }
  return {
    label: pick('Active', 'فعال'),
    class: 'bg-banner-success-bg border-banner-success-border text-success-text',
  };
}

async function addBatch() {
  if (!formData.value.batch_number || !formData.value.expiry_date) {
    toast.warning('Batch number and expiry date are required');
    return;
  }

  // Validate expiry date is in the future
  if (new Date(formData.value.expiry_date) <= new Date()) {
    toast.error('Expiry date must be in the future');
    return;
  }

  loading.value = true;
  try {
    const now = new Date().toISOString();
    await invoke('add_product_batch', {
      request: {
        productId: props.product.id,
        batchNumber: formData.value.batch_number,
        expiryDate: formData.value.expiry_date,
        quantity: Number(formData.value.quantity_in_stock),
        cost: Number(formData.value.cost_price_at_batch),
        receivedDate: formData.value.received_date,
        timestamp: now,
      },
    });

    toast.success('Batch added successfully');
    showAddForm.value = false;
    formData.value = {
      batch_number: '',
      expiry_date: '',
      quantity_in_stock: 0,
      cost_price_at_batch: props.product.cost_price,
      received_date: new Date().toISOString().split('T')[0],
    };
    await loadBatches();
  } catch (error: unknown) {
    reportDiagnostic('operation_failed', 'workspace');
    toast.error('Failed to add batch: ' + errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function cancelAdd() {
  showAddForm.value = false;
  formData.value = {
    batch_number: '',
    expiry_date: '',
    quantity_in_stock: 0,
    cost_price_at_batch: props.product.cost_price,
    received_date: new Date().toISOString().split('T')[0],
  };
}
</script>

<template>
  <div
    v-if="isOpen"
    ref="batchDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Batch Management', 'بیچ مینجمنٹ')"
    class="compact-dialog batch-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    @pointerdown.self.prevent
  >
    <Card class="compact-dialog-card batch-dialog-card">
      <!-- Header -->
      <div class="p-6 border-b flex justify-between items-center">
        <div>
          <h2 class="text-xl font-bold">{{ uiLabel('Batch Management') }}</h2>
          <p class="text-sm text-gray-600 mt-1">
            {{ product.name }} ({{ product.sku }}) | Total Stock: {{ totalStock }}
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            @click="
              emit('close');
              router.push('/expiry-actions');
            "
            >{{ pick('Expiry / Quarantine', 'میعاد / قرنطینہ') }}</Button
          >
          <Button variant="outline" @click="emit('close')">{{ pick('Close', 'بند کریں') }}</Button>
        </div>
      </div>

      <!-- Content -->
      <div class="batch-dialog-content">
        <!-- Add Batch Form -->
        <Card v-if="showAddForm" class="batch-add-form">
          <h3 class="font-semibold mb-4">{{ uiLabel('Add New Batch') }}</h3>

          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label for="field-batchmanager-1" class="block text-sm font-medium mb-2">{{
                uiLabel('Batch Number *')
              }}</label>
              <Input
                id="field-batchmanager-1"
                v-model="formData.batch_number"
                placeholder="e.g. BATCH001"
              />
            </div>
            <div>
              <label for="field-batchmanager-2" class="block text-sm font-medium mb-2">{{
                uiLabel('Expiry Date *')
              }}</label>
              <Input id="field-batchmanager-2" v-model="formData.expiry_date" type="date" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label for="field-batchmanager-3" class="block text-sm font-medium mb-2">{{
                uiLabel('Quantity *')
              }}</label>
              <Input
                id="field-batchmanager-3"
                v-model.number="formData.quantity_in_stock"
                type="number"
              />
            </div>
            <div>
              <label for="field-batchmanager-4" class="block text-sm font-medium mb-2">{{
                uiLabel('Cost Price (Rs) *')
              }}</label>
              <Input
                id="field-batchmanager-4"
                v-model.number="formData.cost_price_at_batch"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <label for="field-batchmanager-5" class="block text-sm font-medium mb-2">{{
                uiLabel('Received Date *')
              }}</label>
              <Input id="field-batchmanager-5" v-model="formData.received_date" type="date" />
            </div>
          </div>

          <div class="flex justify-end gap-3">
            <Button variant="outline" @click="cancelAdd" :disabled="loading">Cancel</Button>
            <Button @click="addBatch" :disabled="loading">
              {{ loading ? 'Adding...' : 'Add Batch' }}
            </Button>
          </div>
        </Card>

        <div v-else class="mb-6">
          <Button @click="showAddForm = true">{{ uiLabel('Add New Batch') }}</Button>
        </div>

        <!-- Batches List -->
        <div v-if="loading && batches.length === 0" class="text-center py-12 text-gray-500">
          {{ uiLabel('Loading batches...') }}
        </div>

        <div v-else-if="batches.length === 0" class="text-center py-12 text-gray-500">
          {{ uiLabel('No batches yet. Add your first batch to track stock and expiry.') }}
        </div>

        <CompactPages
          v-else
          :items="batches"
          :row-height="56"
          :header-height="34"
          v-slot="{ rows }"
        >
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b bg-gray-50">
                <th class="text-left p-3 font-semibold">{{ uiLabel('Batch #') }}</th>
                <th class="text-left p-3 font-semibold">{{ uiLabel('Expiry Date') }}</th>
                <th class="text-right p-3 font-semibold">Stock</th>
                <th class="text-right p-3 font-semibold">{{ uiLabel('Cost Price') }}</th>
                <th class="text-left p-3 font-semibold">{{ uiLabel('Received') }}</th>
                <th class="text-center p-3 font-semibold">{{ pick('Status', 'حالت') }}</th>
                <th>{{ pick('Actions', 'کارروائیاں') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item: batch } in rows" :key="batch.id" class="border-b hover:bg-gray-50">
                <td class="p-3 font-mono text-sm">{{ batch.batch_number }}</td>
                <td class="p-3">
                  {{
                    batch.expiry_date
                      ? new Date(batch.expiry_date).toLocaleDateString()
                      : pick('Not recorded', 'درج نہیں')
                  }}
                  <span
                    v-if="
                      isNearExpiry(
                        batch.expiry_date,
                        Number(settingsStore.settings?.near_expiry_days ?? 60),
                      )
                    "
                    class="text-xs text-danger ml-2"
                  >
                    ({{
                      Math.ceil(
                        (new Date(batch.expiry_date).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      )
                    }}
                    {{ uiLabel('days)') }}
                  </span>
                </td>
                <td class="p-3 text-right font-semibold">
                  {{ batch.quantity_in_stock }}
                  <small v-if="batch.quarantined" class="block text-danger"
                    >⛔ {{ batch.quarantined }} {{ pick('quarantined', 'قرنطینہ') }}</small
                  >
                </td>
                <td class="p-3 text-right">{{ formatCurrency(batch.cost_price_at_batch) }}</td>
                <td class="p-3 text-sm">
                  {{
                    batch.received_date ? new Date(batch.received_date).toLocaleDateString() : '—'
                  }}
                </td>
                <td class="p-3 text-center">
                  <span
                    :class="['inline-block px-2 py-1 text-xs rounded', getBatchStatus(batch).class]"
                  >
                    {{ getBatchStatus(batch).label }} </span><small
                    v-if="batch.quarantined"
                    class="stock-badge held"
                    >{{ pick('Quarantined', 'قرنطینہ') }}: {{ batch.quarantined }}</small
                  >
                </td>
                <td>
                  <Button
                    class="expiry-batch-action"
                    variant="outline"
                    size="sm"
                    @click="
                      emit('close');
                      router.push({ path: '/expiry-actions', query: { batch: batch.id } });
                    "
                    >{{ pick('Batch actions', 'بیچ کی کارروائیاں') }}</Button
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>
    </Card>
  </div>
</template>
