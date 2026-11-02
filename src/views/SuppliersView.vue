<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { executeQuery, executeUpdate } from '@/lib/database'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import type { Supplier } from '@/lib/types'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Badge from '@/components/ui/Badge.vue'
import BilingualText from '@/components/ui/BilingualText.vue'

const { t, pick, formatCurrency, formatNumber } = useI18n()
const { showToast } = useToast()

const suppliers = ref<Supplier[]>([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const showModal = ref(false)
const isEditing = ref(false)
const ledgerBalance = ref<Record<string, number>>({})

const currentSupplier = ref<Partial<Supplier>>({
  supplier_code: '',
  name: '',
  contact_person: '',
  phone_number: '',
  email: '',
  address: '',
  city: '',
  country: 'Pakistan',
  tax_registration: '',
  payment_terms: 30,
  credit_limit: 0,
  current_balance: 0,
  is_active: true,
  notes: ''
})

const filteredSuppliers = computed(() => {
  let result = suppliers.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.trim().toLowerCase()
    result = result.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.supplier_code.toLowerCase().includes(query) ||
      s.contact_person?.toLowerCase().includes(query) ||
      s.phone_number?.includes(query) ||
      s.city?.toLowerCase().includes(query)
    )
  }

  // Status filter
  if (statusFilter.value !== 'all') {
    result = result.filter(s =>
      statusFilter.value === 'active' ? Boolean(s.is_active) : !Boolean(s.is_active)
    )
  }

  return result
})

onMounted(async () => {
  await loadSuppliers()
})

