import type { Product, ProductBatch } from '@/lib/types';

export type SaleReceipt = {
  invoiceId: string;
  invoiceNumber: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  receivedAmount: number;
  changeAmount: number;
};

export type CustomerOption = {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  current_balance: number;
  credit_limit: number;
  customer_type: 'retail' | 'wholesale';
};

export type PosProduct = Product & { batches: ProductBatch[]; recordedStock?: number };
export function roundSaleMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

// A stock ledger entry for sales before a physical batch has been recorded.
export function unallocatedStockBatch(product: Product): ProductBatch {
  return {
    id: `unallocated-stock:${product.id}`,
    product_id: product.id,
    batch_number: 'Unallocated stock',
    expiry_date: '',
    quantity_in_stock: 0,
    loose_open_remaining: 0,
    cost_price_at_batch: product.cost_price,
    received_date: '',
    created_at: '',
    updated_at: '',
  };
}
export function isUnallocatedStockBatch(batch: ProductBatch) {
  return batch.id === `unallocated-stock:${batch.product_id}`;
}
