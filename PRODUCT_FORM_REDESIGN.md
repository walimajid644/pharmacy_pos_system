# Product Form Dialog Redesign

## Overview
Redesigned the `ProductFormDialog.vue` component to match the compact, efficient UX shown in the reference screenshot while maintaining our universal styling system. **Added automatic price calculation with 15% markup.**

## Changes Made

### 1. **ProductFormDialog.vue** - Complete Layout Overhaul
The modal now features a **registration-style layout** inspired by the screenshot:

#### Automatic Price Calculation ⚡
**Bidirectional 15% markup calculation:**
- Enter **Purchase Price** → automatically calculates **Sale Price** (cost + 15%)
- Enter **Sale Price** → automatically calculates **Purchase Price** (sale ÷ 1.15)
- Rounds to 2 decimal places automatically
- Works in real-time as you type

**Example:**
- Purchase Price: 100.00 → Sale Price: 115.00 (auto-calculated)
- Sale Price: 230.00 → Purchase Price: 200.00 (auto-calculated)

#### Header Section
- Added **Registration Date** field in the top-right corner
- Title on left, date picker on right
- Uses compact panel background

#### ITEM INFORMATION Section
**Two-column split layout:**

**Left Column** (identification fields):
- Category (dropdown)
- Company/Manufacturer (dropdown)
- DRAP Registration
- Code/SKU
- Description/Name *

**Right Column** (location + barcode):
- Shelf/Location field
- **Large barcode display box** showing current barcode value prominently
- Barcode input field below display

#### ITEM OPTIONAL INFO Section
**Horizontal grid layout:**
- For/Generic Name (span 2 cols)
- Remarks (span 2 cols)
- UOM dropdown (BOX, STRIP, UNIT, BOTTLE)
- UOM Detail (pack size numeric)
- Pack Type (e.g., "20s")

#### PRICING & STOCK Section
**Four-column group layout:**

1. **Sale Price**
   - Unit Price
   - Wholesale Price

2. **Purchase Price**
   - Unit Price (cost)
   - Ext Disc % (additional discount)

3. **Stock Levels**
   - STM Level (Pack)
   - Re-Order Level (Pack)

4. **Current Stock** (read-only display)
   - In Loose (calculated)
   - In Packs (calculated)

#### Flags/Checkboxes Section
- Active
- Maintain Batch #
- Fridge Item
- Narcotic Item (controlled substance)
- Sell by Loose Unit

### 2. **productForm.ts** - Extended Type Definition
Added new optional fields to `ProductFormData`:

**Extended UI fields (not yet persisted):**
- `shelf_location`: string
- `remarks`: string
- `uom`: string (default: 'box')
- `pack_type`: string
- `ext_disc_percent`: number
- `stm_level`: number
- `maintain_batch`: boolean
- `fridge_item`: boolean
- `registration_date`: string

**Read-only display:**
- `stock_in_loose`: number
- `stock_in_packs`: number

### 3. **useProductCatalog.ts** - Stock Calculation
Updated `openEditModal()` to calculate and populate stock display:
```typescript
const currentStock = productStocks.value.get(product.id) || 0;
const stockInPacks = Math.floor(currentStock / product.pack_size);
const stockInLoose = currentStock % product.pack_size;
```

## Styling Approach

### Maintained Universal Styling
- Uses existing `compact-dialog` class system
- Inherits all compact-operational.css rules
- Respects theme variables and color tokens

### New Scoped Styles
Added minimal scoped styles for the new layout patterns:

- `.p-section-label` - uppercase section headers
- `.p-item-info-grid` - two-column split with divider
- `.p-field-row` - inline label + control pairs
- `.p-barcode-box` - prominent barcode display card
- `.p-optional-grid` - 4-column form grid
- `.p-pricing-row` - 4-column group layout with dividers
- `.p-price-group` - vertical field groups
- `.p-flags-row` - horizontal checkbox layout

All measurements use compact dimensions (11px text, 26px buttons, 3-8px gaps).

## Database Impact

**No database changes required** for the redesigned UI to function. The new extended fields are:
- Optional in the form model
- Not included in save operations
- Can be added to the schema later without breaking existing functionality

Current `saveProduct()` logic only persists the original fields, so the form compiles and saves successfully.

## Benefits

✅ **More compact** - fits more information in less vertical space
✅ **Better organization** - logical grouping by purpose
✅ **Clearer pricing** - side-by-side sale vs purchase
✅ **Auto-pricing** - 15% markup calculated automatically both ways
✅ **Prominent barcode** - large display for scanning verification
✅ **Stock visibility** - current stock shown at-a-glance
✅ **Progressive enhancement** - new fields ready for future DB migration

## Testing Recommendations

1. **Visual verification:**
   - Open Products view
   - Click "Add Product"
   - Verify layout matches screenshot reference
   - Check in both light/dark themes

2. **Functional testing:**
   - Add new product with core fields only
   - Edit existing product - verify stock calculations
   - Save and verify no errors
   - Confirm existing products still load correctly

3. **Price calculation testing:**
   - Enter Purchase Price: 100 → verify Sale Price becomes 115
   - Clear both fields
   - Enter Sale Price: 230 → verify Purchase Price becomes 200
   - Test with various amounts (decimals, whole numbers)
   - Verify rounding to 2 decimal places

4. **Responsive check:**
   - Test on smaller screens
   - Verify dialog remains readable

## Next Steps (Optional)

If you want to persist the new fields:

1. Add columns to `products` table:
   - `shelf_location TEXT`
   - `remarks TEXT`
   - `uom TEXT DEFAULT 'box'`
   - `pack_type TEXT`
   - `ext_disc_percent REAL DEFAULT 0`
   - `stm_level INTEGER DEFAULT 0`
   - `maintain_batch INTEGER DEFAULT 0`
   - `fridge_item INTEGER DEFAULT 0`
   - `registration_date TEXT`

2. Update `saveProduct()` in `useProductCatalog.ts` to include new fields in INSERT/UPDATE

3. Update `openEditModal()` to load persisted values from the database

---

**Status:** ✅ Ready to test  
**Breaking changes:** None  
**Backwards compatible:** Yes
