<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { formatCurrency, pick } = useI18n();
const { showToast } = useToast();

const poId = route.params.id as string;
const loading = ref(true);
const saving = ref(false);

// Purchase Order Data
const po = ref<any>(null);
const invoiceNumber = ref('');
const supplierBillNumber = ref('');
const paymentMethod = ref('cash');
const receiveDate = ref(new Date().toISOString().split('T')[0]);

// Item being added
const selectedProduct = ref<any>(null);
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

// Receive Items
interface ReceiveItem {
  id: string;
  product_id: number;
  product_name: string;
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
}

const receiveItems = ref<ReceiveItem[]>([]);

// Invoice-level adjustments
const invoiceAdvanceTaxPercent = ref(0);
const invoiceDiscountPercent = ref(0);
const invoiceDiscountFlat = ref(0);
const paymentAmount = ref(0);

// Calculations
const subtotal = computed(() => {
  return receiveItems.value.reduce((sum, item) => sum + item.line_total, 0);
});

const totalItemDiscount = computed(() => {
  return receiveItems.value.reduce((sum, item) => sum + item.discount_amount, 0);
});

const totalGST = computed(() => {
  return receiveItems.value.reduce((sum, item) => sum + item.advance_tax_amount, 0);
});

const invoiceDiscountAmount = computed(() => {
  if (invoiceDiscountFlat.value > 0) {
    return invoiceDiscountFlat.value;
  }
  return (subtotal.value * invoiceDiscountPercent.value) / 100;
});

const afterDiscount = computed(() => {
  return subtotal.value - invoiceDiscountAmount.value;
});

const invoiceAdvanceTaxAmount = computed(() => {
  return (afterDiscount.value * invoiceAdvanceTaxPercent.value) / 100;
});

const netPayable = computed(() => {
  return afterDiscount.value + invoiceAdvanceTaxAmount.value;
});

const balance = computed(() => {
  return netPayable.value - paymentAmount.value;
});

// Calculate line item totals
function calculateLineItem(item: ReceiveItem) {
  const baseAmount = item.purchase_price * item.quantity;
  item.discount_amount = (baseAmount * item.discount_percent) / 100;
  const afterDisc = baseAmount - item.discount_amount;
  item.advance_tax_amount = (afterDisc * item.advance_tax_percent) / 100;
  item.line_total = afterDisc + item.advance_tax_amount;
  
  // Calculate margin
  if (item.purchase_price > 0) {
    item.margin_percent = ((item.sale_price - item.purchase_price) / item.purchase_price) * 100;
  } else {
    item.margin_percent = 0;
  }
}

// Add item from quick entry
function addItem() {
  if (!selectedProduct.value || quickEntry.value.quantity <= 0) {
    showToast('Please select a product and enter quantity', 'error');
    return;
  }

  const newItem: ReceiveItem = {
    id: Date.now().toString(),
    product_id: selectedProduct.value.id,
    product_name: selectedProduct.value.name,
    quantity: quickEntry.value.quantity,
    bonus_quantity: quickEntry.value.bonusQuantity,
    purchase_price: quickEntry.value.purchasePrice,
    sale_price: quickEntry.value.salePrice,
    discount_percent: quickEntry.value.discountPercent,
    discount_amount: 0,
    advance_tax_percent: quickEntry.value.gstPercent,
    advance_tax_amount: 0,
    line_total: 0,
    margin_percent: 0,
    batch_number: quickEntry.value.batchNumber,
    expiry_date: quickEntry.value.expiryDate,
    current_stock: selectedProduct.value.total_stock || 0,
  };

  calculateLineItem(newItem);
  receiveItems.value.push(newItem);

  // Reset quick entry
  quickEntry.value = {
    quantity: 0,
    bonusQuantity: 0,
    purchasePrice: 0,
    salePrice: 0,
    discountPercent: 0,
    gstPercent: 0,
    batchNumber: '',
    expiryDate: '',
  };
  selectedProduct.value = null;
}

// Remove item
function removeItem(index: number) {
  receiveItems.value.splice(index, 1);
}

// Recalculate all items
function recalculateAll() {
  receiveItems.value.forEach(item => calculateLineItem(item));
}

// Load PO
onMounted(async () => {
  await loadPO();
});

