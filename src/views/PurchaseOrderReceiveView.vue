<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import CompactPages from '@/components/ui/CompactPages.vue';
import { localDateKey } from '@/lib/businessDay';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { purchasePreferences } from '@/lib/purchasePreferences';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import type { PurchaseOrder, Supplier } from '@/lib/types';

interface ReceiveItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity: number;
  bonus_quantity: number;
  purchase_price: number;
  sale_price: number;
  discount_percent: number;
  discount_amount: number;
  advance_tax_percent: number;
  advance_tax_amount: number;
  line_total: number;
  margin_percent: number;
  batch_number: string;
  expiry_date: string;
  current_stock: number;
  sku?: string;
  barcode?: string | null;
}
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const settings = useSettingsStore();
const { formatCurrency, pick } = useI18n();
const { showToast } = useToast();
const poId = (route.params.id as string) || '';
const direct = !poId;
const submissionId = crypto.randomUUID();
const suppliers = ref<Supplier[]>([]);
const supplierId = ref('');
const catalog = ref<ReceiveItem[]>([]);
const productSearchControl = ref<InstanceType<typeof Input> | null>(null);
const loading = ref(true);
const saving = ref(false);
const po = ref<(PurchaseOrder & { supplier_name: string }) | null>(null);
const receivable = computed(
  () => direct || (!!po.value && ['sent', 'partial'].includes(po.value.status)),
);
const invoiceNumber = ref('');
const supplierBillNumber = ref('');
const receiveDate = ref(localDateKey());
const receiveItems = ref<ReceiveItem[]>([]);
const invoiceAdvanceTaxPercent = ref(0);
const invoiceDiscountPercent = ref(0);
const invoiceDiscountFlat = ref(0);
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const subtotal = computed(() =>
  round(receiveItems.value.reduce((sum, item) => sum + item.line_total, 0)),
);
const totalItemDiscount = computed(() =>
  round(receiveItems.value.reduce((sum, item) => sum + item.discount_amount, 0)),
);
const totalGST = computed(() =>
  round(receiveItems.value.reduce((sum, item) => sum + item.advance_tax_amount, 0)),
);
const invoiceDiscountAmount = computed(() =>
  invoiceDiscountFlat.value > 0
    ? round(invoiceDiscountFlat.value)
    : round((subtotal.value * invoiceDiscountPercent.value) / 100),
);
const invoiceAdvanceTaxAmount = computed(() =>
  round(((subtotal.value - invoiceDiscountAmount.value) * invoiceAdvanceTaxPercent.value) / 100),
);
const netPayable = computed(() =>
  round(subtotal.value - invoiceDiscountAmount.value + invoiceAdvanceTaxAmount.value),
);
const canSave = computed(
  () => receivable.value && receiveItems.value.some((item) => item.quantity > 0),
);

function calculateLineItem(item: ReceiveItem) {
  const base = round(item.purchase_price * item.quantity);
  item.discount_amount = round((base * item.discount_percent) / 100);
  item.advance_tax_amount = round(((base - item.discount_amount) * item.advance_tax_percent) / 100);
  item.line_total = round(base - item.discount_amount + item.advance_tax_amount);
  item.margin_percent =
    item.purchase_price > 0
      ? ((item.sale_price - item.purchase_price) / item.purchase_price) * 100
      : 0;
}
function recalculateAll() {
  receiveItems.value.forEach(calculateLineItem);
}
watch(receiveItems, recalculateAll, { deep: true });

