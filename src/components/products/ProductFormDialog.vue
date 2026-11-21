<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
  shelfLocations: Category[];
}>();
const formData = defineModel<ProductFormData>({ required: true });
const categoryOptions = computed(() =>
  props.categories.filter((item) => item.is_active || item.id === formData.value.category_id),
);
const manufacturerOptions = computed(() =>
  props.manufacturers.filter(
    (item) => item.is_active || item.id === formData.value.manufacturer_id,
  ),
);
const shelfOptions = computed(() =>
  props.shelfLocations.filter(
    (item) => item.is_active || item.name === formData.value.shelf_location,
  ),
);
const emit = defineEmits<{ close: []; save: [] }>();
const { pick } = useI18n();
const formDialog = ref<HTMLElement | null>(null);
const bindFormDialog = bindTemplateRef(formDialog);
useDialogKeyboard(formDialog, () => {
  if (!props.loading) emit('close');
});

// ── Price calculation logic ────────────────────────────────────
const MARKUP_PERCENT = 15; // 15% markup from cost to sale price
const isCalculating = ref(false); // Prevent circular updates

// Watch cost price changes and update sale price
watch(
  () => formData.value.cost_price,
  (newCost, oldCost) => {
    if (isCalculating.value) return;
    if (newCost === oldCost) return;

    const cost = Number(newCost);
    if (cost > 0 && Number.isFinite(cost)) {
      isCalculating.value = true;
      const salePrice = cost * (1 + MARKUP_PERCENT / 100);
      formData.value.unit_price = Math.round(salePrice * 100) / 100;
      isCalculating.value = false;
    }
  },
);

// Watch sale price changes and update cost price
watch(
  () => formData.value.unit_price,
  (newSale, oldSale) => {
    if (isCalculating.value) return;
    if (newSale === oldSale) return;

    const sale = Number(newSale);
    if (sale > 0 && Number.isFinite(sale)) {
      isCalculating.value = true;
      const costPrice = sale / (1 + MARKUP_PERCENT / 100);
      formData.value.cost_price = Math.round(costPrice * 100) / 100;
      isCalculating.value = false;
    }
  },
);
</script>

