<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, onMounted, computed, nextTick } from 'vue'
import { executeQuery, executeUpdate } from '@/lib/database'
import { formatCurrency, generateUUID } from '@/lib/utils'
import { useToast } from '@/composables/useToast'
import { encodeCode39 } from '@/lib/code39'
import { useI18n } from '@/lib/i18n'
import type { Product, Category, Manufacturer } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import BatchManager from '@/components/BatchManager.vue'

const router=useRouter()
const toast = useToast()
const { pick, formatNumber } = useI18n()
const products = ref<Product[]>([])
const categories = ref<Category[]>([])
const manufacturers = ref<Manufacturer[]>([])
const searchQuery = ref('')
const loading = ref(false)
const showModal = ref(false)
const editingProduct = ref<Product | null>(null)
const showBatchManager = ref(false)
const selectedProduct = ref<Product | null>(null)
const productStocks = ref<Map<string, number>>(new Map())
const labelProduct = ref<Product | null>(null)
const labelCount = ref(1)
const printingLabels = ref(false)
const labelBarcode = computed(() => encodeCode39(labelProduct.value?.barcode || ''))
const labelCopies = computed(() => Array.from({ length: Number(labelCount.value) || 0 }, (_, index) => index))

function openLabel(product: Product) {
  if (!product.barcode) {
    toast.warning('Add a barcode to this product before printing labels')
    return
  }
  if (!encodeCode39(product.barcode)) {
    toast.warning('This barcode cannot fit a 75 mm Code 39 label. Use up to 15 uppercase letters, digits, or Code 39 symbols.')
    return
  }
  labelProduct.value = product
  labelCount.value = 1
}

async function printLabels() {
  if (!labelProduct.value || !labelBarcode.value || !Number.isInteger(Number(labelCount.value)) || Number(labelCount.value) < 1 || Number(labelCount.value) > 100) {
    toast.warning('Choose 1 to 100 labels')
    return
  }
  printingLabels.value = true
  await nextTick()
  document.body.classList.add('printing-labels')
  const pageStyle = document.createElement('style')
  pageStyle.textContent = '@page { size: 75mm 35mm; margin: 0; }'
  document.head.appendChild(pageStyle)
  const cleanup = () => {
    pageStyle.remove()
    document.body.classList.remove('printing-labels')
    printingLabels.value = false
  }
  window.addEventListener('afterprint', cleanup, { once: true })
  try { window.print() }
  catch (error) {
    window.removeEventListener('afterprint', cleanup)
    cleanup()
    console.error(error)
    toast.error('Could not open the print dialog')
  }
}

// Form state
const formData = ref({
  sku: '',
  name: '',
  generic_name: '',
  barcode: '',
  category_id: '',
  manufacturer_id: '',
  unit_price: 0,
  wholesale_price: '' as number|string,
  cost_price: 0,
  pack_size: 1,
  sell_by_loose_unit: false,
  drap_registration_number: '',
  controlled_substance: false,
  reorder_level: 10,
  is_active: true,
})

const filteredProducts = computed(() => {
  if (!searchQuery.value) return products.value
  
  const query = searchQuery.value.toLowerCase()
  return products.value.filter(p => 
    p.name.toLowerCase().includes(query) ||
    p.sku.toLowerCase().includes(query) ||
    (p.barcode && p.barcode.toLowerCase().includes(query))
  )
})

onMounted(async () => {
  await Promise.all([
    loadProducts(),
    loadCategories(),
    loadManufacturers()
  ])
})

async function loadProducts() {
  loading.value = true
  try {
    const rows = await executeQuery<Product & { current_stock: number }>(
      `SELECT p.*, COALESCE(SUM(pb.quantity_in_stock), 0) AS current_stock
       FROM products p LEFT JOIN product_batches pb ON pb.product_id = p.id
       WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name`
    )
    products.value = rows
    productStocks.value = new Map(rows.map(product => [product.id, Number(product.current_stock)]))
  } catch (error) {
    console.error('Error loading products:', error)
    toast.error('Failed to load products')
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    categories.value = await executeQuery<Category>(
      'SELECT * FROM categories WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name'
    )
  } catch (error) {
    console.error('Error loading categories:', error)
  }
}

