import { ref, computed, watch } from 'vue'

export type Language = 'en' | 'ur' | 'mixed'
export type NumberFormat = 'en' | 'ur'
export type DateFormat = 'dmy' | 'mdy' | 'iso'

const STORAGE_KEY_LANG = 'pharmacy-pos-language'
const STORAGE_KEY_NUM = 'pharmacy-pos-number-format'
const STORAGE_KEY_DATE = 'pharmacy-pos-date-format'

// Initialize from localStorage
const currentLanguage = ref<Language>((localStorage.getItem(STORAGE_KEY_LANG) as Language) || 'mixed')
const numberFormat = ref<NumberFormat>((localStorage.getItem(STORAGE_KEY_NUM) as NumberFormat) || 'en')
const dateFormat = ref<DateFormat>((localStorage.getItem(STORAGE_KEY_DATE) as DateFormat) || 'dmy')

watch(currentLanguage, lang => {
  document.documentElement.lang = lang === 'ur' ? 'ur' : 'en'
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
}, { immediate: true })

// Translation dictionary
export const translations = {
  credit: { en: 'Credit / Udhar', ur: 'کریڈٹ / ادھار' },
  // Navigation
  dashboard: { en: 'Dashboard', ur: 'ڈیش بورڈ' },
  pos_terminal: { en: 'POS Terminal', ur: 'پی او ایس ٹرمینل' },
  products: { en: 'Products', ur: 'مصنوعات' },
  customers: { en: 'Customers', ur: 'گاہک' },
  sales_history: { en: 'Sales History', ur: 'فروخت کی تاریخ' },
  daily_closing: { en: 'Daily Closing', ur: 'روزانہ بندش' },
  reports: { en: 'Reports', ur: 'رپورٹس' },
  users: { en: 'Users', ur: 'صارفین' },
  suppliers: { en: 'Suppliers', ur: 'سپلائرز' },
  purchase_orders: { en: 'Purchase Orders', ur: 'خریداری کے آرڈرز' },
  settings: { en: 'Settings', ur: 'ترتیبات' },
  
  // Common Actions
  save: { en: 'Save', ur: 'محفوظ کریں' },
  cancel: { en: 'Cancel', ur: 'منسوخ کریں' },
  delete: { en: 'Delete', ur: 'حذف کریں' },
  edit: { en: 'Edit', ur: 'تدوین کریں' },
  add: { en: 'Add', ur: 'شامل کریں' },
  search: { en: 'Search', ur: 'تلاش کریں' },
  filter: { en: 'Filter', ur: 'فلٹر کریں' },
  export: { en: 'Export', ur: 'ایکسپورٹ' },
  print: { en: 'Print', ur: 'پرنٹ کریں' },
  logout: { en: 'Logout', ur: 'لاگ آؤٹ' },
  
  // Auth
  username: { en: 'Username', ur: 'صارف نام' },
  password: { en: 'Password', ur: 'پاس ورڈ' },
  login: { en: 'Login', ur: 'لاگ ان' },
  remember_me: { en: 'Remember me', ur: 'مجھے یاد رکھیں' },
  
  // POS
  cart: { en: 'Cart', ur: 'ٹوکری' },
  subtotal: { en: 'Subtotal', ur: 'ذیلی کل' },
  tax: { en: 'Tax', ur: 'ٹیکس' },
  discount: { en: 'Discount', ur: 'رعایت' },
  total: { en: 'Total', ur: 'کل' },
  cash: { en: 'Cash', ur: 'نقد' },
  card: { en: 'Card', ur: 'کارڈ' },
  mobile: { en: 'Mobile', ur: 'موبائل' },
  checkout: { en: 'Checkout', ur: 'چیک آؤٹ' },
  scan_or_search: { en: 'Scan or search product', ur: 'اسکین یا مصنوعات تلاش کریں' },
  
  // Products
  product_name: { en: 'Product Name', ur: 'مصنوعات کا نام' },
  sku: { en: 'SKU', ur: 'کوڈ' },
  barcode: { en: 'Barcode', ur: 'بار کوڈ' },
  category: { en: 'Category', ur: 'زمرہ' },
  manufacturer: { en: 'Manufacturer', ur: 'بنانے والا' },
  price: { en: 'Price', ur: 'قیمت' },
  cost_price: { en: 'Cost Price', ur: 'لاگت قیمت' },
  unit_price: { en: 'Unit Price', ur: 'یونٹ قیمت' },
  stock: { en: 'Stock', ur: 'اسٹاک' },
  status: { en: 'Status', ur: 'حیثیت' },
  active: { en: 'Active', ur: 'فعال' },
  inactive: { en: 'Inactive', ur: 'غیر فعال' },
  
  // Customers
  customer_name: { en: 'Customer Name', ur: 'گاہک کا نام' },
  customer_code: { en: 'Customer Code', ur: 'گاہک کوڈ' },
  phone_number: { en: 'Phone Number', ur: 'فون نمبر' },
  address: { en: 'Address', ur: 'پتہ' },
  customer_type: { en: 'Customer Type', ur: 'گاہک کی قسم' },
  retail: { en: 'Retail', ur: 'خوردہ' },
  wholesale: { en: 'Wholesale', ur: 'تھوک' },
  credit_limit: { en: 'Credit Limit', ur: 'قرضہ کی حد' },
  current_balance: { en: 'Current Balance', ur: 'موجودہ بیلنس' },
  
  // Sales
  invoice_number: { en: 'Invoice Number', ur: 'انوائس نمبر' },
  invoice_date: { en: 'Invoice Date', ur: 'انوائس کی تاریخ' },
  payment_method: { en: 'Payment Method', ur: 'ادائیگی کا طریقہ' },
  amount: { en: 'Amount', ur: 'رقم' },
  
  // Dashboard
  todays_sales: { en: "Today's Sales", ur: 'آج کی فروخت' },
  total_products: { en: 'Total Products', ur: 'کل مصنوعات' },
  low_stock_items: { en: 'Low Stock Items', ur: 'کم اسٹاک آئٹمز' },
  near_expiry_items: { en: 'Near Expiry Items', ur: 'میعاد ختم ہونے والے' },
  
  // Batch
  batch_number: { en: 'Batch Number', ur: 'بیچ نمبر' },
  expiry_date: { en: 'Expiry Date', ur: 'میعاد ختم' },
  quantity: { en: 'Quantity', ur: 'مقدار' },
  
  // Reports
  daily_sales: { en: 'Daily Sales', ur: 'روزانہ فروخت' },
  sales_by_product: { en: 'Sales by Product', ur: 'مصنوعات کے لحاظ سے' },
  low_stock_report: { en: 'Low Stock Report', ur: 'کم اسٹاک رپورٹ' },
  near_expiry_report: { en: 'Near Expiry Report', ur: 'میعاد ختم رپورٹ' },
  stock_valuation: { en: 'Stock Valuation', ur: 'اسٹاک کی مالیت' },
  
  // Settings
  company_info: { en: 'Company Info', ur: 'کمپنی کی معلومات' },
  tax_currency: { en: 'Tax & Currency', ur: 'ٹیکس اور کرنسی' },
  inventory_settings: { en: 'Inventory', ur: 'انوینٹری' },
  receipt_settings: { en: 'Receipt', ur: 'رسید' },
  appearance: { en: 'Appearance', ur: 'ظاہری شکل' },
  language: { en: 'Language', ur: 'زبان' },
  
  // Theme
  light_mode: { en: 'Light Mode', ur: 'روشن موڈ' },
  dark_mode: { en: 'Dark Mode', ur: 'تاریک موڈ' },
  auto_mode: { en: 'Auto', ur: 'خودکار' },
  
  // Days
  days: { en: 'days', ur: 'دن' },
  today: { en: 'Today', ur: 'آج' },
  yesterday: { en: 'Yesterday', ur: 'کل' },
  
  // Time
  last_login: { en: 'Last Login', ur: 'آخری لاگ ان' },
  
  // Roles
  admin: { en: 'Admin', ur: 'ایڈمن' },
  manager: { en: 'Manager', ur: 'منیجر' },
  cashier: { en: 'Cashier', ur: 'کیشئر' },
  accountant: { en: 'Accountant', ur: 'اکاؤنٹنٹ' },
  
  // Messages
  success: { en: 'Success', ur: 'کامیابی' },
  error: { en: 'Error', ur: 'خرابی' },
  warning: { en: 'Warning', ur: 'انتباہ' },
  info: { en: 'Info', ur: 'معلومات' },
  
  // Units
  rs: { en: 'Rs', ur: 'روپے' },
  items: { en: 'items', ur: 'آئٹمز' },
  pcs: { en: 'pcs', ur: 'عدد' },
  
  // Phase 5: Suppliers
  supplier_name: { en: 'Supplier Name', ur: 'سپلائر کا نام' },
  supplier_code: { en: 'Supplier Code', ur: 'سپلائر کوڈ' },
  contact_person: { en: 'Contact Person', ur: 'رابطہ شخص' },
  email: { en: 'Email', ur: 'ای میل' },
  city: { en: 'City', ur: 'شہر' },
  country: { en: 'Country', ur: 'ملک' },
  payment_terms: { en: 'Payment Terms', ur: 'ادائیگی کی شرائط' },
  notes: { en: 'Notes', ur: 'نوٹس' },
  
  // Phase 5: Purchase Orders
  po_number: { en: 'PO Number', ur: 'پی او نمبر' },
  order_date: { en: 'Order Date', ur: 'آرڈر کی تاریخ' },
  expected_delivery: { en: 'Expected Delivery', ur: 'متوقع ترسیل' },
  supplier: { en: 'Supplier', ur: 'سپلائر' },
  draft: { en: 'Draft', ur: 'مسودہ' },
  sent: { en: 'Sent', ur: 'بھیج دیا' },
  partial: { en: 'Partial', ur: 'جزوی' },
  received: { en: 'Received', ur: 'وصول شدہ' },
  cancelled: { en: 'Cancelled', ur: 'منسوخ شدہ' },
  create_po: { en: 'Create Purchase Order', ur: 'خریداری آرڈر بنائیں' },
  receive_po: { en: 'Receive Order', ur: 'آرڈر وصول کریں' },
  quantity_ordered: { en: 'Qty Ordered', ur: 'مقدار آرڈر' },
  quantity_received: { en: 'Qty Received', ur: 'مقدار وصول' },
  unit_cost: { en: 'Unit Cost', ur: 'یونٹ لاگت' },
  shipping: { en: 'Shipping', ur: 'شپنگ' },
  
  // Phase 5: Stock Adjustments
  stock_adjustments: { en: 'Stock Adjustments', ur: 'اسٹاک ایڈجسٹمنٹ' },
  adjustment_number: { en: 'Adjustment #', ur: 'ایڈجسٹمنٹ نمبر' },
  adjustment_type: { en: 'Type', ur: 'قسم' },
  increase: { en: 'Increase', ur: 'اضافہ' },
  decrease: { en: 'Decrease', ur: 'کمی' },
  reason: { en: 'Reason', ur: 'وجہ' },
  damaged: { en: 'Damaged', ur: 'خراب' },
  expired: { en: 'Expired', ur: 'میعاد ختم' },
  stolen: { en: 'Stolen', ur: 'چوری' },
  lost: { en: 'Lost', ur: 'گم' },
  found: { en: 'Found', ur: 'ملا' },
  count_error: { en: 'Count Error', ur: 'گنتی کی غلطی' },
  return_to_supplier: { en: 'Return to Supplier', ur: 'سپلائر کو واپسی' },
  other: { en: 'Other', ur: 'دیگر' },
  pending: { en: 'Pending', ur: 'زیر التواء' },
  approved: { en: 'Approved', ur: 'منظور شدہ' },
  rejected: { en: 'Rejected', ur: 'مسترد' },
  approve: { en: 'Approve', ur: 'منظور کریں' },
  reject: { en: 'Reject', ur: 'مسترد کریں' },
  
  // Phase 5: Returns & Refunds
  sales_returns: { en: 'Sales Returns', ur: 'فروخت کی واپسی' },
  return_number: { en: 'Return #', ur: 'واپسی نمبر' },
  original_invoice: { en: 'Original Invoice', ur: 'اصل انوائس' },
  return_date: { en: 'Return Date', ur: 'واپسی کی تاریخ' },
  return_reason: { en: 'Return Reason', ur: 'واپسی کی وجہ' },
  defective: { en: 'Defective', ur: 'خراب' },
  wrong_item: { en: 'Wrong Item', ur: 'غلط آئٹم' },
  customer_changed_mind: { en: 'Changed Mind', ur: 'ارادہ بدلا' },
  duplicate_purchase: { en: 'Duplicate', ur: 'نقل' },
  refund_amount: { en: 'Refund Amount', ur: 'واپسی رقم' },
  refund_method: { en: 'Refund Method', ur: 'واپسی کا طریقہ' },
  credit_note: { en: 'Credit Note', ur: 'کریڈٹ نوٹ' },
  refunded: { en: 'Refunded', ur: 'واپس کیا' },
  process_return: { en: 'Process Return', ur: 'واپسی کریں' },
  restock: { en: 'Restock', ur: 'دوبارہ اسٹاک' },
}

