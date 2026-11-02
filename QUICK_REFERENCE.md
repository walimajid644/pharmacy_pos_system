# ⚡ Quick Reference Card

## Common Commands

```bash
# Development
npm install                  # Install dependencies (first time)
npm run tauri:dev           # Run app with hot reload
npm run dev                 # Run Vite only (UI preview)
npm run build               # Type check

# Production
npm run tauri:build         # Build installer

# Database
# Preserve and back up the database before troubleshooting.
```

---

## Default Login

```
Username: admin
Password: admin123
```

---

## Database Queries (Common)

### Search Products
```typescript
const products = await executeQuery<Product>(
  'SELECT * FROM products WHERE name LIKE ? AND deleted_at IS NULL LIMIT 20',
  [`%${search}%`]
)
```

### Get Product with Batches
```typescript
const batches = await executeQuery<ProductBatch>(
  'SELECT * FROM product_batches WHERE product_id = ? ORDER BY expiry_date ASC',
  [productId]
)
```

### Insert Product
```typescript
import { generateUUID } from '@/lib/utils'

await executeUpdate(
  `INSERT INTO products (id, sku, name, unit_price, cost_price, pack_size, is_active, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [generateUUID(), sku, name, price, cost, packSize, 1, now, now]
)
```

### Update Product
```typescript
await executeUpdate(
  'UPDATE products SET name = ?, unit_price = ?, updated_at = ? WHERE id = ?',
  [newName, newPrice, new Date().toISOString(), productId]
)
```

### Soft Delete
```typescript
await executeUpdate(
  'UPDATE products SET deleted_at = ? WHERE id = ?',
  [new Date().toISOString(), productId]
)
```

### Get Low Stock Products
```sql
SELECT p.name, SUM(pb.quantity_in_stock) as total
FROM products p
LEFT JOIN product_batches pb ON p.id = pb.product_id
WHERE p.deleted_at IS NULL
GROUP BY p.id
HAVING total < p.reorder_level
```

---

## Pinia Store Usage

### Auth Store
```typescript
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// Login
await authStore.login('username', 'password')

// Current user
authStore.currentUser // User object
authStore.isAuthenticated // boolean

// Check role
authStore.hasRole(['admin', 'manager'])

// Logout
authStore.logout()
```

### Cart Store
```typescript
import { useCartStore } from '@/stores/cart'

const cartStore = useCartStore()

// Add item
cartStore.addItem(product, batch, quantity, isLooseSale)

// Remove item
cartStore.removeItem(index)

// Update quantity
cartStore.updateItemQuantity(index, newQty)

// Totals
cartStore.subtotal  // number
cartStore.taxAmount // number
cartStore.total     // number

// Clear
cartStore.clearCart()

// Set tax rate
cartStore.setTaxRate(18) // 18%
```

### Settings Store
```typescript
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

// Load settings
await settingsStore.loadSettings()

// Access
settingsStore.settings.tax_rate
settingsStore.settings.company_name

// Update
await settingsStore.updateSettings({ tax_rate: 18 })
```

---

## Form Validation

### Define Schema
```typescript
// src/lib/schemas.ts
export const productSchema = z.object({
  name: z.string().min(1, 'Name required'),
  unit_price: z.number().min(0, 'Price must be positive'),
})
```

### Use in Component
```vue
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { productSchema } from '@/lib/schemas'

const { errors, handleSubmit, defineField } = useForm({
  validationSchema: toTypedSchema(productSchema),
})

const [name] = defineField('name')
const [unit_price] = defineField('unit_price')

const onSubmit = handleSubmit(async (values) => {
  // values is typed & validated
  await saveProduct(values)
})
</script>

<template>
  <form @submit="onSubmit">
    <Input v-model="name" :error="errors.name" />
    <Input v-model="unit_price" type="number" :error="errors.unit_price" />
    <Button type="submit">Save</Button>
  </form>
</template>
```

---

## Utility Functions

```typescript
import { 
  formatCurrency, 
  formatDate, 
  formatDateTime,
  generateUUID,
  isNearExpiry,
  isExpired,
  debounce
} from '@/lib/utils'

// Currency
formatCurrency(1234.56) // "Rs 1,234.56"

// Dates
formatDate('2024-10-24') // "Oct 24, 2024"
formatDateTime('2024-10-24T12:00:00Z') // "Oct 24, 2024, 12:00 PM"

// UUID
const id = generateUUID() // "550e8400-e29b-41d4-a716-446655440000"

// Expiry checks
isNearExpiry('2024-12-25', 60) // true if expires in 60 days
isExpired('2024-10-01') // true if past today

// Debounce
const search = debounce(() => searchProducts(), 300)
```

---

## Router Navigation

```typescript
import { useRouter } from 'vue-router'

const router = useRouter()

