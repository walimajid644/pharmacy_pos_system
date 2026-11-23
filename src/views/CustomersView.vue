<script setup lang="ts">
import CompactPages from '@/components/ui/CompactPages.vue';
import ContactFormDialog from '@/components/contacts/ContactFormDialog.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useCustomers } from '@/composables/useCustomers';

const {
  label,
  router,
  pick,
  t,
  customers,
  loadCustomers,
  searchQuery,
  loading,
  showModal,
  editingCustomer,
  filteredCustomers,
  openAddModal,
  openEditModal,
  deleteCustomer,
  formatCurrency,
} = useCustomers();
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

    <ContactFormDialog
      v-if="showModal"
      v-model:open="showModal"
      initial-role="client"
      :client="editingCustomer"
      @saved="loadCustomers"
    />
  </div>
</template>
