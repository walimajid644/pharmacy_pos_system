# POS Terminal Keyboard Reference

Complete keyboard shortcuts and navigation for the POS terminal.

## Global Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `F2` | Focus product search | Any time |
| `F3` | Open customer picker | Any time |
| `F8` | Select Cash payment | Any time |
| `F9` | Select Card payment | Any time |
| `F10` | Select Mobile/JazzCash payment | Any time |
| `Ctrl + Enter` | Complete sale (checkout) | Cart has items |

## Product Search Field

### Entry & Search
| Key | Action | Notes |
|-----|--------|-------|
| Type text | Search products | Auto-debounces (150ms) for partial matches |
| Type barcode | Instant search | Alphanumeric 6+ chars bypass debounce |
| `Enter` | Add highlighted item (pack) | If results exist, adds immediately |
| `Shift + Enter` | Add highlighted item (loose) | Only if product allows loose units |
| `Esc` | Clear search | Clears query and results |

### Navigation in Results
| Key | Action |
|-----|--------|
| `↓` (Arrow Down) | Highlight next product |
| `↑` (Arrow Up) | Highlight previous product |
| `Enter` | Add highlighted product as pack |
| `Shift + Enter` | Add highlighted product as loose unit |

### Search Behavior
- **Exact barcode match**: Auto-highlighted when found
- **Multiple results**: First item highlighted by default
- **No debounce**: Barcode patterns (6+ alphanumeric chars)
- **150ms debounce**: Partial text searches (name, SKU fragments)

## Customer Search Field

### Entry & Selection
| Key | Action |
|-----|--------|
| Type text | Search customers (debounced) |
| `↓` | Highlight next customer |
| `↑` | Highlight previous customer |
| `Enter` | Select highlighted customer |
| `Esc` | Close picker |
| Click outside | Close picker |

### Options
- First option: "Walk-in sale — no customer"
- Followed by: Matching registered customers

## Cart Line Items

### Quantity Fields
- **Type number** in quantity/bonus fields
- **Tab** to move between fields
- Auto-validates against batch stock

### Discount Fields
- **% discount**: 0-100%
- **Rs discount**: 0 to line total
- One updates the other automatically

## Payment Section

### Cash Entry
- Type amount in "Cash received" field
- Leave blank for exact payment
- "Exact amount" button fills total

### Method Selection
- Click payment button OR use F-keys
- Selected method highlighted
- Credit only available for registered customers

## Special Cases

### Strip Breaking
- Automatic prompt when loose sale requires opening a strip
- `Enter` or click OK to confirm
- `Esc` or click Cancel to abort

### Source Documents (Estimates/Pre-orders)
- Document info shown at top when loaded
- "Detach document" button to clear source
- Checkout completes the source document

## Accessibility Features

### Screen Reader Support
- All inputs labeled with aria-labels
- Keyboard shortcuts announced with aria-keyshortcuts
- Status messages use proper ARIA roles

### Focus Management
- Product search auto-focused on mount
- Tab order follows visual layout
- Focus returns to search after adding item

## Performance Tips

1. **Fastest workflow**: Scan barcode → `Enter` (~150ms)
2. **Keyboard only**: `F2` → type → `↓`/`↑` → `Enter`
3. **Loose units**: Same as above but `Shift + Enter`
4. **Quick checkout**: `F8`/`F9`/`F10` → `Ctrl + Enter`

## Barcode Scanner Configuration

### Recommended Settings
- **Terminator**: CR (Carriage Return) or Enter key
- **Prefix**: None
- **Suffix**: None
- **Debounce**: Device handles internally

### Why It Works
- Scanner sends barcode + Enter as single keystroke sequence
- System detects barcode pattern (alphanumeric, 6+ chars)
- Search executes **immediately** without debounce
- Exact match auto-highlighted
- Enter adds item to cart

Total time: ~150ms from scan to cart

## Troubleshooting

### "Search too slow"
- Check if barcode is 6+ alphanumeric chars
- Shorter/special-char barcodes still use 150ms debounce
- Consider product name/SKU if barcode isn't set

### "Wrong item added"
- Verify barcode uniqueness in database
- Check if multiple products share same barcode
- Use arrow keys to select correct item before Enter

### "Loose unit not working"
- Product must have `sell_by_loose_unit = 1`
- Check product settings if grayed out
- Pack size must be > 1 for loose sales

### "Strip breaking prompts every time"
- Expected when loose units exceed open stock
- Confirms user intention to open sealed strip
- Logged on invoice for audit trail