async function loadSuppliers() {
  loading.value = true
  try {
    suppliers.value = await executeQuery<Supplier>(
      `SELECT * FROM suppliers 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC`
    )
    const balances = await executeQuery<{ supplier_id: string; total_amount: number; ordered_value: number; received_value: number; paid_cents: number }>(
      `SELECT po.supplier_id, po.total_amount,
       COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS ordered_value,
       COALESCE((SELECT SUM(CASE WHEN i.quantity_ordered > 0 THEN i.line_total * i.quantity_received / i.quantity_ordered ELSE 0 END) FROM purchase_order_items i WHERE i.po_id = po.id), 0) AS received_value,
       COALESCE((SELECT SUM(p.amount_cents) FROM supplier_payments p WHERE p.po_id = po.id), 0) AS paid_cents
       FROM purchase_orders po WHERE po.status IN ('partial', 'received')`
    )
    ledgerBalance.value = {}
    for (const row of balances) {
      const accrued = Math.round(row.total_amount * 100 * (row.ordered_value > 0 ? Math.min(1, row.received_value / row.ordered_value) : 0))
      ledgerBalance.value[row.supplier_id] = (ledgerBalance.value[row.supplier_id] || 0) + Math.max(0, accrued - row.paid_cents) / 100
    }
  } catch (error) {
    showToast(pick('Error loading suppliers', 'سپلائرز لوڈ کرنے میں خرابی'), 'error')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  isEditing.value = false
  currentSupplier.value = {
    supplier_code: '',
    name: '',
    contact_person: '',
    phone_number: '',
    email: '',
    address: '',
    city: '',
    country: 'Pakistan',
    payment_terms: 30,
    credit_limit: 0,
    current_balance: 0,
    is_active: true,
    notes: ''
  }
  showModal.value = true
}

function openEditModal(supplier: Supplier) {
  isEditing.value = true
  currentSupplier.value = { ...supplier }
  showModal.value = true
}

async function saveSupplier() {
  const name = currentSupplier.value.name?.trim()
  const code = currentSupplier.value.supplier_code?.trim()
  if (!name || !code) {
    showToast(pick('Name and code are required', 'نام اور کوڈ ضروری ہیں'), 'error')
    return
  }
  if (!Number.isInteger(Number(currentSupplier.value.payment_terms)) || Number(currentSupplier.value.payment_terms) < 0 ||
      !Number.isFinite(Number(currentSupplier.value.credit_limit)) || Number(currentSupplier.value.credit_limit) < 0) {
    showToast(pick('Payment terms and credit limit cannot be negative', 'ادائیگی کی مدت اور کریڈٹ کی حد منفی نہیں ہو سکتی'), 'error')
    return
  }

  try {
    if (isEditing.value && currentSupplier.value.id) {
      // Update existing
      await executeUpdate(
        `UPDATE suppliers SET
          name = ?, contact_person = ?, phone_number = ?, email = ?,
          address = ?, city = ?, country = ?, tax_registration = ?,
          payment_terms = ?, credit_limit = ?, is_active = ?, notes = ?,
          updated_at = datetime('now')
         WHERE id = ?`,
        [
          name,
          currentSupplier.value.contact_person || null,
          currentSupplier.value.phone_number || null,
          currentSupplier.value.email || null,
          currentSupplier.value.address || null,
          currentSupplier.value.city || null,
          currentSupplier.value.country || 'Pakistan',
          currentSupplier.value.tax_registration || null,
          Number(currentSupplier.value.payment_terms),
          Number(currentSupplier.value.credit_limit),
          currentSupplier.value.is_active ? 1 : 0,
          currentSupplier.value.notes || null,
          currentSupplier.value.id
        ]
      )
      showToast(pick('Supplier updated successfully', 'سپلائر کامیابی سے اپ ڈیٹ ہو گیا'), 'success')
    } else {
      // Create new
      const id = `sup-${Date.now()}`
      await executeUpdate(
        `INSERT INTO suppliers (
          id, supplier_code, name, contact_person, phone_number, email,
          address, city, country, tax_registration, payment_terms,
          credit_limit, current_balance, is_active, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          code,
          name,
          currentSupplier.value.contact_person || null,
          currentSupplier.value.phone_number || null,
          currentSupplier.value.email || null,
          currentSupplier.value.address || null,
          currentSupplier.value.city || null,
          currentSupplier.value.country || 'Pakistan',
          currentSupplier.value.tax_registration || null,
          Number(currentSupplier.value.payment_terms),
          Number(currentSupplier.value.credit_limit),
          currentSupplier.value.is_active ? 1 : 0,
          currentSupplier.value.notes || null
        ]
      )
      showToast(pick('Supplier created successfully', 'سپلائر کامیابی سے شامل ہو گیا'), 'success')
    }

    showModal.value = false
    await loadSuppliers()
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      showToast(pick('Supplier code already exists', 'سپلائر کوڈ پہلے سے موجود ہے'), 'error')
    } else {
      showToast(pick('Error saving supplier', 'سپلائر محفوظ کرنے میں خرابی'), 'error')
    }
    console.error(error)
  }
}

async function deleteSupplier(id: string) {
  if (!confirm(pick('Are you sure you want to delete this supplier?', 'کیا آپ واقعی اس سپلائر کو حذف کرنا چاہتے ہیں؟'))) return

  try {
    await executeUpdate(
      `UPDATE suppliers SET deleted_at = datetime('now') WHERE id = ?`,
      [id]
    )
    showToast(pick('Supplier deleted successfully', 'سپلائر کامیابی سے حذف ہو گیا'), 'success')
    await loadSuppliers()
  } catch (error) {
    showToast(pick('Error deleting supplier', 'سپلائر حذف کرنے میں خرابی'), 'error')
    console.error(error)
  }
}
</script>

<template>
  <div class="tool-terminal suppliers-view">
    <!-- Header -->
    <div class="tool-header view-header">
      <div>
        <h2 class="view-title">
          <BilingualText textKey="suppliers" />
        </h2>
        <p class="view-subtitle">
          {{ formatNumber(suppliers.length) }} {{ t('suppliers') }}
        </p>
      </div>
      <Button @click="openAddModal" size="lg">
        <span class="button-icon">+</span>
        {{ pick('Add Supplier', 'سپلائر شامل کریں') }}
      </Button>
    </div>

    <!-- Search & Filters -->
    <Card class="filters-card">
      <div class="filters-grid">
        <Input
          v-model="searchQuery"
          :placeholder="pick('Search suppliers...', 'سپلائرز تلاش کریں...')"
          class="search-input"
        />
        <select v-model="statusFilter" class="filter-select">
          <option value="all">{{ pick('All Status', 'تمام حیثیتیں') }}</option>
          <option value="active">{{ t('active') }}</option>
          <option value="inactive">{{ t('inactive') }}</option>
        </select>
      </div>
    </Card>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ pick('Loading suppliers...', 'سپلائرز لوڈ ہو رہے ہیں...') }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredSuppliers.length === 0" class="empty-state">
      <div class="empty-icon">📦</div>
      <h3 class="empty-title">{{ pick('No Suppliers Found', 'کوئی سپلائر نہیں ملا') }}</h3>
      <p class="empty-subtitle">{{ pick('Add your first supplier to get started', 'شروع کرنے کے لیے اپنا پہلا سپلائر شامل کریں') }}</p>
      <Button @click="openAddModal" variant="outline">
        {{ pick('Add Supplier', 'سپلائر شامل کریں') }}
      </Button>
    </div>

    <!-- Suppliers Grid -->
    <div v-else class="suppliers-grid">
      <Card v-for="supplier in filteredSuppliers" :key="supplier.id" class="supplier-card">
        <div class="supplier-header">
          <div>
            <h3 class="supplier-name">{{ supplier.name }}</h3>
            <p class="supplier-code">{{ supplier.supplier_code }}</p>
          </div>
          <Badge :variant="supplier.is_active ? 'success' : 'neutral'">
            {{ supplier.is_active ? t('active') : t('inactive') }}
          </Badge>
        </div>

        <div class="supplier-details">
          <div v-if="supplier.contact_person" class="detail-row">
            <span class="detail-icon">👤</span>
            <span>{{ supplier.contact_person }}</span>
          </div>
          <div v-if="supplier.phone_number" class="detail-row">
            <span class="detail-icon">📞</span>
            <span>{{ supplier.phone_number }}</span>
          </div>
          <div v-if="supplier.email" class="detail-row">
            <span class="detail-icon">📧</span>
            <span>{{ supplier.email }}</span>
          </div>
          <div v-if="supplier.city" class="detail-row">
            <span class="detail-icon">📍</span>
            <span>{{ supplier.city }}, {{ supplier.country }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">💰</span>
            <span>{{ pick('Received PO balance', 'موصولہ آرڈر کا بقایا') }}: {{ formatCurrency(ledgerBalance[supplier.id] || 0) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-icon">📅</span>
            <span>{{ pick('Payment', 'ادائیگی') }}: {{ formatNumber(supplier.payment_terms) }} {{ t('days') }}</span>
          </div>
        </div>

        <div class="supplier-actions">
          <Button @click="openEditModal(supplier)" variant="outline" size="sm">
            {{ t('edit') }}
          </Button>
          <Button @click="deleteSupplier(supplier.id)" variant="outline" size="sm">
            {{ t('delete') }}
          </Button>
        </div>
      </Card>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <Card class="modal-content">
        <h3 class="modal-title">
          {{ isEditing ? pick('Edit Supplier', 'سپلائر میں ترمیم کریں') : pick('Add Supplier', 'سپلائر شامل کریں') }}
        </h3>

        <form @submit.prevent="saveSupplier" class="modal-form">
          <div class="form-grid">
            <div class="form-field">
              <label>{{ t('supplier_code') }} *</label>
              <Input
                v-model="currentSupplier.supplier_code"
                :disabled="isEditing"
                placeholder="SUP001"
                required
              />
            </div>

            <div class="form-field">
              <label>{{ t('supplier_name') }} *</label>
              <Input
                v-model="currentSupplier.name"
                :placeholder="pick('Enter supplier name', 'سپلائر کا نام درج کریں')"
                required
              />
            </div>

            <div class="form-field">
              <label>{{ t('contact_person') }}</label>
              <Input
                v-model="currentSupplier.contact_person"
                :placeholder="pick('Contact person name', 'رابطہ شخص کا نام')"
              />
            </div>

            <div class="form-field">
              <label>{{ t('phone_number') }}</label>
              <Input
                v-model="currentSupplier.phone_number"
                placeholder="03XX-XXXXXXX"
              />
            </div>

            <div class="form-field">
              <label>{{ t('email') }}</label>
              <Input
                v-model="currentSupplier.email"
                type="email"
                placeholder="supplier@email.com"
              />
            </div>

            <div class="form-field">
              <label>{{ t('city') }}</label>
              <Input
                v-model="currentSupplier.city"
                placeholder="Lahore"
              />
            </div>

            <div class="form-field">
              <label>{{ pick('Payment Terms (days)', 'ادائیگی کی مدت (دن)') }}</label>
              <Input
                v-model.number="currentSupplier.payment_terms"
                type="number"
                min="0"
                step="1"
                placeholder="30"
              />
            </div>

            <div class="form-field">
              <label>{{ t('credit_limit') }}</label>
              <Input
                v-model.number="currentSupplier.credit_limit"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>

            <div class="form-field full-width">
              <label>{{ t('address') }}</label>
              <Input
                v-model="currentSupplier.address"
                :placeholder="pick('Full address', 'مکمل پتہ')"
              />
            </div>

            <div class="form-field full-width">
              <label>{{ t('notes') }}</label>
              <textarea
                v-model="currentSupplier.notes"
                class="form-textarea"
                :placeholder="pick('Additional notes', 'اضافی نوٹس')"
                rows="3"
              ></textarea>
            </div>

            <div class="form-field">
              <label class="checkbox-label">
                <input
                  v-model="currentSupplier.is_active"
                  type="checkbox"
                  :true-value="1"
                  :false-value="0"
                />
                <span>{{ t('active') }}</span>
              </label>
            </div>
          </div>

          <div class="modal-actions">
            <Button type="button" @click="showModal = false" variant="outline">
              {{ t('cancel') }}
            </Button>
            <Button type="submit">
              {{ isEditing ? pick('Update Supplier', 'سپلائر اپ ڈیٹ کریں') : pick('Create Supplier', 'سپلائر بنائیں') }}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.suppliers-view {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.view-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.view-subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.button-icon {
  font-size: 1.5rem;
  margin-right: 0.5rem;
}

.filters-card {
  margin-bottom: 2rem;
  padding: 1.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
}

.search-input {
  font-size: 1rem;
}

.filter-select {
  padding: 0.625rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  cursor: pointer;
}

.loading-state {
  text-align: center;
  padding: 4rem;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

.empty-state {
  text-align: center;
  padding: 4rem;
}

.empty-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.empty-subtitle {
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
}

.suppliers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.supplier-card {
  padding: 1.5rem;
  transition: var(--transition-fast);
}

.supplier-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.supplier-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1rem;
}

.supplier-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.supplier-code {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.supplier-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.detail-icon {
  font-size: 1.125rem;
}

.supplier-actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 2rem;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 2rem;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-textarea {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

@media (max-width: 768px) {
  .suppliers-view {
    padding: 1rem;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }

  .suppliers-grid {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .modal-content {
    padding: 1.5rem;
  }
}
</style>
