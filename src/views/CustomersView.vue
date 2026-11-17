<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import { ref } from 'vue';
import { useDialogKeyboard } from '@/composables/useDialogKeyboard';
import { bindTemplateRef } from '@/lib/templateRefs';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useCustomers } from '@/composables/useCustomers';

const {
  label,
  auth,
  router,
  pick,
  t,
  customers,
  searchQuery,
  loading,
  showModal,
  editingCustomer,
  formData,
  filteredCustomers,
  openAddModal,
  openEditModal,
  saveCustomer,
  deleteCustomer,
  formatCurrency,
} = useCustomers();
const formDialog = ref<HTMLElement | null>(null);
const bindFormDialog = bindTemplateRef(formDialog);
useDialogKeyboard(formDialog, () => {
  if (!loading.value) showModal.value = false;
});
</script>

<template>
  <div class="tool-terminal compact-workspace p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b flex justify-between items-center">
        <h1 class="text-2xl font-bold">{{ t('customers') }}</h1>
        <Button @click="openAddModal">{{ pick('Add Customer', 'گاہک شامل کریں') }}</Button>
      </div>

      <!-- Search -->
      <div class="tool-toolbar p-6 border-b">
        <Input
          v-model="searchQuery"
          :placeholder="
            pick('Search by name, code, or phone...', 'نام، کوڈ یا فون سے تلاش کریں...')
          "
          class="max-w-md"
        />
      </div>

      <!-- Table -->
      <div class="paged-table-host tool-table-scroll flex-1 overflow-auto p-6">
        <div v-if="loading && customers.length === 0" class="text-center py-12 text-gray-500">
          {{ pick('Loading customers...', 'گاہک لوڈ ہو رہے ہیں...') }}
        </div>

        <div v-else-if="filteredCustomers.length === 0" class="text-center py-12 text-gray-500">
          {{
            searchQuery
              ? pick('No customers found', 'کوئی گاہک نہیں ملا')
              : pick(
                  'No customers yet. Add your first customer!',
                  'ابھی کوئی گاہک نہیں۔ پہلا گاہک شامل کریں!',
                )
          }}
        </div>

        <CompactPages
          v-else
          :items="filteredCustomers"
          :row-height="56"
          :header-height="36"
          v-slot="{ rows: pageRows }"
        >
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b bg-gray-50">
                <th class="text-left p-3 font-semibold">{{ pick('Code', 'کوڈ') }}</th>
                <th class="text-left p-3 font-semibold">{{ pick('Name', 'نام') }}</th>
                <th class="text-left p-3 font-semibold">{{ pick('Phone', 'فون') }}</th>
                <th class="text-left p-3 font-semibold">{{ pick('Type', 'قسم') }}</th>
                <th class="text-right p-3 font-semibold">{{ pick('Balance', 'بقایا') }}</th>
                <th class="text-right p-3 font-semibold">{{ t('credit_limit') }}</th>
                <th class="text-center p-3 font-semibold">{{ t('status') }}</th>
                <th class="text-center p-3 font-semibold">{{ pick('Actions', 'اقدامات') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="{ item: customer } in pageRows"
                :key="customer.id"
                class="border-b hover:bg-gray-50"
              >
                <td class="p-3 font-mono text-sm">{{ customer.customer_code }}</td>
                <td class="p-3">
                  <div class="font-medium">{{ customer.first_name }} {{ customer.last_name }}</div>
                  <div v-if="customer.address" class="text-sm text-gray-600 truncate max-w-xs">
                    {{ customer.address }}
                  </div>
                </td>
                <td class="p-3 text-sm">{{ customer.phone_number || '-' }}</td>
                <td class="p-3">
                  <span
                    :class="[
                      'inline-block px-2 py-1 text-xs rounded capitalize',
                      customer.customer_type === 'wholesale'
                        ? 'bg-banner-info-bg border-banner-info-border text-info-text'
                        : 'bg-banner-success-bg border-banner-success-border text-success-text',
                    ]"
                  >
                    {{ t(customer.customer_type) }}
                  </span>
                </td>
                <td class="p-3 text-right">
                  <span
                    class="customer-balance-badge"
                    :class="
                      customer.current_balance < 0
                        ? 'credit'
                        : customer.current_balance > customer.credit_limit
                          ? 'over-limit'
                          : customer.current_balance > 0
                            ? 'owed'
                            : 'settled'
                    "
                    >{{ formatCurrency(customer.current_balance)
                    }}<small>{{
                      customer.current_balance < 0
                        ? pick('Account credit', 'کھاتے کا کریڈٹ')
                        : customer.current_balance > customer.credit_limit
                          ? pick('Over limit', 'حد سے زیادہ')
                          : customer.current_balance > 0
                            ? pick('Outstanding', 'واجب الادا')
                            : pick('Settled', 'بقایا صفر')
                    }}</small></span
                  >
                </td>
                <td class="p-3 text-right text-secondary">
                  {{ formatCurrency(customer.credit_limit) }}
                </td>
                <td class="p-3 text-center">
                  <span
                    :class="[
                      'inline-block px-2 py-1 text-xs rounded',
                      customer.is_active
                        ? 'bg-banner-success-bg border-banner-success-border text-success-text'
                        : 'bg-surface-page text-muted',
                    ]"
                  >
                    {{ customer.is_active ? t('active') : t('inactive') }}
                  </span>
                </td>
                <td class="p-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="
                      router.push({ path: '/customer-ledger', query: { customer: customer.id } })
                    "
                    >{{ pick('Ledger', 'کھاتہ') }}</Button
                  >
                  <Button variant="outline" size="sm" @click="openEditModal(customer)" class="mr-2">
                    {{ t('edit') }}
                  </Button>
                  <Button variant="destructive" size="sm" @click="deleteCustomer(customer)">
                    {{ t('delete') }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </CompactPages>
      </div>
      <footer class="tool-summary">
        <div>
          <small>{{ label('Customers shown') }}</small><strong>{{
            filteredCustomers.length
          }}</strong>
        </div>
      </footer>
    </Card>

    <!-- Modal -->
    <div
      v-if="showModal"
      :ref="bindFormDialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="pick('Customer', 'گاہک')"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @pointerdown.self.prevent
    >
      <Card class="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div class="p-6 border-b">
          <h2 class="text-xl font-bold">
            {{
              editingCustomer
                ? pick('Edit Customer', 'گاہک کی تدوین')
                : pick('Add New Customer', 'نیا گاہک شامل کریں')
            }}
          </h2>
        </div>

        <div class="p-6 space-y-4">
          <!-- Row 1 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="field-customersview-1" class="block text-sm font-medium mb-2"
                >{{ pick('First Name', 'پہلا نام') }} *</label
              >
              <Input id="field-customersview-1" v-model="formData.first_name" placeholder="Ahmed" />
            </div>
            <div>
              <label for="field-customersview-2" class="block text-sm font-medium mb-2"
                >{{ pick('Last Name', 'آخری نام') }} *</label
              >
              <Input id="field-customersview-2" v-model="formData.last_name" placeholder="Ali" />
            </div>
          </div>

          <!-- Row 2 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="field-customersview-3" class="block text-sm font-medium mb-2">{{
                t('phone_number')
              }}</label>
              <Input
                id="field-customersview-3"
                v-model="formData.phone_number"
                placeholder="03001234567"
              />
            </div>
            <div>
              <label for="field-customersview-4" class="block text-sm font-medium mb-2">{{
                t('customer_type')
              }}</label>
              <select
                id="field-customersview-4"
                v-model="formData.customer_type"
                class="w-full border rounded-md p-2"
              >
                <option value="retail">{{ t('retail') }}</option>
                <option value="wholesale">{{ t('wholesale') }}</option>
              </select>
            </div>
          </div>

          <!-- Row 3 -->
          <div>
            <label for="field-customersview-5" class="block text-sm font-medium mb-2">{{
              t('address')
            }}</label>
            <Input
              id="field-customersview-5"
              v-model="formData.address"
              placeholder="House 123, Street 5, City"
            />
          </div>

          <!-- Row 4 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="field-customersview-6" class="block text-sm font-medium mb-2"
                >{{ t('credit_limit') }} (Rs)</label
              >
              <Input
                id="field-customersview-6"
                v-model.number="formData.credit_limit"
                type="number"
                min="0"
                step="0.01"
                :disabled="!auth.hasRole(['admin', 'manager'])"
              /><small>{{
                pick(
                  'Managers set credit limits. Current debt is changed only by sales, collections and credit notes.',
                  'کریڈٹ حد منیجر مقرر کرتا ہے۔ بقایا صرف فروخت، وصولی اور کریڈٹ نوٹ سے بدلتا ہے۔',
                )
              }}</small>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 mb-2">
                <input v-model="formData.is_active" type="checkbox" />
                <span class="text-sm font-medium">{{ t('active') }}</span>
              </label>
            </div>
          </div>

          <div
            v-if="!editingCustomer"
            class="text-sm text-info-text bg-banner-info-bg border-banner-info-border p-3 rounded"
          >
            {{
              pick(
                'Customer code will be auto-generated (e.g., C001, C002...)',
                'گاہک کا کوڈ خود بخود بنے گا (مثلاً C001، C002...)',
              )
            }}
          </div>
        </div>

        <div class="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" @click="showModal = false" :disabled="loading">
            {{ t('cancel') }}
          </Button>
          <Button @click="saveCustomer" :disabled="loading">
            {{
              loading
                ? pick('Saving...', 'محفوظ ہو رہا ہے...')
                : pick('Save Customer', 'گاہک محفوظ کریں')
            }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>
