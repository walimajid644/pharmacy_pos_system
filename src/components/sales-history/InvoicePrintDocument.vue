<script setup lang="ts">
import type { Ref } from 'vue';
import type { useSalesHistory } from '@/composables/useSalesHistory';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSalesHistory>;
defineProps<{
  pick: ViewValue<State['pick']>;
  t: ViewValue<State['t']>;
  formatNumber: ViewValue<State['formatNumber']>;
  selectedInvoice: ViewValue<State['selectedInvoice']>;
  invoiceItems: ViewValue<State['invoiceItems']>;
  printMode: ViewValue<State['printMode']>;
  salePrice: ViewValue<State['salePrice']>;
  shop: ViewValue<State['shop']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  formatDateTime: ViewValue<State['formatDateTime']>;
}>();
</script>

<template>
  <Teleport to="body">
    <section
      v-if="printMode && selectedInvoice"
      class="invoice-print-root"
      :class="printMode === 'receipt' ? 'thermal' : 'full-invoice'"
    >
      <header class="print-header">
        <h1>{{ shop?.company_name || 'Pharmacy POS' }}</h1>
        <p v-if="shop?.company_address">{{ shop.company_address }}</p>
        <p v-if="shop?.company_phone">{{ shop.company_phone }}</p>
        <p v-if="printMode === 'receipt' && shop?.receipt_header" class="print-custom-text">
          {{ shop.receipt_header }}
        </p>
        <h2>
          {{
            printMode === 'receipt'
              ? pick('Sales Receipt', 'فروخت کی رسید')
              : pick('Sales Invoice', 'فروخت کی انوائس')
          }}
        </h2>
      </header>
      <div class="print-meta">
        <div>
          <strong>{{ pick('Invoice', 'انوائس') }}</strong><span>{{
            selectedInvoice.invoice_number
          }}</span>
        </div>
        <div>
          <strong>{{ pick('Date', 'تاریخ') }}</strong><span>{{
            formatDateTime(selectedInvoice.invoice_date)
          }}</span>
        </div>
        <div>
          <strong>{{ pick('Customer', 'گاہک') }}</strong><span>{{
            selectedInvoice.customer_name || pick('Walk-in', 'عام گاہک')
          }}</span>
        </div>
        <div v-if="selectedInvoice.patient_name">
          <strong>{{ pick('Patient', 'مریض') }}</strong><span>{{
            selectedInvoice.patient_name
          }}</span>
        </div>
        <p v-if="selectedInvoice.prescription_note">
          {{ pick('Prescription', 'نسخہ') }}: {{ selectedInvoice.prescription_note }}
        </p>
        <div v-if="selectedInvoice.doctor_name">
          <strong>{{ pick('Doctor', 'ڈاکٹر') }}</strong><span>{{
            selectedInvoice.doctor_name
          }}</span>
        </div>
        <div>
          <strong>{{ pick('Cashier', 'کیشئر') }}</strong><span>{{
            selectedInvoice.cashier_name || '—'
          }}</span>
        </div>
        <div>
          <strong>{{ pick('Payment', 'ادائیگی') }}</strong><span>{{
            t(selectedInvoice.payment_method as 'cash' | 'card' | 'mobile')
          }}</span>
        </div>
      </div>
      <table class="print-items">
        <thead>
          <tr>
            <th>{{ pick('Product / batch', 'مصنوعات / بیچ') }}</th>
            <th>{{ pick('Qty', 'تعداد') }}</th>
            <th>{{ t('price') }}</th>
            <th>{{ t('discount') }}</th>
            <th>{{ t('total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in invoiceItems" :key="item.id">
            <td>
              {{ item.product_name
              }}<small>{{ pick('Batch', 'بیچ') }} {{ item.batch_number }}</small
              ><small
                v-if="
                  shop?.show_drap === 1 &&
                  item.controlled_substance &&
                  item.drap_registration_number
                "
                >DRAP: {{ item.drap_registration_number }}</small
              >
            </td>
            <td>
              {{ formatNumber(item.sale_quantity ?? item.quantity) }}
              {{
                item.sale_quantity == null
                  ? pick('units', 'اکائیاں')
                  : item.is_loose_sale
                    ? pick('loose', 'کھلی')
                    : pick('packs', 'پیک')
              }}<small v-if="item.bonus_quantity"
                >+ {{ formatNumber(item.bonus_quantity) }} {{ pick('free', 'مفت') }}</small
              >
            </td>
            <td>{{ formatCurrency(salePrice(item)) }}</td>
            <td>{{ formatNumber(item.discount_percent) }}%</td>
            <td>{{ formatCurrency(item.line_total) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="print-totals">
        <div>
          <span>{{
            pick('Subtotal after line discounts', 'آئٹم کی رعایت کے بعد ذیلی کل')
          }}</span><span>{{ formatCurrency(selectedInvoice.total_amount) }}</span>
        </div>
        <div>
          <span>{{ t('tax') }}</span><span>{{ formatCurrency(selectedInvoice.tax_amount) }}</span>
        </div>
        <div v-if="selectedInvoice.discount_amount">
          <span>{{ pick('Invoice discount', 'انوائس پر رعایت') }}</span><span
            >-{{ formatCurrency(selectedInvoice.discount_amount) }}</span
          >
        </div>
        <div class="print-grand-total">
          <strong>{{
            selectedInvoice.payment_method === 'credit'
              ? pick('Charged to account', 'کھاتے میں درج رقم')
              : pick('Paid', 'ادا شدہ')
          }}</strong><strong>{{ formatCurrency(selectedInvoice.net_amount) }}</strong>
        </div>
        <div v-if="selectedInvoice.received_amount != null">
          <span>{{ pick('Received', 'وصول') }}</span><span>{{
            formatCurrency(selectedInvoice.received_amount)
          }}</span>
        </div>
        <div v-if="selectedInvoice.change_amount != null">
          <span>{{ pick('Change', 'واپسی') }}</span><span>{{
            formatCurrency(selectedInvoice.change_amount)
          }}</span>
        </div>
      </div>
      <p v-if="selectedInvoice.notes" class="print-custom-text">
        {{ pick('Remarks', 'نوٹس') }}: {{ selectedInvoice.notes }}
      </p>
      <p class="print-footer">
        {{ pick('Thank you for your purchase.', 'آپ کی خریداری کا شکریہ۔') }}
      </p>
      <p
        v-if="printMode === 'receipt' && shop?.receipt_footer"
        class="print-custom-text print-footer"
      >
        {{ shop.receipt_footer }}
      </p>
    </section>
  </Teleport>
</template>

<style>
.invoice-print-root {
  display: none;
}
@media print {
  body.printing-invoice > *:not(.invoice-print-root) {
    display: none !important;
  }
  body > .invoice-print-root {
    display: block !important;
    color: #000;
    background: #fff;
    font-family: Arial, sans-serif;
    font-size: 10pt;
  }
  .invoice-print-root.full-invoice {
    width: 100%;
  }
  .invoice-print-root.thermal {
    width: 72mm;
    font-size: 8pt;
  }
  .invoice-print-root .print-header {
    text-align: center;
    margin-bottom: 1em;
  }
  .invoice-print-root h1 {
    font-size: 1.5em;
    font-weight: bold;
    margin: 0 0 0.3em;
  }
  .invoice-print-root h2 {
    font-size: 1.2em;
    font-weight: bold;
    margin: 0.7em 0;
  }
  .invoice-print-root .print-meta {
    margin-bottom: 1em;
  }
  .invoice-print-root .print-meta div,
  .invoice-print-root .print-totals div {
    display: flex;
    justify-content: space-between;
    gap: 0.5em;
  }
  .invoice-print-root .print-meta strong {
    font-weight: 600;
  }
  .invoice-print-root .print-items {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .invoice-print-root .print-items th,
  .invoice-print-root .print-items td {
    border-bottom: 1px solid #999;
    padding: 0.35em 0.2em;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .invoice-print-root .print-items th:first-child,
  .invoice-print-root .print-items td:first-child {
    text-align: left;
    width: 32%;
  }
  .invoice-print-root .print-items small {
    display: block;
    font-size: 0.8em;
  }
  .invoice-print-root .print-totals {
    margin: 1em 0 0 auto;
    max-width: 70mm;
  }
  .invoice-print-root .print-totals div {
    padding: 0.2em 0;
  }
  .invoice-print-root .print-grand-total {
    border-top: 1px solid #000;
    font-size: 1.15em;
  }
  .invoice-print-root .print-footer {
    text-align: center;
    margin-top: 2em;
  }
  .invoice-print-root .print-custom-text {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .invoice-print-root.thermal .print-items th:nth-child(3),
  .invoice-print-root.thermal .print-items td:nth-child(3),
  .invoice-print-root.thermal .print-items th:nth-child(4),
  .invoice-print-root.thermal .print-items td:nth-child(4) {
    display: none;
  }
  .invoice-print-root.thermal .print-items th:first-child,
  .invoice-print-root.thermal .print-items td:first-child {
    width: 50%;
  }
}
</style>