<template>
  <div
    :ref="bindFormDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Product', 'مصنوعات')"
    class="compact-dialog product-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    @pointerdown.self.prevent
  >
    <Card class="compact-dialog-card product-dialog-card">
      <!-- ── Header ───────────────────────────────────────────── -->
      <div class="p-dialog-header border-b flex items-center justify-between">
        <h2 class="text-xl font-bold">
          {{
            editingProduct
              ? pick('Edit Product', 'مصنوعات میں ترمیم کریں')
              : pick('Add New Product', 'نئی مصنوعات شامل کریں')
          }}
        </h2>
        <div class="p-reg-date flex items-center gap-2">
          <span class="font-semibold">{{ pick('Registration Date', 'اندراج کی تاریخ') }}</span>
          <Input v-model="formData.registration_date" type="date" class="p-reg-date-input" />
        </div>
      </div>

      <!-- ── ITEM INFORMATION ────────────────────────────────── -->
      <div class="p-section-label">{{ pick('ITEM INFORMATION', 'آئٹم کی معلومات') }}</div>

      <div class="p-item-info-grid">
        <!-- Left column: identification fields -->
        <div class="p-item-left">
          <!-- Category -->
          <div class="p-field-row">
            <label for="pf-category" class="p-field-lbl">{{ pick('Category', 'زمرہ') }}</label>
            <select id="pf-category" v-model="formData.category_id" class="p-field-ctrl">
              <option value="">{{ pick('Select', 'منتخب کریں') }}</option>
              <option v-for="cat in categoryOptions" :key="cat.id" :value="cat.id">
                {{ cat.name }}{{ !cat.is_active ? pick(' (inactive)', ' (غیر فعال)') : '' }}
              </option>
            </select>
          </div>
          <!-- Company / Manufacturer -->
          <div class="p-field-row">
            <label for="pf-mfg" class="p-field-lbl">{{ pick('Company', 'کمپنی') }}</label>
            <select id="pf-mfg" v-model="formData.manufacturer_id" class="p-field-ctrl">
              <option value="">{{ pick('Select', 'منتخب کریں') }}</option>
              <option v-for="mfg in manufacturerOptions" :key="mfg.id" :value="mfg.id">
                {{ mfg.name }}{{ !mfg.is_active ? pick(' (inactive)', ' (غیر فعال)') : '' }}
              </option>
            </select>
          </div>
          <!-- DRAP (Supplier equivalent) -->
          <div class="p-field-row">
            <label for="pf-drap" class="p-field-lbl">{{ pick('DRAP Reg.', 'DRAP') }}</label>
            <Input
              id="pf-drap"
              v-model="formData.drap_registration_number"
              placeholder="DRAP-123456"
              class="p-field-ctrl"
            />
          </div>
          <!-- SKU / Code -->
          <div class="p-field-row">
            <label for="pf-sku" class="p-field-lbl">{{ pick('Code / SKU', 'کوڈ') }}</label>
            <Input
              id="pf-sku"
              v-model="formData.sku"
              placeholder="e.g. PARA500"
              class="p-field-ctrl"
            />
          </div>
          <!-- Name / Description -->
          <div class="p-field-row">
            <label for="pf-name" class="p-field-lbl">{{ pick('Description', 'تفصیل') }} *</label>
            <Input
              id="pf-name"
              v-model="formData.name"
              placeholder="e.g. Panadol 500mg"
              class="p-field-ctrl"
            />
          </div>
        </div>

        <!-- Right column: shelf + barcode display -->
        <div class="p-item-right">
          <!-- Shelf / Location -->
          <div class="p-field-row">
            <label for="pf-shelf" class="p-field-lbl">{{ pick('Shelf / Location', 'شیلف') }}</label>
            <select id="pf-shelf" v-model="formData.shelf_location" class="p-field-ctrl">
              <option value="">{{ pick('None', 'کوئی نہیں') }}</option>
              <option v-for="location in shelfOptions" :key="location.id" :value="location.name">
                {{ location.name
                }}{{ !location.is_active ? pick(' (inactive)', ' (غیر فعال)') : '' }}
              </option>
              <option
                v-if="
                  formData.shelf_location &&
                  !shelfLocations.some((item) => item.name === formData.shelf_location)
                "
                :value="formData.shelf_location"
              >
                {{ formData.shelf_location }}
              </option>
            </select>
          </div>
          <!-- Barcode display box -->
          <div class="p-barcode-box">
            <span class="p-barcode-label">{{ pick('Bar Code', 'بار کوڈ') }}</span>
            <div class="p-barcode-value">{{ formData.barcode || '—' }}</div>
            <Input
              id="pf-barcode"
              v-model="formData.barcode"
              :placeholder="pick('Scan or enter barcode', 'بار کوڈ اسکین کریں')"
              class="p-barcode-input"
            />
          </div>
        </div>
      </div>

      <!-- ── ITEM OPTIONAL INFO ──────────────────────────────── -->
      <div class="p-section-label">{{ pick('ITEM OPTIONAL INFO', 'اختیاری معلومات') }}</div>

      <div class="p-optional-grid">
        <!-- Generic Name -->
        <div class="p-field-row p-col-span-2">
          <label for="pf-generic" class="p-field-lbl">{{ pick('For / Generic', 'عام نام') }}</label>
          <Input
            id="pf-generic"
            v-model="formData.generic_name"
            placeholder="e.g. Paracetamol"
            class="p-field-ctrl"
          />
        </div>
        <!-- Remarks -->
        <div class="p-field-row p-col-span-2">
          <label for="pf-remarks" class="p-field-lbl">{{ pick('Remarks', 'ریمارکس') }}</label>
          <Input
            id="pf-remarks"
            maxlength="1000"
            v-model="formData.remarks"
            placeholder=""
            class="p-field-ctrl"
          />
        </div>
        <!-- UOM -->
        <div class="p-field-row">
          <label for="pf-uom" class="p-field-lbl">{{ pick('UOM', 'UOM') }}</label>
          <select id="pf-uom" v-model="formData.uom" class="p-field-ctrl">
            <option value="box">BOX</option>
            <option value="strip">STRIP</option>
            <option value="unit">UNIT</option>
            <option value="bottle">BOTTLE</option>
          </select>
        </div>
        <!-- Pack Size (UOM Detail) -->
        <div class="p-field-row">
          <label for="pf-packsize" class="p-field-lbl">{{ pick('UOM Detail', 'UOM تفصیل') }}</label>
          <Input
            id="pf-packsize"
            v-model.number="formData.pack_size"
            type="number"
            class="p-field-ctrl"
          />
        </div>
        <!-- Pack Type -->
        <div class="p-field-row">
          <label for="pf-packtype" class="p-field-lbl">{{ pick('Pack Type', 'پیک قسم') }}</label>
          <Input
            id="pf-packtype"
            maxlength="40"
            v-model="formData.pack_type"
            placeholder="e.g. 20s"
            class="p-field-ctrl"
          />
        </div>
        <!-- spacer -->
        <div></div>
      </div>

      <!-- ── PRICING & STOCK SECTION ─────────────────────────── -->
      <div class="p-pricing-row">
        <!-- Sale Price -->
        <div class="p-price-group">
          <div class="p-price-group-title">{{ pick('Sale Price', 'فروخت قیمت') }}</div>
          <div class="p-field-row">
            <label for="pf-uprice" class="p-field-lbl">{{
              pick('Unit Price', 'اکائی قیمت')
            }}</label>
            <Input
              id="pf-uprice"
              v-model.number="formData.unit_price"
              type="number"
              step="0.01"
              class="p-field-ctrl-sm"
            />
          </div>
          <div class="p-field-row">
            <label for="pf-wholesale" class="p-field-lbl">{{ pick('Wholesale', 'ہول سیل') }}</label>
            <Input
              id="pf-wholesale"
              v-model.number="formData.wholesale_price"
              type="number"
              step="0.01"
              class="p-field-ctrl-sm"
            />
          </div>
        </div>

        <!-- Purchase Price -->
        <div class="p-price-group">
          <div class="p-price-group-title">{{ pick('Purchase Price', 'خرید قیمت') }}</div>
          <div class="p-field-row">
            <label for="pf-costprice" class="p-field-lbl">{{
              pick('Unit Price', 'اکائی قیمت')
            }}</label>
            <Input
              id="pf-costprice"
              v-model.number="formData.cost_price"
              type="number"
              step="0.01"
              class="p-field-ctrl-sm"
            />
          </div>
          <div class="p-field-row">
            <label for="pf-extdisc" class="p-field-lbl">{{
              pick('Ext Disc %', 'اضافی چھوٹ')
            }}</label>
            <Input
              id="pf-extdisc"
              min="0"
              max="100"
              v-model.number="formData.ext_disc_percent"
              type="number"
              step="0.01"
              class="p-field-ctrl-sm"
            />
          </div>
        </div>

        <!-- Levels -->
        <div class="p-price-group">
          <div class="p-price-group-title">{{ pick('Stock Levels', 'اسٹاک سطح') }}</div>
          <div class="p-field-row">
            <label for="pf-stm" class="p-field-lbl">{{ pick('STM Level (Pack)', 'STM') }}</label>
            <Input
              id="pf-stm"
              min="0"
              max="1000000000"
              step="1"
              v-model.number="formData.stm_level"
              type="number"
              class="p-field-ctrl-sm"
            />
          </div>
          <div class="p-field-row">
            <label for="pf-reorder" class="p-field-lbl">{{
              pick('Re-Order Level (Pack)', 'ری آرڈر')
            }}</label>
            <Input
              id="pf-reorder"
              v-model.number="formData.reorder_level"
              type="number"
              class="p-field-ctrl-sm"
            />
          </div>
        </div>

        <!-- Current Stock (read-only display) -->
        <div class="p-price-group">
          <div class="p-price-group-title">{{ pick('Current Stock', 'موجودہ اسٹاک') }}</div>
          <div class="p-stock-subrow">
            <div class="p-stock-cell">
              <span class="p-field-lbl">{{ pick('In Loose', 'کھلے') }}</span>
              <div class="p-stock-display">{{ formData.stock_in_loose ?? 0 }}</div>
            </div>
            <div class="p-stock-cell">
              <span class="p-field-lbl">{{ pick('In Packs', 'پیک') }}</span>
              <div class="p-stock-display">{{ formData.stock_in_packs ?? 0 }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── CHECKBOXES / FLAGS ──────────────────────────────── -->
      <div class="p-flags-row">
        <label class="p-flag-chk">
          <input v-model="formData.is_active" type="checkbox" />
          <span>{{ pick('Active', 'فعال') }}</span>
        </label>
        <label class="p-flag-chk">
          <input v-model="formData.maintain_batch" type="checkbox" />
          <span>{{ pick('Maintain Batch #', 'بیچ نمبر') }}</span>
        </label>
        <label class="p-flag-chk">
          <input v-model="formData.fridge_item" type="checkbox" />
          <span>{{ pick('Fridge Item', 'فریج آئٹم') }}</span>
        </label>
        <label class="p-flag-chk">
          <input v-model="formData.controlled_substance" type="checkbox" />
          <span>{{ pick('Narcotic Item', 'نشہ آور') }}</span>
        </label>
        <label class="p-flag-chk">
          <input v-model="formData.sell_by_loose_unit" type="checkbox" />
          <span>{{ pick('Sell by Loose Unit', 'کھلے فروخت') }}</span>
        </label>
      </div>

      <!-- ── Footer Actions ──────────────────────────────────── -->
      <div class="border-t flex justify-end gap-3">
        <Button variant="outline" :disabled="loading" @click="emit('close')">
          {{ pick('Cancel', 'منسوخ') }}
        </Button>
        <Button :disabled="loading" @click="emit('save')">
          {{ loading ? pick('Saving…', 'محفوظ ہو رہا ہے…') : pick('Save Product', 'محفوظ کریں') }}
        </Button>
      </div>
    </Card>
  </div>
</template>

<style scoped>
/* ── Override modal size for better readability ─────────────── */
.product-dialog-card {
  width: min(1200px, 98%) !important;
  max-height: calc(100dvh - 24px) !important;
}

.product-dialog h2 {
  font-size: 20px !important;
}

/* ── Section label strip ───────────────────────────────────── */
.p-section-label {
  padding: 5px 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--compact-panel);
  border-top: 1px solid var(--compact-rule);
  border-bottom: 1px solid var(--compact-rule);
  color: var(--compact-ink);
}

