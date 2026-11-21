# Logo Upload Feature - Complete Implementation ✅

## What Changed

Now you can **actually upload logo images** (PNG, JPG, GIF) instead of just entering a file path!

## New Features

### 1. File Upload Button ✅
- Click to browse and select your logo image
- Accepts: PNG, JPG, JPEG, GIF
- Max file size: 5MB
- Automatically converts to base64 for storage

### 2. Live Preview ✅
- Shows your **actual logo image** in the preview
- Displays at the correct size (max 60mm wide, 20mm tall)
- Updates immediately when you select a file

### 3. Actual Logo on Printed Receipt ✅
- Your real logo prints at the top of receipts
- Properly sized for thermal printers
- Maintains aspect ratio

### 4. Remove Button ✅
- Easy "Remove" button to clear the logo
- Clears both the file input and saved data

### 5. Manual Path Option ✅
- Still supports manual path entry
- Hidden under "Or enter path manually" dropdown
- For advanced users or external file paths

## How to Use

### Upload a Logo:

1. **Open Settings → Receipt tab**

2. **Find "Pharmacy Logo (Optional)"** field (first field)

3. **Click the file input** to browse

4. **Select your logo image**:
   - PNG (recommended - supports transparency)
   - JPG/JPEG
   - GIF
   - Max 5MB size

5. **Logo appears immediately** in preview below

6. **Save Settings**

7. **Test print** from POS

### Remove Logo:

1. Click the **"Remove"** button next to current logo path
2. Logo disappears from preview
3. Save settings

## What You'll See

### Settings Form:

```
┌─────────────────────────────────────────┐
│ Pharmacy Logo (Optional)                │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Choose File  [Browse...]            │ │ ← Click here!
│ └─────────────────────────────────────┘ │
│                                         │
│ Current: data:image/png;base64...       │
│ [Remove] button                         │
│                                         │
│ ▼ Or enter path manually (click to exp)│
└─────────────────────────────────────────┘
```

### Preview with Actual Logo:

```
Receipt Preview
┌─────────────────────────────────────┐
│  ╔═══════════════════════════════╗  │
│  ║  [Your Actual Logo Image]     ║  │ ← Real image!
│  ║  Not [LOGO] placeholder       ║  │
│  ╚═══════════════════════════════╝  │
│                                     │
│  Wali Pharmacy                      │
│  ...rest of receipt...              │
```

### Printed Receipt:

```
┌─────────────────────────────────────┐
│                                     │
│     [Your Actual Logo Prints]       │ ← Real image prints!
│                                     │
│  Wali Pharmacy                      │
│  123 Main Street                    │
│  Phone: 021-1234567                 │
│  ─────────────────────────────────  │
│  21-Nov-2026  01:22 PM      ADMIN  │
│  Payment Mode: Cash                 │
│  ...                                │
```

## Technical Details

### How It Works:

1. **File Selection**:
   - User clicks file input
   - Browser opens file picker
   - User selects image file

2. **Validation**:
   - Checks file type (PNG, JPG, GIF only)
   - Checks file size (max 5MB)
   - Alerts user if invalid

3. **Conversion**:
   - Reads file using FileReader API
   - Converts to base64 data URL
   - Format: `data:image/png;base64,iVBORw0KG...`

4. **Storage**:
   - Saves base64 string to `receipt_logo_path`
   - Stored in settings database
   - No external file needed!

5. **Display**:
   - Preview checks if path starts with `data:image`
   - If yes: shows `<img>` tag with base64 src
   - If no: shows `[LOGO]` placeholder (for manual paths)

6. **Printing**:
   - Same logic for print template
   - Logo image embedded in HTML
   - Prints with receipt

### File Size:

**Base64 increases file size by ~33%**

| Original | Base64 | Stored |
|----------|--------|--------|
| 100 KB | → 133 KB | in DB |
| 500 KB | → 665 KB | in DB |
| 1 MB | → 1.33 MB | in DB |

**That's why we limit to 5MB** (becomes ~6.6MB in base64)

### Image Sizing:

