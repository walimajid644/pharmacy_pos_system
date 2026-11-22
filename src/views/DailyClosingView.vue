<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels';
const uiLabel = useWorkspaceLabels();

import { useI18n } from '@/lib/i18n';
const { formatDate, formatDateTime, formatNumber } = useI18n();
import CompactPages from '@/components/ui/CompactPages.vue';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import { useDailyClosing } from '@/composables/useDailyClosing';

const {
  loading,
  showClosingForm,
  todayDate,
  salesData,
  closingHistory,
  todayClosed,
  actualCash,
  actualCard,
  notes,
  cashDifference,
  cardDifference,
  openClosingForm,
  cancelClosing,
  submitClosing,
  getDifferenceClass,
  formatCurrency,
} = useDailyClosing();
</script>

<template>
  <div class="tool-terminal compact-workspace p-6 h-full flex flex-col">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <!-- Today's Sales -->
      <div class="flex flex-col">
        <Card class="flex-1 flex flex-col">
          <div class="tool-header p-6 border-b">
            <h1 class="text-2xl font-bold">{{ uiLabel('Daily Closing') }}</h1>
            <p class="text-sm text-gray-600 mt-1">
              {{ formatDate(todayDate) }}
            </p>
          </div>

          <div class="flex-1 p-6 space-y-6">
            <!-- Status -->
            <div
              v-if="todayClosed"
              class="p-4 bg-banner-success-bg border-banner-success-border border border-banner-success-border rounded-md"
            >
              <div class="flex items-center gap-2">
                <span class="text-2xl">✅</span>
                <div>
                  <div class="font-semibold text-success-text">
                    {{ uiLabel('Day Already Closed') }}
                  </div>
                  <div class="text-sm text-success-text">
                    {{ uiLabel('This day has been closed and reconciled') }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else-if="salesData.invoice_count === 0"
              class="p-4 bg-banner-warning-bg border-banner-warning-border border border-banner-warning-border rounded-md"
            >
              <div class="flex items-center gap-2">
                <span class="text-2xl">ℹ️</span>
                <div>
                  <div class="font-semibold text-warning-text">{{ uiLabel('No Sales Today') }}</div>
                  <div class="text-sm text-warning-text">
                    {{ uiLabel('No transactions recorded for today') }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="p-4 bg-banner-info-bg border-banner-info-border border border-banner-info-border rounded-md"
            >
              <div class="flex items-center gap-2">
                <span class="text-2xl">📊</span>
                <div>
                  <div class="font-semibold text-info-text">{{ uiLabel('Ready to Close') }}</div>
                  <div class="text-sm text-info-text">
                    {{ uiLabel('Review sales and close the day') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Sales Summary -->
            <div v-if="!showClosingForm">
              <h2 class="font-semibold mb-4">{{ uiLabel("Today's Sales Summary") }}</h2>

              <div class="space-y-3">
                <div class="flex justify-between items-center p-3 bg-surface-page rounded-md">
                  <span class="text-secondary">{{ uiLabel('Total Invoices') }}</span>
                  <span class="text-2xl font-bold">{{
                    formatNumber(salesData.invoice_count)
                  }}</span>
                </div>

                <div class="flex justify-between items-center p-3 bg-surface-page rounded-md">
                  <span class="text-secondary">{{ uiLabel('Total Sales') }}</span>
                  <span class="text-2xl font-bold text-primary-600">{{
                    formatCurrency(salesData.total_sales)
                  }}</span>
                </div>

                <div class="border-t pt-3 space-y-2">
                  <div class="flex justify-between text-sm">
                    <span>{{ uiLabel('Credit / Udhar') }}</span><strong>{{
                      formatCurrency(salesData.total_credit)
                    }}</strong>
                  </div>
                  <small>{{ uiLabel('Credit sales are invoiced, not cash collected.') }}</small>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">{{ uiLabel('💵 Cash') }}</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_cash) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">{{ uiLabel('💳 Card') }}</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_card) }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">{{ uiLabel('📱 Mobile') }}</span>
                    <span class="font-semibold">{{ formatCurrency(salesData.total_mobile) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Close Day Button -->
            <div v-if="!todayClosed && !showClosingForm">
              <Button
                @click="openClosingForm"
                size="lg"
                class="w-full"
                :disabled="salesData.invoice_count === 0"
              >
                {{ uiLabel('🔒 Close Day') }}
              </Button>
            </div>

            <!-- Closing Form -->
            <div
              v-if="showClosingForm"
              class="space-y-4 p-4 bg-banner-warning-bg border-banner-warning-border border border-banner-warning-border rounded-md"
            >
              <h3 class="font-semibold">{{ uiLabel('Cash Reconciliation') }}</h3>

              <div>
                <label for="field-dailyclosingview-1" class="block text-sm font-medium mb-2">
                  {{ uiLabel('Actual Cash (Expected:') }}
                  {{ formatCurrency(salesData.total_cash) }})
                </label>
                <Input
                  id="field-dailyclosingview-1"
                  v-model.number="actualCash"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
                <div
                  v-if="cashDifference !== 0"
                  :class="['text-sm mt-1 font-semibold', getDifferenceClass(cashDifference)]"
                >
                  {{ uiLabel(cashDifference > 0 ? 'Over' : 'Short') }} {{ uiLabel('by') }}
                  {{ formatCurrency(Math.abs(cashDifference)) }}
                </div>
              </div>

              <div>
                <label for="field-dailyclosingview-2" class="block text-sm font-medium mb-2">
                  {{ uiLabel('Actual Card (Expected:') }}
                  {{ formatCurrency(salesData.total_card) }})
                </label>
                <Input
                  id="field-dailyclosingview-2"
                  v-model.number="actualCard"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
                <div
                  v-if="cardDifference !== 0"
                  :class="['text-sm mt-1 font-semibold', getDifferenceClass(cardDifference)]"
                >
                  {{ uiLabel(cardDifference > 0 ? 'Over' : 'Short') }} {{ uiLabel('by') }}
                  {{ formatCurrency(Math.abs(cardDifference)) }}
                </div>
              </div>

              <div>
                <label for="field-dailyclosingview-3" class="block text-sm font-medium mb-2">{{
                  uiLabel('Notes (Optional)')
                }}</label>
                <textarea
                  id="field-dailyclosingview-3"
                  v-model="notes"
                  class="w-full border rounded-md p-2 text-sm"
                  rows="2"
                  :placeholder="uiLabel('Any notes about discrepancies or issues...')"
                ></textarea>
              </div>

              <div class="flex gap-3">
                <Button @click="submitClosing" :disabled="loading" class="flex-1">
                  {{ uiLabel(loading ? 'Closing...' : 'Confirm & Close Day') }}
                </Button>
                <Button variant="outline" @click="cancelClosing" :disabled="loading">
                  {{ uiLabel('Cancel') }}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- Closing History -->
      <div class="flex flex-col">
        <Card class="flex-1 flex flex-col">
          <div class="p-6 border-b">
            <h2 class="text-lg font-semibold">{{ uiLabel('Closing History') }}</h2>
            <p class="text-sm text-gray-600 mt-1">{{ uiLabel('Last 30 days') }}</p>
          </div>

          <div class="paged-table-host flex-1 p-6">
            <div v-if="closingHistory.length === 0" class="text-center py-12 text-gray-500">
              {{ uiLabel('No closing history yet') }}
            </div>

            <CompactPages
              v-else
              :items="closingHistory"
              :row-height="120"
              :header-height="0"
              v-slot="{ rows }"
            >
              <div class="space-y-3">
                <div
                  v-for="{ item: closing } in rows"
                  :key="closing.id"
                  class="p-4 border rounded-md hover:bg-gray-50"
                >
                  <div class="flex justify-between items-start mb-2">
                    <div>
                      <div class="font-semibold">
                        {{ formatDate(closing.closing_date) }}
                      </div>
                      <div class="text-sm text-secondary">
                        {{ uiLabel('Closed by:') }} {{ closing.closed_by_name }}
                      </div>
                      <div class="text-xs text-muted">
                        {{ formatDateTime(closing.closing_time) }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-lg font-bold text-primary-600">
                        {{ formatCurrency(closing.total_sales) }}
                      </div>
                    </div>
                  </div>

                  <div class="flex gap-4 text-sm pt-2 border-t">
                    <div>
                      <span class="text-secondary">{{ uiLabel('Cash:') }}</span>
                      <span class="font-semibold ml-1">{{
                        formatCurrency(closing.total_cash)
                      }}</span>
                    </div>
                    <div>
                      <span class="text-secondary">{{ uiLabel('Card:') }}</span>
                      <span class="font-semibold ml-1">{{
                        formatCurrency(closing.total_card)
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CompactPages>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
