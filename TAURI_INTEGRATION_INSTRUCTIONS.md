# Tauri Integration Instructions

## Files Created:

1. ✅ `migrations/add_enhanced_purchase_receipt_fields.sql` - Database migration
2. ✅ `src-tauri/src/models/enhanced_purchase_receipt.rs` - Rust types
3. ✅ `src-tauri/src/commands/purchase_receive_enhanced.rs` - Backend commands
4. ✅ `src/views/PurchaseOrderReceiveView_ENHANCED.vue` - Frontend UI

## Integration Steps:

### Step 1: Add Module Declaration

**File**: `src-tauri/src/models/mod.rs`

Add this line:
```rust
pub mod enhanced_purchase_receipt;
```

### Step 2: Add Commands Module

**File**: `src-tauri/src/commands/mod.rs` (or create if doesn't exist)

Add this line:
```rust
pub mod purchase_receive_enhanced;
```

### Step 3: Register Commands in main.rs

**File**: `src-tauri/src/main.rs`

Add imports at the top:
```rust
mod models;
mod commands;

use commands::purchase_receive_enhanced::{
    receive_purchase_with_details,
    get_next_purchase_invoice_number,
    search_products_for_purchase,
};
```

Add commands to the invoke_handler:
```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // ... your existing commands ...
            receive_purchase_with_details,
            get_next_purchase_invoice_number,
            search_products_for_purchase,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 4: Run Database Migration

**Option A: Using SQL directly**
```bash
sqlite3 your_database.db < migrations/add_enhanced_purchase_receipt_fields.sql
```

**Option B: Using Tauri command (if you have migration system)**
```typescript
// In your Vue app
await invoke('run_migration', {
  sql: migrationSQL
});
```

**Option C: Create a migration function**

Add to your Rust backend:
```rust
#[tauri::command]
pub async fn run_enhanced_receipt_migration(
    db: State<'_, Mutex<Connection>>,
) -> Result<String, String> {
    let conn = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    let migration_sql = include_str!("../../migrations/add_enhanced_purchase_receipt_fields.sql");
    
    conn.execute_batch(migration_sql)
        .map_err(|e| format!("Migration error: {}", e))?;
    
    Ok("Migration completed successfully".to_string())
}
```

### Step 5: Update Frontend Route

**File**: `src/router/index.ts` (or your router file)

Update the purchase order receive route:
```typescript
{
  path: '/purchase-orders/:id/receive',
  name: 'purchase-receive',
  component: () => import('@/views/PurchaseOrderReceiveView_ENHANCED.vue'),
  meta: { requiresAuth: true }
}
```

OR rename the file:
```bash
mv src/views/PurchaseOrderReceiveView_ENHANCED.vue src/views/PurchaseOrderReceiveView.vue
```

### Step 6: Add TypeScript Types (Optional but Recommended)

**File**: `src/types/purchase-receipt.ts` (create new file)

```typescript
export interface ReceiveItemDetail {
  product_id: number;
  product_name: string;
  quantity: number;
  bonus_quantity: number;
  purchase_price: number;
  sale_price: number;
  discount_percent: number;
  discount_amount: number;
  advance_tax_percent: number;
  advance_tax_amount: number;
  line_total: number;
  margin_percent: number;
  batch_number: string;
  expiry_date: string;
}

export interface ReceivePurchaseRequest {
  poId: string;
  invoiceNumber: string;
  supplierBillNumber: string;
  paymentMethod: string;
  receiveDate: string;
  items: ReceiveItemDetail[];
  subtotal: number;
  invoiceDiscountPercent: number;
  invoiceDiscountAmount: number;
  invoiceAdvanceTaxPercent: number;
  invoiceAdvanceTaxAmount: number;
  netPayable: number;
  paymentAmount: number;
  balance: number;
  userId: number;
}
```

## Testing Checklist:

### 1. Database Migration
- [ ] Run migration SQL
- [ ] Verify new columns exist:
  ```sql
  PRAGMA table_info(purchase_receipts);
  PRAGMA table_info(purchase_receipt_items);
  ```

### 2. Backend Commands
- [ ] Build Tauri app: `npm run tauri build` or `npm run tauri dev`
- [ ] Check for compilation errors
- [ ] Verify commands are registered

### 3. Frontend Integration
- [ ] Navigate to receive page
- [ ] Check invoice number auto-generates
- [ ] Test product search
- [ ] Test adding items
- [ ] Test calculations
- [ ] Test saving

### 4. End-to-End Test
- [ ] Create a test purchase order
- [ ] Navigate to receive page
- [ ] Add items with:
  - Regular quantity
  - Bonus quantity
  - Discounts
  - Taxes
- [ ] Enter payment
- [ ] Save receipt
- [ ] Verify:
  - Receipt saved to database
  - Inventory updated (qty + bonus)
  - Batch records created
  - Payment recorded
  - PO status updated
  - Product prices updated

## Quick Start Commands:

```bash
# 1. Run database migration
sqlite3 path/to/your/database.db < migrations/add_enhanced_purchase_receipt_fields.sql

# 2. Build and run Tauri app
cd pharmacy-pos
npm run tauri dev

# 3. Test the new receive page
# Navigate to: /purchase-orders/{id}/receive
```

## Troubleshooting:

### Error: "command receive_purchase_with_details not found"
- Make sure command is registered in `main.rs`
- Rebuild Tauri app
- Check for compilation errors

### Error: "no such column: supplier_bill_number"
- Run the database migration
- Verify columns were added
- Restart the app

### Error: "Database lock error"
- Check database connection in State
- Ensure proper mutex handling
- Verify database file permissions

### Calculations not working
- Check browser console for errors
- Verify all number fields parse correctly
- Check for NaN or undefined values

## Additional Features to Add (Optional):

### 1. Print Purchase Receipt
```typescript
#[tauri::command]
pub async fn print_purchase_receipt(receipt_id: i64) -> Result<String, String> {
    // Generate printable receipt
    // Return HTML or PDF
}
```

### 2. Edit Existing Receipt
```typescript
#[tauri::command]
pub async fn update_purchase_receipt(receipt_id: i64, request: ReceivePurchaseRequest) -> Result<(), String> {
    // Update receipt
    // Adjust inventory accordingly
}
```

### 3. Delete/Void Receipt
```typescript
#[tauri::command]
pub async fn void_purchase_receipt(receipt_id: i64, user_id: i64) -> Result<(), String> {
    // Mark as voided
    // Reverse inventory changes
    // Reverse payment
}
```

### 4. Receipt History/Navigation
```typescript
#[tauri::command]
pub async fn get_purchase_receipts(
    limit: i64,
    offset: i64,
    filters: Option<ReceiptFilters>
) -> Result<Vec<PurchaseReceipt>, String> {
    // Get list of receipts
    // Support pagination
    // Support filtering
}
```

## Summary:

✅ Database migration created
✅ Rust types defined
✅ Backend commands implemented
✅ Frontend UI complete
⏳ Integration steps documented

Follow the steps above to complete the integration!
