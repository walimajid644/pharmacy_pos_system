<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/lib/i18n'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { formatCurrency, formatDate, isNearExpiry, isExpired } from '@/lib/utils'
import type { CashierShift, Product, ProductBatch } from '@/lib/types'
import SavedSaleActions from '@/components/SavedSaleActions.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Card from '@/components/ui/Card.vue'
import Badge from '@/components/ui/Badge.vue'

const toast = useToast()
const { t, pick, formatNumber } = useI18n()
const cartStore = useCartStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const sourceDocumentId = ref<string | null>(null)
const sourceDocumentNumber = ref('')
const sourceDocumentKind = ref('')
const sourceDocumentLoading = ref(false)
const sourceDocumentError = ref('')
const sourcePriceChanges = ref(0)
const shift = ref<CashierShift | null>(null)
const patientName = ref('')
const doctorName = ref('')
const prescriptionNote = ref('')
const hasControlled = computed(()=>cartStore.items.some(i=>i.product.controlled_substance))
const prescriptionMissing = computed(()=>hasControlled.value&&!(patientName.value.trim()&&doctorName.value.trim())&&!prescriptionNote.value.trim())
const saleRemarks = ref('')
const cashReceived = ref<number | string>('')
const showCost = ref(true)
const selectedCustomer = ref<CustomerOption | null>(null)

const searchQuery = ref('')
const searchResults = ref<Array<Product & { batches: ProductBatch[] }>>([])
const searchLoading = ref(false)
const searchError = ref(false)
const highlightedProductIndex = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
let productSearchTimer: ReturnType<typeof setTimeout> | null = null
let productQueryId = 0
let productLookup: { term: string; promise: Promise<Array<Product & { batches: ProductBatch[] }>> } | null = null
const checkoutLoading = ref(false)
type SaleReceipt = { invoiceId: string; invoiceNumber: string; subtotal: number; taxAmount: number; discountAmount: number; netAmount: number; receivedAmount: number; changeAmount: number }
const lastReceipt = ref<SaleReceipt | null>(null)
const lastInvoiceId=ref<string|null>(null)
const savedActions=ref<InstanceType<typeof SavedSaleActions>|null>(null)
const selectedCustomerId = ref<string | null>(null)
type CustomerOption = { id: string; customer_code: string; first_name: string; last_name: string; phone_number: string | null; current_balance: number; credit_limit:number; customer_type:'retail'|'wholesale' }
const customerSearch = ref('')
const customerOptions = ref<CustomerOption[]>([])
const customerOpen = ref(false)
const customerLoading = ref(false)
const highlightedCustomerIndex = ref(0)
let customerSearchTimer: ReturnType<typeof setTimeout> | null = null
let customerQueryId = 0
const paymentMethod = ref('cash')
const creditAllowed=computed(()=>!!selectedCustomer.value && money(Number(selectedCustomer.value.current_balance)+total.value)<=Number(selectedCustomer.value.credit_limit))
watch(selectedCustomer,customer=>{cartStore.setCustomerType(customer?.customer_type||'retail');if(!customer&&paymentMethod.value==='credit')paymentMethod.value='cash'},{flush:'sync'})

const subtotal = computed(() => cartStore.subtotal)
const taxAmount = computed(() => cartStore.taxAmount)
const total = computed(() => cartStore.total)
const money = (amount: number) => Math.round(amount * 100) / 100
const tendered = computed(() => paymentMethod.value === 'cash' && cashReceived.value !== '' ? money(Number(cashReceived.value)) : total.value)
const validTender = computed(() => Number.isFinite(tendered.value) && tendered.value >= total.value && tendered.value >= 0)
const changeDue = computed(() => validTender.value ? money(tendered.value - total.value) : 0)
const lineGross = (item: typeof cartStore.items[number]) => money(cartStore.unitPrice(item.product) * item.quantity * (item.isLooseSale ? 1 : item.product.pack_size))
const lineDiscount = (item: typeof cartStore.items[number]) => money(lineGross(item) - cartStore.lineTotal(item))
const lineCost = (item: typeof cartStore.items[number]) => item.batch.cost_price_at_batch * (item.quantity + item.bonusQuantity) * (item.isLooseSale ? 1 : item.product.pack_size)
const lineMargin = (item: typeof cartStore.items[number]) => cartStore.lineTotal(item) > 0 ? (cartStore.lineTotal(item) - lineCost(item)) / cartStore.lineTotal(item) * 100 : null
const maxInvoiceDiscount = computed(() => Math.round((subtotal.value + taxAmount.value) * 100) / 100)

watch(() => settingsStore.settings?.tax_rate, rate => cartStore.setTaxRate(Number(rate ?? 0)), { immediate: true })
watch(maxInvoiceDiscount, maximum => {
  if (cartStore.discountAmount > maximum) cartStore.setDiscountAmount(maximum)
})

onUnmounted(() => {
  if (productSearchTimer) clearTimeout(productSearchTimer)
  productQueryId++
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerQueryId++
})
onMounted(() => {
  void nextTick(() => searchInput.value?.focus())
  void loadShift()
  if (typeof route.query.document === 'string') void loadSourceDocument(route.query.document)
  window.addEventListener('keydown', onPaymentShortcut)
})
onUnmounted(() => window.removeEventListener('keydown', onPaymentShortcut))

async function loadSourceDocument(id: string) {
  sourceDocumentLoading.value=true; sourceDocumentError.value=''
  try {
    if (cartStore.items.length && !confirm('Replace the current cart with this document?')) return
    const [doc] = await executeQuery<{id:string;number:string;customer_id:string|null;customer_name:string;notes:string;kind:string;due_date:string|null}>("SELECT * FROM commercial_documents WHERE id=? AND status='open'",[id])
    if (!doc) throw new Error(pick('This estimate or pre-order was cancelled, converted, or is no longer available. Open its register to review it.', 'یہ تخمینہ یا آرڈر منسوخ، فروخت میں تبدیل یا دستیاب نہیں۔ متعلقہ رجسٹر کھولیں۔'))
    sourceDocumentKind.value=doc.kind
    const localDate=new Date(); const localToday=`${localDate.getFullYear()}-${String(localDate.getMonth()+1).padStart(2,'0')}-${String(localDate.getDate()).padStart(2,'0')}`
    if (doc.kind==='estimate'&&doc.due_date&&doc.due_date<localToday) throw new Error(pick('This estimate has expired. Open Estimates, edit its validity date and save before loading it again.', 'تخمینہ ختم ہو چکا ہے۔ تخمینے میں تاریخ درست کر کے محفوظ کریں اور دوبارہ لوڈ کریں۔'))
    const sourceLines=await executeQuery<{product_id:string;quantity:number}>('SELECT product_id,quantity FROM commercial_document_items WHERE document_id=?',[id])
    if (!sourceLines.length) throw new Error('Document has no items')
    const availability=await executeQuery<{name:string;quantity:number;available:number;active:number;quoted:number;current:number}>("SELECT p.name,l.quantity,p.is_active AS active,l.unit_price_cents AS quoted,CAST(ROUND((CASE WHEN (SELECT customer_type FROM customers WHERE id=(SELECT customer_id FROM commercial_documents WHERE id=l.document_id))='wholesale' THEN COALESCE(p.wholesale_price,p.unit_price) ELSE p.unit_price END)*100) AS INTEGER) AS current,CASE WHEN p.deleted_at IS NULL THEN COALESCE(SUM(CASE WHEN b.expiry_date>=date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) ELSE 0 END AS available FROM commercial_document_items l JOIN products p ON p.id=l.product_id LEFT JOIN product_batches b ON b.product_id=p.id WHERE l.document_id=? GROUP BY l.id",[id])
    const shortages=availability.filter(l=>!l.active||l.available<l.quantity)
    if (shortages.length) throw new Error(pick('Cannot fulfil this document. Missing stock: ', 'آرڈر مکمل نہیں ہو سکتا۔ کم اسٹاک: ')+shortages.map(l=>`${l.name}: ${l.available}/${l.quantity}`).join('; ')+pick('. Receive stock or edit the document, then try again.', '۔ اسٹاک وصول کریں یا آرڈر درست کر کے دوبارہ کوشش کریں۔'))
    sourcePriceChanges.value=availability.filter(l=>l.quoted!==l.current).length

    const prepared:Array<{product:Product;batch:ProductBatch;quantity:number;loose:boolean;breakStrip:boolean}>=[]
    let customer:CustomerOption|null=null
    if (doc.customer_id) {
      const rows=await executeQuery<CustomerOption>('SELECT id,customer_code,first_name,last_name,phone_number,current_balance,credit_limit,customer_type FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1',[doc.customer_id])
      customer=rows[0]||null
      if (!customer) throw new Error('This customer is unavailable')
    }
    for (const line of sourceLines) {
      const [product]=await executeQuery<Product>('SELECT * FROM products WHERE id=? AND deleted_at IS NULL AND is_active=1',[line.product_id])
      if (!product) throw new Error('A product on this document is unavailable')
      const batches=await executeQuery<ProductBatch>("SELECT * FROM product_batches WHERE product_id=? AND expiry_date>=date('now','localtime') AND quantity_in_stock>0 ORDER BY expiry_date,id",[product.id])
      let remaining=line.quantity
      for (const batch of batches) {
        if (!remaining) break
        const loose=!!product.sell_by_loose_unit
        const units=loose?Math.min(remaining,batch.quantity_in_stock):Math.min(remaining,Math.floor((batch.quantity_in_stock-batch.loose_open_remaining)/product.pack_size)*product.pack_size)
        if (!units || (!loose && units%product.pack_size!==0)) throw new Error(`${product.name}: the earliest batch cannot supply whole packs. Review stock or update the document quantity.`)
        const breakStrip=loose&&units>batch.loose_open_remaining&&product.pack_size>1
        if (breakStrip&&!confirm(`${product.name}: fulfil ${units} loose units from batch ${batch.batch_number}? This may open a strip at checkout.`)) return
        prepared.push({product,batch,quantity:loose?units:units/product.pack_size,loose,breakStrip})
        remaining-=units
      }
      if (remaining) throw new Error(`${product.name}: insufficient unexpired stock to fulfil this document`)
    }
    cartStore.clearCart()
    for (const item of prepared) cartStore.addItem(item.product,item.batch,item.quantity,item.loose,item.breakStrip)
    chooseCustomer(customer)
    saleRemarks.value=`${doc.number} · ${doc.customer_name} · ${doc.notes}`.slice(0,500)
    sourceDocumentId.value=id; sourceDocumentNumber.value=doc.number
    toast.success(pick('Document loaded. Review current prices, tax and payment before checkout.', 'دستاویز لوڈ ہو گئی۔ موجودہ قیمت، ٹیکس اور ادائیگی دیکھ کر فروخت مکمل کریں۔'))
  } catch(error) { sourceDocumentError.value=String(error).replace(/^Error: /,''); toast.error(sourceDocumentError.value) }
  finally { sourceDocumentLoading.value=false }
}

