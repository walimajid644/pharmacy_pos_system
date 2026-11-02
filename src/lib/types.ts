export type UserRole = 'admin' | 'manager' | 'cashier' | 'accountant'

export interface User {
  id: string
  username: string
  full_name: string
  role: UserRole
  is_active: boolean
  last_login: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  must_change_password?: boolean
}

export interface Product {
  id: string
  sku: string
  name: string
  generic_name: string | null
  barcode: string | null
  category_id: string | null
  manufacturer_id: string | null
  unit_price: number
  wholesale_price?: number | null
  cost_price: number
  pack_size: number
  sell_by_loose_unit: boolean
  drap_registration_number: string | null
  controlled_substance: boolean
  reorder_level: number
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProductBatch {
  id: string
  product_id: string
  batch_number: string
  expiry_date: string
  quantity_in_stock: number
  loose_open_remaining: number
  cost_price_at_batch: number
  received_date: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Manufacturer {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Customer {
  id: string
  customer_code: string
  first_name: string
  last_name: string
  phone_number: string | null
  address: string | null
  customer_type: 'retail' | 'wholesale'
  credit_limit: number
  current_balance: number
  loyalty_points: number
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SalesInvoice {
  id: string
  invoice_number: string
  customer_id: string | null
  cashier_id: string
  invoice_date: string
  total_amount: number
  tax_amount: number
  discount_amount: number
  net_amount: number
  payment_method: string
  status: 'completed' | 'pending' | 'cancelled'
  notes: string | null
  received_amount?: number | null
  change_amount?: number | null
  previous_balance?: number | null
  created_at: string
  updated_at: string
}

export interface SalesInvoiceItem {
  id: string
  invoice_id: string
  product_id: string
  batch_id: string
  quantity: number
  sale_quantity?: number | null
  bonus_quantity?: number
  bonus_units?: number
  cost_price?: number | null
  is_loose_sale: boolean
  unit_price: number
  discount_percent: number
  line_total: number
  created_at: string
}

export interface StockMovement {
  id: string
  product_id: string
  batch_id: string
  movement_type: 'in' | 'out' | 'adjustment' | 'return'
  quantity: number
  reference_type: string | null
  reference_id: string | null
  reason: string | null
  user_id: string
  movement_date: string
  created_at: string
}

export interface AppSettings {
  id: string
  company_name: string
  company_address: string | null
  company_phone: string | null
  tax_rate: number
  currency_symbol: string
  theme: 'light' | 'dark'
  printer_config: string | null
  low_stock_threshold: number
  near_expiry_days: number
  receipt_header: string | null
  receipt_footer: string | null
  show_drap: number
  created_at: string
  updated_at: string
}

export interface CashierShift {
  id: string
  cashierId: string
  cashierName: string
  openedAt: string
  openingCashCents: number
  closedAt: string | null
  countedCashCents: number | null
  expectedCashCents: number | null
  varianceCents: number | null
  closedByName?: string | null
  notes?: string | null
  status: 'open' | 'closed'
}

// Cart item for POS
export interface CartItem {
  product: Product
  batch: ProductBatch
  quantity: number
  bonusQuantity: number
  isLooseSale: boolean
  discount: number
  confirmBreak: boolean
}

// =====================================================
// PHASE 5: Advanced Inventory Types
// =====================================================

// Suppliers
export interface Supplier {
  id: string
  supplier_code: string
  name: string
  contact_person: string | null
  phone_number: string | null
  email: string | null
  address: string | null
  city: string | null
  country: string
  tax_registration: string | null
  payment_terms: number
  credit_limit: number
  current_balance: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Purchase Orders
export type POStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string | null
  status: POStatus
  subtotal: number
  tax_amount: number
  discount_amount: number
  shipping_cost: number
  total_amount: number
  received_date: string | null
  received_by: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: string
  po_id: string
  product_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  tax_rate: number
  discount_percent: number
  line_total: number
  batch_number: string | null
  expiry_date: string | null
  notes: string | null
  created_at: string
}

// Stock Adjustments
export type AdjustmentType = 'increase' | 'decrease'
export type AdjustmentReason = 
  | 'damaged' 
  | 'expired' 
  | 'stolen' 
  | 'lost' 
  | 'found' 
  | 'count_error' 
  | 'return_to_supplier' 
  | 'other'
export type AdjustmentStatus = 'pending' | 'approved' | 'rejected'

export interface StockAdjustment {
  id: string
  adjustment_number: string
  adjustment_date: string
  adjustment_type: AdjustmentType
  reason: AdjustmentReason
  reason_notes: string | null
  total_value: number
  status: AdjustmentStatus
  approved_by: string | null
  approved_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface StockAdjustmentItem {
  id: string
  adjustment_id: string
  product_id: string
  batch_id: string
  quantity_adjusted: number
  unit_cost: number
  line_value: number
  notes: string | null
  created_at: string
}

// Sales Returns
export type ReturnReason = 
  | 'defective' 
  | 'wrong_item' 
  | 'expired' 
  | 'customer_changed_mind' 
  | 'duplicate_purchase' 
  | 'other'
export type RefundMethod = 'cash' | 'card' | 'credit_note'
export type ReturnStatus = 'pending' | 'approved' | 'refunded' | 'rejected'

export interface SalesReturn {
  id: string
  return_number: string
  original_invoice_id: string
  return_date: string
  return_reason: ReturnReason
  reason_notes: string | null
  subtotal: number
  tax_amount: number
  refund_amount: number
  refund_method: RefundMethod
  refund_reference: string | null
  status: ReturnStatus
  processed_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface SalesReturnItem {
  id: string
  return_id: string
  invoice_item_id: string
  product_id: string
  batch_id: string
  quantity_returned: number
  unit_price: number
  line_total: number
  restock: boolean
  notes: string | null
  created_at: string
}
