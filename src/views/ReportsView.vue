<script setup lang="ts">
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import DailySalesReport from '@/components/reports/DailySalesReport.vue';
import ProductSalesReport from '@/components/reports/ProductSalesReport.vue';
import LowStockReport from '@/components/reports/LowStockReport.vue';
import NearExpiryReport from '@/components/reports/NearExpiryReport.vue';
import StockValuationReport from '@/components/reports/StockValuationReport.vue';
import { useReports } from '@/composables/useReports';

const {
  label,
  router,
  pick,
  formatDate,
  settingsStore,
  auth,
  loading,
  selectedReport,
  dateFrom,
  dateTo,
  dailySalesData,
  salesByProductData,
  lowStockData,
  nearExpiryData,
  stockValuationData,
  generateDailySalesReport,
  generateSalesByProductReport,
  generateLowStockReport,
  generateNearExpiryReport,
  generateStockValuationReport,
  exportToCSV,
  getDaysClass,
  formatCurrency,
} = useReports();
</script>

<template>
  <div class="tool-terminal compact-workspace p-6 h-full flex flex-col">
    <header class="tool-header">
      <h1>{{ label('Reports') }}</h1>
    </header>
    <div class="tool-report-grid grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <!-- Report Menu -->
      <div class="lg:col-span-1">
        <Card class="p-6">
          <h2 class="text-sm font-semibold mb-4">{{ label('Report filters') }}</h2>

          <!-- Date Range -->
          <div class="mb-6 space-y-3">
            <div>
              <label for="report-date-from" class="block text-sm font-medium mb-2">{{
                label('From Date')
              }}</label>
              <Input id="report-date-from" v-model="dateFrom" type="date" />
            </div>
            <div>
              <label for="report-date-to" class="block text-sm font-medium mb-2">{{
                label('To Date')
              }}</label>
              <Input id="report-date-to" v-model="dateTo" type="date" />
            </div>
          </div>

          <Button class="w-full mb-3" variant="outline" @click="router.push('/controlled-sales')">{{
            pick('Controlled Sales', 'کنٹرول شدہ فروخت')
          }}</Button><Button
            class="w-full mb-3"
            variant="outline"
            @click="router.push('/cashier-performance')"
            >{{ pick('Cashier Performance', 'کیشئر کی کارکردگی') }}</Button
          >
          <!-- Report Buttons -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-gray-600 uppercase">
              {{ label('Sales Reports') }}
            </h3>
            <Button
              variant="outline"
              class="w-full justify-start"
              @click="generateDailySalesReport"
              :disabled="loading"
            >
              📊 Daily Sales Summary
            </Button>
            <Button
              variant="outline"
              class="w-full justify-start"
              @click="generateSalesByProductReport"
              :disabled="loading"
            >
              📦 Sales by Product
            </Button>

            <h3 class="text-sm font-semibold text-gray-600 uppercase mt-6">
              {{ label('Inventory Reports') }}
            </h3>
            <Button
              variant="outline"
              class="w-full justify-start"
              @click="generateLowStockReport"
              :disabled="loading"
            >
              ⚠️ Low Stock Report
            </Button>
            <Button
              variant="outline"
              class="w-full justify-start"
              @click="generateNearExpiryReport"
              :disabled="loading"
            >
              ⏰ Near Expiry Report
            </Button>
            <Button
              variant="outline"
              class="w-full justify-start"
              @click="generateStockValuationReport"
              :disabled="loading"
            >
              💰 Stock Valuation
            </Button>
          </div>
        </Card>
      </div>

      <!-- Report Display -->
      <div class="lg:col-span-2">
        <Card class="h-full flex flex-col">
          <div v-if="!selectedReport" class="flex-1 flex items-center justify-center text-gray-500">
            <div class="text-center">
              <div class="text-6xl mb-4">📈</div>
              <div class="text-lg">Select a report to view</div>
            </div>
          </div>

          <!-- Daily Sales Report -->
          <DailySalesReport
            v-else-if="selectedReport === 'daily-sales'"
            :label="label"
            :date-from="dateFrom"
            :date-to="dateTo"
            :daily-sales-data="dailySalesData"
            :export-to-c-s-v="exportToCSV"
            :format-currency="formatCurrency"
          />
          <!-- Sales by Product Report -->
          <ProductSalesReport
            v-else-if="selectedReport === 'sales-by-product'"
            :label="label"
            :date-from="dateFrom"
            :date-to="dateTo"
            :sales-by-product-data="salesByProductData"
            :export-to-c-s-v="exportToCSV"
            :format-currency="formatCurrency"
          />
          <!-- Low Stock Report -->
          <LowStockReport
            v-else-if="selectedReport === 'low-stock'"
            :label="label"
            :low-stock-data="lowStockData"
            :export-to-c-s-v="exportToCSV"
            :format-currency="formatCurrency"
          />
          <!-- Near Expiry Report -->
          <NearExpiryReport
            v-else-if="selectedReport === 'near-expiry'"
            :label="label"
            :open-batch-actions="
              (batchId) => router.push({ path: '/expiry-actions', query: { batch: batchId } })
            "
            :pick="pick"
            :format-date="formatDate"
            :settings-store="settingsStore"
            :auth="auth"
            :near-expiry-data="nearExpiryData"
            :export-to-c-s-v="exportToCSV"
            :get-days-class="getDaysClass"
            :format-currency="formatCurrency"
          />
          <!-- Stock Valuation Report -->
          <StockValuationReport
            v-else-if="selectedReport === 'stock-valuation'"
            :label="label"
            :pick="pick"
            :stock-valuation-data="stockValuationData"
            :export-to-c-s-v="exportToCSV"
            :format-currency="formatCurrency"
          />
        </Card>
      </div>
    </div>
  </div>
</template>