/* ── Header registration date ──────────────────────────────── */
.p-dialog-header {
  padding: 10px 16px;
  background: var(--compact-panel);
  border-color: var(--compact-rule);
}
.p-reg-date {
  font-size: 12px;
}
.p-reg-date-input {
  width: 140px;
}

/* ── ITEM INFORMATION two-column layout ────────────────────── */
.p-item-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 14px 16px;
  background: var(--compact-entry);
}
.p-item-left {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-right: 20px;
  border-right: 1px solid var(--compact-rule);
}
.p-item-right {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 20px;
}

/* ── Shared field row (label + control inline) ─────────────── */
.p-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.p-field-lbl {
  flex: 0 0 130px;
  font-size: 12px;
  font-weight: 600;
  color: var(--compact-ink);
  text-align: right;
  white-space: nowrap;
}
.p-field-ctrl {
  flex: 1;
  min-width: 0;
}

/* ── Barcode display ───────────────────────────────────────── */
.p-barcode-box {
  border: 1px solid var(--compact-rule);
  border-radius: var(--radius-sm);
  background: var(--surface-card);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.p-barcode-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--compact-ink);
}
.p-barcode-value {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--compact-ink);
  min-height: 38px;
  line-height: 1.2;
}
.p-barcode-input {
  width: 100%;
}

