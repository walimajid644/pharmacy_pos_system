<script setup lang="ts">
import { bindTemplateRef } from '@/lib/templateRefs';
import SavedSaleActions from '@/components/SavedSaleActions.vue';
import Button from '@/components/ui/Button.vue';
import CompactPages from '@/components/ui/CompactPages.vue';
import Input from '@/components/ui/Input.vue';
import PosProductSearchDialog from '@/components/pos/PosProductSearchDialog.vue';
import PosCartTable from '@/components/pos/PosCartTable.vue';
import PosSaleSummary from '@/components/pos/PosSaleSummary.vue';
import PosPrescriptionFields from '@/components/pos/PosPrescriptionFields.vue';
import PosPaymentMethods from '@/components/pos/PosPaymentMethods.vue';
import { usePosTerminal } from '@/composables/usePosTerminal';

const {
  invoiceNumber,
  pendingProduct,
  itemCode,
  itemCodeInput,
  entryQuantityInput,
  entryQuantity,
  entryBonus,
  entryDiscount,
  entryError,
  entryPrice,
  entryStock,
  selectProductForEntry,
  commitEntry,
  clearItemEntry,
  onItemCodeKeydown,
  t,
  pick,
  formatNumber,
  cartStore,
  settingsStore,
  authStore,
  router,
  sourceDocumentId,
  sourceDocumentNumber,
  sourceDocumentKind,
  sourceDocumentLoading,
  sourceDocumentError,
  sourcePriceChanges,
  shift,
  patientName,
  doctorName,
  prescriptionNote,
  hasControlled,
  prescriptionMissing,
  saleRemarks,
  cashReceived,
  showCost,
  selectedCustomer,
  searchQuery,
  productSearchOpen,
  openProductSearch,
  resetProductSearch,
  searchResults,
  searchLoading,
  searchError,
  highlightedProductIndex,
  searchInput,
  checkoutLoading,
  lastReceipt,
  lastInvoiceId,
  savedActions,
  selectedCustomerId,
  customerSearch,
  customerOptions,
  customerOpen,
  customerLoading,
  highlightedCustomerIndex,
  paymentMethod,
  creditAllowed,
  subtotal,
  taxAmount,
  total,
  validTender,
  changeDue,
  lineGross,
  lineDiscount,
  lineMargin,
  maxInvoiceDiscount,
  openCustomerPicker,
  onCustomerInput,
  chooseCustomer,
  onCustomerKeydown,
  onProductSearchInput,
  removeFromCart,
  updateQuantities,
  onLineDiscountAmountChange,
  onLineDiscountChange,
  onInvoiceDiscountChange,
  getBatchWarning,
  checkout,
  handleBarcodeInput,
  formatCurrency,
  formatDate,
} = usePosTerminal();
const bindsearchInput = bindTemplateRef(searchInput);
const bindItemCodeInput = bindTemplateRef(itemCodeInput);
const bindEntryQuantityInput = bindTemplateRef(entryQuantityInput);
</script>