const selectedProduct = ref<ReceiveItem | null>(null);
const productSearch = ref('');
const productResults = ref<ReceiveItem[]>([]);
const quickEntry = ref({
  quantity: 0,
  bonusQuantity: 0,
  purchasePrice: 0,
  salePrice: 0,
  discountPercent: 0,
  gstPercent: 0,
  batchNumber: '',
  expiryDate: '',
});
function searchProducts() {
  const query = productSearch.value.trim().toLowerCase();
  productResults.value = query
    ? (direct ? catalog.value : receiveItems.value)
        .filter((item) =>
          [item.product_name, item.sku, item.barcode].some((value) =>
            value?.toLowerCase().includes(query),
          ),
        )
        .slice(0, 10)
    : [];
}
watch(productSearch, searchProducts);
watch(selectedProduct, (item) => {
  if (!item) return;
  quickEntry.value = {
    quantity: direct
      ? purchasePreferences(settings.settings).purchase_default_quantity
      : item.quantity || item.quantity_ordered - item.quantity_received,
    bonusQuantity: item.bonus_quantity,
    purchasePrice: item.purchase_price,
    salePrice: item.sale_price,
    discountPercent: item.discount_percent,
    gstPercent: item.advance_tax_percent,
    batchNumber: item.batch_number,
    expiryDate: item.expiry_date,
  };
});
function addItem() {
  const item =
    direct && selectedProduct.value
      ? { ...selectedProduct.value, id: crypto.randomUUID() }
      : selectedProduct.value;
  if (!item || quickEntry.value.quantity <= 0) {
    showToast('Select a product and enter a quantity', 'error');
    return;
  }
  Object.assign(item, {
    quantity: quickEntry.value.quantity,
    bonus_quantity: quickEntry.value.bonusQuantity,
    purchase_price: quickEntry.value.purchasePrice,
    sale_price: quickEntry.value.salePrice,
    discount_percent: quickEntry.value.discountPercent,
    advance_tax_percent: quickEntry.value.gstPercent,
    batch_number: quickEntry.value.batchNumber,
    expiry_date: quickEntry.value.expiryDate,
  });
  calculateLineItem(item);
  if (direct) receiveItems.value.push(item);
  selectedProduct.value = null;
  productSearch.value = '';
  productResults.value = [];
  productSearchControl.value?.focus();
}
function removeItem(index: number) {
  if (direct) {
    receiveItems.value.splice(index, 1);
    return;
  }
  const item = receiveItems.value[index];
  item.quantity = 0;
  item.bonus_quantity = 0;
  calculateLineItem(item);
}
onMounted(async () => {
  try {
    await settings.loadSettings();
    if (direct) {
      suppliers.value = await executeQuery<Supplier>(
        'SELECT * FROM suppliers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name',
      );
      const products = await executeQuery<{
        id: string;
        name: string;
        sku: string;
        barcode: string | null;
        cost_price: number;
        unit_price: number;
        current_stock: number;
      }>(
        `SELECT p.*, COALESCE((SELECT SUM(b.quantity_in_stock) FROM product_batches b WHERE b.product_id = p.id), 0) AS current_stock FROM products p WHERE p.is_active = 1 AND p.deleted_at IS NULL ORDER BY p.name`,
      );
      const prefs = purchasePreferences(settings.settings);
      catalog.value = products.map((product) => ({
        id: product.id,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        quantity_ordered: 0,
        quantity_received: 0,
        quantity: 0,
        bonus_quantity: 0,
        purchase_price: product.cost_price,
        sale_price: product.unit_price,
        discount_percent: prefs.purchase_default_discount,
        advance_tax_percent: prefs.purchase_default_tax,
        discount_amount: 0,
        advance_tax_amount: 0,
        line_total: 0,
        margin_percent: 0,
        batch_number: '',
        expiry_date: '',
        current_stock: product.current_stock,
      }));
      invoiceNumber.value = await invoke<string>('get_next_purchase_invoice_number');
      return;
    }
    const [order] = await executeQuery<PurchaseOrder & { supplier_name: string }>(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?`,
      [poId],
    );
    if (!order) {
      showToast('Purchase order not found', 'error');
      await router.push('/purchase-orders');
      return;
    }
    po.value = order;
    const lines = await executeQuery<
      ReceiveItem & { unit_cost: number; unit_price: number; tax_rate: number }
    >(
      `SELECT poi.*, p.name AS product_name, p.unit_price, COALESCE((SELECT SUM(b.quantity_in_stock) FROM product_batches b WHERE b.product_id = p.id), 0) AS current_stock FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id WHERE poi.po_id = ?`,
      [poId],
    );
    receiveItems.value = lines.map((item) => ({
      ...item,
      quantity: purchasePreferences(settings.settings).purchase_fill_remaining
        ? item.quantity_ordered - item.quantity_received
        : 0,
      purchase_price: item.unit_cost,
      sale_price: item.unit_price,
      bonus_quantity: 0,
      advance_tax_percent: item.tax_rate || 0,
      discount_percent: item.discount_percent || 0,
      discount_amount: 0,
      advance_tax_amount: 0,
      line_total: 0,
      margin_percent: 0,
      batch_number: '',
      expiry_date: '',
    }));
    recalculateAll();
    invoiceNumber.value = await invoke<string>('get_next_purchase_invoice_number');
  } catch {
    showToast(direct ? 'Error loading purchase invoice' : 'Error loading purchase order', 'error');
  } finally {
    loading.value = false;
  }
});
async function saveReceipt() {
  if (saving.value || !auth.currentUser || !canSave.value) return;
  if (direct && !supplierId.value) {
    showToast('Select a distributor', 'error');
    return;
  }
  const percent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  if (!supplierBillNumber.value.trim()) {
    showToast('Enter the distributor bill number', 'error');
    return;
  }
  if (
    !percent(invoiceDiscountPercent.value) ||
    !percent(invoiceAdvanceTaxPercent.value) ||
    !Number.isFinite(invoiceDiscountFlat.value) ||
    invoiceDiscountFlat.value < 0 ||
    invoiceDiscountAmount.value > subtotal.value
  ) {
    showToast('Enter valid invoice discounts and taxes', 'error');
    return;
  }
  for (const item of receiveItems.value) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 0 ||
      (!direct && item.quantity > item.quantity_ordered - item.quantity_received) ||
      !Number.isInteger(item.bonus_quantity) ||
      item.bonus_quantity < 0 ||
      (!item.quantity && item.bonus_quantity > 0)
    ) {
      showToast(
        'Receive quantities must be whole numbers within the remaining order quantity',
        'error',
      );
      return;
    }
    if (!item.quantity) continue;
    if (!item.batch_number.trim() || !item.expiry_date || item.expiry_date <= localDateKey()) {
      showToast('Enter a batch number and future expiry for each received product', 'error');
      return;
    }
    if (
      !Number.isFinite(item.purchase_price) ||
      item.purchase_price < 0 ||
      !Number.isFinite(item.sale_price) ||
      item.sale_price < 0 ||
      !percent(item.discount_percent) ||
      !percent(item.advance_tax_percent)
    ) {
      showToast('Enter valid purchase prices, sale prices, discounts and taxes', 'error');
      return;
    }
  }
  saving.value = true;
  try {
    const receipt = await invoke<{ invoiceNumber: string }>('receive_purchase_with_details', {
      request: {
        poId,
        supplierId: direct ? supplierId.value : undefined,
        submissionId: direct ? submissionId : undefined,
        invoiceNumber: invoiceNumber.value,
        supplierBillNumber: supplierBillNumber.value,
        paymentMethod: 'credit',
        receiveDate: receiveDate.value,
        invoiceDiscountPercent: invoiceDiscountPercent.value,
        invoiceDiscountFlat: invoiceDiscountFlat.value,
        invoiceAdvanceTaxPercent: invoiceAdvanceTaxPercent.value,
        paymentAmount: 0,
        userId: auth.currentUser.id,
        items: receiveItems.value
          .filter((item) => item.quantity > 0)
          .map((item) => ({
            poItemId: item.id,
            productId: item.product_id,
            quantity: item.quantity,
            bonusQuantity: item.bonus_quantity,
            unitCost: item.purchase_price,
            salePrice: item.sale_price,
            discountPercent: item.discount_percent,
            advanceTaxPercent: item.advance_tax_percent,
            batchNumber: item.batch_number,
            expiryDate: item.expiry_date,
          })),
      },
    });
    showToast(`Purchase received successfully: ${receipt.invoiceNumber}`, 'success');
    await router.push('/purchase-orders');
  } catch (error) {
    showToast(`Error receiving purchase: ${error}`, 'error');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="purchase-receive-enhanced" :class="{ 'direct-invoice': direct }">
    <!-- Header -->
    <div class="receive-header">
      <div>
        <h2>
          {{
            direct
              ? pick('Purchase Invoice', 'خریداری انوائس')
              : pick('Receive Distributor Purchase', 'خریداری کا آرڈر وصول کریں')
          }}
        </h2>
        <p v-if="po">PO #{{ po.po_number }} - {{ po.supplier_name }}</p>
      </div>
      <Button @click="router.push('/purchase-orders')" variant="outline" :disabled="saving">
        {{ pick('Purchase Register', 'خریداری رجسٹر') }}
      </Button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="direct || po" class="receive-content">
      <p v-if="!receivable" role="status">
        {{
          pick(
            'Only sent or partially received orders can receive stock.',
            'صرف بھیجے گئے یا جزوی وصول شدہ آرڈر وصول کیے جا سکتے ہیں۔',
          )
        }}
      </p>
      <fieldset :disabled="saving || !receivable" class="receipt-fields">
        <!-- Invoice Header Section -->
        <Card class="invoice-header-card">
          <div class="header-fields">
            <div class="field">
              <label>{{ pick('Invoice No', 'انوائس نمبر') }}</label>
              <Input v-model="invoiceNumber" aria-label="Invoice number" readonly />
            </div>
            <div class="field">
              <label>{{ pick('Bill #', 'بل نمبر') }}</label>
              <Input
                v-model="supplierBillNumber"
                aria-label="Distributor bill number"
                placeholder="Supplier bill number"
              />
            </div>
            <div class="field">
              <label>{{ pick('Distributor', 'ڈسٹری بیوٹر') }}</label>
              <select
                v-if="direct"
                v-model="supplierId"
                aria-label="Distributor"
                class="supplier-select"
              >
                <option value="">
                  {{ pick('Select distributor...', 'ڈسٹری بیوٹر منتخب کریں') }}
                </option>
                <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
                  {{ supplier.name }}
                </option>
              </select>
              <Input v-else :model-value="po?.supplier_name" aria-label="Distributor" readonly />
            </div>
            <div class="field">
              <label>{{ pick('Date', 'تاریخ') }}</label>
              <Input v-model="receiveDate" aria-label="Receive date" type="date" />
            </div>
          </div>
        </Card>

        <!-- Quick Entry Row -->
        <details class="quick-entry-card" :open="direct">
          <summary>
            {{
              direct
                ? pick('Add purchase items', 'خریداری آئٹمز شامل کریں')
                : pick('Quick entry for an ordered product', 'آرڈر کی مصنوعات شامل کریں')
            }}
          </summary>
          <!-- Product Search -->
          <div class="product-search">
            <label>{{ pick('ITEM', 'آئٹم') }}</label>
            <div class="search-wrapper">
              <Input
                ref="productSearchControl"
                v-model="productSearch"
                @keydown.enter.prevent="
                  productResults[0] &&
                  ((selectedProduct = productResults[0]), (productResults = []))
                "
                @keydown.esc.stop="productResults = []"
                :placeholder="
                  direct
                    ? 'Search products by name, code or barcode...'
                    : 'Search products on this order...'
                "
                :aria-label="
                  direct
                    ? 'Search purchase products'
                    : pick('Search ordered products', 'آرڈر کی مصنوعات تلاش کریں')
                "
              />
              <div v-if="productResults.length" class="search-results">
                <button
                  type="button"
                  v-for="product in productResults"
                  :key="product.id"
                  @click="
                    selectedProduct = product;
                    productResults = [];
                  "
                  class="search-result-item"
                >
                  {{ product.product_name }} · {{ direct ? 'Stock:' : 'Remaining:' }}
                  {{
                    direct
                      ? product.current_stock
                      : product.quantity_ordered - product.quantity_received
                  }}
                </button>
              </div>
            </div>
          </div>

          <div class="quick-entry-row">
            <div class="quick-field">
              <label>{{ pick('QTY', 'تعداد') }}</label>
              <Input
                v-model.number="quickEntry.quantity"
                aria-label="Quantity"
                type="number"
                min="0"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('Bonus', 'بونس') }}</label>
              <Input
                v-model.number="quickEntry.bonusQuantity"
                aria-label="Bonus"
                type="number"
                min="0"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('PUR. PRICE', 'خرید قیمت') }}</label>
              <Input
                v-model.number="quickEntry.purchasePrice"
                aria-label="Purchase price"
                type="number"
                step="0.01"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('SALE PRICE', 'فروخت قیمت') }}</label>
              <Input
                v-model.number="quickEntry.salePrice"
                aria-label="Sale price"
                type="number"
                step="0.01"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('Disc/Item %', 'رعایت %') }}</label>
              <Input
                v-model.number="quickEntry.discountPercent"
                aria-label="Discount percent"
                type="number"
                step="0.01"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('GST/ITEM', 'جی ایس ٹی') }}</label>
              <Input
                v-model.number="quickEntry.gstPercent"
                aria-label="Tax percent"
                type="number"
                step="0.01"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('Batch', 'بیچ') }}</label>
              <Input
                v-model="quickEntry.batchNumber"
                aria-label="Batch number"
                placeholder="Batch #"
              />
            </div>
            <div class="quick-field">
              <label>{{ pick('Expiry', 'ختم ہونے') }}</label>
              <Input v-model="quickEntry.expiryDate" aria-label="Expiry date" type="date" />
            </div>
            <Button @click="addItem" class="add-btn"
              >↓ {{ direct ? pick('Add', 'شامل') : pick('Apply', 'شامل') }}</Button
            >
          </div>
          <div v-if="selectedProduct" class="selected-product">
            <strong>Selected:</strong> {{ selectedProduct.product_name }} |
            <span>Current Stock: {{ selectedProduct.current_stock }}</span>
          </div>
        </details>

        <!-- Items Table -->
        <Card class="items-table-card">
          <CompactPages :items="receiveItems" :row-height="90" v-slot="{ rows }"
            ><div class="table-scroll">
              <p v-if="!receiveItems.length" class="empty-invoice">
                {{
                  pick(
                    'Select a product above, enter its quantity and prices, then choose Add.',
                    'اوپر سے مصنوعات منتخب کریں، تعداد اور قیمت درج کریں اور آئٹم شامل کریں۔',
                  )
                }}
              </p>
              <table v-else class="items-table">
                <thead>
                  <tr>
                    <th>{{ pick('Sr', 'نمبر') }}</th>
                    <th>{{ pick('Description', 'تفصیل') }}</th>
                    <th>{{ pick('Qty', 'تعداد') }}</th>
                    <th>{{ pick('Bonus', 'بونس') }}</th>
                    <th>{{ pick('Pur Price', 'خرید قیمت') }}</th>
                    <th>{{ pick('Disc %', 'رعایت %') }}</th>
                    <th>{{ pick('Disc Amt', 'رعایت رقم') }}</th>
                    <th>{{ pick('AdvTax%', 'ٹیکس %') }}</th>
                    <th>{{ pick('AdvAmount', 'ٹیکس رقم') }}</th>
                    <th>{{ pick('Total', 'کل') }}</th>
                    <th>{{ pick('Sale Price', 'فروخت قیمت') }}</th>
                    <th>{{ pick('Margin %', 'منافع %') }}</th>
                    <th>{{ pick('Actions', 'اعمال') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="{ item, index } in rows" :key="item.id">
                    <td>{{ index + 1 }}</td>
                    <td class="product-cell">
                      <div>
                        {{ item.product_name }}
                        <button
                          v-if="direct"
                          type="button"
                          class="inline-remove"
                          :aria-label="'Remove ' + item.product_name"
                          @click="removeItem(index)"
                        >
                          ×
                        </button>
                      </div>
                      <small v-if="!direct"
                        >Ordered: {{ item.quantity_ordered }} · Received:
                        {{ item.quantity_received }}</small
                      >
                      <label
                        >Batch
                        <Input
                          v-model="item.batch_number"
                          :aria-label="'Batch number for ' + item.product_name"
                      /></label>
                      <label
                        >Expiry
                        <Input
                          v-model="item.expiry_date"
                          type="date"
                          :aria-label="'Expiry date for ' + item.product_name"
                      /></label>
                    </td>
                    <td>
                      <Input
                        v-model.number="item.quantity"
                        :max="direct ? undefined : item.quantity_ordered - item.quantity_received"
                        :aria-label="'Receive quantity for ' + item.product_name"
                        min="0"
                        type="number"
                        @change="calculateLineItem(item)"
                      />
                    </td>
                    <td>
                      <Input
                        v-model.number="item.bonus_quantity"
                        type="number"
                        min="0"
                        :aria-label="'Bonus for ' + item.product_name"
                      />
                    </td>
                    <td>
                      <Input
                        v-model.number="item.purchase_price"
                        :aria-label="'Purchase price for ' + item.product_name"
                        min="0"
                        type="number"
                        step="0.01"
                        @change="calculateLineItem(item)"
                      />
                    </td>
                    <td>
                      <Input
                        v-model.number="item.discount_percent"
                        :aria-label="'Item discount percent for ' + item.product_name"
                        min="0"
                        type="number"
                        step="0.01"
                        @change="calculateLineItem(item)"
                      />
                    </td>
                    <td>{{ formatCurrency(item.discount_amount) }}</td>
                    <td>
                      <Input
                        v-model.number="item.advance_tax_percent"
                        :aria-label="'Item tax percent for ' + item.product_name"
                        min="0"
                        type="number"
                        step="0.01"
                        @change="calculateLineItem(item)"
                      />
                    </td>
                    <td>{{ formatCurrency(item.advance_tax_amount) }}</td>
                    <td class="total-cell">{{ formatCurrency(item.line_total) }}</td>
                    <td>
                      <Input
                        v-model.number="item.sale_price"
                        :aria-label="'Sale price for ' + item.product_name"
                        min="0"
                        type="number"
                        step="0.01"
                        @change="calculateLineItem(item)"
                      />
                    </td>
                    <td class="margin-cell">{{ item.margin_percent.toFixed(2) }}%</td>
                    <td>
                      <button
                        @click="removeItem(index)"
                        class="remove-btn"
                        :aria-label="'Clear receipt for ' + item.product_name"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CompactPages>
          <!-- Summary -->
          <div class="items-summary">
            <span
              >{{ pick('Items', 'آئٹمز') }}: <strong>{{ receiveItems.length }}</strong></span
            >
            <span
              >{{ pick('Item Disc', 'آئٹم رعایت') }}:
              <strong>{{ formatCurrency(totalItemDiscount) }}</strong></span
            >
            <span
              >{{ pick('GST', 'جی ایس ٹی') }}: <strong>{{ formatCurrency(totalGST) }}</strong></span
            >
          </div>
        </Card>

        <!-- Footer Section -->
        <div class="footer-section">
          <Card class="footer-card">
            <!-- Invoice Adjustments -->
            <div class="adjustments">
              <div class="adjustment-row">
                <label>{{ pick('Invoice Advance Tax', 'انوائس ٹیکس') }} %:</label>
                <Input
                  v-model.number="invoiceAdvanceTaxPercent"
                  aria-label="Invoice advance tax percent"
                  min="0"
                  max="100"
                  type="number"
                  step="0.01"
                  class="small-input"
                />
              </div>
              <div class="adjustment-row">
                <label>{{ pick('Invoice Discount', 'انوائس رعایت') }} %:</label>
                <Input
                  v-model.number="invoiceDiscountPercent"
                  aria-label="Invoice discount percent"
                  min="0"
                  max="100"
                  type="number"
                  step="0.01"
                  class="small-input"
                />
                <label>{{ pick('Flat', 'فلیٹ') }}:</label>
                <Input
                  v-model.number="invoiceDiscountFlat"
                  aria-label="Flat invoice discount"
                  min="0"
                  type="number"
                  step="0.01"
                  class="small-input"
                />
              </div>
            </div>

            <div class="payment-section">
              <p>
                {{
                  pick(
                    'Record supplier payments in Supplier Ledger after receiving this invoice.',
                    'انوائس وصول کرنے کے بعد سپلائر لیجر میں ادائیگی درج کریں۔',
                  )
                }}
              </p>
            </div>

            <!-- Net Payable -->
            <div class="net-payable">
              <label>{{ pick('Net Payable', 'خالص ادائیگی') }}:</label>
              <div class="net-amount">{{ formatCurrency(netPayable) }}</div>
            </div>
          </Card>
        </div>
      </fieldset>
      <!-- Actions -->
      <div class="action-buttons">
        <Button @click="router.push('/purchase-orders')" variant="outline" :disabled="saving">
          {{ pick('Cancel', 'منسوخ') }}
        </Button>
        <Button @click="saveReceipt" permission="purchases.receive" :disabled="saving || !canSave">
          {{
            saving
              ? pick('Saving...', 'محفوظ ہو رہا ہے...')
              : pick('Save & Update Stock', 'محفوظ کریں اور اسٹاک اپ ڈیٹ کریں')
          }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.purchase-receive-enhanced {
  height: 100%;
  min-height: 0;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  color: var(--color-text-primary);
}
.receive-header,
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
.receive-header h2 {
  font-size: 18px;
  font-weight: 700;
}
.receive-header p,
.field label,
.quick-field label,
.selected-product {
  font-size: 12px;
}
.receive-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.receipt-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.invoice-header-card,
.footer-card {
  padding: 8px;
  flex-shrink: 0;
}
.header-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.quick-entry-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 8px;
  flex-shrink: 0;
}
.quick-entry-card summary {
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.quick-entry-row {
  display: grid;
  grid-template-columns: repeat(8, minmax(60px, 1fr)) auto;
  gap: 6px;
  align-items: end;
}
.product-search {
  margin: 6px 0;
}
.search-wrapper {
  position: relative;
}
.search-results {
  position: absolute;
  z-index: 20;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  max-height: 180px;
  overflow: auto;
  width: 100%;
}
.search-result-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px;
  cursor: pointer;
}
.search-result-item:hover {
  background: var(--color-bg-secondary);
}
.items-table-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
.table-scroll {
  height: 100%;
  overflow: auto;
}
.items-table {
  width: 100%;
  min-width: 1250px;
  border-collapse: collapse;
  font-size: 12px;
}
.items-table th {
  background: var(--color-bg-secondary);
  text-align: left;
  padding: 6px;
  white-space: nowrap;
}
.items-table td {
  padding: 4px;
  border-bottom: 1px solid var(--color-border);
  min-width: 75px;
}
.items-table td:first-child {
  min-width: 28px;
}
.items-table td.product-cell {
  min-width: 230px;
}
.product-cell small {
  display: block;
  color: var(--color-text-secondary);
}
.product-cell label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-right: 5px;
  font-size: 11px;
}
.product-cell label :deep(input) {
  width: 110px;
}
.items-table :deep(input) {
  height: 28px;
  padding: 2px 4px;
  font-size: 12px;
  min-width: 65px;
}
:deep(.header-fields input),
:deep(.quick-entry-card input),
:deep(.adjustments input) {
  height: 28px;
  padding: 2px 6px;
  font-size: 12px;
}
.items-summary {
  display: flex;
  gap: 20px;
  padding: 5px 8px;
  font-size: 12px;
  flex-shrink: 0;
}
.footer-section {
  flex-shrink: 0;
}
.footer-card {
  display: grid;
  grid-template-columns: auto minmax(100px, 1fr) auto;
  align-items: center;
  gap: 12px;
}
.adjustment-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
  font-size: 12px;
}
.adjustment-row .small-input {
  width: 65px;
}
.payment-section {
  font-size: 11px;
  color: var(--color-text-secondary);
  max-width: 260px;
}
.net-payable {
  text-align: right;
  font-size: 12px;
}
.net-amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
}
.remove-btn {
  color: var(--color-danger);
  font-size: 22px;
  padding: 0 8px;
}
.total-cell {
  font-weight: 700;
}
.loading {
  padding: 24px;
}
@media (max-width: 760px) {
  .header-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .footer-card {
    grid-template-columns: 1fr auto;
  }
  .payment-section {
    display: none;
  }
  .quick-entry-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container (max-width: 1100px) {
  .items-table {
    min-width: 0;
    table-layout: fixed;
  }
  .items-table th {
    white-space: normal;
    font-size: 11px;
    line-height: 1.2;
    padding: 5px 3px;
    overflow-wrap: anywhere;
  }
  .items-table td {
    min-width: 0;
    padding: 4px 3px;
  }
  .items-table td.product-cell {
    min-width: 0;
  }
  .items-table th:nth-child(2) {
    width: 28%;
  }
  .items-table :deep(input) {
    min-width: 0;
    width: 100%;
  }
  .product-cell label {
    display: flex;
  }
  .product-cell label :deep(input) {
    width: 110px;
  }
  .items-table :is(th, td):nth-child(1),
  .items-table :is(th, td):nth-child(7),
  .items-table :is(th, td):nth-child(9),
  .items-table :is(th, td):nth-child(12),
  .items-table :is(th, td):nth-child(13) {
    display: none;
  }
}
.supplier-select {
  width: 100%;
  height: 28px;
  padding: 2px 6px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}
.empty-invoice {
  padding: 16px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.inline-remove {
  color: var(--color-danger, #dc2626);
  padding: 0 6px;
  font-size: 16px;
}
.direct-invoice .quick-entry-card summary {
  display: none;
}
.direct-invoice .product-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 5px;
}
.direct-invoice .search-wrapper {
  flex: 1;
  min-width: 0;
}
.direct-invoice .product-cell label {
  display: inline-flex;
  margin-right: 4px;
}
.direct-invoice .product-cell label :deep(input) {
  width: 80px;
}
.direct-invoice .product-cell label :deep(input[type='date']) {
  width: 105px;
}
@media (max-height: 700px) {
  .direct-invoice {
    gap: 5px;
    padding: 5px;
  }
  .direct-invoice .receive-content,
  .direct-invoice .receipt-fields {
    gap: 5px;
  }
  .direct-invoice .receive-header h2 {
    font-size: 16px;
  }
  .direct-invoice .receive-header :deep(button),
  .direct-invoice .action-buttons :deep(button) {
    height: 30px;
    font-size: 12px;
    padding: 2px 8px;
  }
  .direct-invoice .invoice-header-card,
  .direct-invoice .footer-card {
    padding: 5px 8px;
  }
  .direct-invoice .quick-entry-card {
    padding: 5px 8px;
  }
}
.direct-invoice .quick-entry-row {
  grid-template-columns: repeat(8, minmax(0, 1fr)) 110px;
}
.direct-invoice .add-btn {
  padding: 2px 8px;
  height: 28px;
  font-size: 12px;
}
</style>