async function loadShift() {
  try { shift.value = await invoke<CashierShift | null>('current_shift') }
  catch (error) { console.error('Could not load shift', error); shift.value = null }
}

function onPaymentShortcut(event: KeyboardEvent) {
  if (event.repeat || event.isComposing) return
  const method = ({ F8: 'cash', F9: 'card', F10: 'mobile' } as Record<string, string>)[event.key]
  if (method) { event.preventDefault(); paymentMethod.value = method }
  if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); void checkout() }
}

function customerLabel(customer: CustomerOption) {
  return `${customer.first_name} ${customer.last_name} · ${customer.customer_code}`
}

async function loadCustomerOptions(term: string) {
  const queryId = ++customerQueryId
  customerLoading.value = true
  try {
    const pattern = `%${term.trim()}%`
    const rows = await executeQuery<CustomerOption>(
      `SELECT id, customer_code, first_name, last_name, phone_number, current_balance, credit_limit, customer_type FROM customers
       WHERE is_active = 1 AND deleted_at IS NULL
         AND (first_name LIKE ? OR last_name LIKE ? OR customer_code LIKE ?
              OR COALESCE(phone_number, '') LIKE ?)
       ORDER BY last_name, first_name LIMIT 20`,
      [pattern, pattern, pattern, pattern]
    )
    if (queryId === customerQueryId) {
      customerOptions.value = rows
      highlightedCustomerIndex.value = selectedCustomerId.value ? -1 : term.trim() ? (rows.length ? 1 : -1) : 0
    }
  } catch (error) {
    if (queryId === customerQueryId) {
      console.error('Customer lookup failed:', error)
      toast.error('Could not search customers')
    }
  } finally {
    if (queryId === customerQueryId) customerLoading.value = false
  }
}

function openCustomerPicker() {
  customerOpen.value = true
  highlightedCustomerIndex.value = selectedCustomerId.value ? -1 : 0
  customerOptions.value = []
  void loadCustomerOptions(selectedCustomerId.value ? '' : customerSearch.value)
}

function onCustomerInput() {
  customerQueryId++
  selectedCustomerId.value = null
  selectedCustomer.value = null
  customerOpen.value = true
  customerOptions.value = []
  customerLoading.value = true
  highlightedCustomerIndex.value = -1
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerSearchTimer = setTimeout(() => void loadCustomerOptions(customerSearch.value), 150)
}

function chooseCustomer(customer: CustomerOption | null) {
  if (customerSearchTimer) clearTimeout(customerSearchTimer)
  customerQueryId++
  selectedCustomerId.value = customer?.id ?? null
  selectedCustomer.value = customer
  customerSearch.value = customer ? customerLabel(customer) : ''
  customerOptions.value = []
  customerLoading.value = false
  customerOpen.value = false
}

function onCustomerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    customerOpen.value = false
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    customerOpen.value = true
    const direction = event.key === 'ArrowDown' ? 1 : -1
    highlightedCustomerIndex.value = Math.max(0, Math.min(customerOptions.value.length,
      highlightedCustomerIndex.value + direction))
  } else if (event.key === 'Enter' && customerOpen.value && highlightedCustomerIndex.value >= 0) {
    event.preventDefault()
    chooseCustomer(highlightedCustomerIndex.value === 0
      ? null : customerOptions.value[highlightedCustomerIndex.value - 1] ?? null)
  }
}

// Optimized search input handler:
// - Barcode patterns (alphanumeric 6+ chars) search immediately for fast scanning
// - Partial text searches debounce by 150ms to avoid query spam while typing
// - Exact barcode matches get auto-highlighted in results
function onProductSearchInput() {
  productQueryId++
  if (productSearchTimer) clearTimeout(productSearchTimer)
  searchResults.value = []
  searchLoading.value = false
  searchError.value = false
  highlightedProductIndex.value = 0
  const term = searchQuery.value.trim()
  if (term.length >= 2) {
    searchLoading.value = true
    // Check if this looks like an exact barcode (no wildcards needed)
    // For exact matches, search immediately without debounce
    const isLikelyBarcode = /^[A-Z0-9\-_]+$/i.test(term) && term.length >= 6
    if (isLikelyBarcode) {
      void searchProducts()
    } else {
      productSearchTimer = setTimeout(() => void searchProducts(), 150)
    }
  }
}

async function searchProducts(addFromSearch = false, loose = false) {
  const term = searchQuery.value.trim()
  const queryId = ++productQueryId
  if (term.length < (addFromSearch ? 1 : 2)) {
    searchResults.value = []
    return
  }

  searchLoading.value = true
  searchError.value = false
  // Barcode input and its following Enter share one bounded IPC lookup.
  const lookup = productLookup?.term === term ? productLookup : {term, promise: queryProducts(term)}
  productLookup = lookup
  try {
    const productsWithBatches = await lookup.promise
    if (queryId !== productQueryId) return
    
    // Check for exact barcode match
    const exactMatch = productsWithBatches.find(p => p.barcode === term)
    
    searchResults.value = productsWithBatches
    // If exact barcode match exists, highlight it immediately
    highlightedProductIndex.value = exactMatch ? productsWithBatches.indexOf(exactMatch) : 0
    
    if (addFromSearch) {
      // Prioritize exact barcode match, then first result
      const product = exactMatch || productsWithBatches[0]
      if (product) addToCart(product, loose)
    }
  } catch (error) {
    if (queryId === productQueryId) {
      searchError.value = true
      searchResults.value = []
      console.error('Search error:', error)
      toast.error('Could not search products')
    }
  } finally {
    if (productLookup === lookup) productLookup = null
    if (queryId === productQueryId) searchLoading.value = false
  }
}

async function queryProducts(term: string) {
    const query = `%${term}%`
    const products = await executeQuery<Product>(
      `SELECT * FROM products
       WHERE (name LIKE ? OR generic_name LIKE ? OR sku LIKE ? OR barcode = ?)
       AND is_active = 1 AND deleted_at IS NULL
       ORDER BY CASE WHEN barcode = ? THEN 0 ELSE 1 END, name LIMIT 20`,
      [query, query, query, term, term]
    )
    // One batch query for the bounded result set, rather than one IPC call per product.
    const batches=products.length?await executeQuery<ProductBatch>(`SELECT * FROM product_batches WHERE product_id IN (${products.map(()=>'?').join(',')}) AND quantity_in_stock>0 AND expiry_date>=date('now','localtime') ORDER BY expiry_date,id`,products.map(p=>p.id)):[]
    return products.map(product=>({...product,batches:batches.filter(b=>b.product_id===product.id)}))
}

function reservedInBatch(batchId: string, excludeIndex = -1) {
  return cartStore.items.reduce((sum, item, index) =>
    sum + (index !== excludeIndex && item.batch.id === batchId
      ? (item.quantity + item.bonusQuantity) * (item.isLooseSale ? 1 : item.product.pack_size) : 0), 0)
}

function stripsNeeded(units: number, openUnits: number, packSize: number) {
  return packSize > 1 ? Math.max(0, Math.ceil((units - openUnits) / packSize)) : 0
}

function addToCart(product: Product & { batches: ProductBatch[] }, isLooseSale = false) {
  if (isLooseSale && !product.sell_by_loose_unit) {
    toast.warning('This product cannot be sold as a loose unit')
    return
  }
  if (!product.batches || product.batches.length === 0) {
    toast.warning('No stock available for this product')
    return
  }

  const unitsNeeded = isLooseSale ? 1 : product.pack_size
  // Keep FEFO: an earlier batch must be exhausted before the next one is used.
  const batch = product.batches.find(candidate => candidate.quantity_in_stock - reservedInBatch(candidate.id) > 0 && !isExpired(candidate.expiry_date))
  if (!batch) {
    toast.warning(`No unexpired batch has enough stock for another ${isLooseSale ? 'loose unit' : 'pack'}`)
    return
  }
  if (batch.quantity_in_stock - reservedInBatch(batch.id) < unitsNeeded) {
    toast.warning(pick('Sell the remaining units from the earliest batch first.', 'پہلے جلد میعاد ختم ہونے والے بیچ کی باقی اکائیاں فروخت کریں۔'))
    return
  }
  if (!isLooseSale && batch.quantity_in_stock - reservedInBatch(batch.id) - batch.loose_open_remaining < unitsNeeded) {
    toast.warning(pick('Only opened loose units remain in this batch.', 'اس بیچ میں صرف کھلی اکائیاں باقی ہیں۔'))
    return
  }
  
  // Check if expired
  if (isExpired(batch.expiry_date)) {
    toast.error('Cannot sell expired product')
    return
  }
  
  const existingLoose = cartStore.items.find(item => item.batch.id === batch.id && item.isLooseSale)
  const loosePlanned = existingLoose ? existingLoose.quantity + existingLoose.bonusQuantity : 0
  const needsBreak = isLooseSale && stripsNeeded(loosePlanned + 1, batch.loose_open_remaining, product.pack_size)
    > stripsNeeded(loosePlanned, batch.loose_open_remaining, product.pack_size)
  if (needsBreak && !confirm(pick(
    `Open a strip from batch ${batch.batch_number} (expires ${formatDate(batch.expiry_date)})? This will be logged on the invoice.`,
    `بیچ ${batch.batch_number} کی پٹی کھولیں؟ یہ فیصلہ انوائس میں درج ہوگا۔`
  ))) return
  cartStore.addItem(product, batch, 1, isLooseSale, needsBreak)
  toast.success(`Added ${isLooseSale ? 'loose unit' : 'pack'} of ${product.name}`)
  searchQuery.value = ''
  searchResults.value = []
  searchLoading.value = false
  searchError.value = false
  productQueryId++
  searchInput.value?.focus()
}