<template>
  <main class="pos-terminal" :aria-label="pick('Sales terminal', 'فروخت کا ٹرمینل')">
    <header class="pos-header" :inert="productSearchOpen">
      <div class="pos-brand">
        <span class="pos-rx" aria-hidden="true">℞</span>
        <div>
          <strong>{{ settingsStore.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{
            pick('Sales terminal', 'فروخت کا ٹرمینل')
          }}</small>
        </div>
      </div>
      <div class="pos-header-meta">
        <div class="pos-header-fact">
          <span>{{ pick('Last invoice', 'آخری انوائس') }}</span><bdi>{{
            lastReceipt?.invoiceNumber || '—'
          }}</bdi
          ><button
            type="button"
            class="pos-last-reprint"
            :disabled="!lastReceipt"
            @click="savedActions?.print()"
          >
            {{ pick('Reprint last', 'آخری رسید پرنٹ') }}
          </button>
        </div>
        <span
          class="pos-shift-badge"
          :class="shift?.cashierId === authStore.currentUser?.id ? 'is-open' : 'is-closed'"
        >
          {{
            shift?.cashierId === authStore.currentUser?.id
              ? pick('Shift open', 'شفٹ کھلی ہے')
              : pick('No shift', 'شفٹ بند ہے')
          }}
        </span>
      </div>
      <fieldset class="pos-customer-mode">
        <legend class="sr-only">{{ pick('Customer type', 'گاہک کی قسم') }}</legend>
        <label
          ><input
            type="radio"
            name="pos-customer-mode"
            :checked="!selectedCustomerId && !customerSearch.trim()"
            @change="chooseCustomer(null)"
          />{{ pick('Casual client', 'عام گاہک') }}</label
        >
        <label
          ><input
            type="radio"
            name="pos-customer-mode"
            :checked="!!selectedCustomerId || !!customerSearch.trim()"
            @change="openCustomerPicker"
          />{{ pick('Registered client', 'رجسٹرڈ گاہک') }}</label
        >
      </fieldset>
      <div class="pos-header-end">
        <time>{{ formatDate(new Date()) }}</time><small
          >F2 {{ pick('Search', 'تلاش') }} · F3 {{ pick('Client', 'گاہک') }} · F8–F10
          {{ pick('Pay', 'ادائیگی') }}</small
        >
      </div>
    </header>

    <div v-if="sourceDocumentLoading" class="pos-source-document" role="status">
      {{
        pick(
          'Checking document, prices and available stock…',
          'دستاویز، قیمت اور اسٹاک کی جانچ جاری ہے…',
        )
      }}
    </div>
    <div v-if="sourceDocumentError" class="pos-source-error" role="alert">
      {{ sourceDocumentError }}
      <button
        type="button"
        @click="router.push(sourceDocumentKind === 'preorder' ? '/preorders' : '/estimates')"
      >
        {{ pick('Review document', 'دستاویز دیکھیں') }}
      </button>
    </div>
    <div v-if="sourceDocumentId" class="pos-source-document" role="status">
      <div>
        <strong
          >{{ pick('Loaded from', 'لوڈ کیا گیا') }}
          {{
            sourceDocumentKind === 'estimate'
              ? pick('Estimate', 'تخمینہ')
              : pick('Pre-order', 'پیشگی آرڈر')
          }}
          <bdi>{{ sourceDocumentNumber }}</bdi></strong
        ><small
          >{{
            pick(
              'Current prices and tax apply. Checkout completes this document.',
              'موجودہ قیمت اور ٹیکس لاگو ہیں۔ فروخت مکمل کرنے پر دستاویز مکمل ہو گی۔',
            )
          }}
          <span v-if="sourcePriceChanges"
            >{{ pick('Changed prices:', 'تبدیل شدہ قیمتیں:') }}
            {{ formatNumber(sourcePriceChanges) }}</span
          ><span v-if="sourceDocumentKind === 'preorder'">
            {{
              pick(
                'Stock was not reserved; availability is checked again at checkout.',
                'اسٹاک محفوظ نہیں تھا؛ فروخت پر دوبارہ جانچ ہو گی۔',
              )
            }}</span
          ></small
        >
      </div>
      <button
        type="button"
        @click="
          sourceDocumentId = null;
          sourceDocumentNumber = '';
        "
      >
        {{ pick('Detach document', 'دستاویز الگ کریں') }}
      </button>
    </div>
    <div class="pos-workspace" :inert="productSearchOpen">
      <section class="pos-main" :aria-label="pick('Sale entry and items', 'فروخت کے آئٹم')">
        <div class="pos-entry-strip">
          <div class="pos-invoice-field">
            <label for="pos-invoice-number">{{ pick('Invoice No.', 'انوائس نمبر') }}</label>
            <input id="pos-invoice-number" :value="invoiceNumber" readonly />
          </div>
          <div class="pos-client-field">
            <label for="pos-customer">{{ pick('Client', 'گاہک') }}</label>
            <div class="pos-combobox">
              <input
                id="pos-customer"
                v-model="customerSearch"
                type="text"
                autocomplete="off"
                :title="pick('Customer selection (F3)', 'گاہک کا انتخاب (F3)')"
                aria-keyshortcuts="F3"
                :placeholder="
                  pick('Walk-in or search name, phone, code', 'عام گاہک یا نام، فون، کوڈ تلاش کریں')
                "
                role="combobox"
                aria-controls="pos-customer-options"
                :aria-expanded="customerOpen"
                @focus="openCustomerPicker"
                @input="onCustomerInput"
                @keydown="onCustomerKeydown"
                @blur="customerOpen = false"
              />
              <div
                v-if="customerOpen"
                id="pos-customer-options"
                role="listbox"
                class="pos-customer-results"
              >
                <button
                  type="button"
                  role="option"
                  :aria-selected="highlightedCustomerIndex === 0"
                  :class="{ selected: highlightedCustomerIndex === 0 }"
                  @mousedown.prevent="chooseCustomer(null)"
                >
                  {{ pick('Walk-in sale — no customer', 'عام فروخت — گاہک کے بغیر') }}
                </button>
                <CompactPages
                  :items="customerOptions"
                  :active-index="highlightedCustomerIndex - 1"
                  :row-height="42"
                  :header-height="0"
                  v-slot="{ rows }"
                >
                  <button
                    v-for="{ item: customer, index } in rows"
                    :key="customer.id"
                    type="button"
                    role="option"
                    :aria-selected="highlightedCustomerIndex === index + 1"
                    :class="{ selected: highlightedCustomerIndex === index + 1 }"
                    @mousedown.prevent="chooseCustomer(customer)"
                  >
                    <strong>{{ customer.first_name }} {{ customer.last_name }}</strong
                    ><small
                      ><bdi>{{ customer.customer_code }}</bdi
                      ><span v-if="customer.phone_number">
                        · <bdi>{{ customer.phone_number }}</bdi></span
                      ></small
                    >
                  </button>
                </CompactPages>
                <p v-if="customerLoading" role="status">
                  {{ pick('Searching clients…', 'گاہک تلاش ہو رہے ہیں…') }}
                </p>
                <p v-else-if="customerSearch.trim() && !customerOptions.length" role="status">
                  {{ pick('No active clients found', 'کوئی فعال گاہک نہیں ملا') }}
                </p>
              </div>
            </div>
          </div>
          <div class="pos-item-field">
            <div class="pos-search-wrap pos-staged-search">
              <label for="pos-item-code">{{ pick('ITEM', 'آئٹم') }}</label>
              <input
                id="pos-item-code"
                :ref="bindItemCodeInput"
                v-model="itemCode"
                autocomplete="off"
                :aria-label="pick('Item code — Enter to search', 'آئٹم کوڈ — تلاش کے لیے Enter')"
                @keydown="onItemCodeKeydown"
              />
              <Input
                id="pos-product-search"
                :ref="bindsearchInput"
                :model-value="pendingProduct?.name || searchQuery"
                :readonly="!!pendingProduct"
                @update:model-value="searchQuery = String($event ?? '')"
                size="sm"
                type="search"
                autocomplete="off"
                :aria-label="pick('Product name or barcode search', 'مصنوعات یا بارکوڈ تلاش')"
                :title="pick('Product or barcode search (F2)', 'مصنوعات یا بارکوڈ تلاش (F2)')"
                aria-keyshortcuts="F2"
                :placeholder="t('scan_or_search')"
                prefix-text="⌕"
                @input="onProductSearchInput"
                @keydown="openProductSearch"
              />
            </div>
          </div>
          <PosPrescriptionFields
            :pick="pick"
            :cart-store="cartStore"
            :has-controlled="hasControlled"
            :prescription-missing="prescriptionMissing"
            v-model:patient-name="patientName"
            v-model:doctor-name="doctorName"
            v-model:prescription-note="prescriptionNote"
          />
          <label class="pos-remarks"
            >{{ pick('Sale remarks (optional)', 'فروخت کے نوٹس (اختیاری)')
            }}<textarea
              v-model="saleRemarks"
              maxlength="500"
              rows="2"
              :placeholder="pick('Notes saved with this invoice', 'انوائس کے ساتھ محفوظ نوٹس')"
            ></textarea>
          </label>

          <div class="pos-entry-tools">
            <strong class="pos-price-mode">{{
              cartStore.customerType === 'wholesale'
                ? pick('Wholesale pricing', 'ہول سیل قیمت')
                : pick('Retail prices', 'ریٹیل قیمت')
            }}</strong>
            <p class="pos-entry-hint">
              {{
                pick(
                  'Enter in ITEM → choose product → enter quantity → Enter or ↓ to add.',
                  'آئٹم پر Enter → مصنوعات منتخب کریں → مقدار → Enter یا ↓ سے شامل کریں۔',
                )
              }}
            </p>
            <label class="pos-cost-toggle"
              ><input v-model="showCost" type="checkbox" />{{
                pick('Cost & margin', 'لاگت اور منافع')
              }}</label
            >
          </div>
        </div>

        <form
          class="pos-item-entry"
          :aria-label="pick('Selected item entry', 'منتخب آئٹم کا اندراج')"
          @submit.prevent="commitEntry($event)"
        >
          <label for="pos-entry-quantity"
            >{{ pick('QTY', 'مقدار') }}
            <input
              id="pos-entry-quantity"
              :ref="bindEntryQuantityInput"
              v-model="entryQuantity"
              type="number"
              min="1"
              step="1"
              :disabled="!pendingProduct"
              @keydown.enter.exact.prevent="commitEntry($event)"
            />
          </label>
          <label for="pos-entry-discount"
            >{{ pick('DISC %', 'رعایت ٪') }}
            <input
              id="pos-entry-discount"
              v-model="entryDiscount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              :disabled="!pendingProduct"
              @keydown.enter.exact.prevent="commitEntry($event)"
            />
          </label>
          <label for="pos-entry-bonus"
            >{{ pick('BONUS', 'بونس') }}
            <input
              id="pos-entry-bonus"
              v-model="entryBonus"
              type="number"
              min="0"
              step="1"
              :disabled="!pendingProduct"
              @keydown.enter.exact.prevent="commitEntry($event)"
            />
          </label>
          <label for="pos-entry-price"
            >{{ pick('UNIT PRICE', 'فی اکائی قیمت') }}
            <input
              id="pos-entry-price"
              :value="formatCurrency(entryPrice)"
              readonly
              :title="
                pick('Price for the selected pack or loose unit', 'منتخب پیک یا کھلی اکائی کی قیمت')
              "
            />
          </label>
          <button
            type="submit"
            class="pos-entry-add"
            :disabled="!pendingProduct"
            :aria-label="pick('Add selected item to sale', 'منتخب آئٹم فروخت میں شامل کریں')"
            :title="pick('Add item (Enter)', 'آئٹم شامل کریں (Enter)')"
          >
            ↓
          </button>
          <label for="pos-entry-pack-size"
            >{{ pick('PACK SIZE', 'پیک سائز') }}
            <input
              id="pos-entry-pack-size"
              :value="pendingProduct ? formatNumber(pendingProduct.pack_size) : ''"
              readonly
            />
          </label>
          <label for="pos-entry-stock"
            >{{ pick('CURRENT STOCK', 'موجودہ اسٹاک') }}
            <input
              id="pos-entry-stock"
              :value="pendingProduct ? formatNumber(entryStock) : ''"
              readonly
              :title="
                pick(
                  'Recorded batch balance in individual units, before this sale',
                  'فروخت سے پہلے بیچ میں محفوظ انفرادی اکائیوں کا بقایا',
                )
              "
            />
          </label>
          <button type="button" :disabled="!pendingProduct" @click="clearItemEntry">
            {{ pick('Clear', 'صاف کریں') }}
          </button>
          <p v-if="entryError" class="pos-entry-error" role="alert">{{ entryError }}</p>
        </form>
        <PosCartTable
          :t="t"
          :pick="pick"
          :format-number="formatNumber"
          :cart-store="cartStore"
          :show-cost="showCost"
          :line-gross="lineGross"
          :line-discount="lineDiscount"
          :line-margin="lineMargin"
          :remove-from-cart="removeFromCart"
          :update-quantities="updateQuantities"
          :on-line-discount-amount-change="onLineDiscountAmountChange"
          :on-line-discount-change="onLineDiscountChange"
          :get-batch-warning="getBatchWarning"
          :format-currency="formatCurrency"
          :format-date="formatDate"
        />
        <PosSaleSummary
          :t="t"
          :pick="pick"
          :format-number="formatNumber"
          :cart-store="cartStore"
          :auth-store="authStore"
          :subtotal="subtotal"
          :tax-amount="taxAmount"
          :total="total"
          :max-invoice-discount="maxInvoiceDiscount"
          :on-invoice-discount-change="onInvoiceDiscountChange"
          :format-currency="formatCurrency"
        />
      </section>

      <aside class="pos-dock" :aria-label="pick('Payment and prescription', 'ادائیگی اور نسخہ')">
        <div class="pos-dock-heading">
          <div
            v-if="paymentMethod === 'credit' && selectedCustomer"
            class="pos-credit-status"
            :class="{ exceeded: !creditAllowed }"
            :role="creditAllowed ? 'status' : 'alert'"
          >
            {{
              creditAllowed
                ? pick('Account after sale', 'فروخت کے بعد بقایا')
                : pick(
                    'Limit exceeded — collect payment / contact manager',
                    'حد سے زیادہ — وصولی کریں / منیجر سے رابطہ کریں',
                  )
            }}: {{ formatCurrency(Number(selectedCustomer.current_balance) + total) }} /
            {{ formatCurrency(Number(selectedCustomer.credit_limit)) }}
          </div>
        </div>
        <div class="pos-dock-scroll">
          <div
            v-if="!shift || shift.cashierId !== authStore.currentUser?.id"
            class="pos-shift-warning"
            role="alert"
          >
            {{
              pick(
                'Open your cash drawer shift before selling.',
                'فروخت سے پہلے اپنی کیش شفٹ کھولیں۔',
              )
            }}<button type="button" @click="router.push('/shifts')">
              {{ pick('Open shift →', 'شفٹ کھولیں ←') }}
            </button>
          </div>
          <p v-else class="pos-shift-ok">
            ● {{ pick('Shift open', 'شفٹ کھلی ہے') }} · {{ shift.cashierName }}
          </p>
          <div v-if="selectedCustomer" class="pos-previous-balance">
            <span>{{ pick('Previous customer balance', 'گاہک کا سابقہ بقایا') }}</span><strong>{{
              formatCurrency(selectedCustomer.current_balance)
            }}</strong
            ><small>{{
              pick(
                'Shown separately; not collected with this sale.',
                'الگ دکھایا گیا ہے؛ اس فروخت کے ساتھ وصول نہیں ہوگا۔',
              )
            }}</small>
          </div>

          <section v-if="selectedCustomer" class="pos-credit-info">
            <strong>{{ pick('Credit / Udhar', 'کریڈٹ / ادھار') }}</strong>
            <div>
              {{ pick('Limit', 'حد') }}: {{ formatCurrency(Number(selectedCustomer.credit_limit)) }}
            </div>
            <div>
              {{ pick('Balance after credit sale', 'ادھار کے بعد بقایا') }}:
              {{ formatCurrency(Number(selectedCustomer.current_balance) + total) }}
            </div>
            <p v-if="paymentMethod === 'credit' && !creditAllowed" role="alert">
              {{
                pick(
                  'Credit limit exceeded. Collect payment or ask a manager to review the limit.',
                  'کریڈٹ حد سے زیادہ رقم ہے۔ وصولی کریں یا منیجر سے رابطہ کریں۔',
                )
              }}
            </p>
          </section>
          <section v-if="paymentMethod === 'cash'" class="pos-cash-tender">
            <label
              >{{ pick('Cash received', 'وصول شدہ نقد')
              }}<input
                v-model="cashReceived"
                type="number"
                min="0"
                step="0.01"
                :placeholder="total.toFixed(2)"
            /></label>
            <button type="button" @click="cashReceived = total">
              {{ pick('Exact amount', 'پوری رقم') }}
            </button>
            <div>
              <span>{{ pick('Change to return', 'واپس دینے کی رقم') }}</span><strong>{{
                formatCurrency(changeDue)
              }}</strong>
            </div>
            <small v-if="!validTender" role="alert">{{
              pick('Received amount is below the bill total.', 'وصول شدہ رقم بل سے کم ہے۔')
            }}</small>
            <small v-else-if="cashReceived === ''">{{
              pick('Leave blank for exact payment.', 'پوری ادائیگی کے لیے خالی چھوڑیں۔')
            }}</small>
          </section>

          <SavedSaleActions
            ref="savedActions"
            :invoice-id="lastInvoiceId"
            @loaded="
              (sale) => {
                lastReceipt = {
                  invoiceId: sale.id,
                  invoiceNumber: sale.invoice_number,
                  netAmount: sale.net_amount,
                  subtotal: sale.total_amount,
                  taxAmount: sale.tax_amount,
                  discountAmount: sale.discount_amount,
                  receivedAmount: sale.received_amount || 0,
                  changeAmount: sale.change_amount || 0,
                };
              }
            "
          />
        </div>
        <PosPaymentMethods
          :pick="pick"
          :selected-customer="selectedCustomer"
          v-model:payment-method="paymentMethod"
        />
        <Button
          variant="primary"
          size="xl"
          class="pos-complete"
          :disabled="
            !cartStore.items.length ||
            prescriptionMissing ||
            !!pendingProduct ||
            checkoutLoading ||
            sourceDocumentLoading ||
            (paymentMethod === 'credit' && !creditAllowed) ||
            !validTender ||
            !shift ||
            shift.cashierId !== authStore.currentUser?.id
          "
          @click="checkout"
        >
          {{
            checkoutLoading
              ? pick('Processing…', 'کارروائی جاری ہے…')
              : pick('Complete Sale · Ctrl+Enter', 'فروخت مکمل کریں · Ctrl+Enter')
          }}
        </Button>
      </aside>
    </div>
    <PosProductSearchDialog
      v-if="productSearchOpen"
      v-model:query="searchQuery"
      v-model:highlighted-index="highlightedProductIndex"
      :results="searchResults"
      :loading="searchLoading"
      :error="searchError"
      :unit-price="cartStore.unitPrice"
      @search="onProductSearchInput"
      @keydown-search="handleBarcodeInput"
      @select="selectProductForEntry"
      @close="resetProductSearch"
    />
  </main>
</template>

<style src="@/components/pos/pos-terminal.css"></style>