async function loadPO() {
  loading.value = true;
  try {
    const [poData] = await executeQuery(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ?`,
      [poId],
    );
    
    if (!poData) {
      showToast('Purchase order not found', 'error');
      router.push('/purchase-orders');
      return;
    }
    
    po.value = poData;
    
    // Generate invoice number
    const lastInvoice = await executeQuery(
      'SELECT invoice_number FROM purchase_receipts ORDER BY id DESC LIMIT 1'
    );
    const lastNum = lastInvoice[0]?.invoice_number?.match(/\d+$/)?.[0] || '0';
    invoiceNumber.value = `PI-${String(Number(lastNum) + 1).padStart(6, '0')}`;
    
  } catch (error) {
    showToast('Error loading purchase order', 'error');
  } finally {
    loading.value = false;
  }
}

// Search products
const productSearch = ref('');
const productResults = ref<any[]>([]);
async function searchProducts() {
  if (productSearch.value.length < 2) return;
  
  const results = await executeQuery(
    `SELECT id, name, total_stock, purchase_price, sale_price 
     FROM products 
     WHERE name LIKE ? 
     LIMIT 10`,
    [`%${productSearch.value}%`]
  );
  productResults.value = results;
}

// Save receipt
async function saveReceipt() {
  if (receiveItems.value.length === 0) {
    showToast('Please add at least one item', 'error');
    return;
  }

  if (!supplierBillNumber.value.trim()) {
    showToast('Please enter supplier bill number', 'error');
    return;
  }

  saving.value = true;
  
  try {
    await invoke('receive_purchase_with_details', {
      request: {
        poId,
        invoiceNumber: invoiceNumber.value,
        supplierBillNumber: supplierBillNumber.value,
        paymentMethod: paymentMethod.value,
        receiveDate: receiveDate.value,
        items: receiveItems.value,
        subtotal: subtotal.value,
        invoiceDiscountPercent: invoiceDiscountPercent.value,
        invoiceDiscountAmount: invoiceDiscountAmount.value,
        invoiceAdvanceTaxPercent: invoiceAdvanceTaxPercent.value,
        invoiceAdvanceTaxAmount: invoiceAdvanceTaxAmount.value,
        netPayable: netPayable.value,
        paymentAmount: paymentAmount.value,
        balance: balance.value,
        userId: authStore.currentUser?.id,
      },
    });

    showToast('Purchase received successfully', 'success');
    router.push('/purchase-orders');
  } catch (error) {
    showToast(`Error: ${error}`, 'error');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="purchase-receive-enhanced">
    <!-- Header -->
    <div class="receive-header">
      <div>
        <h2>{{ pick('Receive Purchase Order', 'خریداری کا آرڈر وصول کریں') }}</h2>
        <p v-if="po">PO #{{ po.po_number }} - {{ po.supplier_name }}</p>
      </div>
      <Button @click="router.push('/purchase-orders')" variant="outline">
        {{ pick('Back', 'واپس') }}
      </Button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else class="receive-content">
      <!-- Invoice Header Section -->
      <Card class="invoice-header-card">
        <div class="header-fields">
          <div class="field">
            <label>{{ pick('Invoice No', 'انوائس نمبر') }}</label>
            <Input v-model="invoiceNumber" readonly />
          </div>
          <div class="field">
            <label>{{ pick('Bill #', 'بل نمبر') }}</label>
            <Input v-model="supplierBillNumber" placeholder="Supplier bill number" />
          </div>
          <div class="field">
            <label>{{ pick('Payment', 'ادائیگی') }}</label>
            <select v-model="paymentMethod" class="select-input">
              <option value="cash">{{ pick('Cash', 'نقد') }}</option>
              <option value="credit">{{ pick('Credit', 'ادھار') }}</option>
              <option value="bank">{{ pick('Bank Transfer', 'بینک ٹرانسفر') }}</option>
            </select>
          </div>
          <div class="field">
            <label>{{ pick('Date', 'تاریخ') }}</label>
            <Input v-model="receiveDate" type="date" />
          </div>
        </div>

        <!-- Product Search -->
        <div class="product-search">
          <label>{{ pick('ITEM', 'آئٹم') }}</label>
          <div class="search-wrapper">
            <Input 
              v-model="productSearch" 
              @input="searchProducts"
              placeholder="Search product..."
            />
            <div v-if="productResults.length" class="search-results">
              <div 
                v-for="product in productResults" 
                :key="product.id"
                @click="selectedProduct = product; productResults = []"
                class="search-result-item"
              >
                {{ product.name }} - Stock: {{ product.total_stock }}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- Quick Entry Row -->
      <Card class="quick-entry-card">
        <div class="quick-entry-row">
          <div class="quick-field">
            <label>{{ pick('QTY', 'تعداد') }}</label>
            <Input v-model.number="quickEntry.quantity" type="number" min="0" />
          </div>
          <div class="quick-field">
            <label>{{ pick('Bonus', 'بونس') }}</label>
            <Input v-model.number="quickEntry.bonusQuantity" type="number" min="0" />
          </div>
          <div class="quick-field">
            <label>{{ pick('PUR. PRICE', 'خرید قیمت') }}</label>
            <Input v-model.number="quickEntry.purchasePrice" type="number" step="0.01" />
          </div>
          <div class="quick-field">
            <label>{{ pick('SALE PRICE', 'فروخت قیمت') }}</label>
            <Input v-model.number="quickEntry.salePrice" type="number" step="0.01" />
          </div>
          <div class="quick-field">
            <label>{{ pick('Disc/Item %', 'رعایت %') }}</label>
            <Input v-model.number="quickEntry.discountPercent" type="number" step="0.01" />
          </div>
          <div class="quick-field">
            <label>{{ pick('GST/ITEM', 'جی ایس ٹی') }}</label>
            <Input v-model.number="quickEntry.gstPercent" type="number" step="0.01" />
          </div>
          <div class="quick-field">
            <label>{{ pick('Batch', 'بیچ') }}</label>
            <Input v-model="quickEntry.batchNumber" placeholder="Batch #" />
          </div>
          <div class="quick-field">
            <label>{{ pick('Expiry', 'ختم ہونے') }}</label>
            <Input v-model="quickEntry.expiryDate" type="date" />
          </div>
          <Button @click="addItem" class="add-btn">↓ {{ pick('Add', 'شامل') }}</Button>
        </div>
        <div v-if="selectedProduct" class="selected-product">
          <strong>Selected:</strong> {{ selectedProduct.name }} 
          | <span>Current Stock: {{ selectedProduct.total_stock }}</span>
        </div>
      </Card>

      <!-- Items Table -->
      <Card class="items-table-card">
        <div class="table-scroll">
          <table class="items-table">
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
              <tr v-for="(item, index) in receiveItems" :key="item.id">
                <td>{{ index + 1 }}</td>
                <td class="product-cell">
                  <div>{{ item.product_name }}</div>
                  <small>Batch: {{ item.batch_number }}</small>
                </td>
                <td><Input v-model.number="item.quantity" type="number" @change="calculateLineItem(item)" /></td>
                <td>{{ item.bonus_quantity }}</td>
                <td><Input v-model.number="item.purchase_price" type="number" step="0.01" @change="calculateLineItem(item)" /></td>
                <td><Input v-model.number="item.discount_percent" type="number" step="0.01" @change="calculateLineItem(item)" /></td>
                <td>{{ formatCurrency(item.discount_amount) }}</td>
                <td><Input v-model.number="item.advance_tax_percent" type="number" step="0.01" @change="calculateLineItem(item)" /></td>
                <td>{{ formatCurrency(item.advance_tax_amount) }}</td>
                <td class="total-cell">{{ formatCurrency(item.line_total) }}</td>
                <td><Input v-model.number="item.sale_price" type="number" step="0.01" @change="calculateLineItem(item)" /></td>
                <td class="margin-cell">{{ item.margin_percent.toFixed(2) }}%</td>
                <td>
                  <button @click="removeItem(index)" class="remove-btn">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Summary -->
        <div class="items-summary">
          <span>{{ pick('Items', 'آئٹمز') }}: <strong>{{ receiveItems.length }}</strong></span>
          <span>{{ pick('Item Disc', 'آئٹم رعایت') }}: <strong>{{ formatCurrency(totalItemDiscount) }}</strong></span>
          <span>{{ pick('GST', 'جی ایس ٹی') }}: <strong>{{ formatCurrency(totalGST) }}</strong></span>
        </div>
      </Card>

      <!-- Footer Section -->
      <div class="footer-section">
        <Card class="footer-card">
          <!-- Invoice Adjustments -->
          <div class="adjustments">
            <div class="adjustment-row">
              <label>{{ pick('Invoice Advance Tax', 'انوائس ٹیکس') }} %:</label>
              <Input v-model.number="invoiceAdvanceTaxPercent" type="number" step="0.01" class="small-input" />
              <Button @click="recalculateAll" size="sm">{{ pick('Calculate', 'حساب') }}</Button>
            </div>
            <div class="adjustment-row">
              <label>{{ pick('Invoice Discount', 'انوائس رعایت') }} %:</label>
              <Input v-model.number="invoiceDiscountPercent" type="number" step="0.01" class="small-input" />
              <label>{{ pick('Flat', 'فلیٹ') }}:</label>
              <Input v-model.number="invoiceDiscountFlat" type="number" step="0.01" class="small-input" />
            </div>
          </div>

          <!-- Payment -->
          <div class="payment-section">
            <div class="payment-row">
              <label>{{ pick('Payment', 'ادائیگی') }}:</label>
              <Input v-model.number="paymentAmount" type="number" step="0.01" />
            </div>
            <div class="payment-row">
              <label>{{ pick('Balance', 'بقایا') }}:</label>
              <Input :value="formatCurrency(balance)" readonly />
            </div>
          </div>

          <!-- Net Payable -->
          <div class="net-payable">
            <label>{{ pick('Net Payable', 'خالص ادائیگی') }}:</label>
            <div class="net-amount">{{ formatCurrency(netPayable) }}</div>
          </div>
        </Card>
      </div>

      <!-- Actions -->
      <div class="action-buttons">
        <Button @click="router.push('/purchase-orders')" variant="outline" :disabled="saving">
          {{ pick('Cancel', 'منسوخ') }}
        </Button>
        <Button @click="saveReceipt" :disabled="saving || receiveItems.length === 0">
          {{ saving ? pick('Saving...', 'محفوظ ہو رہا ہے...') : pick('Save & Update Stock', 'محفوظ کریں اور اسٹاک اپ ڈیٹ کریں') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.purchase-receive-enhanced {
  padding: 2rem;
  max-width: 1600px;
  margin: 0 auto;
}

.receive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.receive-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.invoice-header-card {
  margin-bottom: 1rem;
}

.header-fields {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.field label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.select-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
}

.product-search {
  position: relative;
}

.search-wrapper {
  position: relative;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.search-result-item {
  padding: 0.5rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
}

.search-result-item:hover {
  background: #f9fafb;
}

.quick-entry-card {
  margin-bottom: 1rem;
}

.quick-entry-row {
  display: grid;
  grid-template-columns: repeat(8, 1fr) auto;
  gap: 0.5rem;
  align-items: end;
}

.quick-field label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.add-btn {
  height: 38px;
}

.selected-product {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #f0f9ff;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.items-table-card {
  margin-bottom: 1rem;
}

.table-scroll {
  overflow-x: auto;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.items-table th {
  background: #f9fafb;
  padding: 0.75rem 0.5rem;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
}

.items-table td {
  padding: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.items-table input {
  width: 80px;
  padding: 0.25rem;
  font-size: 0.875rem;
}

.product-cell {
  min-width: 200px;
}

.product-cell small {
  display: block;
  color: #6b7280;
  font-size: 0.75rem;
}

.total-cell {
  font-weight: 600;
}

.margin-cell {
  color: #059669;
  font-weight: 500;
}

.remove-btn {
  background: #ef4444;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}

.items-summary {
  display: flex;
  gap: 2rem;
  padding: 1rem;
  background: #f9fafb;
  border-top: 2px solid #e5e7eb;
  font-size: 0.875rem;
}

.footer-section {
  margin-bottom: 1rem;
}

.footer-card {
  padding: 1.5rem;
}

.adjustments {
  margin-bottom: 1rem;
}

.adjustment-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.adjustment-row label {
  min-width: 150px;
  font-size: 0.875rem;
}

.small-input {
  width: 100px;
}

.payment-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.payment-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.payment-row label {
  min-width: 80px;
  font-size: 0.875rem;
  font-weight: 500;
}

.net-payable {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 2px solid #e5e7eb;
}

.net-payable label {
  font-size: 1rem;
  font-weight: 600;
}

.net-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #059669;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.loading {
  text-align: center;
  padding: 3rem;
  font-size: 1.125rem;
  color: #6b7280;
}
</style>
