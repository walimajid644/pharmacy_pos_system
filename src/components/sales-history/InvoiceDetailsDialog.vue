<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import { ref, type Ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import type { useSalesHistory } from '@/composables/useSalesHistory';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';

type ViewValue<T> = T extends Ref<infer Value> ? Value : T;
type State = ReturnType<typeof useSalesHistory>;
const props = defineProps<{
  pick: ViewValue<State['pick']>;
  t: ViewValue<State['t']>;
  formatNumber: ViewValue<State['formatNumber']>;
  showDetailModal: ViewValue<State['showDetailModal']>;
  selectedInvoice: ViewValue<State['selectedInvoice']>;
  invoiceItems: ViewValue<State['invoiceItems']>;
  salePrice: ViewValue<State['salePrice']>;
  copySms: ViewValue<State['copySms']>;
  sendWhatsApp: ViewValue<State['sendWhatsApp']>;
  closeDetailModal: ViewValue<State['closeDetailModal']>;
  printInvoice: ViewValue<State['printInvoice']>;
  formatCurrency: ViewValue<State['formatCurrency']>;
  formatDate: ViewValue<State['formatDate']>;
}>();
const digitalText = defineModel<ViewValue<State['digitalText']>>('digitalText', { required: true });
const invoiceDialog = ref<HTMLElement | null>(null);
const detailTab = ref<'items' | 'receipt'>('items');
useDialogKeyboard(invoiceDialog, () => props.closeDetailModal());
</script>

<template>
  <div
    v-if="showDetailModal && selectedInvoice"
    ref="invoiceDialog"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    :aria-label="pick('Invoice Details', 'انوائس کی تفصیلات')"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    @click.self="closeDetailModal"
  >
    <Card class="invoice-detail-panel w-full max-w-4xl max-h-[90vh] flex flex-col">
      <!-- Modal Header -->
      <div class="p-6 border-b flex justify-between items-start">
        <div>
          <h2 class="text-xl font-bold">{{ pick('Invoice Details', 'انوائس کی تفصیلات') }}</h2>
          <p class="text-sm text-gray-600 mt-1">{{ selectedInvoice.invoice_number }}</p>
        </div>
        <Button variant="outline" @click="closeDetailModal">{{ pick('Close', 'بند کریں') }}</Button>
      </div>

      <!-- Invoice Info -->
      <div class="p-6 border-b bg-gray-50">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-gray-600">{{ pick('Date', 'تاریخ') }}</div>
            <div class="font-medium">{{ formatDate(selectedInvoice.invoice_date) }}</div>
          </div>
          <div>
            <div class="text-gray-600">{{ pick('Customer', 'گاہک') }}</div>
            <div class="font-medium">{{ selectedInvoice.customer_name }}</div>
          </div>
          <div>
            <div class="text-gray-600">{{ pick('Cashier', 'کیشئر') }}</div>
            <div class="font-medium">{{ selectedInvoice.cashier_name }}</div>
          </div>
          <div v-if="selectedInvoice.patient_name">
            <div class="text-gray-600">{{ pick('Patient', 'مریض') }}</div>
            <div class="font-medium">{{ selectedInvoice.patient_name }}</div>
          </div>
          <div v-if="selectedInvoice.doctor_name">
            <div class="text-gray-600">{{ pick('Doctor', 'ڈاکٹر') }}</div>
            <div class="font-medium">{{ selectedInvoice.doctor_name }}</div>
          </div>
          <div v-if="selectedInvoice.customer_id && selectedInvoice.previous_balance != null">
            <div class="text-gray-600">
              {{ pick('Previous balance (not collected)', 'سابقہ بقایا (وصول نہیں ہوا)') }}
            </div>
            <div class="font-medium">{{ formatCurrency(selectedInvoice.previous_balance) }}</div>
          </div>
          <div v-if="selectedInvoice.notes" class="col-span-2">
            <div class="text-gray-600">{{ pick('Remarks', 'نوٹس') }}</div>
            <div class="whitespace-pre-wrap break-words">{{ selectedInvoice.notes }}</div>
          </div>
          <div>
            <div class="text-gray-600">{{ t('payment_method') }}</div>
            <div class="font-medium capitalize">
              {{ t(selectedInvoice.payment_method as 'cash' | 'card' | 'mobile') }}
            </div>
          </div>
        </div>
      </div>

      <nav class="detail-tabs flex gap-2 p-2 border-b" aria-label="Invoice sections">
        <Button
          variant="outline"
          :aria-pressed="detailTab === 'items'"
          @click="detailTab = 'items'"
          >{{ t('items') }}</Button
        >
        <Button
          variant="outline"
          :aria-pressed="detailTab === 'receipt'"
          @click="detailTab = 'receipt'"
          >{{ pick('Digital receipt', 'ڈیجیٹل رسید') }}</Button
        >
      </nav>
      <!-- Items -->
      <div v-if="detailTab === 'items'" class="paged-table-host flex-1 p-6">
        <h3 class="font-semibold mb-4">{{ t('items') }}</h3>
        <CompactPages
          :items="invoiceItems"
          :row-height="56"
          :header-height="36"
          v-slot="{ rows: pageRows }"
        >
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b bg-gray-50">
                <th class="text-left p-3 font-semibold">{{ pick('Product', 'مصنوعات') }}</th>
                <th class="text-left p-3 font-semibold">{{ pick('Batch', 'بیچ') }}</th>
                <th class="text-right p-3 font-semibold">{{ pick('Qty', 'تعداد') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('unit_price') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('discount') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item: item } in pageRows" :key="item.id" class="border-b">
                <td class="p-3">
                  <div>{{ item.product_name }}</div>
                  <div class="text-xs text-gray-500">
                    {{
                      item.is_loose_sale
                        ? pick('Loose sale', 'کھلی فروخت')
                        : pick('Pack sale', 'پیک فروخت')
                    }}
                  </div>
                </td>
                <td class="p-3 text-sm font-mono">{{ item.batch_number }}</td>
                <td class="p-3 text-right">
                  {{ formatNumber(item.sale_quantity ?? item.quantity) }}
                  {{
                    item.sale_quantity == null
                      ? pick('units', 'اکائیاں')
                      : item.is_loose_sale
                        ? pick('loose units', 'کھلی اکائیاں')
                        : pick('packs', 'پیک')
                  }}
                  <div v-if="item.bonus_quantity" class="text-xs">
                    + {{ formatNumber(item.bonus_quantity) }} {{ pick('free', 'مفت') }}
                  </div>
                  <div
                    v-if="item.sale_quantity != null && !item.is_loose_sale"
                    class="text-xs text-gray-500"
                  >
                    {{ formatNumber(item.quantity) }} {{ pick('units', 'اکائیاں') }}
                  </div>
                </td>
                <td class="p-3 text-right">{{ formatCurrency(salePrice(item)) }}</td>
                <td class="p-3 text-right">{{ formatNumber(item.discount_percent) }}%</td>
                <td class="p-3 text-right font-semibold">{{ formatCurrency(item.line_total) }}</td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>

      <!-- Totals -->
      <div class="p-6 border-t bg-gray-50">
        <div class="max-w-md ml-auto space-y-2">
          <div class="flex justify-between text-sm">
            <span
              >{{ pick('Subtotal after line discounts', 'آئٹم کی رعایت کے بعد ذیلی کل') }}:</span
            >
            <span>{{ formatCurrency(selectedInvoice.total_amount) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span>{{ t('tax') }}:</span>
            <span>{{ formatCurrency(selectedInvoice.tax_amount) }}</span>
          </div>
          <div v-if="selectedInvoice.discount_amount > 0" class="flex justify-between text-sm">
            <span>{{ pick('Invoice discount', 'انوائس پر رعایت') }}:</span>
            <span class="text-danger">-{{ formatCurrency(selectedInvoice.discount_amount) }}</span>
          </div>
          <div class="flex justify-between text-lg font-bold pt-2 border-t">
            <span>{{ t('total') }}:</span>
            <span>{{ formatCurrency(selectedInvoice.net_amount) }}</span>
          </div>
          <div v-if="selectedInvoice.received_amount != null" class="flex justify-between text-sm">
            <span>{{ pick('Received', 'وصول') }}:</span
            ><span>{{ formatCurrency(selectedInvoice.received_amount) }}</span>
          </div>
          <div v-if="selectedInvoice.change_amount != null" class="flex justify-between text-sm">
            <span>{{ pick('Change returned', 'واپس دی گئی رقم') }}:</span
            ><span>{{ formatCurrency(selectedInvoice.change_amount) }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="detailTab === 'receipt'" class="receipt-panel p-6 border-t">
        <h3 class="font-semibold">{{ pick('Digital receipt', 'ڈیجیٹل رسید') }}</h3>
        <p class="text-sm">
          {{
            pick(
              'WhatsApp opens a draft for the saved customer number. SMS text can be copied below.',
              'WhatsApp محفوظ نمبر پر مسودہ کھولتا ہے۔ SMS کا متن نیچے سے کاپی کریں۔',
            )
          }}
        </p>
        <textarea
          v-model="digitalText"
          class="mt-2 w-full rounded border bg-background p-2"
          rows="6"
          readonly
          aria-label="Digital receipt text"
        ></textarea>
        <div class="mt-2 flex gap-2">
          <Button variant="outline" @click="copySms">{{
            pick('Copy for SMS', 'SMS کے لیے کاپی کریں')
          }}</Button><Button
            v-if="selectedInvoice.customer_phone"
            variant="outline"
            @click="sendWhatsApp"
            >{{ pick('Open WhatsApp', 'WhatsApp کھولیں') }}</Button
          >
        </div>
      </div>
      <div class="p-6 border-t flex justify-end gap-3">
        <Button variant="outline" @click="printInvoice('invoice')">
          {{ pick('Print Invoice', 'انوائس پرنٹ کریں') }}
        </Button>
        <Button variant="outline" @click="printInvoice('receipt')">
          {{ pick('Print 80mm Receipt', '۸۰ ملی میٹر رسید پرنٹ کریں') }}
        </Button>
        <Button variant="outline" @click="closeDetailModal">
          {{ pick('Close', 'بند کریں') }}
        </Button>
      </div>
    </Card>
  </div>
</template>
