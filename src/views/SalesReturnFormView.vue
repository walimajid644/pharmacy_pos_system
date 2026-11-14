<script setup lang="ts">
import { useSalesReturnForm } from '@/composables/useSalesReturnForm';

const {
  router,
  pick,
  t,
  formatNumber,
  search,
  invoice,
  lines,
  reason,
  method,
  notes,
  saving,
  reasons,
  refund,
  findInvoice,
  save,
  formatCurrency,
  formatDate,
} = useSalesReturnForm();
</script>

<template>
  <div class="tool-terminal max-w-5xl space-y-5 p-6">
    <header class="tool-header">
      <h2 class="text-2xl font-bold">{{ pick('New sales return', 'نئی فروخت واپسی') }}</h2>
      <p class="text-muted-foreground">
        {{
          pick(
            'Find the original invoice and select returned quantities',
            'اصل انوائس تلاش کریں اور واپس کی گئی تعداد منتخب کریں',
          )
        }}
      </p>
    </header>
    <div class="flex flex-wrap gap-3">
      <input
        v-model="search"
        class="rounded border bg-background p-2"
        :placeholder="pick('Invoice number', 'انوائس نمبر')"
        @keyup.enter="findInvoice"
      /><button class="rounded bg-primary px-4 py-2 text-primary-foreground" @click="findInvoice">
        {{ pick('Find invoice', 'انوائس تلاش کریں') }}
      </button>
    </div>
    <form v-if="invoice" class="space-y-5 rounded-lg border bg-card p-5" @submit.prevent="save">
      <p>
        <strong>{{ invoice.invoice_number }}</strong> · {{ formatDate(invoice.invoice_date) }} ·
        {{ pick('Paid', 'ادا شدہ') }} {{ formatCurrency(invoice.net_amount) }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <label
          >{{ pick('Reason', 'وجہ')
          }}<select v-model="reason" class="block w-full rounded border bg-background p-2">
            <option v-for="item in reasons" :key="item" :value="item">{{ t(item) }}</option>
          </select></label
        ><label
          >{{ t('refund_method')
          }}<select
            v-model="method"
            :disabled="invoice?.payment_method === 'credit'"
            class="block w-full rounded border bg-background p-2"
          >
            <option value="cash">{{ t('cash') }}</option>
            <option value="card">{{ t('card') }}</option>
            <option value="credit_note" :disabled="!invoice?.customer_id">
              {{ t('credit_note') }}
            </option>
          </select></label
        >
      </div>
      <label class="block"
        >{{ pick('Notes', 'نوٹس')
        }}<textarea v-model="notes" class="block w-full rounded border bg-background p-2" />
      </label>
      <p class="text-sm">
        {{
          pick(
            'Return quantities use individual units, including free units. Refunds spread the paid line value across all delivered units.',
            'واپسی تعداد انفرادی اکائیوں میں ہے، مفت اکائیوں سمیت۔ ادا شدہ رقم تمام دی گئی اکائیوں پر تقسیم ہوتی ہے۔',
          )
        }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr>
              <th class="p-2">{{ pick('Product', 'مصنوعات') }}</th>
              <th class="p-2">{{ pick('Batch', 'بیچ') }}</th>
              <th class="p-2">{{ pick('Available to return', 'واپسی کے لیے دستیاب') }}</th>
              <th class="p-2">{{ pick('Return now', 'ابھی واپس کریں') }}</th>
              <th class="p-2">{{ t('restock') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.id" class="border-t">
              <td class="p-2">{{ line.product_name }}</td>
              <td class="p-2">
                <bdi>{{ line.batch_number }}</bdi>
              </td>
              <td class="p-2">
                {{ formatNumber(Number(line.quantity) - Number(line.already_returned)) }}
              </td>
              <td class="p-2">
                <input
                  v-model.number="line.return_now"
                  type="number"
                  min="0"
                  :max="Number(line.quantity) - Number(line.already_returned)"
                  step="1"
                  class="w-24 rounded border bg-background p-2"
                />
              </td>
              <td class="p-2"><input v-model="line.restock" type="checkbox" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="font-semibold">
        {{ pick('Estimated refund', 'متوقع واپسی رقم') }}: {{ formatCurrency(refund) }}
      </p>
      <p class="text-sm text-muted-foreground">
        {{
          pick(
            "The refund includes a proportional share of the invoice's tax and discount. Confirm the amount before approval.",
            'واپسی رقم میں انوائس کے ٹیکس اور رعایت کا متناسب حصہ شامل ہے۔ منظوری سے پہلے رقم کی تصدیق کریں۔',
          )
        }}
      </p>
      <div class="flex gap-3">
        <button :disabled="saving" class="rounded bg-primary px-4 py-2 text-primary-foreground">
          {{
            saving
              ? pick('Saving...', 'محفوظ ہو رہا ہے...')
              : pick('Submit for approval', 'منظوری کے لیے جمع کریں')
          }}</button><button
          type="button"
          class="rounded border px-4 py-2"
          @click="router.push('/sales-returns')"
        >
          {{ t('cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>