**Preview:**
- Max width: 60mm (CSS)
- Max height: 20mm (CSS)
- object-fit: contain (maintains ratio)

**Print:**
- Max width: 60mm (CSS)
- Max height: 20mm (CSS)
- Centered on receipt
- Scales to fit thermal printer

## Code Changes

### File: `ReceiptSettings.vue`

**Template:**
```vue
<!-- File input -->
<input
  type="file"
  accept="image/png,image/jpeg,image/jpg,image/gif"
  @change="handleLogoUpload"
/>

<!-- Show actual image in preview -->
<img 
  v-if="formData.receipt_logo_path.startsWith('data:image')"
  :src="formData.receipt_logo_path"
  style="max-width: 60mm; max-height: 20mm;"
/>
```

**Script:**
```typescript
function handleLogoUpload(event: Event) {
  const file = target.files?.[0];
  
  // Validate type and size
  // Convert to base64
  const reader = new FileReader();
  reader.onload = (e) => {
    formData.value.receipt_logo_path = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  formData.value.receipt_logo_path = '';
}
```

### File: `SavedSaleActions.vue`

**Template:**
```vue
<!-- Show actual image in print -->
<img 
  v-if="sale.shop.receipt_logo_path.startsWith('data:image')"
  :src="sale.shop.receipt_logo_path"
  class="receipt-logo-image"
/>
```

**CSS:**
```css
.receipt-logo-image {
  max-width: 60mm;
  max-height: 20mm;
  object-fit: contain;
}
```

## Advantages of Base64 Approach

✅ **No external files needed** - logo embedded in database
✅ **Works anywhere** - no file path issues
✅ **Portable** - database backup includes logo
✅ **Secure** - no file system access required
✅ **Simple** - just image data, no file management

## Disadvantages

❌ **Larger database** - base64 is ~33% bigger
❌ **Memory usage** - loaded into memory
❌ **Not ideal for very large images** - hence 5MB limit

## Best Practices

### Logo Design:

1. **Size**: 200-300px wide, 50-100px tall
2. **Format**: PNG with transparency (best for logos)
3. **Colors**: Simple, high contrast (prints well)
4. **Details**: Not too fine (thermal printers limited)
5. **File size**: Keep under 200KB (faster, smaller DB)

### Optimization:

Before uploading, optimize your logo:
- Resize to appropriate dimensions
- Compress PNG (use tools like TinyPNG)
- Remove unnecessary metadata
- Keep file size small

## Troubleshooting

### Logo doesn't appear in preview:
- Make sure you selected a valid image file
- Check browser console for errors
- Try a different image file
- Ensure file is under 5MB

### Logo doesn't print:
- Check that logo shows in preview first
- Make sure settings are saved
- Try reprinting
- Check printer supports images

### File too large error:
- Resize image to smaller dimensions
- Compress the image file
- Use PNG instead of uncompressed formats

### Logo looks blurry:
- Use higher resolution source image
- Ensure image is sharp before uploading
- PNG format usually better than JPG for logos

## Example Usage

### Typical Workflow:

1. Design logo in Photoshop/GIMP
2. Export as PNG, 250px wide
3. Compress with TinyPNG
4. Upload in Settings → Receipt
5. Preview shows logo
6. Save settings
7. Test print receipt
8. Logo appears on all future receipts

### Updating Logo:

1. Upload new logo (overwrites old one)
2. OR click Remove then upload new one
3. Save settings
4. New logo appears immediately

## Future Enhancements

Possible improvements:
- Image cropping tool
- Drag & drop upload
- Logo position adjustment (left/center/right)
- Multiple logo sizes (small/medium/large)
- Logo for different receipt types
- Preview zoom/pan

## Summary

✅ **File upload working** - Browse and select images
✅ **Actual logo shows** - Real image in preview
✅ **Real logo prints** - Image on thermal receipts
✅ **Easy to use** - Simple file picker
✅ **Validated** - Type and size checks
✅ **Removable** - Clear logo anytime
✅ **Base64 embedded** - No external files needed

**You can now upload your pharmacy logo and it will appear on all receipts!**
