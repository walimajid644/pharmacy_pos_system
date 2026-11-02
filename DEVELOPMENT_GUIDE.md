# Development Guide

## Architecture Overview

This application follows a **local-first architecture** with Tauri as the bridge between the Vue frontend and SQLite database.

```
┌─────────────────────────────────────┐
│      Vue 3 Frontend (TypeScript)    │
│  - Components (UI)                   │
│  - Views (Pages)                     │
│  - Stores (Pinia - State)           │
│  - Router (Navigation)               │
└─────────────┬───────────────────────┘
              │ Tauri IPC
              ▼
┌─────────────────────────────────────┐
│         Tauri Rust Backend          │
│  - Window Management                 │
│  - SQLite Plugin                     │
│  - Native APIs                       │
└─────────────┬───────────────────────┘
              │ SQL Queries
              ▼
┌─────────────────────────────────────┐
│       SQLite Database (Local)       │
│  - Single-file storage               │
│  - ACID transactions                 │
│  - No server required                │
└─────────────────────────────────────┘
```

## Key Technologies

### Frontend
- **Vue 3 Composition API**: Reactive UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first styling
- **Pinia**: State management
- **Vue Router**: Navigation
- **VeeValidate + Zod**: Form validation

### Backend
- **Tauri 2.x**: Desktop runtime (Rust + WebView)
- **SQLite**: Embedded database
- **tauri-plugin-sql**: Database access

## Database Access Pattern

### 1. Direct SQL Queries (Current Implementation)

```typescript
// src/lib/database.ts
import Database from '@tauri-apps/plugin-sql'

export async function executeQuery<T>(query: string, params: any[]): Promise<T[]> {
  const db = await getDatabase()
  return db.select<T>(query, params)
}
```

**Usage in components:**
```typescript
const products = await executeQuery<Product>(
  'SELECT * FROM products WHERE name LIKE ? LIMIT 20',
  [`%${searchQuery}%`]
)
```

**Pros:**
- Simple and direct
- No ORM overhead
- Full SQL control

**Cons:**
- No type safety for queries
- Manual SQL writing
- Potential SQL injection if not careful

### 2. Why NOT Kysely?

Kysely is a TypeScript query builder but it:
- Runs on Node.js, not in browser/Tauri WebView
- Requires a connection pool (not available client-side)
- Adds complexity without benefits for our use case

### 3. Why NOT Prisma?

Prisma:
- Requires Node.js runtime
- Needs Prisma CLI and migration system
- Can't run in Tauri's Rust backend
- Overkill for SQLite in desktop app

## State Management

### Auth Store (src/stores/auth.ts)
Manages user authentication:
```typescript
const authStore = useAuthStore()
await authStore.login('admin', 'admin123')
authStore.currentUser // Current user object
authStore.isAuthenticated // Boolean
authStore.hasRole(['admin', 'manager']) // Role check
authStore.logout()
```

### Cart Store (src/stores/cart.ts)
Manages POS shopping cart:
```typescript
const cartStore = useCartStore()
cartStore.addItem(product, batch, quantity, isLooseSale)
cartStore.removeItem(index)
cartStore.updateItemQuantity(index, newQty)
cartStore.subtotal // Computed
cartStore.taxAmount // Computed
cartStore.total // Computed
cartStore.clearCart()
```

### Settings Store (src/stores/settings.ts)
App configuration:
```typescript
const settingsStore = useSettingsStore()
await settingsStore.loadSettings()
settingsStore.settings.tax_rate // Tax percentage
await settingsStore.updateSettings({ tax_rate: 18 })
```

## Form Validation

Using VeeValidate + Zod:

**1. Define Schema (src/lib/schemas.ts):**
```typescript
export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  unit_price: z.number().min(0, 'Price must be positive'),
})
```

**2. Use in Component:**
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

## Component Development

### UI Components (src/components/ui/)

**Base components** following shadcn-vue pattern:
- `Button.vue`: Variants (default, destructive, outline, ghost)
- `Input.vue`: Text input with error display
- `Card.vue`: Container with border & shadow

**Creating new components:**
```vue
<!-- src/components/ui/Badge.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const badgeClass = computed(() =>
  cn('inline-flex px-2 py-1 text-xs font-semibold rounded', {
    'bg-gray-100 text-gray-800': props.variant === 'default',
    'bg-green-100 text-green-800': props.variant === 'success',
    'bg-yellow-100 text-yellow-800': props.variant === 'warning',
    'bg-red-100 text-red-800': props.variant === 'danger',
  })
)
</script>

<template>
  <span :class="badgeClass">
    <slot />
  </span>
</template>
```

## Database Patterns

### Soft Deletes
All tables have `deleted_at` column:
```typescript
// Mark as deleted
await executeUpdate(
  'UPDATE products SET deleted_at = ? WHERE id = ?',
  [new Date().toISOString(), productId]
)

// Always filter out deleted records
const products = await executeQuery<Product>(
  'SELECT * FROM products WHERE deleted_at IS NULL'
)
```

