# How to See the Logo in Preview

## The Logo IS Already in the Preview Code!

The preview has been updated. Here's exactly how to see it work:

## Step-by-Step Testing

### Step 1: Open Settings
1. Launch your Pharmacy POS application
2. Click on **Settings** (gear icon)
3. Click on **Receipt** tab

### Step 2: Enter Logo Path
1. Look at the **FIRST field** at the top
2. It says: **"Pharmacy Logo (Optional)"**
3. Enter a test value, for example:
   ```
   logo.png
   ```
   or
   ```
   ./assets/logo.png
   ```

### Step 3: Check the Preview
1. Scroll down to **"Receipt Preview"** section
2. **Important**: The preview container is scrollable
3. **Scroll UP** inside the preview to see the very top
4. You should see a **dashed box** with:
   - `[LOGO]` text
   - Your logo path below it

### Step 4: If You Don't See It

**The logo ONLY shows if you enter a path!**

Try this:
1. Clear the logo field (delete any text)
2. Look at preview - no logo box (correct!)
3. Type: `test-logo.png` in the logo field
4. Look at preview again - logo box should appear!

## Why the Logo Might Not Show

### Reason 1: No Logo Path Entered
❌ Logo field is empty  
✅ Enter ANY text in the logo field

### Reason 2: Not Looking at Top of Preview
❌ Preview scrolled down to middle/bottom  
✅ Scroll UP inside the preview box

### Reason 3: Preview Not Refreshing
❌ Old cached version  
✅ Try:
- Type something in logo field
- Delete it
- Type it again
- Or refresh the page

### Reason 4: Changes Not Applied Yet
❌ Viewing old build  
✅ Rebuild the application:
```bash
cd pharmacy-pos
npm run dev
```

## Visual Guide

### What You Should See:

```
Settings → Receipt Tab
├─ Pharmacy Logo (Optional)
│  [logo.png____________] ← Type here
│
├─ Receipt Header
│  [___________________]
│
├─ Receipt Footer
│  [___________________]
│
└─ Receipt Preview ↓
   ┌─────────────────────────────┐
   │ ▲ Scroll to top            │
   │ ┌─────────────────────────┐ │
   │ │ ┏━━━━━━━━━━━━━━━━━━━┓ │ │ ← Look here!
   │ │ ┃     [LOGO]        ┃ │ │
   │ │ ┃   logo.png        ┃ │ │
   │ │ ┗━━━━━━━━━━━━━━━━━━━┛ │ │
   │ │                       │ │
   │ │ Company Name          │ │
   │ │ Address               │ │
   │ │ ...                   │ │
```

## Code Verification

The logo preview code is at **line 69** of ReceiptSettings.vue:

```vue
<!-- Logo placeholder -->
<div v-if="formData.receipt_logo_path" 
     class="text-center mb-2 p-2 border border-dashed">
  <div class="text-gray-400 text-xs">[LOGO]</div>
  <div class="text-gray-500 text-xs">
    {{ formData.receipt_logo_path }}
  </div>
</div>
```

This code:
- Checks if `formData.receipt_logo_path` has a value
- Only shows the logo box if you entered something
- Displays `[LOGO]` placeholder
- Shows your entered path below

## Testing Checklist

Test the preview by following these steps:

- [ ] Open Settings
- [ ] Go to Receipt tab
- [ ] See "Pharmacy Logo (Optional)" field at top
- [ ] Enter "test.png" in logo field
- [ ] Scroll down to Receipt Preview
- [ ] Scroll UP inside the preview box
- [ ] See dashed box with [LOGO] at the very top
- [ ] See "test.png" displayed below [LOGO]
- [ ] Clear the logo field
- [ ] Logo box disappears from preview
- [ ] Enter path again
- [ ] Logo box reappears

## Expected Behavior

| Logo Field | Preview Shows |
|------------|---------------|
| Empty | No logo box, starts with company name |
| `logo.png` | `[LOGO]` box at top with "logo.png" |
| `./assets/logo.png` | `[LOGO]` box at top with path |
| Any text | `[LOGO]` box with that text |

## If Still Not Working

### Option 1: Check Browser Console
1. Open browser developer tools (F12)
2. Look for any errors in console
3. Check if formData.receipt_logo_path is undefined

### Option 2: Verify File Saved
1. Check that the file was saved correctly
2. Look for this line in the file:
   ```
   <div v-if="formData.receipt_logo_path"
   ```

### Option 3: Rebuild Application
```bash
cd pharmacy-pos
npm run dev
```

### Option 4: Hard Refresh
- Windows: Ctrl + Shift + R
- Mac: Cmd + Shift + R
- Or close and reopen the app

## Debugging

### Check formData
The logo field should be accessible as:
```javascript
formData.receipt_logo_path
```

### Check if Field Exists
Look for this in the Receipt tab:
```html
<input
  id="field-receiptsettings-logo"
  v-model="formData.receipt_logo_path"
  type="text"
  placeholder="path/to/logo.png or leave blank"
/>
```

### Check Preview Condition
The preview uses `v-if` to show/hide logo:
```vue
<div v-if="formData.receipt_logo_path" ...>
```

This means:
- If logo path is empty → Don't show box
- If logo path has any value → Show box

## Summary

✅ **Logo preview code IS in the file**  
✅ **Located at the very top of preview**  
✅ **Only shows when you enter a logo path**  
✅ **Uses conditional rendering (v-if)**  

**To see it:**
1. Enter ANY text in "Pharmacy Logo" field
2. Look at the TOP of the receipt preview
3. You'll see a dashed box with [LOGO]

The preview is already updated in the code - you just need to enter a logo path to see it appear!
