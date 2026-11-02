# POS Search Optimization - Test Plan

## Quick Validation Checklist

Test these scenarios to confirm the optimization works correctly:

### ✅ Core Search & Add Functionality

#### Test 1: Barcode Scanner (Instant Search)
1. Use barcode scanner on a product
2. **Expected**: Results appear instantly (no visible delay)
3. **Expected**: Exact match is highlighted
4. Press Enter
5. **Expected**: Item added to cart immediately
6. **Timing**: Total time scan→cart should be ~150ms

#### Test 2: Manual Barcode Entry (Instant Search)
1. Type a complete barcode: `ABC123456`
2. **Expected**: Search starts immediately (no 150ms wait)
3. **Expected**: Exact match highlighted if found
4. Press Enter
5. **Expected**: Item added to cart
6. **Note**: Must be 6+ alphanumeric chars for instant search

#### Test 3: Partial Name Search (Debounced)
1. Type partial product name slowly: `para` (pause between letters)
2. **Expected**: No search until you stop typing for 150ms
3. **Expected**: Results appear after debounce
4. Use arrow keys to highlight desired product
5. Press Enter
6. **Expected**: Highlighted item added immediately

#### Test 4: Enter on Highlighted Result (Fast Path)
1. Search for any product (type or scan)
2. Wait for results to appear
3. Use ↓ or ↑ to highlight a different product
4. Press Enter
5. **Expected**: Highlighted product added instantly (no additional search)
6. **Expected**: No network delay

### ✅ Keyboard Navigation

#### Test 5: Arrow Key Navigation
1. Search for a product with multiple results
2. Press ↓ repeatedly
3. **Expected**: Highlight moves down through results
4. **Expected**: Highlighted row scrolls into view automatically
5. Press ↑ repeatedly
6. **Expected**: Highlight moves up through results
7. **Expected**: Wraps around at top/bottom

#### Test 6: Shift+Enter for Loose Units
1. Search for a product that allows loose units
2. Highlight the product
3. Press Shift+Enter
4. **Expected**: Loose unit added to cart (not pack)
5. **Expected**: Cart line shows "Loose unit" badge

### ✅ Edge Cases

#### Test 7: Multiple Products with Similar Names
1. Type partial text that matches multiple products: `para`
2. **Expected**: Multiple results shown
3. **Expected**: First result highlighted by default
4. Use arrows to select different item
5. Press Enter
6. **Expected**: Selected item added (not first item)

#### Test 8: Exact Barcode Auto-Highlight
1. Type an exact barcode that exists
2. **Expected**: Product with matching barcode is auto-highlighted
3. **Expected**: Other results (if any) shown but not highlighted
4. Press Enter without using arrows
5. **Expected**: Barcode-matched product added

#### Test 9: Short Barcode (< 6 chars)
1. Type a short barcode: `AB123`
2. **Expected**: Still uses 150ms debounce (not instant)
3. **Expected**: Functions normally after debounce
4. Press Enter
5. **Expected**: Result added correctly

#### Test 10: Special Characters in Search
1. Type product name with spaces: `tab para`
2. **Expected**: Uses debounced search
3. Type barcode with dash: `ABC-123-456`
4. **Expected**: Uses instant search (dashes allowed)
5. Both should work correctly

### ✅ Pack vs Loose Selection

#### Test 11: Pack Selection
1. Search for any product
2. Press Enter (no Shift)
3. **Expected**: Full pack added to cart
4. **Expected**: Quantity shows 1 pack
5. **Expected**: Badge shows "Pack · X units"

#### Test 12: Loose Unit Validation
1. Search for product that DOESN'T allow loose units
2. Press Shift+Enter
3. **Expected**: Warning toast appears
4. **Expected**: Nothing added to cart
5. Cart should remain unchanged

#### Test 13: Strip Breaking Confirmation
1. Search for product with loose units enabled
2. Add loose unit when no open strips exist
3. **Expected**: Confirmation dialog appears
4. Click OK
5. **Expected**: Item added with "Strip opening confirmed" badge

### ✅ Batch & Expiry Handling

#### Test 14: Expired Batch
1. Search for product with only expired batch
2. Press Enter
3. **Expected**: Warning toast: "Cannot sell expired product"
4. **Expected**: Nothing added to cart

#### Test 15: Low Stock Warning
1. Search for product near reorder level
2. **Expected**: Orange "low" stock pill shown in results
3. Press Enter
4. **Expected**: Item still adds (warning is informational)

#### Test 16: Near Expiry Warning
1. Search for product with batch expiring soon
2. **Expected**: Yellow "Near Expiry" pill shown
3. Press Enter
4. **Expected**: Item adds successfully
5. **Expected**: Expiry date highlighted in cart line

### ✅ Performance Validation

#### Test 17: Rapid Scanning
1. Scan 5 different products rapidly (one after another)
2. **Expected**: All items added to cart
3. **Expected**: No items skipped or duplicated
4. **Expected**: No race conditions or errors

#### Test 18: Type-Ahead During Search
1. Start typing a product name
2. Before results appear, continue typing
3. **Expected**: Old search cancelled
4. **Expected**: New search with full query executed
5. **Expected**: Correct results shown

#### Test 19: Escape During Search
1. Start typing a search query
2. Before results appear, press Escape
3. **Expected**: Search cancelled
4. **Expected**: Input cleared
5. **Expected**: No results shown

### ✅ Regression Tests

#### Test 20: Customer Selection Still Works
1. Press F3 or click customer field
2. Type customer name
3. Use arrows and Enter to select
4. **Expected**: Customer selection unaffected by search optimization

#### Test 21: Payment Shortcuts Still Work
1. Add items to cart
2. Press F8, F9, F10
3. **Expected**: Payment methods change correctly
4. Press Ctrl+Enter
5. **Expected**: Checkout proceeds normally

#### Test 22: Focus Management
1. Add item to cart
2. **Expected**: Focus returns to search input
3. Type immediately without clicking
4. **Expected**: Search works without needing to click first

## Performance Metrics

Record these timings (use browser DevTools Performance tab):

| Scenario | Target | Measured | Pass? |
|----------|--------|----------|-------|
| Barcode scan → add | < 200ms | | |
| Type barcode → Enter | < 200ms | | |
| Highlight → Enter | < 50ms | | |
| Arrow key response | < 16ms | | |
| Partial search debounce | 150ms | | |

## Browser Compatibility

Test in these environments:

- [ ] Chrome/Edge (primary target)
- [ ] Firefox
- [ ] Safari (if applicable)
- [ ] Tauri webview (production environment)

## Accessibility Check

- [ ] Screen reader announces search results count
- [ ] Screen reader announces highlighted item
- [ ] Keyboard-only workflow works completely
- [ ] Focus indicators visible
- [ ] ARIA labels present and accurate

## Sign-Off

- [ ] All core tests pass
- [ ] No regressions found
- [ ] Performance targets met
- [ ] Edge cases handled correctly
- [ ] Batch/expiry logic intact
- [ ] Ready for production

**Tested by**: _______________  
**Date**: _______________  
**Environment**: _______________  
**Notes**: _______________
