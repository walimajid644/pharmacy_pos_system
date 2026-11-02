# POS Terminal - Quick Guide for Cashiers

**Fast reference for daily pharmacy sales**

---

## Starting Your Shift

1. Login with your username and password
2. Open cash drawer: **Shifts** menu → **Open Shift**
3. Enter your starting cash amount
4. Click **Open Shift** to begin

---

## Making a Sale

### 1. Search for Product

**With Barcode Scanner:**
- Scan barcode → Press Enter (or scanner auto-enters)
- Item added to cart instantly

**With Keyboard:**
- Type barcode or product name
- Use ↓ ↑ arrows to select
- Press Enter to add

**Tips:**
- Exact barcode = auto-highlighted
- Enter = full pack
- Shift+Enter = loose unit (if allowed)

### 2. Adjust Quantities

- Click in quantity field
- Type new number
- Press Enter or click outside

### 3. Add Discounts (if authorized)

- Type percentage in "Disc %" column
- OR type amount in "Disc Rs" column

### 4. Select Customer (optional)

**Walk-in Sale:**
- Leave customer field empty or select "Walk-in"

**Registered Customer:**
- Press F3 or click customer field
- Type name, phone, or code
- Use arrows to select
- Press Enter

### 5. Choose Payment Method

Press function key or click button:
- **F8** = Cash
- **F9** = Card
- **F10** = Mobile/JazzCash

**For Cash:**
- Enter amount received
- Change calculated automatically

**For Credit (Udhar):**
- Customer must be registered
- Credit limit checked automatically

### 6. Complete Sale

- Press **Ctrl+Enter** or click **Complete Sale**
- Receipt prints automatically (if printer configured)

---

## Common Tasks

### Remove Item from Cart
- Click **×** button on the line

### Clear Entire Cart
- Remove items one by one
- OR logout/login (unsaved cart cleared)

### Print Last Receipt Again
Click **Reprint last** button at top of screen

### Switch Languages
- Click 🌐 icon in header
- Choose: English / اردو / Mixed

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F2 | Focus product search |
| F3 | Select customer |
| F8 | Cash payment |
| F9 | Card payment |
| F10 | Mobile payment |
| Ctrl+Enter | Complete sale |
| Enter | Add pack to cart |
| Shift+Enter | Add loose unit |
| ↑ ↓ | Navigate search results |
| Esc | Clear search |

---

## Important Messages

### ⚠️ "Open your cash drawer shift before selling"
**Fix:** Go to Shifts menu and open your shift

### ⚠️ "No stock available for this product"
**Fix:** Receive purchase order or check product batches

### ⚠️ "Cannot sell expired product"
**Fix:** Remove expired batch or choose different product

### ⚠️ "Quantity exceeds batch stock"
**Fix:** Reduce quantity or check available stock

### ⚠️ "Open a strip from batch...?"
**Info:** Confirms you want to break a sealed strip for loose sale
- Click OK to proceed (logged on invoice)
- Click Cancel to abort

### ⚠️ "Credit limit exceeded"
**Fix:** 
- Collect cash payment instead
- OR ask manager to increase customer limit

### ⚠️ "Cash received must cover the sale total"
**Fix:** Enter amount equal to or greater than total

---

## Prescription Sales

For prescription items:

1. Add items to cart as normal
2. Before checkout, fill:
   - **Patient Name** (optional)
   - **Prescribing Doctor** (optional)
3. Both appear on printed receipt

---

## End of Shift

1. Count your cash drawer
2. Go to **Shifts** menu
3. Click **Close Shift**
4. Enter counted amount
5. System shows difference (if any)
6. Confirm to close

---

## Screen Layout

```
┌─────────────────────────────────────────────────────┐
│ [Logo] Pharmacy Name        [Date]  [Shift Status]  │ Header
├─────────────────────────────────────────────────────┤
│ Customer: [___]  Item/Barcode: [___________]        │ Entry
├─────────────────────────────────────────────────────┤
│ # │ Description │ Batch │ Qty │ Price │ Total │ ×  │ Cart
│───┼─────────────┼───────┼─────┼───────┼───────┼───│ Table
│ 1 │ Panadol Tab │ B001  │ 2   │ 10.00 │ 20.00 │ × │
├─────────────────────────────────────────────────────┤
│ Items: 1  Gross: 20.00  Tax: 3.00  Total: 23.00   │ Summary
└─────────────────────────────────────────────────────┘

Right Panel:
┌─────────────────┐
│ Payment         │
│ ☑ Cash  ☐ Card │
│ ☐ Mobile        │
│                 │
│ Received: [___] │
│ Change: 0.00    │
│                 │
│ [Complete Sale] │
└─────────────────┘
```

---

## Tips for Speed

1. **Use barcode scanner** - Fastest method
2. **Learn shortcuts** - F8, F9, Ctrl+Enter
3. **Keep common items stocked** - Reduce search time
4. **Use customer codes** - Faster than typing full names
5. **Check totals before finalizing** - Avoid voids/returns

---

## Getting Help

**See full documentation:**
- `POS_KEYBOARD_REFERENCE.md` - All shortcuts
- `PHARMACY_OPERATIONS.md` - Complete procedures
- `QUICK_START_GUIDE.md` - System setup

**Common issues:**
- Printer not working → Check Settings → Printing
- Scanner not working → Check USB connection
- Forgot password → Ask manager to reset

---

## Daily Checklist

**Morning:**
- [ ] Login to system
- [ ] Open cash shift with starting float
- [ ] Check printer has paper/ribbon
- [ ] Verify scanner works

**During Day:**
- [ ] Print receipts for all sales
- [ ] Record prescriptions for controlled items
- [ ] Check stock alerts
- [ ] Keep workspace organized

**Evening:**
- [ ] Complete pending sales
- [ ] Count cash drawer
- [ ] Close shift
- [ ] Logout

---

**Remember:** The POS system tracks all actions. Always complete sales properly and close your shift at end of day.

**Version:** 0.1.0 Release Candidate  
**Last Updated:** November 1, 2026