/* ── OPTIONAL INFO grid ────────────────────────────────────── */
.p-optional-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px 14px;
  padding: 12px 16px;
  background: var(--compact-entry);
}
.p-col-span-2 {
  grid-column: span 2;
}
.p-optional-grid .p-field-lbl {
  flex: 0 0 110px;
  text-align: right;
}

/* ── PRICING ROW ───────────────────────────────────────────── */
.p-pricing-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 12px 16px;
  background: var(--compact-entry);
  border-top: 1px solid var(--compact-rule);
}
.p-price-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px;
  border-right: 1px solid var(--compact-rule);
}
.p-price-group:first-child {
  padding-left: 0;
}
.p-price-group:last-child {
  border-right: none;
}
.p-price-group-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--compact-ink);
  margin-bottom: 3px;
  opacity: 0.7;
}
.p-price-group .p-field-lbl {
  flex: 0 0 140px;
  text-align: right;
  font-size: 12px;
}
.p-field-ctrl-sm {
  flex: 1;
  min-width: 0;
  max-width: 100px;
}

/* ── Current Stock display cells ───────────────────────────── */
.p-stock-subrow {
  display: flex;
  gap: 12px;
}
.p-stock-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}
.p-stock-cell .p-field-lbl {
  text-align: left;
  flex: unset;
  font-size: 12px;
}
.p-stock-display {
  border: 1px solid var(--compact-rule);
  border-radius: var(--radius-sm);
  background: var(--surface-card);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  padding: 4px 8px;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── FLAGS / Checkboxes ────────────────────────────────────── */
.p-flags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 28px;
  padding: 10px 16px;
  background: var(--compact-panel);
  border-top: 1px solid var(--compact-rule);
}
.p-flag-chk {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* ── Footer ────────────────────────────────────────────────── */
.product-dialog-card > .border-t:last-child {
  padding: 10px 16px !important;
}
</style>
