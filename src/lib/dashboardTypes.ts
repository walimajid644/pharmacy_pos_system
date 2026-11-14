export interface RecentBill {
  id: string;
  invoice_number: string;
  invoice_date: string;
  net_amount: number;
  payment_method: string;
  customer_name: string | null;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  current_stock: number;
  reorder_level: number;
}

export interface NearExpiryItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  quantity_in_stock: number;
}

export type AlertTab = 'lowStock' | 'nearExpiry';
