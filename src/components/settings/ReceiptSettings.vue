<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { ref, computed, type Ref } from 'vue';
import { useElementSize } from '@vueuse/core';
const previewViewport = ref<HTMLElement | null>(null);
const previewPaper = ref<HTMLElement | null>(null);
const viewportSize = useElementSize(previewViewport);
const paperSize = useElementSize(previewPaper, { width: 302, height: 1 }, { box: 'border-box' });
const previewScale = computed(() =>
  Math.min(
    1,
    (viewportSize.width.value - 12) / (paperSize.width.value || 302),
    (viewportSize.height.value - 12) / (paperSize.height.value || 1),
  ),
);

import type { useSettingsForm } from '@/composables/useSettingsForm';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSettingsForm>;
defineProps<{
  pick: ViewValue<State['pick']>;
  activeTab: ViewValue<State['activeTab']>;
}>();
const formData = defineModel<ViewValue<State['formData']>>('formData', { required: true });

// Handle logo file upload
function handleLogoUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    alert('Please select a valid image file (PNG, JPG, or GIF)');
    target.value = '';
    return;
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    alert('Image file is too large. Please select an image under 5MB.');
    target.value = '';
    return;
  }

  // Convert to base64 data URL for embedding
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result;
    if (typeof result === 'string') formData.value.receipt_logo_path = result;
  };
  reader.onerror = () => {
    alert('Error reading file. Please try again.');
    target.value = '';
  };
  reader.readAsDataURL(file);
}

// Clear logo
function clearLogo() {
  formData.value.receipt_logo_path = '';
  // Clear file input
  const fileInput = document.getElementById('field-receiptsettings-logo') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
}
</script>

