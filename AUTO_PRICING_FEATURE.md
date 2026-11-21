# 🔄 Automatic Price Calculation Feature

## Overview
The Product Form now includes **bidirectional automatic price calculation** with a 15% markup between purchase and sale prices.

## How It Works

### Purchase → Sale Price
When you enter a **Purchase Price (Cost)**, the system automatically calculates the **Sale Price** with 15% markup:

```
Sale Price = Purchase Price × 1.15
```

**Examples:**
- Purchase: **100.00** → Sale: **115.00** ✅
- Purchase: **200.00** → Sale: **230.00** ✅
- Purchase: **45.50** → Sale: **52.33** ✅
- Purchase: **1000.00** → Sale: **1150.00** ✅

### Sale → Purchase Price
When you enter a **Sale Price**, the system automatically calculates the **Purchase Price** by reversing the 15% markup:

```
Purchase Price = Sale Price ÷ 1.15
```

**Examples:**
- Sale: **115.00** → Purchase: **100.00** ✅
- Sale: **230.00** → Purchase: **200.00** ✅
- Sale: **52.33** → Purchase: **45.50** ✅
- Sale: **1150.00** → Purchase: **1000.00** ✅

## Features

✅ **Real-time calculation** - Updates as you type
✅ **Bidirectional** - Works both ways (cost→sale or sale→cost)
✅ **Automatic rounding** - Always rounds to 2 decimal places
✅ **Smart validation** - Only calculates when value is positive and valid
✅ **Non-destructive** - You can still manually override either field

## User Workflow

### Adding a New Product

**Option 1: Starting with Cost Price**
1. Fill in product details (SKU, Name, etc.)
2. Enter **Purchase Price (Cost)**: `85.00`
3. **Sale Price** auto-fills: `97.75` ✨
4. (Optional) Adjust either price manually if needed
5. Click Save

**Option 2: Starting with Sale Price**
1. Fill in product details
2. Enter **Sale Price**: `299.00`
3. **Purchase Price** auto-fills: `260.00` ✨
4. (Optional) Adjust either price manually if needed
5. Click Save

### Editing Existing Product
- When you open an existing product, both prices show their saved values
- Change either price to recalculate the other
- Original prices remain if you don't modify them

## Technical Details

### Implementation
Located in: `src/components/products/ProductFormDialog.vue`

**Uses Vue `watch` API for reliable reactivity:**

```typescript
// 15% markup constant
const MARKUP_PERCENT = 15;
const isCalculating = ref(false); // Prevent circular updates

// Watch cost price changes → update sale price
watch(
  () => formData.value.cost_price,
  (newCost, oldCost) => {
    if (isCalculating.value) return; // Prevent circular updates
    if (newCost === oldCost) return; // Skip if no change
    
    const cost = Number(newCost);
    if (cost > 0 && Number.isFinite(cost)) {
      isCalculating.value = true;
      const salePrice = cost * (1 + MARKUP_PERCENT / 100);
      formData.value.unit_price = Math.round(salePrice * 100) / 100;
      isCalculating.value = false;
    }
  }
);

// Watch sale price changes → update cost price
watch(
  () => formData.value.unit_price,
  (newSale, oldSale) => {
    if (isCalculating.value) return; // Prevent circular updates
    if (newSale === oldSale) return; // Skip if no change
    
    const sale = Number(newSale);
    if (sale > 0 && Number.isFinite(sale)) {
      isCalculating.value = true;
      const costPrice = sale / (1 + MARKUP_PERCENT / 100);
      formData.value.cost_price = Math.round(costPrice * 100) / 100;
      isCalculating.value = false;
    }
  }
);
```

**Why watchers instead of @input events?**
- Watchers trigger **after** `v-model.number` converts the string to a number
- `@input` fires **during** typing, before proper conversion
- Prevents incorrect calculations from partial string values
- `isCalculating` flag prevents infinite loops between the two watchers

## Customization

To change the markup percentage, simply modify the constant:

```typescript
const MARKUP_PERCENT = 15; // Change to 20 for 20% markup, etc.
```

## Business Logic

**Why 15%?**
- Standard pharmacy markup for retail products
- Covers operational costs while remaining competitive
- Typical industry standard in Pakistan

**Markup Formula:**
- **Markup %** = ((Sale Price - Cost Price) / Cost Price) × 100
- **15% example**: ((115 - 100) / 100) × 100 = 15%

## Benefits for Operators

✅ **Faster data entry** - No manual calculator needed
✅ **Consistent pricing** - Always applies the same markup
✅ **Reduced errors** - No manual calculation mistakes
✅ **Flexible** - Can override if special pricing needed
✅ **Transparent** - Can see both cost and sale instantly

## Future Enhancements (Optional)

- [ ] Add configurable markup % in settings
- [ ] Support different markup tiers (retail vs wholesale)
- [ ] Show calculated margin % in real-time
- [ ] Bulk price update with adjustable markup
- [ ] Category-specific markup percentages

---

**Status:** ✅ Implemented and ready to test  
**Version:** 1.0  
**Last Updated:** November 21, 2026
