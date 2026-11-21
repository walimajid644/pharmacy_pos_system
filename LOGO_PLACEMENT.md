# Logo Placement on Receipt

## Exact Position: AT THE VERY TOP ⬆️

The pharmacy logo will be placed at the **absolute top** of the receipt, above everything else.

## Receipt Structure (Top to Bottom)

```
┌────────────────────────────────────────┐
│                                        │
│  ╔════════════════════════════════╗   │ ⬅️ 1. LOGO HERE (if path set)
│  ║          [LOGO]                ║   │    AT THE VERY TOP
│  ║       path/to/logo.png         ║   │    Centered, in a box
│  ╚════════════════════════════════╝   │
│                                        │
│       City Medical Pharmacy            │ ⬅️ 2. Company Name
│     123 Main Street, Karachi           │ ⬅️ 3. Company Address
│        Phone: 021-1234567              │ ⬅️ 4. Company Phone
│                                        │
│      Welcome to City Pharmacy          │ ⬅️ 5. Custom Header (optional)
│     Your Health, Our Priority          │
│                                        │
│  ─────────────────────────────────────│
│                                        │
│  21-Nov-2026  01:22 PM         ADMIN  │ ⬅️ 6. Date/Time & Cashier
│  Payment Mode: Cash                    │ ⬅️ 7. Payment Mode
│                                        │
│         BILL/CASH MEMO                 │ ⬅️ 8. Section Title
│                                        │
│  Inv #: 55046                          │ ⬅️ 9. Invoice Number
│                                        │
│  Client Name:                          │ ⬅️ 10. Client Info
│  Walk-in Customer                      │
│                                        │
│  ITEM NAME       QTY   RATE      AMT  │ ⬅️ 11. Items Table
│  ─────────────────────────────────────│
│  HUMULIN 70/30    1   1663.00  1663.00│
│  TREVIAMET...    30     32.50   975.00│
│  TAB                                   │
│  [... more items ...]                  │
│  ───��─────────────────────────────────│
│                                        │
│  Items 7            Gross: 6,713.50   │ ⬅️ 12. Summary
│  ─────────────────────────────────────│
│                                        │
│          THANK YOU                     │ ⬅️ 13. Thank You
│       for Visiting us.                 │
│                                        │
│                  Total:      6714      │ ⬅️ 14. Total
│                                        │
│  ─────────────────────────────────────│
│                                        │
│  Thank you for your business!          │ ⬅️ 15. Custom Footer (optional)
│  Exchange policy: 7 days with receipt  │
│                                        │
│  Please ensure that medicines and...   │ ⬅️ 16. Disclaimer
│  [disclaimer text]                     │
│                                        │
│  Developed By IBS: (0304-5117454)     │ ⬅️ 17. Developer Credit
│                                        │
└────────────────────────────────────────┘
```

## Logo Details

### Position
- **Location**: Very first element, at the absolute top
- **Alignment**: Centered
- **Spacing**: 2mm padding, 2mm bottom margin
- **Border**: Dashed border (placeholder only)

### Size (Current Placeholder)
- **Width**: Full receipt width (72mm)
- **Height**: Auto (adjusts to content)
- **Text**: "[LOGO]" in gray
- **Note**: Shows file path below

### In the Future (Actual Logo)
- Will display actual image from the path
- Recommended size: 200-300px wide
- Will auto-scale to fit thermal printer width
- Centered on receipt

## Visual Example

### With Logo Path Set:
```
┌──────────────────────────────┐
│ ╔══════════════════════════╗ │ ← Logo box appears
│ ║        [LOGO]            ║ │
│ ║    ./assets/logo.png     ║ │
│ ╚══════════════════════════╝ │
│                              │
│   City Medical Pharmacy      │
│   123 Main Street            │
│   ...rest of receipt...      │
```

### Without Logo Path:
```
┌──────────────────────────────┐
│                              │ ← No logo box
│   City Medical Pharmacy      │ ← Starts with company name
│   123 Main Street            │
│   ...rest of receipt...      │
```