function removeFromCart(index: number) {
  cartStore.removeItem(index)
}

function updateQuantities(index: number, event: Event, bonus = false) {
  const input = event.target as HTMLInputElement
  const item = cartStore.items[index]
  if (!item) return
  const previous = bonus ? item.bonusQuantity : item.quantity
  const quantity = Number(input.value)
  const restore = () => { input.value = String(previous) }
  if (input.value === '' || !Number.isSafeInteger(quantity) || quantity < (bonus ? 0 : 1)) { restore(); return }
  const allQuantity = bonus ? item.quantity + quantity : quantity + item.bonusQuantity
  const units = allQuantity * (item.isLooseSale ? 1 : item.product.pack_size)
  if (units + reservedInBatch(item.batch.id, index) > item.batch.quantity_in_stock) {
    toast.warning('Quantity exceeds batch stock')
    restore(); return
  }
  if (!item.isLooseSale && units + reservedInBatch(item.batch.id, index) > item.batch.quantity_in_stock - item.batch.loose_open_remaining) {
    toast.warning('Only opened loose units remain; reduce packs or sell loose units')
    restore(); return
  }
  if (item.isLooseSale && stripsNeeded(allQuantity, item.batch.loose_open_remaining, item.product.pack_size)
    > stripsNeeded(item.quantity + item.bonusQuantity, item.batch.loose_open_remaining, item.product.pack_size)) {
    if (!confirm(pick(`Open a strip from batch ${item.batch.batch_number}?`, `بیچ ${item.batch.batch_number} کی پٹی کھولیں؟`))) { restore(); return }
    item.confirmBreak = true
  }
  if (bonus) item.bonusQuantity = quantity
  else cartStore.updateItemQuantity(index, quantity)
}

function onLineDiscountAmountChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const item = cartStore.items[index]
  const amount = Number(input.value)
  const gross = lineGross(item)
  if (!Number.isFinite(amount) || amount < 0 || amount > gross) {
    toast.warning('Discount amount must be between zero and the line price')
  } else cartStore.updateItemDiscount(index, gross ? money(amount) / gross * 100 : 0)
  input.value = lineDiscount(item).toFixed(2)
}

function onLineDiscountChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const discount = Number(input.value)
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    toast.warning('Line discount must be between 0% and 100%')
    input.value = String(cartStore.items[index]?.discount ?? 0)
    return
  }
  cartStore.updateItemDiscount(index, discount)
  input.value = String(cartStore.items[index].discount)
}

function onInvoiceDiscountChange(event: Event) {
  const input = event.target as HTMLInputElement
  const discount = Number(input.value)
  if (!Number.isFinite(discount) || discount < 0 || discount > maxInvoiceDiscount.value) {
    toast.warning(`Invoice discount must be between 0 and ${formatCurrency(maxInvoiceDiscount.value)}`)
    input.value = cartStore.discountAmount.toFixed(2)
    return
  }
  cartStore.setDiscountAmount(Math.round(discount * 100) / 100)
  input.value = cartStore.discountAmount.toFixed(2)
}

function getBatchWarning(expiryDate: string): string | null {
  if (isExpired(expiryDate)) return pick('EXPIRED', 'میعاد ختم')
  if (isNearExpiry(expiryDate, Number(settingsStore.settings?.near_expiry_days ?? 60))) return pick('Near Expiry', 'جلد میعاد ختم')
  return null
}

async function checkout() {
  if (checkoutLoading.value || sourceDocumentLoading.value) return
  if(paymentMethod.value==='credit'&&!creditAllowed.value){toast.warning(pick('Select a registered customer with sufficient credit limit. Collect a payment or ask a manager to review the limit.','مناسب کریڈٹ حد والا رجسٹرڈ گاہک منتخب کریں۔ وصولی کریں یا منیجر سے حد درست کروائیں۔'));return}
  if(prescriptionMissing.value){toast.warning(pick('Add both patient and doctor, or a prescription note/reference for controlled products.','کنٹرول شدہ دوا کے لیے مریض اور ڈاکٹر دونوں، یا نسخے کا نوٹ / حوالہ درج کریں۔'));return}
  if (!validTender.value) { toast.warning('Cash received must cover the sale total'); return }
  await loadShift()
  if (checkoutLoading.value) return
  if (!shift.value || shift.value.cashierId !== authStore.currentUser?.id) {
    toast.warning(pick('Open your cash drawer shift before selling.', 'فروخت سے پہلے اپنی کیش شفٹ کھولیں۔'))
    return
  }
  if (cartStore.items.length === 0) {
    toast.warning('Cart is empty')
    return
  }

  if (cartStore.items.some(item => reservedInBatch(item.batch.id) > item.batch.quantity_in_stock)) {
    toast.warning('A cart quantity exceeds available batch stock')
    return
  }
  if (!authStore.currentUser) {
    toast.error('Please sign in before completing a sale')
    return
  }
  if (customerSearch.value.trim() && !selectedCustomerId.value) {
    toast.warning('Select a customer from the list or clear the search for a walk-in sale')
    return
  }
  if (cartStore.discountAmount > maxInvoiceDiscount.value) {
    toast.warning('Invoice discount exceeds the amount due')
    return
  }

  checkoutLoading.value = true
  try {
    const receipt = await invoke<SaleReceipt>('checkout_sale', {
      request: {
        cashierId: authStore.currentUser.id,
        sourceDocumentId: sourceDocumentId.value,
        customerId: selectedCustomerId.value,
        patientName: patientName.value.trim() || null,
        doctorName: doctorName.value.trim() || null,
        prescriptionNote: prescriptionNote.value.trim() || null,
        notes: saleRemarks.value.trim() || null,
        receivedAmount: paymentMethod.value==='credit'?0:tendered.value,
        paymentMethod: paymentMethod.value,
        orderDiscount: cartStore.discountAmount,
        expectedSubtotal: subtotal.value,
        expectedTaxAmount: taxAmount.value,
        expectedNetAmount: total.value,
        timestamp: new Date().toISOString(),
        items: cartStore.items.map(item => ({
          productId: item.product.id,
          batchId: item.batch.id,
          quantity: item.quantity,
          bonusQuantity: item.bonusQuantity,
          isLooseSale: item.isLooseSale,
          discountPercent: item.discount,
          confirmBreak: item.confirmBreak,
        })),
      },
    })
    lastReceipt.value = receipt
    lastInvoiceId.value=receipt.invoiceId
    sourceDocumentId.value = null
    sourceDocumentNumber.value = ''
    toast.success(`Sale completed! ${receipt.invoiceNumber} · ${formatCurrency(receipt.netAmount)}`)
    cartStore.clearCart()
    selectedCustomerId.value = null
    selectedCustomer.value = null
    customerSearch.value = ''
    customerQueryId++
    customerOptions.value = []
    paymentMethod.value = 'cash'
    patientName.value = ''
    doctorName.value = ''
    prescriptionNote.value = ''
    saleRemarks.value = ''
    cashReceived.value = ''
    searchInput.value?.focus()
  } catch (error) {
    console.error('Checkout error:', error)
    toast.error(String(error).includes('Selected customer is unavailable')
      ? 'This customer is no longer active. Choose another customer or a walk-in sale.'
      : String(error).includes('Sale total changed')
        ? 'Price or tax changed. Refresh POS and rebuild the cart before checkout.'
        : String(error))
  } finally {
    checkoutLoading.value = false
  }
}

// Product search keyboard handler - optimized for speed:
// Enter key: Fast-path adds highlighted item immediately without additional search
// Shift+Enter: Same but for loose units
// Arrow keys: Navigate results with smooth scrolling
function handleBarcodeInput(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && searchResults.value.length) {
    event.preventDefault()
    highlightedProductIndex.value = (highlightedProductIndex.value + 1) % searchResults.value.length
    void nextTick(()=>document.querySelector('.pos-product-row.highlighted')?.scrollIntoView({block:'nearest'}))
  } else if (event.key === 'ArrowUp' && searchResults.value.length) {
    event.preventDefault()
    highlightedProductIndex.value = (highlightedProductIndex.value - 1 + searchResults.value.length) % searchResults.value.length
    void nextTick(()=>document.querySelector('.pos-product-row.highlighted')?.scrollIntoView({block:'nearest'}))
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (productSearchTimer) clearTimeout(productSearchTimer)
    const highlighted = searchResults.value[highlightedProductIndex.value]
    
    // Fast path: if we have a highlighted result, add it immediately
    if (highlighted) {
      addToCart(highlighted, event.shiftKey)
    } else {
      // No results yet - trigger immediate search and add
      const term = searchQuery.value.trim()
      // For likely barcodes, do a quick exact-match check
      if (term.length >= 2) {
        void searchProducts(true, event.shiftKey)
      }
    }
  } else if (event.key === 'Escape') {
    if (productSearchTimer) clearTimeout(productSearchTimer)
    searchQuery.value = ''
    searchResults.value = []
    searchLoading.value = false
    searchError.value = false
    productQueryId++
  }
}
</script>

