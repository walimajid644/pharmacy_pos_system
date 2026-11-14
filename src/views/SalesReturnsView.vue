<script setup lang="ts">
import { useSalesReturns } from '@/composables/useSalesReturns';

const {
  router,
  pick,
  t,
  formatNumber,
  returns,
  selected,
  items,
  busy,
  loading,
  printing,
  shop,
  printReturn,
  select,
  changeStatus,
  formatCurrency,
  formatDate,
} = useSalesReturns();
</script>

<template>
  <div class="tool-terminal space-y-5 p-6">
    <header class="tool-header flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold">{{ t('sales_returns') }}</h2>
        <p class="text-muted-foreground">
          {{
            pick(
              'Review returned items and record refunds',
              'واپس شدہ اشیاء دیکھیں اور رقم کی واپسی درج کریں',
            )
          }}
        </p>
      </div>
      <button
        class="rounded bg-primary px-4 py-2 text-primary-foreground"
        @click="router.push('/sales-returns/new')"
      >
        {{ pick('New return', 'نئی واپسی') }}
      </button>
    </header>
    <p v-if="loading">{{ pick('Loading returns...', 'واپسیاں لوڈ ہو رہی ہیں...') }}</p>
    <p v-else-if="!returns.length" class="rounded border p-6">
      {{ pick('No returns yet.', 'ابھی کوئی واپسی نہیں۔') }}
    </p>
    <div v-else class="overflow-x-auto rounded border">
      <table class="w-full text-left text-sm">
        <thead class="bg-muted">
          <tr>
            <th class="p-3">{{ pick('Return', 'واپسی') }}</th>
            <th class="p-3">{{ pick('Invoice', 'انوائس') }}</th>
            <th class="p-3">{{ pick('Date', 'تاریخ') }}</th>
            <th class="p-3">{{ pick('Reason', 'وجہ') }}</th>
            <th class="p-3">{{ pick('Refund', 'واپسی رقم') }}</th>
            <th class="p-3">{{ pick('Refund reference', 'واپسی کا حوالہ') }}</th>
            <th class="p-3">{{ pick('Status', 'حیثیت') }}</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in returns" :key="row.id" class="border-t">
            <td class="p-3">
              <bdi>{{ row.return_number }}</bdi>
            </td>
            <td class="p-3">
              <bdi>{{ row.invoice_number }}</bdi>
            </td>
            <td class="p-3">{{ formatDate(row.return_date) }}</td>
            <td class="p-3">{{ t(row.return_reason) }}</td>
            <td class="p-3">{{ formatCurrency(row.refund_amount) }}</td>
            <td class="p-3 font-mono">
              {{
                row.refund_reference ||
                (row.status === 'rejected' ? '—' : pick('Pending', 'زیر التواء'))
              }}
            </td>
            <td class="p-3">{{ t(row.status) }}</td>
            <td class="p-3">
              <button class="text-primary" @click="select(row)">
                {{ pick('Review', 'جائزہ') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="selected = null"
    >
      <div
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 space-y-4"
      >
        <h3 class="text-xl font-semibold">
          {{ pick('Return', 'واپسی') }} <bdi>{{ selected.return_number }}</bdi>
        </h3>
        <p>
          {{ t('original_invoice') }}:
          <button
            class="text-primary underline"
            @click="
              router.push({ path: '/sales-history', query: { invoice: selected.invoice_number } })
            "
          >
            <bdi>{{ selected.invoice_number }}</bdi>
          </button>
        </p>
        <p>
          {{ t(selected.return_reason) }} · {{ t(selected.refund_method) }} ·
          {{ t(selected.status) }}
        </p>
        <p v-if="selected.reason_notes">{{ selected.reason_notes }}</p>
        <ul class="divide-y rounded border">
          <li v-for="item in items" :key="item.id" class="flex justify-between p-3">
            <span
              >{{ item.product_name }} ·
              {{
                item.restock
                  ? pick('restock', 'اسٹاک میں شامل')
                  : pick('do not restock', 'اسٹاک میں شامل نہ کریں')
              }}</span
            ><strong>{{ formatNumber(item.quantity_returned) }}</strong>
          </li>
        </ul>
        <p class="font-semibold">
          {{ pick('Refund', 'واپسی رقم') }}: {{ formatCurrency(selected.refund_amount) }}
        </p>
        <p>
          {{ pick('Refund reference', 'واپسی کا حوالہ') }}:
          <strong class="font-mono">{{
            selected.refund_reference ||
            pick('Assigned when marked refunded', 'رقم واپس کرنے پر دیا جائے گا')
          }}</strong>
        </p>
        <div class="flex flex-wrap justify-end gap-3">
          <button
            v-if="selected.status === 'refunded'"
            class="rounded border px-4 py-2"
            @click="printReturn"
          >
            {{
              selected.refund_method === 'credit_note'
                ? pick('Print credit note', 'کریڈٹ نوٹ پرنٹ کریں')
                : pick('Print return receipt', 'واپسی کی رسید پرنٹ کریں')
            }}
          </button>
          <button class="rounded border px-4 py-2" @click="selected = null">
            {{ pick('Close', 'بند کریں') }}
          </button>
          <template v-if="selected.status === 'pending'"
            ><button
              :disabled="busy"
              class="rounded border px-4 py-2"
              @click="changeStatus('rejected')"
            >
              {{ t('reject') }}</button
            ><button
              :disabled="busy"
              class="rounded bg-primary px-4 py-2 text-primary-foreground"
              @click="changeStatus('approved')"
            >
              {{ t('approve') }}
            </button></template
          >
          <button
            v-if="selected.status === 'approved'"
            :disabled="busy"
            class="rounded bg-primary px-4 py-2 text-primary-foreground"
            @click="changeStatus('refunded')"
          >
            {{ pick('Mark refunded', 'رقم واپس شدہ نشان زد کریں') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <section v-if="printing && selected" class="return-print-root">
      <header>
        <h1>{{ shop?.company_name || 'Pharmacy POS' }}</h1>
        <p v-if="shop?.company_address">{{ shop.company_address }}</p>
        <p v-if="shop?.company_phone">{{ shop.company_phone }}</p>
        <p v-if="shop?.receipt_header" class="return-custom-text">{{ shop.receipt_header }}</p>
        <h2>
          {{
            selected.refund_method === 'credit_note'
              ? t('credit_note')
              : pick('Return Receipt', 'واپسی کی رسید')
          }}
        </h2>
      </header>
      <dl class="return-print-meta">
        <div>
          <dt>{{ pick('Return', 'واپسی') }}</dt>
          <dd>{{ selected.return_number }}</dd>
        </div>
        <div>
          <dt>{{ t('original_invoice') }}</dt>
          <dd>{{ selected.invoice_number }}</dd>
        </div>
        <div>
          <dt>{{ t('return_date') }}</dt>
          <dd>{{ formatDate(selected.return_date) }}</dd>
        </div>
        <div>
          <dt>{{ pick('Refund reference', 'واپسی کا حوالہ') }}</dt>
          <dd>{{ selected.refund_reference }}</dd>
        </div>
        <div>
          <dt>{{ t('refund_method') }}</dt>
          <dd>{{ t(selected.refund_method) }}</dd>
        </div>
        <div>
          <dt>{{ pick('Reason', 'وجہ') }}</dt>
          <dd>{{ t(selected.return_reason) }}</dd>
        </div>
      </dl>
      <p v-if="selected.reason_notes">{{ selected.reason_notes }}</p>
      <table>
        <thead>
          <tr>
            <th>{{ pick('Product', 'مصنوعات') }}</th>
            <th>{{ pick('Qty', 'تعداد') }}</th>
            <th>{{ t('unit_price') }}</th>
            <th>{{ pick('Line amount', 'آئٹم کی رقم') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>
              {{ item.product_name
              }}<small
                v-if="
                  shop?.show_drap === 1 &&
                  item.controlled_substance &&
                  item.drap_registration_number
                "
                class="return-drap"
                >DRAP: {{ item.drap_registration_number }}</small
              >
            </td>
            <td>{{ formatNumber(item.quantity_returned) }}</td>
            <td>{{ formatCurrency(item.unit_price) }}</td>
            <td>{{ formatCurrency(item.line_total) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="return-print-totals">
        <div>
          <span>{{ pick('Returned items', 'واپس شدہ اشیاء') }}</span><span>{{
            formatCurrency(selected.subtotal)
          }}</span>
        </div>
        <div>
          <span>{{ pick('Tax refund', 'ٹیکس کی واپسی') }}</span><span>{{
            formatCurrency(selected.tax_amount)
          }}</span>
        </div>
        <div class="grand">
          <strong>{{ pick('Refund recorded', 'واپسی رقم درج شدہ') }}</strong><strong>{{
            formatCurrency(selected.refund_amount)
          }}</strong>
        </div>
      </div>
      <p v-if="shop?.receipt_footer" class="return-custom-text return-footer">
        {{ shop.receipt_footer }}
      </p>
    </section>
  </Teleport>
</template>

<style>
.return-print-root {
  display: none;
}
@media print {
  body.printing-return > *:not(.return-print-root) {
    display: none !important;
  }
  body > .return-print-root {
    display: block !important;
    color: #000;
    background: #fff;
    font:
      10pt Arial,
      sans-serif;
    margin: 12mm;
  }
  .return-print-root header {
    text-align: center;
    margin-bottom: 1.5em;
  }
  .return-print-root .return-custom-text {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .return-print-root .return-drap {
    display: block;
    font-size: 0.8em;
  }
  .return-print-root .return-footer {
    text-align: center;
    margin-top: 1.5em;
  }
  .return-print-root h1 {
    font-size: 1.5em;
    font-weight: bold;
  }
  .return-print-root h2 {
    font-size: 1.2em;
    font-weight: bold;
    margin-top: 0.7em;
  }
  .return-print-root .return-print-meta {
    margin-bottom: 1.5em;
  }
  .return-print-root .return-print-meta div,
  .return-print-root .return-print-totals div {
    display: flex;
    justify-content: space-between;
    gap: 1em;
  }
  .return-print-root dd {
    margin: 0;
  }
  .return-print-root table {
    width: 100%;
    border-collapse: collapse;
  }
  .return-print-root th,
  .return-print-root td {
    border-bottom: 1px solid #999;
    padding: 0.5em;
    text-align: right;
  }
  .return-print-root th:first-child,
  .return-print-root td:first-child {
    text-align: left;
  }
  .return-print-root .return-print-totals {
    max-width: 75mm;
    margin: 1.5em 0 0 auto;
  }
  .return-print-root .return-print-totals div {
    padding: 0.2em 0;
  }
  .return-print-root .grand {
    border-top: 1px solid #000;
  }
}
</style>
