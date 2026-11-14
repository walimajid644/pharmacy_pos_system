export interface DailySalesRow {
  sale_date: string;
  invoice_count: number;
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  mobile_sales: number;
}

export interface ProductSalesRow {
  product_name: string;
  sku: string;
  total_quantity: number;
  invoice_count: number;
  total_sales: number;
}

export interface LowStockRow {
  product_name: string;
  sku: string;
  current_stock: number;
  reorder_level: number;
  stock_value: number;
}

export interface NearExpiryRow {
  batch_id: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  days_until_expiry: number;
  quantity_in_stock: number;
  quarantined_stock: number;
  batch_value: number;
}

export interface StockValuationRow {
  product_name: string;
  sku: string;
  total_stock: number;
  quarantined_stock: number;
  cost_value: number;
  retail_value: number;
  potential_profit: number;
}