<template>
  <main class="pos-terminal" :aria-label="pick('Sales terminal', 'فروخت کا ٹرمینل')">
    <header class="pos-header">
      <div class="pos-brand">
        <span class="pos-rx" aria-hidden="true">℞</span>
        <div><strong>{{ settingsStore.settings?.company_name || 'Pharmacy POS' }}</strong><small>{{ pick('Sales terminal', 'فروخت کا ٹرمینل') }}</small></div>
      </div>
      <div class="pos-header-meta">
        <div class="pos-header-fact"><span>{{ pick('Last invoice', 'آخری انوائس') }}</span><bdi>{{ lastReceipt?.invoiceNumber || '—' }}</bdi><button type="button" class="pos-last-reprint" :disabled="!lastReceipt" @click="savedActions?.print()">{{pick('Reprint last','آخری رسید پرنٹ')}}</button></div>
        <span class="pos-shift-badge" :class="shift?.cashierId === authStore.currentUser?.id ? 'is-open' : 'is-closed'">
          {{ shift?.cashierId === authStore.currentUser?.id ? pick('Shift open', 'شفٹ کھلی ہے') : pick('No shift', 'شفٹ بند ہے') }}
        </span>
      </div>
      <fieldset class="pos-customer-mode">
        <legend class="sr-only">{{ pick('Customer type', 'گاہک کی قسم') }}</legend>
        <label><input type="radio" name="pos-customer-mode" :checked="!selectedCustomerId && !customerSearch.trim()" @change="chooseCustomer(null)" />{{ pick('Walk-in', 'عام گاہک') }}</label>
        <label><input type="radio" name="pos-customer-mode" :checked="!!selectedCustomerId || !!customerSearch.trim()" @change="openCustomerPicker" />{{ pick('Registered client', 'رجسٹرڈ گاہک') }}</label>
      </fieldset>
      <div class="pos-header-end"><time>{{ formatDate(new Date()) }}</time><small>F2 {{ pick('Search', 'تلاش') }} · F3 {{ pick('Client', 'گاہک') }} · F8–F10 {{ pick('Pay', 'ادائیگی') }}</small></div>
    </header>

    <div v-if="sourceDocumentLoading" class="pos-source-document" role="status">{{ pick('Checking document, prices and available stock…', 'دستاویز، قیمت اور اسٹاک کی جانچ جاری ہے…') }}</div>
    <div v-if="sourceDocumentError" class="pos-source-error" role="alert">{{ sourceDocumentError }} <button type="button" @click="router.push(sourceDocumentKind==='preorder'?'/preorders':'/estimates')">{{ pick('Review document', 'دستاویز دیکھیں') }}</button></div>
    <div v-if="sourceDocumentId" class="pos-source-document" role="status"><div><strong>{{ pick('Loaded from', 'لوڈ کیا گیا') }} {{ sourceDocumentKind==='estimate'?pick('Estimate','تخمینہ'):pick('Pre-order','پیشگی آرڈر') }} <bdi>{{ sourceDocumentNumber }}</bdi></strong><small>{{ pick('Current prices and tax apply. Checkout completes this document.', 'موجودہ قیمت اور ٹیکس لاگو ہیں۔ فروخت مکمل کرنے پر دستاویز مکمل ہو گی۔') }} <span v-if="sourcePriceChanges">{{ pick('Changed prices:', 'تبدیل شدہ قیمتیں:') }} {{ formatNumber(sourcePriceChanges) }}</span><span v-if="sourceDocumentKind==='preorder'"> {{ pick('Stock was not reserved; availability is checked again at checkout.', 'اسٹاک محفوظ نہیں تھا؛ فروخت پر دوبارہ جانچ ہو گی۔') }}</span></small></div><button type="button" @click="sourceDocumentId=null; sourceDocumentNumber=''">{{ pick('Detach document', 'دستاویز الگ کریں') }}</button></div>
    <div class="pos-workspace">
      <section class="pos-main" :aria-label="pick('Sale entry and items', 'فروخت کے آئٹم')">
        <div class="pos-entry-strip">
          <div class="pos-client-field">
            <label for="pos-customer">{{ pick('Client', 'گاہک') }}</label>
            <div class="pos-combobox">
              <input id="pos-customer" v-model="customerSearch" type="text" autocomplete="off"
                :title="pick('Customer selection (F3)', 'گاہک کا انتخاب (F3)')" aria-keyshortcuts="F3"
                :placeholder="pick('Walk-in or search name, phone, code', 'عام گاہک یا نام، فون، کوڈ تلاش کریں')"
                role="combobox" aria-controls="pos-customer-options" :aria-expanded="customerOpen"
                @focus="openCustomerPicker" @input="onCustomerInput" @keydown="onCustomerKeydown" @blur="customerOpen = false" />
              <div v-if="customerOpen" id="pos-customer-options" role="listbox" class="pos-customer-results">
                <button type="button" role="option" :aria-selected="highlightedCustomerIndex === 0" :class="{ selected: highlightedCustomerIndex === 0 }" @mousedown.prevent="chooseCustomer(null)">{{ pick('Walk-in sale — no customer', 'عام فروخت — گاہک کے بغیر') }}</button>
                <button v-for="(customer, index) in customerOptions" :key="customer.id" type="button" role="option"
                  :aria-selected="highlightedCustomerIndex === index + 1" :class="{ selected: highlightedCustomerIndex === index + 1 }"
                  @mousedown.prevent="chooseCustomer(customer)"><strong>{{ customer.first_name }} {{ customer.last_name }}</strong><small><bdi>{{ customer.customer_code }}</bdi><span v-if="customer.phone_number"> · <bdi>{{ customer.phone_number }}</bdi></span></small></button>
                <p v-if="customerLoading" role="status">{{ pick('Searching clients…', 'گاہک تلاش ہو رہے ہیں…') }}</p>
                <p v-else-if="customerSearch.trim() && !customerOptions.length" role="status">{{ pick('No active clients found', 'کوئی فعال گاہک نہیں ملا') }}</p>
              </div>
            </div>
          </div>
          <div class="pos-item-field">
            <div class="pos-search-wrap">
              <Input
                id="pos-product-search"
                ref="searchInput"
                v-model="searchQuery"
                size="lg"
                type="search"
                autocomplete="off"
                :label="pick('Item / barcode', 'آئٹم / بارکوڈ')"
                :title="pick('Product or barcode search (F2)', 'مصنوعات یا بارکوڈ تلاش (F2)')"
                aria-keyshortcuts="F2"
                :placeholder="t('scan_or_search')"
                prefix-text="⌕"
                @input="onProductSearchInput"
                @keydown="handleBarcodeInput"
              />
              <div v-if="searchQuery.trim().length >= 2 || searchResults.length" class="pos-product-results">
                <p v-if="searchLoading" role="status" class="pos-result-message">{{ pick('Searching products…', 'مصنوعات تلاش کی جا رہی ہیں…') }}</p>
                <p v-else-if="searchError" role="alert" class="pos-result-message pos-error">{{ pick('Product search failed. Try again.', 'مصنوعات کی تلاش ناکام ہوئی۔ دوبارہ کوشش کریں۔') }}</p>
                <p v-else-if="!searchResults.length" role="status" class="pos-result-message">{{ pick('No matching products.', 'کوئی مماثل مصنوعات نہیں ملیں۔') }}</p>
                <template v-else>
                  <p class="pos-result-count body-sm text-text-secondary">{{ formatNumber(searchResults.length) }} {{ pick('matches · ↑↓ choose · Enter pack · Shift+Enter loose', 'نتائج · ↑↓ منتخب · Enter پیک · Shift+Enter کھلی اکائی') }}</p>
                  <Card
                    v-for="(product, index) in searchResults"
                    :key="product.id"
                    hoverable
                    padding="md"
                    :class="['pos-product-card', { 'highlighted': highlightedProductIndex === index }]"
                    @click="addToCart(product, false)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <h4 class="heading-4 mb-1">{{ product.name }}</h4>
                        <p class="body-sm text-text-secondary truncate">
                          <bdi>{{ product.sku }}</bdi> · {{ formatNumber(product.pack_size) }} {{ pick('units/pack', 'اکائیاں/پیک') }}
                        </p>
                      </div>
                      <div class="text-right flex-shrink-0">
                        <div class="number-display-md text-brand-600 mb-1">
                          {{ formatCurrency(cartStore.unitPrice(product) * product.pack_size) }}
                        </div>
                        <div class="flex items-center gap-1 justify-end">
                          <Badge
                            :variant="product.batches.reduce((sum, b) => sum + b.quantity_in_stock, 0) <= product.reorder_level ? 'warning' : 'success'"
                            size="sm"
                          >
                            {{ t('stock') }} {{ formatNumber(product.batches.reduce((sum, b) => sum + b.quantity_in_stock, 0)) }}
                          </Badge>
                          <Badge
                            v-if="product.batches[0] && getBatchWarning(product.batches[0].expiry_date)"
                            variant="warning"
                            size="sm"
                          >
                            {{ getBatchWarning(product.batches[0].expiry_date) }}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div class="pos-result-actions" @click.stop>
                      <Button variant="primary" size="sm" @click="addToCart(product, false)">
                        {{ pick('Pack', 'پیک') }}
                      </Button>
                      <Button v-if="product.sell_by_loose_unit" variant="outline" size="sm" @click="addToCart(product, true)">
                        {{ pick('Loose', 'کھلی') }}
                      </Button>
                    </div>
                  </Card>
                </template>
              </div>
            </div>
          </div>
          <div class="pos-entry-tools"><strong class="pos-price-mode">{{cartStore.customerType==='wholesale'?pick('Wholesale pricing','ہول سیل قیمت'):pick('Retail prices','ریٹیل قیمت')}}</strong><p class="pos-entry-hint">{{ pick('Enter adds a pack · Shift+Enter adds loose units · Bonus uses the same unit as quantity.', 'Enter پیک، Shift+Enter کھلی اکائی · بونس تعداد والی اکائی میں ہے۔') }}</p><label class="pos-cost-toggle"><input v-model="showCost" type="checkbox" />{{ pick('Cost & margin', 'لاگت اور منافع') }}</label></div>
        </div>

        <div class="pos-table-scroll">
          <table class="pos-lines">
            <thead><tr><th scope="col">#</th><th scope="col">{{ pick('Description', 'تفصیل') }}</th><th scope="col">{{ pick('Batch / Exp', 'بیچ / میعاد') }}</th><th scope="col">{{ t('quantity') }}</th><th scope="col" :title="pick('Free packs or loose units; deducted from stock', 'مفت پیک یا کھلی اکائیاں؛ اسٹاک سے کم ہوں گی')">{{ pick('Bonus', 'بونس') }}</th><th scope="col">{{ t('unit_price') }}</th><th v-if="showCost" scope="col">{{ pick('Cost', 'لاگت') }}</th><th v-if="showCost" scope="col" :title="pick('Line margin after free stock and line discount, before invoice discount and tax', 'بونس اور آئٹم رعایت کے بعد منافع؛ انوائس رعایت اور ٹیکس سے پہلے')">{{ pick('Margin %', 'منافع %') }}</th><th scope="col">{{ pick('Disc %', 'رعایت %') }}</th><th scope="col">{{ pick('Disc Rs', 'رعایت روپے') }}</th><th scope="col">{{ t('total') }}</th><th scope="col"><span class="sr-only">{{ pick('Remove', 'ہٹائیں') }}</span></th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in cartStore.items" :key="index">
                <td class="pos-line-number">{{ formatNumber(index + 1) }}</td>
                <td class="pos-line-description"><strong>{{ item.product.name }}</strong><div class="pos-line-badges"><span class="pos-type-pill">{{ item.isLooseSale ? pick('Loose unit', 'کھلی اکائی') : `${pick('Pack', 'پیک')} · ${formatNumber(item.product.pack_size)} ${pick('units', 'اکائیاں')}` }}</span><span v-if="item.confirmBreak" class="pos-break-pill">{{ pick('Strip opening confirmed', 'پٹی کھولنے کی تصدیق') }}</span></div></td>
                <td><bdi class="pos-batch-number">{{ item.batch.batch_number }}</bdi><small class="pos-expiry-date" :class="{ warning: !!getBatchWarning(item.batch.expiry_date) }">{{ formatDate(item.batch.expiry_date) }}<span v-if="getBatchWarning(item.batch.expiry_date)"> · {{ getBatchWarning(item.batch.expiry_date) }}</span></small></td>
                <td><input type="number" :value="item.quantity" @change="updateQuantities(index, $event)" class="pos-discount-input" min="1" step="1" :aria-label="pick('Quantity', 'تعداد')" /></td>
                <td><input type="number" :value="item.bonusQuantity" @change="updateQuantities(index, $event, true)" class="pos-discount-input" min="0" step="1" :aria-label="pick('Free quantity', 'مفت تعداد')" /></td>
                <td class="pos-money"><bdi>{{ formatCurrency(cartStore.unitPrice(item.product) * (item.isLooseSale ? 1 : item.product.pack_size)) }}</bdi></td>
                <td v-if="showCost" class="pos-money"><bdi>{{ formatCurrency(item.batch.cost_price_at_batch * (item.isLooseSale ? 1 : item.product.pack_size)) }}</bdi></td>
                <td v-if="showCost" class="pos-money" :class="{ 'pos-negative': (lineMargin(item) ?? 0) < 0 }">{{ lineMargin(item) == null ? '—' : `${lineMargin(item)!.toFixed(1)}%` }}</td>
                <td><input class="pos-discount-input" type="number" min="0" max="100" step="0.01" :value="item.discount" :aria-label="pick('Line discount percent', 'آئٹم کی رعایت فیصد')" @change="onLineDiscountChange(index, $event)" /></td>
                <td><input class="pos-discount-input" type="number" min="0" :max="lineGross(item)" step="0.01" :value="lineDiscount(item).toFixed(2)" :aria-label="pick('Line discount in rupees', 'آئٹم کی رعایت روپے میں')" @change="onLineDiscountAmountChange(index, $event)" /></td>
                <td class="pos-money pos-line-total"><bdi>{{ formatCurrency(cartStore.lineTotal(item)) }}</bdi></td>
                <td><Button variant="destructive" size="sm" class="pos-remove" :aria-label="pick('Remove item', 'آئٹم ہٹائیں')" @click="removeFromCart(index)">×</Button></td>
              </tr>
              <tr v-if="!cartStore.items.length"><td :colspan="showCost ? 12 : 10" class="pos-empty"><span aria-hidden="true">▤</span><strong>{{ pick('No items in this sale', 'اس فروخت میں کوئی آئٹم نہیں') }}</strong><small>{{ pick('Scan a barcode or search for a product above.', 'اوپر بارکوڈ اسکین کریں یا مصنوعات تلاش کریں۔') }}</small></td></tr>
            </tbody>
          </table>
        </div>

        <div class="pos-summary" :aria-label="pick('Sale summary', 'فروخت کا خلاصہ')">
          <div><small>{{ t('items') }}</small><strong>{{ formatNumber(cartStore.itemCount) }}</strong></div>
          <div class="pos-summary-cashier"><small>{{ pick('Cashier', 'کیشئر') }}</small><strong>{{ authStore.currentUser?.full_name || '—' }}</strong></div>
          <div><small>{{ pick('Gross total', 'مجموعی رقم') }}</small><strong>{{ formatCurrency(subtotal) }}</strong></div>
          <div><small>{{ t('tax') }}</small><strong>{{ formatCurrency(taxAmount) }}</strong></div>
          <label class="pos-summary-discount"><small>{{ pick('Invoice discount', 'انوائس رعایت') }}</small><span><bdi>Rs</bdi><input type="number" min="0" :max="maxInvoiceDiscount" step="0.01" :value="cartStore.discountAmount.toFixed(2)" @change="onInvoiceDiscountChange" :aria-label="pick('Invoice discount in rupees', 'انوائس رعایت روپے میں')" /></span></label>
          <div class="pos-summary-total"><small>{{ t('total') }}</small><strong>{{ formatCurrency(total) }}</strong></div>
        </div>
      </section>

      <aside class="pos-dock" :aria-label="pick('Payment and prescription', 'ادائیگی اور نسخہ')">
        <div class="pos-dock-heading"><h2>{{ pick('Payment', 'ادائیگی') }}</h2><small>{{ pick('Fast checkout', 'فوری فروخت') }}</small><div v-if="paymentMethod==='credit'&&selectedCustomer" class="pos-credit-status" :class="{'exceeded':!creditAllowed}" :role="creditAllowed?'status':'alert'">{{creditAllowed?pick('Account after sale','فروخت کے بعد بقایا'):pick('Limit exceeded — collect payment / contact manager','حد سے زیادہ — وصولی کریں / منیجر سے رابطہ کریں')}}: {{formatCurrency(Number(selectedCustomer.current_balance)+total)}} / {{formatCurrency(Number(selectedCustomer.credit_limit))}}</div></div>
        <div class="pos-dock-scroll">
        <div v-if="!shift || shift.cashierId !== authStore.currentUser?.id" class="pos-shift-warning" role="alert">{{ pick('Open your cash drawer shift before selling.', 'فروخت سے پہلے اپنی کیش شفٹ کھولیں۔') }}<button type="button" @click="router.push('/shifts')">{{ pick('Open shift →', 'شفٹ کھولیں ←') }}</button></div>
        <p v-else class="pos-shift-ok">● {{ pick('Shift open', 'شفٹ کھلی ہے') }} · {{ shift.cashierName }}</p>
        <div v-if="selectedCustomer" class="pos-previous-balance"><span>{{ pick('Previous customer balance', 'گاہک کا سابقہ بقایا') }}</span><strong>{{ formatCurrency(selectedCustomer.current_balance) }}</strong><small>{{ pick('Shown separately; not collected with this sale.', 'الگ دکھایا گیا ہے؛ اس فروخت کے ساتھ وصول نہیں ہوگا۔') }}</small></div>

        <section class="pos-rx-fields"><h3>℞ {{ pick('Prescription details', 'نسخے کی تفصیل') }}</h3><p v-if="prescriptionMissing" role="alert" class="pos-error">{{pick('Prescription details required before checkout.','فروخت سے پہلے نسخے کی تفصیل ضروری ہے۔')}}</p><label>{{ pick('Patient name (optional)', 'مریض کا نام (اختیاری)') }}<input v-model="patientName" maxlength="100" type="text" /></label><label>{{ pick('Prescribing doctor (optional)', 'نسخہ لکھنے والا ڈاکٹر (اختیاری)') }}<input v-model="doctorName" maxlength="100" type="text" /></label><p v-if="cartStore.items.some(item => item.product.controlled_substance)" class="pos-controlled-warning">{{ pick('Controlled sale: both patient and doctor names OR a prescription note/reference are required.','کنٹرول شدہ فروخت: مریض اور ڈاکٹر دونوں نام یا نسخے کا نوٹ / حوالہ ضروری ہے۔') }}</p><label v-if="hasControlled">{{pick('Prescription note / reference','نسخے کا نوٹ / حوالہ')}}<textarea class="pos-prescription-note" v-model="prescriptionNote" maxlength="500" rows="2"/></label></section>
        <label class="pos-remarks">{{ pick('Sale remarks (optional)', 'فروخت کے نوٹس (اختیاری)') }}<textarea v-model="saleRemarks" maxlength="500" rows="2" :placeholder="pick('Notes saved with this invoice', 'انوائس کے ساتھ محفوظ نوٹس')"></textarea></label>

        <section class="pos-payment-totals"><h3>{{ pick('Bill summary', 'بل کا خلاصہ') }}</h3><div><span>{{ pick('Subtotal', 'ذیلی کل') }}</span><bdi>{{ formatCurrency(subtotal) }}</bdi></div><div><span>{{ t('tax') }} ({{ settingsStore.settings?.tax_rate || 0 }}%)</span><bdi>{{ formatCurrency(taxAmount) }}</bdi></div><div><span>{{ pick('Invoice discount', 'انوائس رعایت') }}</span><bdi>−{{ formatCurrency(cartStore.discountAmount) }}</bdi></div><div class="pos-dock-grand"><span>{{ t('total') }}</span><strong>{{ formatCurrency(total) }}</strong></div></section>

        <section v-if="selectedCustomer" class="pos-credit-info"><strong>{{ pick('Credit / Udhar','کریڈٹ / ادھار') }}</strong><div>{{ pick('Limit','حد') }}: {{ formatCurrency(Number(selectedCustomer.credit_limit)) }}</div><div>{{ pick('Balance after credit sale','ادھار کے بعد بقایا') }}: {{ formatCurrency(Number(selectedCustomer.current_balance)+total) }}</div><p v-if="paymentMethod==='credit'&&!creditAllowed" role="alert">{{ pick('Credit limit exceeded. Collect payment or ask a manager to review the limit.','کریڈٹ حد سے زیادہ رقم ہے۔ وصولی کریں یا منیجر سے رابطہ کریں۔') }}</p></section>
        <section v-if="paymentMethod === 'cash'" class="pos-cash-tender">
          <label>{{ pick('Cash received', 'وصول شدہ نقد') }}<input v-model="cashReceived" type="number" min="0" step="0.01" :placeholder="total.toFixed(2)" /></label>
          <button type="button" @click="cashReceived = total">{{ pick('Exact amount', 'پوری رقم') }}</button>
          <div><span>{{ pick('Change to return', 'واپس دینے کی رقم') }}</span><strong>{{ formatCurrency(changeDue) }}</strong></div>
          <small v-if="!validTender" role="alert">{{ pick('Received amount is below the bill total.', 'وصول شدہ رقم بل سے کم ہے۔') }}</small>
          <small v-else-if="cashReceived === ''">{{ pick('Leave blank for exact payment.', 'پوری ادائیگی کے لیے خالی چھوڑیں۔') }}</small>
        </section>


        <SavedSaleActions ref="savedActions" :invoice-id="lastInvoiceId" @loaded="sale=>{lastReceipt={invoiceId:sale.id,invoiceNumber:sale.invoice_number,netAmount:sale.net_amount,subtotal:sale.total_amount,taxAmount:sale.tax_amount,discountAmount:sale.discount_amount,receivedAmount:sale.received_amount||0,changeAmount:sale.change_amount||0}}" />
        </div>
        <div class="pos-payment-actions" role="group" :aria-label="pick('Payment method shortcuts', 'ادائیگی کے شارٹ کٹس')">
          <Button
            :variant="paymentMethod === 'cash' ? 'primary' : 'outline'"
            size="md"
            class="pos-pay-btn"
            :aria-pressed="paymentMethod === 'cash'"
            @click="paymentMethod = 'cash'"
          >
            <span class="flex items-center justify-between w-full gap-2">
              <span>{{ pick('Cash', 'نقد') }}</span>
              <kbd class="pos-kbd">F8</kbd>
            </span>
          </Button>
          <Button
            :variant="paymentMethod === 'card' ? 'primary' : 'outline'"
            size="md"
            class="pos-pay-btn"
            :aria-pressed="paymentMethod === 'card'"
            @click="paymentMethod = 'card'"
          >
            <span class="flex items-center justify-between w-full gap-2">
              <span>{{ pick('Card', 'کارڈ') }}</span>
              <kbd class="pos-kbd">F9</kbd>
            </span>
          </Button>
          <Button
            :variant="paymentMethod === 'mobile' ? 'primary' : 'outline'"
            size="md"
            class="pos-pay-btn"
            :aria-pressed="paymentMethod === 'mobile'"
            @click="paymentMethod = 'mobile'"
          >
            <span class="flex items-center justify-between w-full gap-2">
              <span>{{ pick('Mobile / JazzCash', 'موبائل / جاز کیش') }}</span>
              <kbd class="pos-kbd">F10</kbd>
            </span>
          </Button>
          <Button
            v-if="selectedCustomer"
            :variant="paymentMethod === 'credit' ? 'primary' : 'outline'"
            size="md"
            class="pos-pay-btn"
            :aria-pressed="paymentMethod === 'credit'"
            @click="paymentMethod = 'credit'"
          >
            <span>{{ pick('Credit / Udhar', 'کریڈٹ / ادھار') }}</span>
          </Button>
        </div>
        <Button
          variant="primary"
          size="xl"
          class="pos-complete"
          :disabled="!cartStore.items.length || prescriptionMissing || checkoutLoading || sourceDocumentLoading || (paymentMethod==='credit'&&!creditAllowed) || !validTender || !shift || shift.cashierId !== authStore.currentUser?.id"
          @click="checkout"
        >
          {{ checkoutLoading ? pick('Processing…', 'کارروائی جاری ہے…') : pick('Complete Sale · Ctrl+Enter', 'فروخت مکمل کریں · Ctrl+Enter') }}
        </Button>
      </aside>
    </div>
  </main>