export type TranslationKey = keyof typeof translations

// Urdu numerals mapping
const urduNumerals: { [key: string]: string } = {
  '0': '۰',
  '1': '۱',
  '2': '۲',
  '3': '۳',
  '4': '۴',
  '5': '۵',
  '6': '۶',
  '7': '۷',
  '8': '۸',
  '9': '۹',
}

export function useI18n() {
  const pick = (english: string, urdu: string): string => currentLanguage.value === 'en'
    ? english : currentLanguage.value === 'ur' ? urdu : `${english} / ${urdu}`

  const t = (key: TranslationKey): string => {
    const translation = translations[key]
    if (!translation) return key
    
    if (currentLanguage.value === 'en') {
      return translation.en
    } else if (currentLanguage.value === 'ur') {
      return translation.ur
    } else {
      // Mixed: show both
      return `${translation.en} / ${translation.ur}`
    }
  }

  const tEn = (key: TranslationKey): string => {
    return translations[key]?.en || key
  }

  const tUr = (key: TranslationKey): string => {
    return translations[key]?.ur || key
  }

  const formatNumber = (num: number | string): string => {
    const str = num.toString()
    if (numberFormat.value === 'ur') {
      return str.replace(/[0-9]/g, (digit) => urduNumerals[digit] || digit)
    }
    return str
  }

  const formatCurrency = (amount: number): string => {
    const formatted = amount.toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    
    if (numberFormat.value === 'ur') {
      const urduNumber = formatted.replace(/[0-9]/g, (digit) => urduNumerals[digit] || digit)
      return `${urduNumber} ${tUr('rs')}`
    }
    
    return `Rs ${formatted}`
  }

  const formatDate = (value: string | Date): string => {
    const date = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return String(value)
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const formatted = dateFormat.value === 'iso' ? `${year}-${month}-${day}`
      : dateFormat.value === 'mdy' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`
    return formatNumber(formatted)
  }

  const formatDateTime = (value: string | Date): string => {
    const date = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return String(value)
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return `${formatDate(date)} ${formatNumber(time)}`
  }

  const setLanguage = (lang: Language) => {
    currentLanguage.value = lang
    localStorage.setItem(STORAGE_KEY_LANG, lang)
  }

  const setNumberFormat = (format: NumberFormat) => {
    numberFormat.value = format
    localStorage.setItem(STORAGE_KEY_NUM, format)
  }

  const setDateFormat = (format: DateFormat) => {
    dateFormat.value = format
    localStorage.setItem(STORAGE_KEY_DATE, format)
  }

  const isRTL = computed(() => currentLanguage.value === 'ur')
  
  return {
    pick,
    t,
    tEn,
    tUr,
    formatNumber,
    formatCurrency,
    formatDate,
    formatDateTime,
    language: currentLanguage,
    numberFormat,
    dateFormat,
    setLanguage,
    setNumberFormat,
    setDateFormat,
    isRTL,
  }
}
