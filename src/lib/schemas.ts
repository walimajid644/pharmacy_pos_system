import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  generic_name: z.string().nullable(),
  barcode: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  manufacturer_id: z.string().uuid().nullable(),
  unit_price: z.number().min(0, 'Price must be positive'),
  cost_price: z.number().min(0, 'Cost must be positive'),
  pack_size: z.number().int().min(1, 'Pack size must be at least 1'),
  sell_by_loose_unit: z.boolean(),
  drap_registration_number: z.string().nullable(),
  controlled_substance: z.boolean(),
  reorder_level: z.number().int().min(0),
  is_active: z.boolean(),
})

export const productBatchSchema = z.object({
  product_id: z.string().uuid(),
  batch_number: z.string().min(1, 'Batch number is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
  quantity_in_stock: z.number().int().min(0),
  cost_price_at_batch: z.number().min(0),
  received_date: z.string(),
})

export const customerSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone_number: z.string().nullable(),
  address: z.string().nullable(),
  customer_type: z.enum(['retail', 'wholesale']),
  credit_limit: z.number().min(0),
  is_active: z.boolean(),
})

export const settingsSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  company_address: z.string().nullable(),
  company_phone: z.string().nullable(),
  tax_rate: z.number().min(0).max(100, 'Tax rate must be between 0 and 100'),
  theme: z.enum(['light', 'dark']),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ProductInput = z.infer<typeof productSchema>
export type ProductBatchInput = z.infer<typeof productBatchSchema>
export type CustomerInput = z.infer<typeof customerSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