</template>

<style scoped>
/* Integration with enhanced components */
.pos-product-card {
  cursor: pointer;
  margin-bottom: 0.25rem;
  transition: var(--transition-base);
}

.pos-product-card.highlighted {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

:global(.dark) .pos-product-card.highlighted {
  background: rgba(16, 185, 129, 0.1);
  border-color: var(--brand-600);
}

.pos-product-card .pos-result-actions {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
}

.pos-pay-btn {
  width: 100%;
}

.pos-kbd {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.7rem;
  font-family: var(--font-mono);
}

/* Enhanced search input styling */
.pos-search-wrap {
  position: relative;
}

/* Product results dropdown positioning */
.pos-search-wrap .pos-product-results {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 380px;
  overflow-y: auto;
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 0.5rem;
}

/* Scrollbar styling for product results */
.pos-product-results::-webkit-scrollbar {
  width: 8px;
}

.pos-product-results::-webkit-scrollbar-track {
  background: var(--background-primary);
  border-radius: 4px;
}

.pos-product-results::-webkit-scrollbar-thumb {
  background: var(--neutral-300);
  border-radius: 4px;
}

:global(.dark) .pos-product-results::-webkit-scrollbar-thumb {
  background: var(--neutral-700);
}

/* Original POS styles (preserved for backward compatibility) */
.pos-prescription-note{width:100%;padding:.4rem;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:5px;font:inherit}.pos-price-mode{color:var(--color-primary);font-size:.68rem}.pos-entry-tools{flex-wrap:wrap;grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:.5rem}.pos-entry-tools .pos-cost-toggle{display:flex;align-items:center;gap:.3rem;white-space:nowrap;margin:0;text-transform:none;letter-spacing:normal;font-size:.7rem}.pos-negative{color:var(--color-danger)}
.pos-previous-balance{display:grid;grid-template-columns:1fr auto;gap:.25rem;padding:.5rem;border:1px solid var(--color-border);border-radius:6px;font-size:.75rem}.pos-previous-balance small{grid-column:1/-1;color:var(--color-text-secondary);font-size:.65rem}
.pos-remarks,.pos-cash-tender label{display:grid;gap:.25rem;color:var(--color-text-secondary);font-size:.72rem;font-weight:600}.pos-remarks textarea,.pos-cash-tender input{width:100%;padding:.4rem .5rem;border:1px solid var(--color-border);border-radius:5px;background:var(--color-background);color:var(--color-text-primary);font:inherit}.pos-remarks textarea{resize:vertical;min-height:48px}.pos-cash-tender{display:grid;gap:.4rem;padding:.6rem;border:1px solid var(--color-border);border-radius:6px}.pos-cash-tender button{justify-self:start;padding:.25rem .5rem;border:1px solid var(--color-border);border-radius:4px;background:var(--color-hover);color:var(--color-text-primary);cursor:pointer;font-size:.7rem}.pos-cash-tender>div{display:flex;justify-content:space-between;gap:.5rem;font-size:.78rem}.pos-cash-tender small{font-size:.68rem;color:var(--color-text-secondary)}.pos-cash-tender small[role=alert]{color:var(--color-danger)}
.pos-terminal{display:flex;flex-direction:column;height:calc(100vh - 6.8rem);min-height:480px;overflow:hidden;background:var(--color-background);color:var(--color-text-primary);font-variant-numeric:tabular-nums}
.pos-terminal *{box-sizing:border-box}
.pos-terminal button,.pos-terminal input{font:inherit}
.pos-terminal button:focus-visible,.pos-terminal input:focus-visible{outline:2px solid #0d9488;outline-offset:2px}
.pos-header{display:flex;align-items:center;gap:1rem;min-height:76px;padding:.75rem 1rem;background:linear-gradient(110deg,#0f766e,#0d9488);color:#fff;box-shadow:0 2px 8px rgba(15,118,110,.16)}
.pos-brand{display:flex;align-items:center;gap:.65rem;min-width:175px;max-width:25%}.pos-rx{display:grid;place-items:center;width:38px;height:38px;flex:none;border:1px solid rgba(255,255,255,.65);border-radius:10px;font-size:1.45rem}.pos-brand strong,.pos-brand small{display:block}.pos-brand strong{font-size:1.05rem;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pos-brand small{font-size:.68rem;opacity:.83}
.pos-header-meta{display:flex;align-items:center;gap:.75rem;min-width:0}.pos-header-fact{display:flex;flex-direction:column;gap:.15rem}.pos-header-fact span,.pos-header-end small{font-size:.65rem;opacity:.85}.pos-header-fact bdi{font-size:.76rem;font-weight:700;white-space:nowrap}.pos-shift-badge{border-radius:99px;padding:.3rem .55rem;font-size:.72rem;font-weight:700;white-space:nowrap}.pos-shift-badge.is-open{background:#ccfbf1;color:#115e59}.pos-shift-badge.is-closed{background:#fef3c7;color:#92400e}
.pos-customer-mode{display:flex;gap:.7rem;align-items:center;margin:0 auto;padding:0;border:0;white-space:nowrap}.pos-customer-mode label{display:flex;align-items:center;gap:.25rem;font-size:.78rem;cursor:pointer}.pos-customer-mode input{accent-color:#ccfbf1}.pos-header-end{display:flex;flex-direction:column;align-items:end;gap:.2rem;margin-inline-start:auto;white-space:nowrap}.pos-header-end time{font-size:.8rem;font-weight:700}
.pos-workspace{display:grid;grid-template-columns:minmax(0,1fr) 292px;min-height:0;flex:1}.pos-main{display:flex;flex-direction:column;min-width:0;min-height:0}.pos-entry-strip{display:grid;grid-template-columns:minmax(205px,.86fr) minmax(340px,1.4fr);gap:.55rem .75rem;padding:.8rem 1rem .55rem;background:var(--color-surface);border-bottom:1px solid var(--color-border)}

.pos-entry-strip label {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.pos-client-field, .pos-item-field {
  display: flex;
  flex-direction: column;
}

.pos-combobox{position:relative}.pos-combobox>input{width:100%;height:40px;padding:.45rem .7rem;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:7px}.pos-entry-hint{grid-column:1/-1;margin:0;color:var(--color-text-secondary);font-size:.69rem}
.pos-customer-results{position:absolute;top:calc(100% + 3px);inset-inline:0;z-index:40;max-height:260px;overflow:auto;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-lg)}.pos-customer-results button{display:block;width:100%;padding:.55rem .75rem;text-align:start;color:var(--color-text-primary);background:transparent;border:0;border-bottom:1px solid var(--color-border);cursor:pointer}.pos-customer-results button:hover,.pos-customer-results button.selected{background:var(--color-hover)}.pos-customer-results strong,.pos-customer-results small{display:block}.pos-customer-results small{color:var(--color-text-secondary);font-size:.68rem}.pos-customer-results p,.pos-result-message,.pos-result-count{margin:0;padding:.55rem .75rem;color:var(--color-text-secondary);font-size:.75rem}.pos-error{color:#dc2626}

.pos-table-scroll{flex:1;min-height:0;overflow:auto;background:var(--color-surface)}.pos-lines{width:100%;min-width:680px;border-collapse:collapse;font-size:.77rem}.pos-lines thead{position:sticky;top:0;z-index:2;background:#0f766e;color:white}.pos-lines th{height:36px;padding:.45rem .55rem;text-align:start;font-weight:700;white-space:nowrap}.pos-lines th:nth-child(n+4):nth-child(-n+7){text-align:end}.pos-lines tbody tr{border-bottom:1px solid var(--color-border)}.pos-lines tbody tr:not(:has(.pos-empty)):hover{background:var(--color-hover)}.pos-lines td{padding:.5rem .55rem;vertical-align:middle}.pos-line-number{width:34px;color:var(--color-text-secondary)}.pos-line-description{min-width:155px}.pos-line-description strong{display:block}.pos-line-badges{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.2rem}.pos-type-pill{background:var(--color-hover);color:var(--color-text-secondary)}.pos-batch-number,.pos-expiry-date{display:block;white-space:nowrap}.pos-expiry-date{font-size:.68rem;color:var(--color-text-secondary)}.pos-expiry-date.warning{color:#dc2626;font-weight:700}.pos-qty-input{max-width:66px;min-width:55px;margin-inline:auto;text-align:center}.pos-discount-input{width:66px;padding:.4rem .3rem;text-align:center;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:5px}.pos-money{text-align:end;white-space:nowrap}.pos-line-total{font-weight:800}.pos-remove{min-width:28px;min-height:28px;padding:0;font-size:1.1rem}.pos-empty{height:150px;text-align:center;color:var(--color-text-secondary)}.pos-empty span,.pos-empty strong,.pos-empty small{display:block}.pos-empty span{font-size:2rem}.pos-empty small{margin-top:.25rem}
.pos-summary{display:grid;grid-template-columns:.5fr 1fr 1fr .75fr 1.1fr 1.2fr;align-items:center;gap:.65rem;min-height:74px;padding:.55rem 1rem;background:var(--color-surface);border-top:2px solid #0d9488;box-shadow:0 -3px 14px rgba(0,0,0,.06)}.pos-summary>div,.pos-summary>label{min-width:0}.pos-summary small{display:block;margin-bottom:.2rem;color:var(--color-text-secondary);font-size:.65rem;font-weight:700;white-space:nowrap}.pos-summary strong{display:block;overflow:hidden;text-overflow:ellipsis}.pos-summary-cashier{overflow:hidden}.pos-summary-cashier strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pos-summary-discount{display:flex;flex-direction:column;gap:.2rem}.pos-summary-discount span{display:flex;align-items:center;gap:.25rem}.pos-summary-discount input{width:76px;padding:.35rem .45rem;text-align:end;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:5px;font-variant-numeric:tabular-nums}.pos-summary-total{font-size:1.05rem;font-weight:800}
.pos-dock{display:flex;flex-direction:column;min-height:0;padding:.85rem;background:linear-gradient(180deg,#f0fdfa,#ccfbf1);border-inline-start:1px solid #0d9488;box-shadow:-3px 0 8px rgba(0,0,0,.06)}
:global(.dark) .pos-dock{background:linear-gradient(180deg,#134e4a,#115e59)}.pos-dock-heading{display:flex;flex-direction:column;gap:.15rem;margin-bottom:.65rem}.pos-dock-heading h2{margin:0;font-size:.95rem;color:#0f766e;font-weight:800}:global(.dark) .pos-dock-heading h2{color:#5eead4}.pos-dock-heading small{font-size:.65rem;color:#115e59;opacity:.8}:global(.dark) .pos-dock-heading small{color:#99f6e4}.pos-credit-status{margin-top:.4rem;padding:.4rem;border-radius:5px;background:#ccfbf1;color:#115e59;font-size:.68rem;font-weight:600}:global(.dark) .pos-credit-status{background:rgba(20,184,166,.2);color:#5eead4}.pos-credit-status.exceeded{background:#fef3c7;color:#92400e}:global(.dark) .pos-credit-status.exceeded{background:rgba(251,191,36,.2);color:#fcd34d}.pos-dock-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding-inline-end:.25rem;margin-bottom:.65rem}.pos-shift-warning,.pos-shift-ok{padding:.55rem;border-radius:6px;font-size:.72rem;margin-bottom:.55rem}.pos-shift-warning{background:#fef3c7;color:#92400e;font-weight:600}.pos-shift-warning button{margin-top:.35rem;padding:.35rem .55rem;background:#fbbf24;color:#fff;border:0;border-radius:5px;cursor:pointer;font-size:.7rem}.pos-shift-ok{background:rgba(20,184,166,.15);color:#0f766e;font-weight:600}:global(.dark) .pos-shift-ok{background:rgba(20,184,166,.2);color:#5eead4}
.pos-rx-fields,.pos-payment-totals,.pos-credit-info{padding:.6rem;border:1px solid rgba(15,118,110,.2);border-radius:6px;margin-bottom:.6rem}.pos-rx-fields h3,.pos-payment-totals h3,.pos-credit-info strong{margin:0 0 .4rem;font-size:.72rem;font-weight:800;color:#0f766e;display:flex;align-items:center;gap:.25rem}:global(.dark) .pos-rx-fields h3,:global(.dark) .pos-payment-totals h3,:global(.dark) .pos-credit-info strong{color:#5eead4}.pos-rx-fields label,.pos-payment-totals>div,.pos-credit-info>div{display:block;margin-bottom:.4rem;font-size:.72rem;color:var(--color-text-secondary)}.pos-rx-fields input,.pos-rx-fields textarea{width:100%;margin-top:.25rem;padding:.4rem;border:1px solid var(--color-border);border-radius:5px;background:var(--color-background);color:var(--color-text-primary);font:inherit}.pos-controlled-warning{padding:.4rem;margin-top:.4rem;border-radius:5px;background:#fef3c7;color:#92400e;font-size:.65rem;font-weight:600}.pos-payment-totals>div{display:flex;justify-content:space-between;gap:.5rem}.pos-dock-grand{padding-top:.35rem;border-top:2px solid rgba(15,118,110,.3);margin-top:.25rem}.pos-dock-grand span{font-size:.72rem;font-weight:700}.pos-dock-grand strong{font-size:1.25rem;font-weight:800;color:#0f766e}:global(.dark) .pos-dock-grand strong{color:#5eead4}.pos-credit-info{background:rgba(20,184,166,.08);font-size:.7rem}.pos-credit-info p[role=alert]{margin-top:.4rem;color:#dc2626;font-weight:600}

.pos-payment-actions{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.65rem}.pos-payment-actions .pos-pay-btn:nth-last-child(1):nth-child(odd){grid-column:1/-1}

.pos-complete{width:100%;height:56px;font-size:.9rem;font-weight:800;letter-spacing:.015em}
.pos-source-document,.pos-source-error{padding:.6rem;margin:.6rem 1rem;border-radius:6px;font-size:.75rem;display:grid;grid-template-columns:1fr auto;gap:.5rem;align-items:center}.pos-source-document{background:#dbeafe;color:#1e40af;border:1px solid #93c5fd}.pos-source-error{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}.pos-source-document strong,.pos-source-error{font-weight:700}.pos-source-document small{display:block;margin-top:.25rem;opacity:.9}.pos-source-document button,.pos-source-error button{padding:.35rem .55rem;border:0;border-radius:5px;cursor:pointer;font-size:.7rem;font-weight:600;white-space:nowrap}.pos-source-document button{background:#3b82f6;color:#fff}.pos-source-error button{background:#dc2626;color:#fff}.pos-last-reprint{padding:.2rem .4rem;margin-inline-start:.4rem;border:1px solid rgba(255,255,255,.4);border-radius:4px;background:transparent;color:rgba(255,255,255,.9);cursor:pointer;font-size:.68rem;font-weight:600}.pos-last-reprint:disabled{opacity:.4;cursor:not-allowed}
</style>erflow:ellipsis;white-space:nowrap;font-size:.83rem}.pos-summary-discount span{display:flex;align-items:center;gap:.2rem}.pos-summary-discount input{width:78px;min-width:0;padding:.3rem .35rem;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:5px;text-align:end;font-size:.75rem}.pos-summary-total{padding-inline-start:.7rem;border-inline-start:1px solid var(--color-border)}.pos-summary-total strong{color:#0f766e;font-size:1.2rem}
.pos-dock{display:flex;flex-direction:column;gap:.7rem;min-height:0;overflow-y:auto;padding:.8rem .85rem;background:var(--color-surface);border-inline-start:1px solid var(--color-border);box-shadow:-3px 0 12px rgba(0,0,0,.035)}.pos-dock-heading{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--color-border);padding-bottom:.5rem}.pos-dock-heading h2{margin:0;font-size:1.1rem}.pos-dock-heading small{color:var(--color-text-secondary);font-size:.7rem}.pos-shift-warning{padding:.55rem .65rem;border:1px solid #f59e0b;border-radius:7px;background:#fffbeb;color:#92400e;font-size:.74rem}.pos-shift-warning button{display:block;margin-top:.25rem;border:0;background:transparent;color:inherit;font-weight:800;text-decoration:underline;cursor:pointer}.pos-shift-ok{margin:0;color:#047857;font-size:.73rem;font-weight:700}.pos-rx-fields{display:grid;gap:.45rem}.pos-rx-fields h3,.pos-payment-totals h3,.pos-last-sale h3{margin:0;font-size:.8rem}.pos-rx-fields label{display:grid;gap:.2rem;font-size:.7rem;font-weight:700;color:var(--color-text-secondary)}.pos-rx-fields input{width:100%;height:32px;padding:.35rem .5rem;background:var(--color-background);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:5px}.pos-controlled-warning{margin:0;color:#b45309;font-size:.68rem;font-weight:700}.pos-payment-totals{display:grid;gap:.32rem;margin-top:auto;padding-top:.6rem;border-top:1px solid var(--color-border)}.pos-payment-totals>div{display:flex;justify-content:space-between;gap:.5rem;color:var(--color-text-secondary);font-size:.75rem}.pos-payment-totals bdi{color:var(--color-text-primary)}.pos-payment-totals .pos-dock-grand{align-items:baseline;padding-top:.35rem;border-top:1px solid var(--color-border);color:var(--color-text-primary);font-weight:800}.pos-dock-grand strong{color:#0f766e;font-size:1.45rem;white-space:nowrap}
.pos-payment-actions{display:grid;gap:.35rem}.pos-pay-button{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:34px;padding:.4rem .65rem;border:2px solid transparent;border-radius:6px;color:white;font-size:.79rem;font-weight:800;cursor:pointer}.pos-pay-button.cash{background:#047857}.pos-pay-button.card{background:#1d4ed8}.pos-pay-button.mobile{background:#ea580c}.pos-pay-button[aria-pressed=true]{border-color:var(--color-text-primary);box-shadow:0 0 0 2px var(--color-surface) inset}.pos-pay-button kbd{padding:.1rem .3rem;border:1px solid rgba(255,255,255,.5);border-radius:4px;font-size:.67rem}.pos-complete{width:100%;min-height:42px;background:#0f766e;color:white;font-weight:800}.pos-last-sale{padding:.55rem .65rem;border:1px solid var(--color-border);border-radius:7px;background:var(--color-background);font-size:.72rem}.pos-last-sale bdi{display:block;margin:.2rem 0;color:var(--color-text-secondary)}.pos-last-sale div{display:flex;justify-content:space-between;gap:.5rem}.pos-last-sale strong{color:#0f766e}
[data-theme='dark'] .pos-summary-total strong,[data-theme='dark'] .pos-dock-grand strong,[data-theme='dark'] .pos-last-sale strong{color:#5eead4}[data-theme='dark'] .pos-result-actions button{color:#5eead4}[data-theme='dark'] .pos-shift-ok{color:#6ee7b7}[data-theme='dark'] .pos-controlled-warning{color:#fbbf24}[data-theme='dark'] .pos-expiry-date.warning{color:#fca5a5}
@media(max-width:1150px){.pos-header{gap:.65rem}.pos-header-end small{display:none}.pos-customer-mode{gap:.35rem}.pos-summary{gap:.35rem}.pos-summary-cashier{display:none}.pos-summary{grid-template-columns:.5fr 1fr .7fr 1.1fr 1.2fr}.pos-workspace{grid-template-columns:minmax(0,1fr) 280px}}
@media(max-width:900px){.pos-terminal{height:auto;min-height:0;overflow:visible}.pos-workspace{display:flex;flex-direction:column}.pos-table-scroll{min-height:250px;max-height:55vh}.pos-dock{overflow:visible;border-inline-start:0;border-top:1px solid var(--color-border)}.pos-entry-strip{grid-template-columns:1fr}.pos-header{flex-wrap:wrap}.pos-header-end{display:none}.pos-summary{position:sticky;bottom:0;z-index:3}}

.pos-header,.pos-summary{flex-shrink:0}
.pos-last-reprint{padding:.15rem .4rem;border:1px solid #ccfbf1;border-radius:4px;color:#fff;background:transparent;font-size:.65rem!important;cursor:pointer}.pos-last-reprint:disabled{opacity:.4;cursor:default}.pos-dock-heading{flex-wrap:wrap}.pos-credit-status{flex-basis:100%;padding:.3rem;border:1px solid var(--color-border);border-radius:4px;color:var(--color-text-primary);font-size:.7rem}.pos-credit-status.exceeded{color:var(--color-danger);border-color:var(--color-danger)}
.pos-pay-button.credit{background:#7c3aed}.pos-credit-info{padding:.55rem;border:1px solid var(--color-border);border-radius:6px;font-size:.75rem}.pos-credit-info p{color:var(--color-danger)}
.pos-dock{display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;overflow:hidden;gap:.5rem}
.pos-dock-scroll{display:flex;flex-direction:column;gap:.6rem;min-height:0;overflow:auto;overscroll-behavior:contain;padding-inline-end:.15rem}
.pos-dock-scroll>*{flex-shrink:0}.pos-payment-totals{margin-top:0}
.pos-pay-button[aria-pressed=true]{border-color:#fff;outline:2px solid var(--color-primary);outline-offset:1px;box-shadow:0 0 0 2px #fff inset,0 0 12px rgba(13,148,136,.4)}
.pos-pay-button[aria-pressed=true] span::before{content:'✓ ';font-weight:900}
.pos-pay-button[aria-pressed=false]{opacity:.72}
.pos-break-pill{border:1px solid #b45309;font-weight:800;background:#fef3c7;color:#78350f}
.pos-source-document{display:flex;align-items:center;justify-content:space-between;gap:.65rem;flex-shrink:0;padding:.55rem 1rem;border-bottom:2px solid #0d9488;background:#ccfbf1;color:#115e59;font-size:.78rem}
.pos-source-document strong,.pos-source-document small{display:block}.pos-source-document small{margin-top:.2rem;font-size:.7rem}.pos-source-document button{flex-shrink:0;padding:.35rem .55rem;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit}
.pos-source-error{flex-shrink:0;padding:.5rem 1rem;background:var(--color-surface);color:var(--color-danger);border-bottom:1px solid var(--color-danger);font-size:.78rem}.pos-source-error button{text-decoration:underline;margin-inline-start:.5rem}
[data-theme='dark'] .pos-source-document{background:#134e4a;color:#ccfbf1}
[data-theme='dark'] .pos-pay-button[aria-pressed=true]{outline-color:#5eead4;box-shadow:0 0 0 2px #fff inset,0 0 14px rgba(94,234,212,.4)}
@media(min-width:901px) and (max-height:700px){.pos-header{min-height:58px;padding:.5rem .75rem}.pos-entry-strip{padding:.5rem .65rem;gap:.35rem .6rem;grid-template-columns:minmax(180px,.8fr) minmax(230px,1.2fr)}.pos-combobox>input,.pos-search-wrap>input{height:34px}.pos-summary{min-height:60px;padding:.4rem .65rem}.pos-dock{padding:.55rem .65rem}.pos-dock-heading h2{font-size:1rem}.pos-pay-button{min-height:30px;padding:.3rem .55rem}.pos-complete{min-height:38px;height:auto;padding:.5rem}.pos-product-results{max-height:200px}.pos-lines{min-width:680px}.pos-header-meta{gap:.4rem}}
@media(max-width:900px){.pos-dock{display:flex;overflow:visible}.pos-dock-scroll{overflow:visible;min-height:0}.pos-source-document{flex-wrap:wrap}}
</style>
