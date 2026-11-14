<script setup lang="ts">
import Card from '@/components/ui/Card.vue';
import SalesHistoryFilters from '@/components/sales-history/SalesHistoryFilters.vue';
import SalesHistoryTable from '@/components/sales-history/SalesHistoryTable.vue';
import InvoiceDetailsDialog from '@/components/sales-history/InvoiceDetailsDialog.vue';
import InvoicePrintDocument from '@/components/sales-history/InvoicePrintDocument.vue';
import { useSalesHistory } from '@/composables/useSalesHistory';

const {
  pick,
  t,
  formatNumber,
  invoices,
  customers,
  loading,
  showDetailModal,
  selectedInvoice,
  invoiceItems,
  printMode,
  digitalText,
  salePrice,
  shop,
  dateFrom,
  dateTo,
  searchQuery,
  selectedCustomer,
  selectedPaymentMethod,
  filteredInvoices,
  totalSales,
  totalInvoices,
  viewInvoiceDetails,
  copySms,
  sendWhatsApp,
  closeDetailModal,
  getPaymentMethodBadge,
  clearFilters,
  printInvoice,
  formatCurrency,
  formatDate,
  formatDateTime,
} = useSalesHistory();
</script>

<template>
  <div class="tool-terminal p-6 h-full flex flex-col">
    <Card class="tool-panel flex-1 flex flex-col">
      <!-- Header -->
      <div class="tool-header p-6 border-b">
        <h1 class="text-2xl font-bold">{{ t('sales_history') }}</h1>
        <p class="text-sm text-gray-600 mt-1">
          {{ pick('View and search past sales transactions', 'پچھلی فروخت دیکھیں اور تلاش کریں') }}
        </p>
      </div>

      <!-- Filters -->
      <SalesHistoryFilters
        :pick="pick"
        :t="t"
        :format-number="formatNumber"
        :customers="customers"
        :total-sales="totalSales"
        :total-invoices="totalInvoices"
        :clear-filters="clearFilters"
        :format-currency="formatCurrency"
        v-model:date-from="dateFrom"
        v-model:date-to="dateTo"
        v-model:selected-customer="selectedCustomer"
        v-model:selected-payment-method="selectedPaymentMethod"
        v-model:search-query="searchQuery"
      />
      <!-- Table -->
      <SalesHistoryTable
        :pick="pick"
        :t="t"
        :invoices="invoices"
        :loading="loading"
        :search-query="searchQuery"
        :selected-customer="selectedCustomer"
        :selected-payment-method="selectedPaymentMethod"
        :filtered-invoices="filteredInvoices"
        :view-invoice-details="viewInvoiceDetails"
        :get-payment-method-badge="getPaymentMethodBadge"
        :format-currency="formatCurrency"
        :format-date="formatDate"
        :format-date-time="formatDateTime"
      />
    </Card>

    <!-- Invoice Detail Modal -->
    <InvoiceDetailsDialog
      :pick="pick"
      :t="t"
      :format-number="formatNumber"
      :show-detail-modal="showDetailModal"
      :selected-invoice="selectedInvoice"
      :invoice-items="invoiceItems"
      :sale-price="salePrice"
      :copy-sms="copySms"
      :send-whats-app="sendWhatsApp"
      :close-detail-modal="closeDetailModal"
      :print-invoice="printInvoice"
      :format-currency="formatCurrency"
      :format-date="formatDate"
      v-model:digital-text="digitalText"
    />
  </div>
  <InvoicePrintDocument
    :pick="pick"
    :t="t"
    :format-number="formatNumber"
    :selected-invoice="selectedInvoice"
    :invoice-items="invoiceItems"
    :print-mode="printMode"
    :sale-price="salePrice"
    :shop="shop"
    :format-currency="formatCurrency"
    :format-date-time="formatDateTime"
  />
</template>