<template>
  <div v-if="activeTab === 'receipt'" class="settings-fields receipt-fields max-w-2xl space-y-6">
    <div class="receipt-options">
      <div>
        <label for="field-receiptsettings-logo" class="block text-sm font-medium mb-2">{{
          pick('Pharmacy Logo (Optional)', 'فارمیسی کا لوگو (اختیاری)')
        }}</label>

        <!-- File input for selecting logo -->
        <div class="space-y-2">
          <input
            id="field-receiptsettings-logo"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif"
            class="w-full border rounded-md p-2 text-sm"
            @change="handleLogoUpload"
          />

          <!-- Show current logo path if exists -->
          <div
            v-if="formData.receipt_logo_path"
            class="flex items-center gap-2 p-2 bg-gray-50 rounded border"
          >
            <span class="text-xs text-gray-600">{{ uiLabel('Current:') }}</span>
            <span class="text-xs font-mono flex-1">{{
              formData.receipt_logo_path.startsWith('data:image/')
                ? pick('Uploaded image', 'اپ لوڈ شدہ تصویر')
                : formData.receipt_logo_path
            }}</span>
            <button
              type="button"
              class="receipt-remove text-xs text-red-600 hover:text-red-800"
              @click="clearLogo"
            >
              {{ pick('Remove', 'ہٹائیں') }}
            </button>
          </div>

          <!-- Or manual path input -->
          <details class="text-xs">
            <summary class="cursor-pointer text-gray-600 hover:text-gray-800">
              {{ pick('Or enter path manually', 'یا دستی طور پر راستہ درج کریں') }}
            </summary>
            <input
              :aria-label="pick('Logo file path', 'لوگو فائل کا راستہ')"
              v-model="formData.receipt_logo_path"
              type="text"
              class="w-full border rounded-md p-2 text-sm mt-2"
              placeholder="./assets/logo.png"
            />
          </details>
        </div>

        <p class="text-xs text-gray-500 mt-1">
          {{
            pick(
              'Upload PNG, JPG, or GIF image (recommended: 200-300px wide)',
              'PNG، JPG، یا GIF تصویر اپ لوڈ کریں (تجویز: 200-300px چوڑی)',
            )
          }}
        </p>
      </div>

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
        <p class="text-xs text-gray-500 mt-1">
          {{ uiLabel('Printed at the top of receipts (optional)') }}
        </p>
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
        <p class="text-xs text-gray-500 mt-1">
          {{ uiLabel('Printed at the bottom of receipts (optional)') }}
        </p>
      </div>

      <div>
        <label class="flex items-center gap-2">
          <input v-model="formData.show_drap" type="checkbox" />
          <span class="text-sm font-medium">{{
            pick('Show DRAP Registration on Receipts', 'رسید پر ڈریپ رجسٹریشن دکھائیں')
          }}</span>
        </label>
        <p class="text-xs text-gray-500 mt-1 ml-6">
          {{
            uiLabel(
              'Display Drug Regulatory Authority of Pakistan registration numbers for controlled substances',
            )
          }}
        </p>
      </div>
    </div>

    <div class="receipt-preview">
      <div class="font-semibold mb-2">{{ pick('Receipt Preview', 'رسید کا نمونہ') }}</div>

      <!-- Scrollable container for the receipt with increased height -->
      <div ref="previewViewport" class="receipt-preview-viewport">
        <div
          ref="previewPaper"
          class="receipt-preview-paper text-xs p-3"
          :style="{ transform: `translateX(-50%) scale(${Math.max(0, previewScale)})` }"
        >
          <!-- Logo placeholder or actual image -->
          <div v-if="formData.receipt_logo_path" class="text-center mb-2">
            <!-- Show actual image if it's a data URL (base64) -->
            <img
              v-if="formData.receipt_logo_path.startsWith('data:image')"
              :src="formData.receipt_logo_path"
              alt="Logo"
              class="mx-auto"
              style="max-width: 60mm; max-height: 20mm; object-fit: contain"
            />
            <!-- Show placeholder if it's just a path -->
            <div v-else class="p-2 border border-dashed">
              <div class="text-gray-400 text-xs">{{ uiLabel('[LOGO]') }}</div>
              <div class="text-gray-500 text-xs">{{ formData.receipt_logo_path }}</div>
            </div>
          </div>

          <!-- Company Name -->
          <div class="text-center font-bold text-sm mb-1">
            {{ formData.company_name || 'Company Name' }}
          </div>

          <!-- Company Address and Phone -->
          <div
            v-if="formData.company_address || formData.company_phone"
            class="text-center text-xs mb-1"
          >
            <div v-if="formData.company_address">{{ formData.company_address }}</div>
            <div v-if="formData.company_phone">{{ formData.company_phone }}</div>
          </div>

          <!-- Receipt Header (Custom) -->
          <div
            v-if="formData.receipt_header"
            class="text-center text-gray-600 mb-2 whitespace-pre-line text-xs"
          >
            {{ formData.receipt_header }}
          </div>

          <div class="border-t border-dashed my-2"></div>

          <!-- Header: Date/Time and User -->
          <div class="flex justify-between mb-1">
            <span>21-Nov-2026 01:22 PM</span>
            <span class="font-bold">ADMIN</span>
          </div>

          <!-- Payment Mode -->
          <div class="mb-1">
            <span>{{ uiLabel('Payment Mode:') }} </span>
            <span class="font-bold">{{ uiLabel('Cash') }}</span>
          </div>

          <!-- Section Title -->
          <div class="text-center font-bold my-1">{{ uiLabel('BILL/CASH MEMO') }}</div>

          <!-- Invoice Number -->
          <div class="mb-2">
            <span>{{ uiLabel('Inv #:') }} </span>
            <span class="font-bold">55046</span>
          </div>

          <!-- Client Name -->
          <div class="mb-2">
            <div>{{ uiLabel('Client Name:') }}</div>
            <div>{{ uiLabel('Walk-in Customer') }}</div>
          </div>

          <!-- Items Table Header -->
          <table class="w-full text-xs border-b border-black">
            <thead>
              <tr>
                <th class="text-left pb-1">{{ uiLabel('ITEM NAME') }}</th>
                <th class="text-center pb-1" style="width: 15%">{{ uiLabel('QTY') }}</th>
                <th class="text-right pb-1" style="width: 22%">{{ uiLabel('RATE') }}</th>
                <th class="text-right pb-1" style="width: 22%">{{ uiLabel('AMT') }}</th>
              </tr>
            </thead>
          </table>

          <!-- Items -->
          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>HUMULIN 70/30 VIAL</div>
                  </td>
                  <td class="text-center" style="width: 15%">1</td>
                  <td class="text-right" style="width: 22%">1663.00</td>
                  <td class="text-right" style="width: 22%">1663.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>TREVIAMET 50/850MG</div>
                    <div class="text-gray-500" style="font-size: 0.65rem">TAB</div>
                  </td>
                  <td class="text-center" style="width: 15%">30</td>
                  <td class="text-right" style="width: 22%">32.50</td>
                  <td class="text-right" style="width: 22%">975.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>ZOPENT 40MG TAB</div>
                    <div v-if="formData.show_drap" class="text-gray-500" style="font-size: 0.65rem">
                      DRAP: 12345-ABC
                    </div>
                  </td>
                  <td class="text-center" style="width: 15%">30</td>
                  <td class="text-right" style="width: 22%">38.75</td>
                  <td class="text-right" style="width: 22%">1162.50</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>LEVOPRAID 25MG TAB</div>
                  </td>
                  <td class="text-center" style="width: 15%">30</td>
                  <td class="text-right" style="width: 22%">26.85</td>
                  <td class="text-right" style="width: 22%">805.50</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>CIDINE 1MG TAB</div>
                  </td>
                  <td class="text-center" style="width: 15%">30</td>
                  <td class="text-right" style="width: 22%">35.90</td>
                  <td class="text-right" style="width: 22%">1077.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>JARDY 10MG TAB</div>
                  </td>
                  <td class="text-center" style="width: 15%">30</td>
                  <td class="text-right" style="width: 22%">31.35</td>
                  <td class="text-right" style="width: 22%">940.50</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="border-b border-dotted py-1">
            <table class="w-full text-xs">
              <tbody>
                <tr>
                  <td class="text-left" style="width: 41%">
                    <div>BD INSULIN SYRINGE</div>
                    <div class="text-gray-500" style="font-size: 0.65rem">BRAUN</div>
                  </td>
                  <td class="text-center" style="width: 15%">2</td>
                  <td class="text-right" style="width: 22%">45.00</td>
                  <td class="text-right" style="width: 22%">90.00</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Summary Line -->
          <div class="flex justify-between py-1 border-t border-b border-black font-bold my-1">
            <span>{{ uiLabel('Items') }} <strong>7</strong></span>
            <span>{{ uiLabel('Gross:') }} <strong>6,713.50</strong></span>
          </div>

          <!-- Thank You -->
          <div class="text-center font-bold my-2">
            <div>{{ uiLabel('THANK YOU') }}</div>
            <div>{{ uiLabel('for Visiting us.') }}</div>
          </div>

          <!-- Total -->
          <div class="text-right font-bold text-sm mb-2">
            <span>{{ uiLabel('Total:') }}</span>
            <span class="ml-3 text-base">6714</span>
          </div>

          <div class="border-t border-dashed my-2"></div>

          <!-- Receipt Footer (Custom) -->
          <div
            v-if="formData.receipt_footer"
            class="text-center text-gray-600 mb-2 whitespace-pre-line"
            style="font-size: 0.65rem; line-height: 1.3"
          >
            {{ formData.receipt_footer }}
          </div>

          <!-- Default Footer -->
          <div class="text-center text-gray-600 mt-2" style="font-size: 0.6rem; line-height: 1.3">
            <p>
              {{
                uiLabel(
                  'Please ensure that medicines and other item tally with your prescription/demand and is not expired and no claim / return / exchange would be entertained after leaving counter.',
                )
              }}
            </p>
            <p class="font-bold mt-1">Developed By IBS: (0304-5117454)</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-500 mt-3 text-center">
        {{
          pick(
            '80 mm receipt preview — fitted to the available space',
            '۸۰ ملی میٹر رسید کا مکمل نمونہ دستیاب جگہ کے مطابق دکھایا گیا ہے',
          )
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.receipt-options {
  grid-column: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding-inline-end: 4px;
}
.receipt-preview {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  border: 1px solid var(--border);
  background: var(--surface-secondary);
  border-radius: 6px;
}
.receipt-preview-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-page);
}
.receipt-preview-paper {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 80mm;
  transform-origin: top center;
  color: #000;
  background: #fff;
  color-scheme: light;
}
.receipt-preview-paper {
  overflow-wrap: anywhere;
}
.receipt-preview-paper th {
  position: static !important;
}
.receipt-preview-paper tr {
  height: auto !important;
}
.receipt-preview-paper :is(td, th) {
  padding: 2px 0 !important;
  font-size: 10px !important;
  line-height: 1.2;
  color: #000 !important;
  background: #fff !important;
}
.receipt-preview-paper .border-b {
  padding: 2px 0 !important;
}
.receipt-preview-paper :is(.text-gray-400, .text-gray-500, .text-gray-600) {
  color: #555 !important;
}
.receipt-preview p {
  margin: 4px 0 0;
}
.receipt-remove {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid var(--banner-danger-border);
  border-radius: 4px;
  color: var(--banner-danger-text);
  background: var(--banner-danger-bg);
}
.receipt-fields details input,
.receipt-fields .font-mono {
  overflow-wrap: anywhere;
}
@media (max-width: 680px) {
  .receipt-options {
    overflow: visible;
  }
  .receipt-preview-viewport {
    min-height: 360px;
  }
  .receipt-preview {
    grid-column: 1;
    grid-row: auto;
    min-height: 480px;
  }
}
</style>