### UUID Primary Keys
```typescript
import { generateUUID } from '@/lib/utils'

const productId = generateUUID()
await executeUpdate(
  'INSERT INTO products (id, name, ...) VALUES (?, ?, ...)',
  [productId, name, ...]
)
```

### Timestamps
```typescript
const now = new Date().toISOString()
await executeUpdate(
  'INSERT INTO products (..., created_at, updated_at) VALUES (..., ?, ?)',
  [..., now, now]
)

// On update
await executeUpdate(
  'UPDATE products SET name = ?, updated_at = ? WHERE id = ?',
  [newName, now, productId]
)
```

### Stock Movement Audit Log
NEVER update stock_movements, only INSERT:
```typescript
await executeUpdate(
  `INSERT INTO stock_movements 
   (id, product_id, batch_id, movement_type, quantity, reference_type, reference_id, user_id, movement_date, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    generateUUID(),
    productId,
    batchId,
    'out', // 'in' | 'out' | 'adjustment' | 'return'
    -10, // Negative for 'out', positive for 'in'
    'sale',
    invoiceId,
    userId,
    now,
    now
  ]
)
```

## Keyboard-First UX

### POS Terminal
The POS screen is designed for keyboard + barcode scanner:

```vue
<Input
  v-model="searchQuery"
  @keydown="handleBarcodeInput"
  placeholder="Scan barcode or type product name..."
/>

<script>
function handleBarcodeInput(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    // Barcode scanner sends Enter after code
    searchProducts()
  }
}
</script>
```

**Desktop keyboard shortcuts:** See `QUICK_REFERENCE.md` for the current mapping. F1 opens help, F2 focuses POS product search, F3 focuses customer selection, and F4 focuses Products search. In POS search, Enter adds a pack and Shift+Enter adds a loose unit when supported.

## Error Handling

### Database Errors
```typescript
try {
  await executeUpdate('INSERT INTO products ...', [...])
} catch (error) {
  console.error('Database error:', error)
  // Show user-friendly message
  alert('Failed to save product. Please try again.')
}
```

### Network-Free Operation
This app is 100% offline. Never make HTTP requests for core functionality.

## Testing Strategy

### Manual Testing Checklist (Phase 1)
- [ ] Login with correct credentials
- [ ] Login with wrong credentials (should fail)
- [ ] Search products by name
- [ ] Search products by barcode
- [ ] Add product to cart
- [ ] Update cart item quantity
- [ ] Remove cart item
- [ ] Complete sale with cash
- [ ] Complete sale with card
- [ ] Verify stock decreased after sale
- [ ] Verify invoice created in database
- [ ] Verify stock movement logged
- [ ] Logout

### Database Testing
Use DB Browser to verify:
- Invoices inserted correctly
- Stock quantities updated
- Stock movements logged
- Timestamps set properly
- No hard deletes (only soft deletes)

## Performance Considerations

### Virtualization (Future)
For large lists (>1000 items), use TanStack Table with virtualization:
```typescript
// Will be implemented in Phase 2
import { useVirtualizer } from '@tanstack/vue-virtual'
```

### Database Indexing
Already created in migration:
- Product name, SKU, barcode
- Customer phone, name
- Invoice date, number
- Stock movement date

### Query Optimization
```sql
-- ✅ Good: Use indexes
SELECT * FROM products WHERE barcode = ?

-- ❌ Bad: Full table scan
SELECT * FROM products WHERE LOWER(name) LIKE '%search%'

-- ✅ Better: Index-friendly
SELECT * FROM products WHERE name LIKE 'Search%'
```

## Security Notes

### SQL Injection Prevention
Always use parameterized queries:
```typescript
// ✅ Good
executeQuery('SELECT * FROM products WHERE id = ?', [productId])

// ❌ NEVER
executeQuery(`SELECT * FROM products WHERE id = '${productId}'`)
```

### Password Security
TODO: Implement bcrypt hashing
```typescript
// Current (DEV ONLY)
if (password !== 'admin123') return false

// Future (Production)
import bcrypt from 'bcryptjs'
const hash = await bcrypt.hash(password, 10)
const match = await bcrypt.compare(password, user.password_hash)
```

## Next Development Tasks

### Phase 1 Completion
1. **Product Management:**
   - Product CRUD (Create, Read, Update, Delete)
   - Batch management
   - Category & manufacturer management
   - Low stock alerts
   - Near-expiry alerts

2. **Customer Management:**
   - Customer CRUD
   - Search & filter
   - Credit limit tracking
   - Loyalty points (future)

3. **Polish:**
   - Loading states
   - Better error messages
   - Toast notifications
   - Keyboard shortcuts

### Phase 2
- Daily closing/reconciliation
- Purchase orders
- Sales reports
- Stock adjustments
- Thermal printer integration

### Phase 3
- Role-based permissions
- Settings screen
- Auto-updates
- Dark mode
- High-contrast mode