// Navigate
router.push('/products')
router.push({ name: 'pos' })

// Go back
router.back()

// Current route
const route = useRoute()
console.log(route.path) // "/pos"
console.log(route.name) // "pos"
```

---

## Component Styling

```vue
<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
</script>

<template>
  <!-- Variants -->
  <Button variant="default">Default</Button>
  <Button variant="destructive">Delete</Button>
  <Button variant="outline">Cancel</Button>
  <Button variant="secondary">Secondary</Button>
  <Button variant="ghost">Ghost</Button>
  
  <!-- Sizes -->
  <Button size="sm">Small</Button>
  <Button size="default">Default</Button>
  <Button size="lg">Large</Button>
  
  <!-- Disabled -->
  <Button :disabled="loading">Submit</Button>
</template>
```

---

## Common Patterns

### Loading State
```vue
<script setup lang="ts">
const loading = ref(false)

async function saveData() {
  loading.value = true
  try {
    await executeUpdate(...)
  } catch (error) {
    console.error(error)
    alert('Failed to save')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Button :disabled="loading">
    {{ loading ? 'Saving...' : 'Save' }}
  </Button>
</template>
```

### Search with Debounce
```vue
<script setup lang="ts">
import { debounce } from '@/lib/utils'

const searchQuery = ref('')
const results = ref([])

const search = debounce(async () => {
  if (!searchQuery.value) return
  results.value = await executeQuery('SELECT * FROM products WHERE name LIKE ?', [`%${searchQuery.value}%`])
}, 300)
</script>

<template>
  <Input v-model="searchQuery" @input="search" />
</template>
```

### Computed Properties
```vue
<script setup lang="ts">
import { computed } from 'vue'

const items = ref([
  { price: 10, quantity: 2 },
  { price: 20, quantity: 1 },
])

const total = computed(() => 
  items.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
)
</script>

<template>
  <div>Total: {{ formatCurrency(total) }}</div>
</template>
```

---

## File Locations

```
src/
  components/ui/         Base UI components
  views/                 Page components
  stores/                Pinia stores
  lib/
    database.ts          DB functions
    types.ts             TypeScript types
    schemas.ts           Zod schemas
    utils.ts             Helper functions
  router/index.ts        Routes
  assets/styles/         CSS

src-tauri/
  migrations/            SQL files
  src/
    lib.rs               Tauri app
    main.rs              Entry point
```

---

## Desktop Keyboard Shortcuts

```
F1           - Show or hide shortcut help
F2           - Focus POS product and barcode search
F3           - Focus POS customer selection
F4           - Focus Products search (admin/manager)
Alt+D        - Dashboard
Ctrl+Shift+L - Log out after confirmation
↑ / ↓        - Choose a POS product search result
Enter        - Add highlighted pack; scanner barcode + Enter adds exact match
Shift+Enter  - Add highlighted loose unit, when supported
Esc          - Close shortcut help or clear POS product search
```

---

## Database Path

```
Windows: %APPDATA%\com.pharmacypos.app\pharmacy.db

Full path:
C:\Users\<YourName>\AppData\Roaming\com.pharmacypos.app\pharmacy.db
```

---

## Tailwind Classes (Common)

```css
/* Layout */
flex, grid, space-x-4, space-y-4, gap-4

/* Sizing */
w-full, w-64, h-10, max-w-md, min-h-screen

/* Spacing */
p-4, px-6, py-2, m-4, mx-auto, mt-6

/* Colors */
bg-white, text-gray-600, border-gray-200
bg-primary, text-primary-foreground
bg-destructive, text-destructive-foreground

/* Typography */
text-sm, text-lg, font-bold, font-medium

/* Borders */
border, rounded-md, rounded-lg, border-t

/* Flexbox */
justify-between, items-center, flex-1

/* Hover */
hover:bg-accent, hover:text-accent-foreground
```

---

## VS Code Extensions

```json
{
  "recommendations": [
    "vue.volar",
    "vue.vscode-typescript-vue-plugin",
    "bradlc.vscode-tailwindcss",
    "rust-lang.rust-analyzer",
    "tauri-apps.tauri-vscode"
  ]
}
```

Already configured in `.vscode/extensions.json`

---

## Common Errors & Fixes

### "Cannot find module '@tauri-apps/api'"
```bash
rm -rf node_modules
npm install
```

### Database not created
- Check `%APPDATA%\com.pharmacypos.app\`
- Preserve the database and follow PHARMACY_OPERATIONS.md before diagnosis

### Port 1420 already in use
```bash
netstat -ano | findstr :1420
taskkill /PID <PID> /F
```

### Rust compile errors
```bash
rustup update
# Install Visual Studio Build Tools
```

---

## New database

A fresh installation starts with no products or customers. Add real products and batches before testing POS.

---

**Print this file for quick desk reference! 📋**
