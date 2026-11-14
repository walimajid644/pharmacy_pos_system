export interface PurchaseOrderFormData {
  supplier_id: string;
  order_date: string;
  expected_delivery_date: string;
  discount_amount: number;
  shipping_cost: number;
  notes: string;
}

export interface PurchaseOrderLine {
  id?: string;
  product_id: string;
  product_name?: string;
  quantity_ordered: number;
  unit_cost: number;
  tax_rate: number;
  discount_percent: number;
  line_total: number;
}
