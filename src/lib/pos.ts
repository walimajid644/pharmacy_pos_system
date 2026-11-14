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

export type PosProduct = Product & { batches: ProductBatch[] };
export function roundSaleMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}
