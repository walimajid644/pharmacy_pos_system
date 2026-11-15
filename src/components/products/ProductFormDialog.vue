<script setup lang="ts">
import { ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import type { Category, Manufacturer } from '@/lib/types';
import type { ProductFormData } from '@/lib/productForm';
import { useI18n } from '@/lib/i18n';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{
  editingProduct: boolean;
  loading: boolean;
  categories: Category[];
  manufacturers: Manufacturer[];
}>();
const formData = defineModel<ProductFormData>({ required: true });
const emit = defineEmits<{ close: []; save: [] }>();
const { pick } = useI18n();
const formDialog = ref<HTMLElement | null>(null);
const bindFormDialog = bindTemplateRef(formDialog);
useDialogKeyboard(formDialog, () => {
  if (!props.loading) emit('close');
});
</script>

<template>
  <div
    :ref="bindFormDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Product', 'مصنوعات')"
    class="compact-dialog product-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    @click.self="emit('close')"
  >
    <Card class="compact-dialog-card product-dialog-card">
      <div class="p-6 border-b">
        <h2 class="text-xl font-bold">
          {{
            editingProduct
              ? pick('Edit Product', 'مصنوعات میں ترمیم کریں')
              : pick('Add New Product', 'نئی مصنوعات شامل کریں')
          }}
        </h2>
      </div>

      <div class="product-form-grid">
        <!-- Row 1 -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="field-productformdialog-1" class="block text-sm font-medium mb-2"
              >SKU *</label
            >
            <Input
              id="field-productformdialog-1"
              v-model="formData.sku"
              placeholder="e.g. PARA500"
            />
          </div>
          <div>
            <label for="field-productformdialog-2" class="block text-sm font-medium mb-2">{{
              pick('Barcode', 'بار کوڈ')
            }}</label>
            <Input
              id="field-productformdialog-2"
              v-model="formData.barcode"
              :placeholder="pick('Scan or enter barcode', 'بار کوڈ اسکین یا درج کریں')"
            />
          </div>
        </div>

        <!-- Row 2 -->
        <div>
          <label for="field-productformdialog-3" class="block text-sm font-medium mb-2"
            >{{ pick('Product Name', 'مصنوعات کا نام') }} *</label
          >
          <Input
            id="field-productformdialog-3"
            v-model="formData.name"
            placeholder="e.g. Panadol 500mg"
          />
        </div>

        <!-- Row 3 -->
        <div>
          <label for="field-productformdialog-4" class="block text-sm font-medium mb-2">{{
            pick('Generic Name', 'عام نام')
          }}</label>
          <Input
            id="field-productformdialog-4"
            v-model="formData.generic_name"
            placeholder="e.g. Paracetamol"
          />
        </div>

        <!-- Row 4 -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="field-productformdialog-5" class="block text-sm font-medium mb-2">{{
              pick('Category', 'زمرہ')
            }}</label>
            <select
              id="field-productformdialog-5"
              v-model="formData.category_id"
              class="w-full border rounded-md bg-background p-2"
            >
              <option value="">{{ pick('Select category', 'زمرہ منتخب کریں') }}</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div>
            <label for="field-productformdialog-6" class="block text-sm font-medium mb-2">{{
              pick('Manufacturer', 'بنانے والا')
            }}</label>
            <select
              id="field-productformdialog-6"
              v-model="formData.manufacturer_id"
              class="w-full border rounded-md bg-background p-2"
            >
              <option value="">{{ pick('Select manufacturer', 'بنانے والا منتخب کریں') }}</option>
              <option v-for="mfg in manufacturers" :key="mfg.id" :value="mfg.id">
                {{ mfg.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Row 5 -->
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label for="field-productformdialog-7" class="block text-sm font-medium mb-2">{{
              pick('Retail unit price (Rs) *', 'ریٹیل اکائی قیمت (روپے) *')
            }}</label>
            <Input
              id="field-productformdialog-7"
              v-model.number="formData.unit_price"
              type="number"
              step="0.01"
            />
          </div>
          <div>
            <label for="field-productformdialog-8" class="block text-sm font-medium mb-2"
              >Cost Price (Rs) *</label
            >
            <Input
              id="field-productformdialog-8"
              v-model.number="formData.cost_price"
              type="number"
              step="0.01"
            />
          </div>
          <div>
            <label for="field-productformdialog-9" class="block text-sm font-medium mb-2"
              >Pack Size *</label
            >
            <Input
              id="field-productformdialog-9"
              v-model.number="formData.pack_size"
              type="number"
            />
          </div>
        </div>

        <label class="block text-sm font-medium"
          >{{ pick('Wholesale unit price (Rs)', 'ہول سیل اکائی قیمت (روپے)')
          }}<Input
            v-model="formData.wholesale_price"
            type="number"
            min="0"
            step="0.01"
            :placeholder="pick('Blank = retail price', 'خالی = ریٹیل قیمت')"
          /><small>{{
            pick(
              'Applied to wholesale customers; charged prices remain saved on invoice lines.',
              'ہول سیل گاہکوں پر لاگو؛ وصول کردہ قیمت انوائس میں محفوظ رہتی ہے۔',
            )
          }}</small></label
        >
        <!-- Row 6 -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="field-productformdialog-10" class="block text-sm font-medium mb-2"
              >DRAP Registration</label
            >
            <Input
              id="field-productformdialog-10"
              v-model="formData.drap_registration_number"
              placeholder="DRAP-123456"
            />
          </div>
          <div>
            <label for="field-productformdialog-11" class="block text-sm font-medium mb-2"
              >Reorder Level</label
            >
            <Input
              id="field-productformdialog-11"
              v-model.number="formData.reorder_level"
              type="number"
            />
          </div>
        </div>

        <!-- Checkboxes -->
        <div class="flex gap-6">
          <label class="flex items-center gap-2">
            <input v-model="formData.sell_by_loose_unit" type="checkbox" />
            <span class="text-sm">Sell by loose unit</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="formData.controlled_substance" type="checkbox" />
            <span class="text-sm">Controlled substance</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="formData.is_active" type="checkbox" />
            <span class="text-sm">Active</span>
          </label>
        </div>
      </div>

      <div class="p-6 border-t flex justify-end gap-3">
        <Button variant="outline" @click="emit('close')" :disabled="loading"> Cancel </Button>
        <Button @click="emit('save')" :disabled="loading">
          {{ loading ? 'Saving...' : 'Save Product' }}
        </Button>
      </div>
    </Card>
  </div>
</template>
