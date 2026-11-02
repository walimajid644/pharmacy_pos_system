# Visual Testing Guide - Week 1 Foundation

**Purpose**: Verify the new design system is working correctly  
**Time Required**: 15-20 minutes  
**Prerequisites**: `npm run dev` running

---

## 🎯 How to Test

### 1. Start Development Server

```powershell
cd pharmacy-pos
npm run dev
```

Wait for Vite to start, then open `http://localhost:1420` (or the URL shown).

---

## ✅ What to Look For

### Theme Switching
1. **Click the theme toggle** (sun/moon icon)
2. **Observe**:
   - Smooth transition (~150ms)
   - All colors change smoothly
   - Shadows adjust (softer in dark mode)
   - Text remains readable
   - No flashing or jumping

### Focus States
1. **Press Tab** to navigate
2. **Observe each focused element**:
   - 4px ring appears (emerald color)
   - Ring has 2px offset
   - Smooth appearance
   - Clearly visible in both themes

### Interactive States

#### Buttons
1. **Hover over any button**
   - Lifts up slightly (-1px)
   - Shadow increases
   - Smooth transition (150ms)

2. **Click a button**
   - Ripple effect appears
   - Button drops back to normal position
   - Satisfying feedback

#### Cards (if visible)
1. **Hover over a card**
   - Lifts up (-2px)
   - Shadow increases
   - Smooth transition

#### Table Rows
1. **Hover over table rows**
   - Background changes (subtle gradient)
   - Smooth transition (100ms)
   - Easy to see current row

### Typography
1. **Look at headings vs body text**
   - Clear size hierarchy
   - Consistent spacing
   - Good readability
   - Proper weight differences

2. **Check labels**
   - UPPERCASE
   - Slightly wider letter-spacing
   - Secondary text color
   - Smaller size

### Spacing
1. **Look at overall layout**
   - Consistent gaps between elements
   - No cramped areas
   - Breathing room around content
   - Aligned to 8px grid

### Badges (if visible)
1. **Check badge styling**
   - Rounded corners
   - Appropriate padding
   - Clear colors (success = green, warning = amber, danger = red)
   - Good contrast with background

---

## 🎨 Test Scenarios

### Scenario 1: Login Screen
**What to check**:
- [ ] Large heading uses `heading-1` style
- [ ] Form labels are clear
- [ ] Input fields have proper spacing
- [ ] Focus ring appears on inputs
- [ ] Button has hover effect
- [ ] Error messages (if any) are readable

### Scenario 2: Dashboard
**What to check**:
- [ ] Page title is prominent
- [ ] Metric cards have consistent padding (24px)
- [ ] Numbers use monospace font
- [ ] Badges show correct colors
- [ ] Cards have subtle shadow
- [ ] Card hover effect works
- [ ] Spacing between sections consistent

### Scenario 3: POS View
**What to check**:
- [ ] Search input is large and prominent
- [ ] Product cards have clear hierarchy
- [ ] Cart table is readable
- [ ] Row hover effects work
- [ ] Total displays in large, bold text
- [ ] Payment buttons have good spacing
- [ ] All interactive elements have focus rings

### Scenario 4: Tables (Products, Sales History, etc.)
**What to check**:
- [ ] Headers have background color
- [ ] Rows have hover effect
- [ ] Text alignment appropriate (left for text, right for numbers)
- [ ] Monospace font for numbers
- [ ] Borders are subtle
- [ ] Spacing makes rows easy to scan

### Scenario 5: Forms
**What to check**:
- [ ] Labels are clear and aligned
- [ ] Input fields have consistent height
- [ ] Focus rings appear properly
- [ ] Error states (if any) use danger color
- [ ] Buttons have proper sizes
- [ ] Spacing between fields comfortable

---

## 🔍 Browser DevTools Testing

### 1. Check CSS Variables

Open DevTools → Elements → :root
Look for our variables:

```css
--text-base: 1rem;
--space-4: 1rem;
--brand-600: #059669;
--shadow-md: 0 4px 6px...;
--transition-base: 150ms...;
```

### 2. Test Focus

1. Open DevTools → Console
2. Type: `document.activeElement`
3. Press Tab, run command again
4. Verify focus is moving correctly

### 3. Test Dark Mode

1. Open DevTools → Elements
2. Find `<html data-theme="dark">`
3. Toggle manually
4. Verify all colors change

### 4. Check Animations

1. Open DevTools → Animations tab
2. Interact with elements
3. Verify transitions are ~150ms
4. No janky animations

---

## 🐛 Known Issues to Verify

