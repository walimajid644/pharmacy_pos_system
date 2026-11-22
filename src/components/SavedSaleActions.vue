<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { computed, ref, watch, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@/lib/i18n';
import {
  savedSaleText,
  savedSaleSummary,
  type SavedSale,
  type SavedInvoice,
} from '@/lib/savedSale';
const props = defineProps<{ invoiceId?: string | null }>(),
  emit = defineEmits<{ loaded: [sale: SavedInvoice] }>();
const { pick, formatCurrency, formatNumber, formatDateTime, isRTL } = useI18n(),
  sale = ref<SavedSale | null>(null),
  busy = ref(false),
  error = ref(''),
  printing = ref(false),
  copyFallback = ref(false);

// Format date/time for receipt header (e.g., "21-Nov-2026  01:22 PM")
function formatReceiptDateTime(dateStr: string) {
  return formatDateTime(dateStr);
}

// Format amount without currency symbol, with 2 decimals
function formatAmount(amount: number) {
  return formatNumber(amount.toFixed(2));
}
const text = computed(() => (sale.value ? savedSaleText(sale.value, formatCurrency) : ''));
const receiptLogo = computed(() => {
  const value = sale.value?.shop?.receipt_logo_path;
  return typeof value === 'string' ? value : '';
});
let version = 0;
async function load() {
  const current = ++version;
  busy.value = true;
  error.value = '';
  try {
    const result = await invoke<SavedSale | null>('saved_sale', {
      invoiceId: props.invoiceId || null,
    });
    if (current !== version) return null;
    sale.value = result;
    if (result) emit('loaded', result.invoice);
    return result;
  } catch (e) {
    if (current === version) error.value = String(e);
    return null;
  } finally {
    if (current === version) busy.value = false;
  }
}
watch(
  () => props.invoiceId,
  () => void load(),
  { immediate: true },
);
async function print() {
  if (busy.value) return;
  const result = await load();
  if (!result) return;
  printing.value = true;
  await nextTick();
  const style = document.createElement('style');
  style.textContent = '@page { size: 80mm 297mm; margin: 3mm; }';
  document.head.appendChild(style);
  document.body.classList.add('printing-saved-sale');
  const clean = () => {
    style.remove();
    document.body.classList.remove('printing-saved-sale');
    printing.value = false;
  };
  window.addEventListener('afterprint', clean, { once: true });
  try {
    window.print();
  } catch (e) {
    window.removeEventListener('afterprint', clean);
    clean();
    error.value = String(e);
  }
}
async function copy() {
  const result = await load();
  if (!result) return;
  try {
    await navigator.clipboard.writeText(text.value);
    copyFallback.value = true;
  } catch {
    copyFallback.value = true;
  }
}
async function whatsapp() {
  const result = await load();
  if (!result?.invoice.customer_phone) return;
  try {
    await invoke('open_whatsapp_receipt', {
      phone: result.invoice.customer_phone,
      message: savedSaleSummary(result, formatCurrency),
    });
  } catch (e) {
    error.value = String(e);
  }
}
defineExpose({ print, copy, whatsapp, load });
</script>
<template>
  <section class="saved-sale-actions">
    <h3>{{ pick('Last saved sale', 'آخری محفوظ فروخت') }}</h3>
    <p v-if="busy" role="status">
      {{ pick('Loading saved invoice…', 'محفوظ انوائس لوڈ ہو رہی ہے…') }}
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="sale"
      ><bdi>{{ sale.invoice.invoice_number }}</bdi
      ><strong>{{ formatCurrency(sale.invoice.net_amount) }}</strong
      ><small>{{
        sale.invoice.payment_method === 'credit'
          ? pick('Posted to customer account', 'گاہک کے کھاتے میں درج')
          : pick('Completed payment', 'ادائیگی مکمل')
      }}</small
      ><small v-if="sale.invoice.customer_phone">{{ sale.invoice.customer_phone }}</small>
      <div class="saved-sale-buttons">
        <button type="button" :disabled="busy" @click="print">
          {{ pick('Reprint receipt', 'رسید دوبارہ پرنٹ') }}</button><button
          type="button"
          :disabled="busy"
          @click="copy"
        >
          {{ pick('Copy SMS receipt', 'ایس ایم ایس رسید کاپی') }}</button
        ><button
          v-if="sale.invoice.customer_phone"
          type="button"
          :disabled="busy"
          @click="whatsapp"
        >
          {{ pick('WhatsApp draft', 'واٹس ایپ مسودہ') }}
        </button>
      </div>
      <small>{{
        pick(
          'Saved invoice data; independent of the current cart.',
          'محفوظ انوائس کا ڈیٹا؛ موجودہ کارٹ سے الگ۔',
        )
      }}</small><textarea
        v-if="copyFallback"
        :value="text"
        readonly
        rows="5"
        :aria-label="
          pick(
            'Saved receipt text — paste into your SMS app',
            'محفوظ رسید — ایس ایم ایس ایپ میں پیسٹ کریں',
          )
        "
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
    </template>
    <button v-if="!sale || error" type="button" :disabled="busy" @click="load">
      {{ pick('Recover last saved sale', 'آخری محفوظ فروخت بازیاب کریں') }}
    </button>
  </section>
  <Teleport to="body"
    ><section v-if="printing && sale" class="saved-sale-print" :dir="isRTL ? 'rtl' : 'ltr'">
      <!-- Logo - AT THE VERY TOP -->
      <div v-if="receiptLogo" class="receipt-logo">
        <!-- Show actual image if it's a data URL -->
        <img
          v-if="receiptLogo.startsWith('data:image')"
          :src="receiptLogo"
          alt="Logo"
          class="receipt-logo-image"
        />
        <!-- Show placeholder otherwise -->
        <template v-else>
          <div class="receipt-logo-placeholder">{{ uiLabel('[LOGO]') }}</div>
          <div class="receipt-logo-note">{{ receiptLogo }}</div>
        </template>
      </div>

      <!-- Company Name -->
      <div class="receipt-company-name">
        {{ sale.shop?.company_name || 'Pharmacy POS' }}
      </div>

      <!-- Company Address and Phone -->
      <div
        v-if="sale.shop?.company_address || sale.shop?.company_phone"
        class="receipt-company-info"
      >
        <div v-if="sale.shop?.company_address">{{ sale.shop.company_address }}</div>
        <div v-if="sale.shop?.company_phone">{{ sale.shop.company_phone }}</div>
      </div>

      <!-- Receipt Header (Custom) -->
      <div v-if="sale.shop?.receipt_header" class="receipt-custom-header">
        {{ sale.shop.receipt_header }}
      </div>

      <div class="receipt-divider"></div>

      <!-- Date/Time and User at top right -->
      <div class="receipt-header-line">
        <span class="receipt-datetime">{{ formatReceiptDateTime(sale.invoice.invoice_date) }}</span>
        <span class="receipt-user">{{ sale.invoice.cashier_name }}</span>
      </div>

      <!-- Payment Mode -->
      <div class="receipt-payment-mode">
        <span>{{ uiLabel('Payment Mode:') }}</span>
        <strong>{{
          sale.invoice.payment_method === 'credit'
            ? 'Credit'
            : sale.invoice.payment_method === 'cash'
              ? 'Cash'
              : sale.invoice.payment_method
        }}</strong>
      </div>

      <!-- Invoice Section Header -->
      <div class="receipt-section-title">{{ uiLabel('BILL/CASH MEMO') }}</div>

      <!-- Invoice Number -->
      <div class="receipt-invoice">
        <span>{{ uiLabel('Inv #:') }}</span>
        <strong>{{ sale.invoice.invoice_number }}</strong>
      </div>

      <!-- Client Name -->
      <div class="receipt-client">
        <span>{{ uiLabel('Client Name:') }}</span>
        <div>{{ sale.invoice.customer_name || 'Walk-in Customer' }}</div>
      </div>

      <!-- Items Table -->
      <table class="receipt-items-table">
        <thead>
          <tr>
            <th class="col-item">{{ uiLabel('ITEM NAME') }}</th>
            <th class="col-qty">{{ uiLabel('QTY') }}</th>
            <th class="col-rate">{{ uiLabel('RATE') }}</th>
            <th class="col-amt">{{ uiLabel('AMT') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in sale.items" :key="l.id">
            <td class="col-item">
              <div class="item-name">{{ l.product_name }}</div>
              <div v-if="l.batch_number" class="item-batch">{{ l.batch_number }}</div>
              <div
                v-if="sale.shop?.show_drap && l.controlled_substance && l.drap_registration_number"
                class="item-drap"
              >
                DRAP: {{ l.drap_registration_number }}
              </div>
            </td>
            <td class="col-qty">{{ l.sale_quantity ?? l.quantity }}</td>
            <td class="col-rate">
              {{ formatAmount(l.line_total / (l.sale_quantity ?? l.quantity)) }}
            </td>
            <td class="col-amt">{{ formatAmount(l.line_total) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- Items count and Gross -->
      <div class="receipt-summary-line">
        <span
          >{{ uiLabel('Items') }} <strong>{{ sale.items.length }}</strong></span
        >
        <span
          >{{ uiLabel('Gross:') }}
          <strong>{{ formatAmount(sale.invoice.total_amount) }}</strong></span
        >
      </div>

      <!-- Thank you message -->
      <div class="receipt-thankyou">
        <div>{{ uiLabel('THANK YOU') }}</div>
        <div>{{ uiLabel('for Visiting us.') }}</div>
      </div>

      <!-- Total -->
      <div class="receipt-total-line">
        <span>{{ uiLabel('Total:') }}</span>
        <strong>{{ Math.round(sale.invoice.net_amount) }}</strong>
      </div>

      <div class="receipt-divider"></div>

      <!-- Receipt Footer (Custom) -->
      <div v-if="sale.shop?.receipt_footer" class="receipt-custom-footer">
        {{ sale.shop.receipt_footer }}
      </div>

      <!-- Footer disclaimer -->
      <div class="receipt-footer">
        <p>
          {{
            uiLabel(
              'Please ensure that medicines and other item tally with your prescription/demand and is not expired and no claim / return / exchange would be entertained after leaving counter.',
            )
          }}
        </p>
        <p class="receipt-developer">Developed By IBS: (0304-5117454)</p>
      </div>
    </section></Teleport
  >
</template>
<style scoped>
.saved-sale-actions {
  display: grid;
  gap: 0.3rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-background);
  font-size: 0.72rem;
}
.saved-sale-actions h3 {
  font-size: 0.8rem;
  font-weight: 700;
}
.saved-sale-actions strong {
  color: var(--color-primary);
}
.saved-sale-actions small {
  color: var(--color-text-secondary);
  font-size: 0.68rem;
}
.saved-sale-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.saved-sale-actions button {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 0.7rem;
}
.saved-sale-actions textarea {
  width: 100%;
  background: var(--color-surface);
  color: var(--color-text-primary);
}
.saved-sale-actions [role='alert'] {
  color: var(--color-danger);
}
</style>
<style>
.saved-sale-print {
  display: none;
}
@media print {
  body.printing-saved-sale > *:not(.saved-sale-print) {
    display: none !important;
  }
  body.printing-saved-sale > .saved-sale-print {
    display: block !important;
    width: 72mm;
    background: white;
    color: black;
    font:
      8pt 'Courier New',
      monospace;
    padding: 2mm;
  }

  /* Logo - AT THE VERY TOP */
  .receipt-logo {
    text-align: center;
    margin-bottom: 2mm;
  }

  .receipt-logo-image {
    max-width: 60mm;
    max-height: 20mm;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    margin: 0 auto 2mm auto;
  }

  .receipt-logo-placeholder {
    font-size: 9pt;
    font-weight: bold;
    color: #999;
    margin-bottom: 1mm;
    padding: 2mm;
    border: 1px dashed #ccc;
  }

  .receipt-logo-note {
    font-size: 6pt;
    color: #999;
  }

  /* Company Name */
  .receipt-company-name {
    text-align: center;
    font-weight: bold;
    font-size: 10pt;
    margin-bottom: 1mm;
  }

  /* Company Info (Address/Phone) */
  .receipt-company-info {
    text-align: center;
    font-size: 7pt;
    margin-bottom: 1mm;
    line-height: 1.3;
  }

  /* Custom Header */
  .receipt-custom-header {
    text-align: center;
    font-size: 7pt;
    color: #555;
    margin: 2mm 0;
    white-space: pre-line;
    line-height: 1.3;
  }

  /* Divider */
  .receipt-divider {
    border-top: 1px dashed #999;
    margin: 2mm 0;
  }

  /* Header with date/time and user */
  .receipt-header-line {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    margin-bottom: 2mm;
  }

  .receipt-datetime {
    font-weight: normal;
  }

  .receipt-user {
    text-align: end;
    font-weight: bold;
  }

  /* Payment Mode */
  .receipt-payment-mode {
    font-size: 8pt;
    margin-bottom: 1mm;
  }

  .receipt-payment-mode strong {
    font-weight: bold;
  }

  /* Section title */
  .receipt-section-title {
    text-align: center;
    font-weight: bold;
    font-size: 9pt;
    margin: 2mm 0;
  }

  /* Invoice number */
  .receipt-invoice {
    font-size: 8pt;
    margin-bottom: 2mm;
  }

  .receipt-invoice strong {
    font-weight: bold;
  }

  /* Client name */
  .receipt-client {
    font-size: 8pt;
    margin-bottom: 3mm;
  }

  .receipt-client span {
    display: block;
    margin-bottom: 1mm;
  }

  /* Items table */
  .receipt-items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    margin-bottom: 2mm;
  }

  .receipt-items-table thead {
    border-bottom: 1px solid black;
  }

  .receipt-items-table th {
    text-align: start;
    padding: 1mm 0;
    font-weight: bold;
    font-size: 8pt;
  }

  .receipt-items-table td {
    text-align: start;
    padding: 1mm 0;
    vertical-align: top;
    border-bottom: 1px dotted #999;
  }

  .receipt-items-table .col-item {
    width: 42%;
  }

  .receipt-items-table .col-qty {
    width: 12%;
    text-align: center;
  }

  .receipt-items-table .col-rate {
    width: 23%;
    text-align: end;
  }

  .receipt-items-table .col-amt {
    width: 23%;
    text-align: end;
  }

  .item-name {
    font-weight: normal;
    word-wrap: break-word;
  }

  .item-batch {
    font-size: 7pt;
    color: #555;
  }

  .item-drap {
    font-size: 6.5pt;
    color: #555;
  }

  /* Summary line (Items count and Gross) */
  .receipt-summary-line {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    padding: 2mm 0;
    border-top: 1px solid black;
    border-bottom: 1px solid black;
    margin: 2mm 0;
  }

  .receipt-summary-line strong {
    font-weight: bold;
  }

  /* Thank you section */
  .receipt-thankyou {
    text-align: center;
    font-size: 9pt;
    font-weight: bold;
    margin: 3mm 0;
  }

  /* Total line */
  .receipt-total-line {
    text-align: end;
    font-size: 10pt;
    font-weight: bold;
    margin: 3mm 0;
    padding-right: 2mm;
  }

  .receipt-total-line strong {
    font-size: 12pt;
    margin-left: 5mm;
  }

  /* Custom Footer */
  .receipt-custom-footer {
    text-align: center;
    font-size: 7pt;
    color: #555;
    margin: 2mm 0;
    white-space: pre-line;
    line-height: 1.3;
  }

  /* Footer */
  .receipt-footer {
    font-size: 6.5pt;
    text-align: center;
    margin-top: 3mm;
    line-height: 1.3;
  }

  .receipt-footer p {
    margin: 2mm 0;
  }

  .receipt-developer {
    font-weight: bold;
    margin-top: 2mm;
  }
}
</style>