async function loadManufacturers() {
  try {
    manufacturers.value = await executeQuery<Manufacturer>(
      'SELECT * FROM manufacturers WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name'
    )
  } catch (error) {
    console.error('Error loading manufacturers:', error)
  }
}

function openAddModal() {
  editingProduct.value = null
  formData.value = {
    sku: '',
    name: '',
    generic_name: '',
    barcode: '',
    category_id: '',
    manufacturer_id: '',
    unit_price: 0,
    wholesale_price: '',
    cost_price: 0,
    pack_size: 1,
    sell_by_loose_unit: false,
    drap_registration_number: '',
    controlled_substance: false,
    reorder_level: 10,
    is_active: true,
  }
  showModal.value = true
}

function openEditModal(product: Product) {
  editingProduct.value = product
  formData.value = {
    sku: product.sku,
    name: product.name,
    generic_name: product.generic_name || '',
    barcode: product.barcode || '',
    category_id: product.category_id || '',
    manufacturer_id: product.manufacturer_id || '',
    unit_price: product.unit_price,
    wholesale_price: product.wholesale_price??'',
    cost_price: product.cost_price,
    pack_size: product.pack_size,
    sell_by_loose_unit: product.sell_by_loose_unit,
    drap_registration_number: product.drap_registration_number || '',
    controlled_substance: product.controlled_substance,
    reorder_level: product.reorder_level,
    is_active: product.is_active,
  }
  showModal.value = true
}