### Should Work
- [x] Theme toggle
- [x] Focus rings
- [x] Hover states
- [x] Typography scales
- [x] Spacing consistency

### May Need Adjustment
- [ ] Some old components may not use new colors yet
- [ ] Some custom styles may override new system
- [ ] Some hardcoded colors may still exist

---

## 📸 Visual Comparison

### Typography Before/After

**Before**: Mixed sizes, no clear hierarchy
```
Title: 32px, random weight
Subtitle: 18px
Body: 14px
Small: 12px
```

**After**: Professional scale
```
heading-1: 39px, bold, tight leading
heading-2: 31px, semibold
body: 16px, normal, comfortable leading
label: 13px, medium, uppercase
```

### Colors Before/After

**Before**: Many accent colors, unclear usage
```
Primary: #059669
Secondary: #0284C7
Success: #16A34A
Warning: #EAB308
Danger: #DC2626
(when to use which?)
```

**After**: Semantic system
```
Brand: #10B981 (main actions)
Success: #22C55E (completed, approved)
Warning: #F59E0B (near-expiry, caution)
Danger: #EF4444 (errors, expired)
Info: #3B82F6 (informational)
```

### Spacing Before/After

**Before**: Inconsistent
```
padding: 20px
margin: 15px
gap: 18px
```

**After**: 8px grid
```
padding: var(--space-6) /* 24px */
margin: var(--space-4) /* 16px */
gap: var(--space-4) /* 16px */
```

---

## ✅ Success Criteria

### Typography ✅
- [ ] Clear hierarchy (large to small makes sense)
- [ ] Readable at all sizes
- [ ] Consistent line heights
- [ ] Proper font weights

### Colors ✅
- [ ] Good contrast (text vs background)
- [ ] Semantic meaning clear
- [ ] Dark mode comfortable
- [ ] No harsh colors

### Spacing ✅
- [ ] Consistent throughout
- [ ] Not too cramped
- [ ] Not too loose
- [ ] Elements properly grouped

### Interactions ✅
- [ ] Hover states smooth
- [ ] Focus states visible
- [ ] Transitions not too fast/slow
- [ ] Ripple effect satisfying

### Accessibility ✅
- [ ] Focus rings visible
- [ ] Tab navigation works
- [ ] Theme toggle works
- [ ] Reduced motion respected

---

## 🎯 Quick Visual Checklist

Open the app and verify in 2 minutes:

1. [ ] **Typography looks professional** (varied sizes, clear hierarchy)
2. [ ] **Theme toggle works smoothly** (no flash, all colors change)
3. [ ] **Focus rings appear** (press Tab, see 4px emerald rings)
4. [ ] **Buttons lift on hover** (try hovering various buttons)
5. [ ] **Spacing is consistent** (no cramped or weird gaps)
6. [ ] **Dark mode is comfortable** (not too dark or harsh)
7. [ ] **Tables are readable** (hover shows gradient)
8. [ ] **Badges have good colors** (green/amber/red clear)

If all 8 checks pass: ✅ **Foundation working perfectly!**

---

## 🔧 Troubleshooting

### Issue: No visual changes
**Solution**: Hard refresh (Ctrl+Shift+R) to clear cache

### Issue: Colors look wrong
**Solution**: Check `data-theme` attribute on `<html>`

### Issue: Transitions not working
**Solution**: Check for `.preload` class on body (should only be on initial load)

### Issue: Focus rings not showing
**Solution**: Use Tab key (click focuses don't always show rings by design)

### Issue: Typography sizes seem off
**Solution**: Check browser zoom level (should be 100%)

---

## 📊 Performance Check

### Load Time
- CSS file should be < 50KB
- No noticeable delay switching themes
- No layout shifts on page load

### Animation Performance
- 60fps smooth transitions
- No janky hover effects
- Ripple animation smooth

### Memory
- No memory leaks from CSS
- Theme toggle doesn't accumulate

---

## 🎉 What Success Looks Like

After Week 1 foundation:

✅ **Professional appearance** - Clean, modern, cohesive
✅ **Clear hierarchy** - Easy to scan and understand
✅ **Smooth interactions** - Delightful micro-animations
✅ **Accessible** - Visible focus, keyboard navigation
✅ **Dark mode** - Comfortable, not harsh
✅ **Consistent** - Same spacing, colors, patterns throughout

---

**Next**: Use these improvements in component redesigns (Week 2)

**Questions?** Check:
- `UI_UX_DESIGN_PLAN.md` - Overall plan
- `UI_UX_IMPLEMENTATION_PROGRESS.md` - Detailed progress
- `UI_UX_WEEK1_COMPLETE.md` - What we accomplished

