use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivePurchaseRequest {
    #[serde(default)]
    pub po_id: String,
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub submission_id: Option<String>,
    pub invoice_number: String,
    pub supplier_bill_number: String,
    pub payment_method: String,
    pub items: Vec<ReceiveItemDetail>,
    pub invoice_discount_percent: f64,
    pub invoice_advance_tax_percent: f64,
    pub payment_amount: f64,
    #[serde(default)]
    pub invoice_discount_flat: f64,
    #[serde(default)]
    pub receive_date: Option<String>,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveItemDetail {
    pub po_item_id: String,
    pub product_id: String,
    pub quantity: i64,
    pub bonus_quantity: i64,
    pub unit_cost: f64,
    pub sale_price: f64,
    pub discount_percent: f64,
    pub advance_tax_percent: f64,
    pub batch_number: String,
    pub expiry_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseReceiptResponse {
    pub id: String,
    pub invoice_number: String,
    pub net_payable: f64,
    pub balance: f64,
}