async function saveProduct() {
  if (!formData.value.name.trim() || !formData.value.sku.trim()) {
    toast.warning('Name and SKU are required')
    return
  }
  if (!Number.isFinite(Number(formData.value.unit_price)) || Number(formData.value.unit_price) < 0 ||
      !Number.isFinite(Number(formData.value.cost_price)) || Number(formData.value.cost_price) < 0 ||
      !Number.isInteger(Number(formData.value.pack_size)) || Number(formData.value.pack_size) < 1 ||
      !Number.isInteger(Number(formData.value.reorder_level)) || Number(formData.value.reorder_level) < 0) {
    toast.warning(pick('Enter valid prices, pack size, and reorder level', 'درست قیمتیں، پیک سائز اور دوبارہ آرڈر کی حد درج کریں'))
    return
  }

  const wholesale=formData.value.wholesale_price===''?null:Number(formData.value.wholesale_price)
  if(wholesale!==null&&(!Number.isFinite(wholesale)||wholesale<0||wholesale>100000000||Math.abs(wholesale*100-Math.round(wholesale*100))>0.00001)){toast.warning(pick('Use a valid wholesale price with at most two decimals, or leave blank for retail.','درست ہول سیل قیمت دو اعشاری ہندسوں تک درج کریں، یا ریٹیل کے لیے خالی رکھیں۔'));return}
  loading.value = true
  try {
    const now = new Date().toISOString()
    
    if (editingProduct.value) {
      // Update existing product
      await executeUpdate(
        `UPDATE products SET 
          sku = ?, name = ?, generic_name = ?, barcode = ?,
          category_id = ?, manufacturer_id = ?,
          unit_price = ?, wholesale_price = ?, cost_price = ?, pack_size = ?,
          sell_by_loose_unit = ?, drap_registration_number = ?,
          controlled_substance = ?, reorder_level = ?,
          is_active = ?, updated_at = ?
         WHERE id = ?`,
        [
          formData.value.sku,
          formData.value.name,
          formData.value.generic_name || null,
          formData.value.barcode || null,
          formData.value.category_id || null,
          formData.value.manufacturer_id || null,
          formData.value.unit_price,
          wholesale,
          formData.value.cost_price,
          formData.value.pack_size,
          formData.value.sell_by_loose_unit ? 1 : 0,
          formData.value.drap_registration_number || null,
          formData.value.controlled_substance ? 1 : 0,
          formData.value.reorder_level,
          formData.value.is_active ? 1 : 0,
          now,
          editingProduct.value.id
        ]
      )
      toast.success('Product updated successfully')
    } else {
      // Create new product
      const id = generateUUID()
      await executeUpdate(
        `INSERT INTO products (
          id, sku, name, generic_name, barcode,
          category_id, manufacturer_id,
          unit_price, wholesale_price, cost_price, pack_size,
          sell_by_loose_unit, drap_registration_number,
          controlled_substance, reorder_level,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          formData.value.sku,
          formData.value.name,
          formData.value.generic_name || null,
          formData.value.barcode || null,
          formData.value.category_id || null,
          formData.value.manufacturer_id || null,
          formData.value.unit_price,
          wholesale,
          formData.value.cost_price,
          formData.value.pack_size,
          formData.value.sell_by_loose_unit ? 1 : 0,
          formData.value.drap_registration_number || null,
          formData.value.controlled_substance ? 1 : 0,
          formData.value.reorder_level,
          formData.value.is_active ? 1 : 0,
          now,
          now
        ]
      )
      toast.success('Product created successfully')
    }
    
    showModal.value = false
    await loadProducts()
  } catch (error: any) {
    console.error('Error saving product:', error)
    toast.error('Failed to save product: ' + error.message)
  } finally {
    loading.value = false
  }
}

async function deleteProduct(product: Product) {
  if (!confirm(pick(`Delete ${product.name} from active products?`, `کیا ${product.name} کو فعال مصنوعات سے حذف کریں؟`))) return
  loading.value = true
  try {
    await executeUpdate(
      'UPDATE products SET deleted_at = ? WHERE id = ?',
      [new Date().toISOString(), product.id]
    )
    toast.success('Product deleted successfully')
    await loadProducts()
  } catch (error) {
    console.error('Error deleting product:', error)
    toast.error('Failed to delete product')
  } finally {
    loading.value = false
  }
}

function getCategoryName(categoryId: string | null) {
  if (!categoryId) return '-'
  const cat = categories.value.find(c => c.id === categoryId)
  return cat ? cat.name : '-'
}

function getManufacturerName(manufacturerId: string | null) {
  if (!manufacturerId) return '-'
  const mfg = manufacturers.value.find(m => m.id === manufacturerId)
  return mfg ? mfg.name : '-'
}

function openBatchManager(product: Product) {
  selectedProduct.value = product
  showBatchManager.value = true
}

function closeBatchManager() {
  showBatchManager.value = false
  selectedProduct.value = null
  // Reload products to update stock levels
  loadProducts()
}

function getStockLevel(productId: string): number {
  return productStocks.value.get(productId) || 0
}

function isLowStock(product: Product): boolean {
  const stock = getStockLevel(product.id)
  return stock <= product.reorder_level
}
</script>

<template>
  <div class="inventory-terminal">
    <Card class="inventory-panel">
      <!-- Header -->
      <div class="inventory-header">
        <div>
          <h1 class="heading-2 mb-1">{{ pick('Products & Inventory', 'مصنوعات اور اسٹاک') }}</h1>
          <p class="body-sm text-text-secondary">{{ pick('Product catalogue · stock & batches', 'مصنوعات کی فہرست · اسٹاک اور بیچ') }}</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="md" @click="router.push('/catalog-import')">
            {{ pick('Import', 'درآمد') }}
          </Button>
          <Button variant="outline" size="md" @click="router.push('/catalog-bulk')">
            {{ pick('Bulk setup', 'اجتماعی ترتیب') }}
          </Button>
          <Button variant="primary" size="md" @click="openAddModal">
            <span class="text-lg leading-none">+</span>
            {{ pick('Add Product', 'مصنوعات شامل کریں') }}
          </Button>
        </div>
      </div>

      <!-- Search -->
      <div class="inventory-search">
        <Input
          id="products-search"
          v-model="searchQuery"
          size="lg"
          :label="pick('Item / barcode', 'آئٹم / بارکوڈ')"
          :title="pick('Products search (F4)', 'مصنوعات کی تلاش (F4)')"
          aria-keyshortcuts="F4"
          type="search"
          :placeholder="pick('Search by name, SKU, or barcode...', 'نام، کوڈ یا بار کوڈ سے تلاش کریں...')"
          prefix-text="🔍"
        />
        <kbd class="text-xs px-2 py-1 rounded border">F4</kbd>
      </div>

      <!-- Table -->
      <div class="inventory-table-scroll">
        <div v-if="loading && products.length === 0" class="text-center py-12 text-muted-foreground" role="status">
          {{ pick('Loading products...', 'مصنوعات لوڈ ہو رہی ہیں...') }}
        </div>

        <div v-else-if="filteredProducts.length === 0" class="text-center py-12 text-muted-foreground" role="status">
          {{ searchQuery ? pick('No products found', 'کوئی مصنوعات نہیں ملیں') : pick('No products yet. Add your first product!', 'ابھی کوئی مصنوعات نہیں۔ پہلی مصنوعات شامل کریں!') }}
        </div>

        <table v-else class="inventory-table">
          <thead>
            <tr class="border-b bg-muted text-muted-foreground">
              <th class="label text-left p-3">SKU</th>
              <th class="label text-left p-3">{{ pick('Name', 'نام') }}</th>
              <th class="label text-left p-3">{{ pick('Category', 'زمرہ') }}</th>
              <th class="label text-left p-3">{{ pick('Manufacturer', 'بنانے والا') }}</th>
              <th class="label text-right p-3">{{ pick('Price', 'قیمت') }}</th>
              <th class="label text-right p-3">{{ pick('Stock', 'اسٹاک') }}</th>
              <th class="label text-center p-3">{{ pick('Status', 'حیثیت') }}</th>
              <th class="label text-center p-3" style="min-width: 240px;">{{ pick('Actions', 'اقدامات') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="product in filteredProducts"
              :key="product.id"
              class="border-b hover:bg-accent/50 transition-colors"
            >
              <td class="p-3 mono body-sm">{{ product.sku }}</td>
              <td class="p-3">
                <div class="body font-medium">{{ product.name }}</div>
                <div v-if="product.generic_name" class="body-sm text-text-secondary">
                  {{ product.generic_name }}
                </div>
              </td>
              <td class="p-3 body-sm">{{ getCategoryName(product.category_id) }}</td>
              <td class="p-3 body-sm">{{ getManufacturerName(product.manufacturer_id) }}</td>
              <td class="p-3 text-right">
                <div class="number-display-sm text-brand-600">{{ formatCurrency(product.unit_price) }}</div>
                <small class="body-xs text-text-secondary block">
                  {{ pick('Wholesale', 'ہول سیل') }}: {{ product.wholesale_price == null ? pick('Retail fallback', 'ریٹیل قیمت') : formatCurrency(product.wholesale_price) }}
                </small>
              </td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <span class="body-sm" :class="{ 'text-danger-600 font-bold': isLowStock(product) }">
                    {{ formatNumber(getStockLevel(product.id)) }}
                  </span>
                  <Badge v-if="isLowStock(product)" variant="danger" size="sm" :dot="true">
                    {{ pick('Low', 'کم') }}
                  </Badge>
                </div>
              </td>
              <td class="p-3 text-center">
                <Badge :variant="product.is_active ? 'success' : 'neutral'" size="sm">
                  {{ product.is_active ? pick('Active', 'فعال') : pick('Inactive', 'غیر فعال') }}
                </Badge>
              </td>
              <td class="p-3 text-center whitespace-nowrap">
                <div class="inline-flex gap-1">
                  <Button variant="outline" size="sm" @click="openBatchManager(product)">
                    {{ pick('Batches', 'بیچ') }}
                  </Button>
                  <Button variant="outline" size="sm" @click="openEditModal(product)">
                    {{ pick('Edit', 'تدوین') }}
                  </Button>
                  <Button variant="ghost" size="sm" @click="openLabel(product)">
                    {{ pick('Label', 'لیبل') }}
                  </Button>
                  <Button variant="danger" size="sm" @click="deleteProduct(product)">
                    {{ pick('Delete', 'حذف') }}
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="inventory-summary">
        <div>
          <small class="body-xs text-text-secondary">{{ pick('Products shown', 'دکھائی گئی مصنوعات') }}</small>
          <strong class="number-display-sm text-brand-600">{{ formatNumber(filteredProducts.length) }} / {{ formatNumber(products.length) }}</strong>
        </div>
        <div>
          <small class="body-xs text-text-secondary">{{ pick('Low stock', 'کم اسٹاک') }}</small>
          <strong class="number-display-sm text-danger-600">{{ formatNumber(products.filter(isLowStock).length) }}</strong>
        </div>
        <div>
          <small class="body-xs text-text-secondary">{{ pick('Active products', 'فعال مصنوعات') }}</small>
          <strong class="number-display-sm text-brand-600">{{ formatNumber(products.filter(product => product.is_active).length) }}</strong>
        </div>
      </footer>
    </Card>

    <!-- Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="showModal = false"
    >
      <Card class="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div class="p-6 border-b">
          <h2 class="text-xl font-bold">
            {{ editingProduct ? pick('Edit Product', 'مصنوعات میں ترمیم کریں') : pick('Add New Product', 'نئی مصنوعات شامل کریں') }}
          </h2>
        </div>

        <div class="p-6 space-y-4">
          <!-- Row 1 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">SKU *</label>
              <Input v-model="formData.sku" placeholder="e.g. PARA500" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">{{ pick('Barcode', 'بار کوڈ') }}</label>
              <Input v-model="formData.barcode" :placeholder="pick('Scan or enter barcode', 'بار کوڈ اسکین یا درج کریں')" />
            </div>
          </div>

          <!-- Row 2 -->
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Product Name', 'مصنوعات کا نام') }} *</label>
            <Input v-model="formData.name" placeholder="e.g. Panadol 500mg" />
          </div>

          <!-- Row 3 -->
          <div>
            <label class="block text-sm font-medium mb-2">{{ pick('Generic Name', 'عام نام') }}</label>
            <Input v-model="formData.generic_name" placeholder="e.g. Paracetamol" />
          </div>

          <!-- Row 4 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{ pick('Category', 'زمرہ') }}</label>
              <select v-model="formData.category_id" class="w-full border rounded-md bg-background p-2">
                <option value="">{{ pick('Select category', 'زمرہ منتخب کریں') }}</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">{{ pick('Manufacturer', 'بنانے والا') }}</label>
              <select v-model="formData.manufacturer_id" class="w-full border rounded-md bg-background p-2">
                <option value="">{{ pick('Select manufacturer', 'بنانے والا منتخب کریں') }}</option>
                <option v-for="mfg in manufacturers" :key="mfg.id" :value="mfg.id">
                  {{ mfg.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Row 5 -->
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">{{pick('Retail unit price (Rs) *','ریٹیل اکائی قیمت (روپے) *')}}</label>
              <Input v-model.number="formData.unit_price" type="number" step="0.01" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Cost Price (Rs) *</label>
              <Input v-model.number="formData.cost_price" type="number" step="0.01" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Pack Size *</label>
              <Input v-model.number="formData.pack_size" type="number" />
            </div>
          </div>

          <label class="block text-sm font-medium">{{pick('Wholesale unit price (Rs)','ہول سیل اکائی قیمت (روپے)')}}<Input v-model="formData.wholesale_price" type="number" min="0" step="0.01" :placeholder="pick('Blank = retail price','خالی = ریٹیل قیمت')"/><small>{{pick('Applied to wholesale customers; charged prices remain saved on invoice lines.','ہول سیل گاہکوں پر لاگو؛ وصول کردہ قیمت انوائس میں محفوظ رہتی ہے۔')}}</small></label>
          <!-- Row 6 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">DRAP Registration</label>
              <Input v-model="formData.drap_registration_number" placeholder="DRAP-123456" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Reorder Level</label>
              <Input v-model.number="formData.reorder_level" type="number" />
            </div>
          </div>

          <!-- Checkboxes -->
          <div class="flex gap-6">
            <label class="flex items-center gap-2">
              <input v-model="formData.sell_by_loose_unit" type="checkbox" />
              <span class="text-sm">Sell by loose unit</span>
            </label>
            <label class="flex items-center gap-2">
              <input v-model="formData.controlled_substance" type="checkbox" />
              <span class="text-sm">Controlled substance</span>
            </label>
            <label class="flex items-center gap-2">
              <input v-model="formData.is_active" type="checkbox" />
              <span class="text-sm">Active</span>
            </label>
          </div>
        </div>

        <div class="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" @click="showModal = false" :disabled="loading">
            Cancel
          </Button>
          <Button @click="saveProduct" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Product' }}
          </Button>
        </div>
      </Card>
    </div>

    <!-- Batch Manager Modal -->
    <BatchManager
      v-if="selectedProduct"
      :product="selectedProduct"
      :is-open="showBatchManager"
      @close="closeBatchManager"
    />
    <div v-if="labelProduct" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="labelProduct = null">
      <section role="dialog" aria-modal="true" aria-label="Print barcode labels" class="w-[30rem] rounded-lg border bg-background p-6 shadow-xl">
        <h2 class="text-xl font-semibold">Print barcode labels</h2>
        <p class="mt-2 text-sm">{{ labelProduct.name }} · {{ labelProduct.barcode }}</p>
        <p class="mt-1 text-xs text-muted-foreground">75 × 35 mm Code 39 labels. Select a desktop label printer and matching paper in the print dialog.</p>
        <label class="mt-4 block text-sm">Number of labels
          <input v-model.number="labelCount" type="number" min="1" max="100" step="1" class="mt-1 block w-28 rounded border bg-background p-2" />
        </label>
        <div v-if="labelBarcode" class="mt-4 rounded border bg-white p-3 text-center text-black">
          <div class="truncate text-xs">{{ labelProduct.name }}</div>
          <svg class="mx-auto h-12 w-full" :viewBox="`0 0 ${labelBarcode.width} 30`" preserveAspectRatio="none" role="img" :aria-label="`Barcode ${labelProduct.barcode}`">
            <rect v-for="(bar, index) in labelBarcode.bars" :key="index" :x="bar.x" y="0" :width="bar.width" height="30" fill="black" />
          </svg>
          <div class="font-mono text-xs">{{ labelProduct.barcode }}</div>
        </div>
        <div class="mt-5 flex justify-end gap-2"><Button variant="outline" @click="labelProduct = null">Cancel</Button><Button @click="printLabels">Print labels</Button></div>
      </section>
    </div>
  </div>
  <Teleport to="body">
    <div v-if="printingLabels && labelProduct && labelBarcode" class="barcode-print-root">
      <section v-for="copy in labelCopies" :key="copy" class="barcode-print-label">
        <div class="barcode-print-name">{{ labelProduct.name }}</div>
        <svg :viewBox="`0 0 ${labelBarcode.width} 30`" preserveAspectRatio="none" role="img" :aria-label="`Barcode ${labelProduct.barcode}`">
          <rect v-for="(bar, index) in labelBarcode.bars" :key="index" :x="bar.x" y="0" :width="bar.width" height="30" fill="black" />
        </svg>
        <div class="barcode-print-code">{{ labelProduct.barcode }}</div>
        <div class="barcode-print-price">{{ formatCurrency(labelProduct.unit_price) }}</div>
      </section>
    </div>
  </Teleport>
</template>

<style>
.barcode-print-root { display: none; }
@media print {
  body.printing-labels > *:not(.barcode-print-root) { display: none !important; }
  body > .barcode-print-root { display: block !important; color: #000; background: #fff; }
  .barcode-print-label { width: 75mm; height: 35mm; box-sizing: border-box; padding: 2mm; text-align: center; font: 8pt Arial, sans-serif; overflow: hidden; break-after: page; page-break-after: always; }
  .barcode-print-label:last-child { break-after: auto; page-break-after: auto; }
  .barcode-print-name { height: 5mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .barcode-print-label svg { display: block; width: 71mm; height: 16mm; shape-rendering: crispEdges; }
  .barcode-print-code { direction: ltr; font: 7pt monospace; margin-top: 1mm; }
  .barcode-print-price { margin-top: 1mm; font-weight: bold; }
}
</style>