## How It Works

1. **Logo Field in Settings**
   - Located: Settings → Receipt → "Pharmacy Logo (Optional)"
   - Enter path: e.g., `./assets/logo.png`

2. **Preview Display**
   - Shows `[LOGO]` placeholder box at top
   - Displays the file path you entered
   - Appears above company name

3. **Printed Receipt**
   - Logo section prints at the very top (if path is set)
   - Currently shows placeholder
   - Future: Will show actual image

## Order of Appearance (Top to Bottom)

| # | Element | Required | Position |
|---|---------|----------|----------|
| 1 | **LOGO** | Optional | **Very Top** ⬆️ |
| 2 | Company Name | Yes | Below logo |
| 3 | Company Address | Optional | Below name |
| 4 | Company Phone | Optional | Below address |
| 5 | Custom Header | Optional | Below company info |
| 6 | Divider Line | Yes | --- |
| 7 | Date/Time/Cashier | Yes | Receipt body starts |
| 8-17 | Rest of receipt | Yes | Standard items |

## Styling Details

### Logo Placeholder (Print)
```css
.receipt-logo {
  text-align: center;
  margin-bottom: 2mm;
  padding: 2mm;
  border: 1px dashed #ccc;
}

.receipt-logo-placeholder {
  font-size: 9pt;
  font-weight: bold;
  color: #999;
}
```

### Logo Placeholder (Preview)
```html
<div class="text-center mb-2 p-2 border border-dashed">
  <div class="text-gray-400">[LOGO]</div>
  <div class="text-gray-500">{{ path }}</div>
</div>
```

## Logo Recommendations

### File Format
- PNG (transparent background recommended)
- JPG (solid background)
- SVG (future support)

### Size
- **Width**: 200-300 pixels
- **Height**: 50-100 pixels (keep it short)
- **Aspect Ratio**: Wide and short (landscape)
- **Resolution**: 150-300 DPI for thermal printers

### Placement Tips
- ✅ Keep logo simple and clear
- ✅ High contrast (works well in black & white)
- ✅ Not too tall (saves paper)
- ✅ Centered for professional look
- ❌ Avoid complex gradients
- ❌ Avoid very fine details
- ❌ Don't make it too large

## Example Logo Sizes on Receipt

### Small Logo (Recommended)
```
┌──────────────────────────────┐
│    ╔════════════════╗        │  ← ~40mm wide
│    ║    [LOGO]      ║        │  ← ~15mm tall
│    ╚════════════════╝        │
│  City Medical Pharmacy       │
```

### Medium Logo
```
┌──────────────────────────────┐
│  ╔══════════════════════╗    │  ← ~50mm wide
│  ║                      ║    │  ← ~20mm tall
│  ║      [LOGO]          ║    │
│  ║                      ║    │
│  ╚══════════════════════╝    │
│  City Medical Pharmacy       │
```

### Too Large (Not Recommended)
```
┌──────────────────────────────┐
│ ╔════════════════════════════╗│  ← Full width
│ ║                            ║│
│ ║                            ║│  ← Too tall
│ ║        [LOGO]              ║│  ← Wastes paper
│ ║                            ║│
│ ║                            ║│
│ ╚════════════════════════════╝│
│ City Medical Pharmacy         │  ← Too far down
```

## Future Implementation

When actual logo display is implemented, it will:
1. Load image from the specified path
2. Resize to fit thermal printer width (72mm)
3. Maintain aspect ratio
4. Center on receipt
5. Print clearly on thermal paper
6. Support PNG, JPG formats
7. Handle missing files gracefully

## Summary

**Logo Position**: Absolute top of receipt, above company name
**Current Status**: Placeholder showing path
**Future**: Will display actual logo image
**Configuration**: Settings → Receipt → "Pharmacy Logo" field
**Appearance**: Both in preview and printed receipt

The logo is the **FIRST THING** customers see when they receive the receipt!
