<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import type { StockAdjustment } from '@/lib/types'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const { pick, t, formatNumber } = useI18n()
const adjustments = ref<(StockAdjustment & { creator_name: string })[]>([])
const items = ref<{ product_name: string; batch_number: string; quantity_adjusted: number }[]>([])
const selected = ref<StockAdjustment | null>(null)
const loading = ref(false)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    adjustments.value = await executeQuery<StockAdjustment & { creator_name: string }>(
      `SELECT sa.*, u.full_name AS creator_name FROM stock_adjustments sa
       JOIN users u ON u.id = sa.created_by ORDER BY sa.created_at DESC`
    )
  } catch (error) {
    console.error(error)
    toast.error(pick('Could not load stock adjustments', 'اسٹاک ترامیم لوڈ نہیں ہو سکیں'))
  } finally { loading.value = false }
}

async function select(adjustment: StockAdjustment) {
  selected.value = adjustment
  items.value = []
  try {
    const rows = await executeQuery<{ product_name: string; batch_number: string; quantity_adjusted: number }>(
      `SELECT p.name AS product_name, pb.batch_number, sai.quantity_adjusted
       FROM stock_adjustment_items sai
       JOIN products p ON p.id = sai.product_id
       JOIN product_batches pb ON pb.id = sai.batch_id
       WHERE sai.adjustment_id = ?`, [adjustment.id]
    )
    if (selected.value?.id === adjustment.id) items.value = rows
  } catch (error) {
    console.error(error)
    toast.error(pick('Could not load adjustment items', 'ترمیم کی اشیاء لوڈ نہیں ہو سکیں'))
  }
}

async function decide(approved: boolean) {
  if (!selected.value || selected.value.status !== 'pending' || !auth.currentUser) return
  if (!confirm(approved ? pick('Approve this stock adjustment?', 'کیا اس اسٹاک ترمیم کو منظور کریں؟') : pick('Reject this stock adjustment?', 'کیا اس اسٹاک ترمیم کو مسترد کریں؟'))) return
  busy.value = true
  try {
    await invoke('decide_stock_adjustment', { request: {
      recordId: selected.value.id,
      timestamp: new Date().toISOString(),
      action: approved ? 'approved' : 'rejected'
    } })
    selected.value = null
    toast.success(approved ? pick('Stock adjustment approved', 'اسٹاک ترمیم منظور ہو گئی') : pick('Stock adjustment rejected', 'اسٹاک ترمیم مسترد ہو گئی'))
    await load()
  } catch (error) {
    console.error(error)
    toast.error(approved ? pick('Approval failed. Check stock levels and items.', 'منظوری ناکام ہوئی۔ اسٹاک اور اشیاء چیک کریں۔') : pick('Rejection failed', 'مسترد کرنا ناکام ہوا'))
  } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <div class="tool-terminal space-y-5 p-6">
    <header class="tool-header flex flex-wrap items-center justify-between gap-3">
      <div><h2 class="text-2xl font-bold">{{ t('stock_adjustments') }}</h2><p class="text-muted-foreground">{{ pick('Record damaged, expired, lost or found stock', 'خراب، میعاد ختم، گم یا ملنے والا اسٹاک درج کریں') }}</p></div>
      <button class="rounded bg-primary px-4 py-2 text-primary-foreground" @click="router.push('/stock-adjustments/new')">{{ pick('New adjustment', 'نئی ترمیم') }}</button>
    </header>
    <p v-if="loading">{{ pick('Loading adjustments...', 'ترامیم لوڈ ہو رہی ہیں...') }}</p>
    <p v-else-if="!adjustments.length" class="rounded border p-6">{{ pick('No stock adjustments yet.', 'ابھی کوئی اسٹاک ترمیم نہیں۔') }}</p>
    <div v-else class="overflow-x-auto rounded border">
      <table class="w-full text-left text-sm"><thead class="bg-muted"><tr><th class="p-3">{{ pick('Number', 'نمبر') }}</th><th class="p-3">{{ pick('Date', 'تاریخ') }}</th><th class="p-3">{{ pick('Type', 'قسم') }}</th><th class="p-3">{{ pick('Reason', 'وجہ') }}</th><th class="p-3">{{ pick('Created by', 'درج کرنے والا') }}</th><th class="p-3">{{ t('status') }}</th><th class="p-3"></th></tr></thead>
        <tbody><tr v-for="row in adjustments" :key="row.id" class="border-t"><td class="p-3"><bdi>{{ row.adjustment_number }}</bdi></td><td class="p-3">{{ formatDate(row.adjustment_date) }}</td><td class="p-3">{{ t(row.adjustment_type) }}</td><td class="p-3">{{ t(row.reason) }}</td><td class="p-3">{{ row.creator_name }}</td><td class="p-3">{{ t(row.status) }}</td><td class="p-3"><button class="text-primary" @click="select(row)">{{ pick('Review', 'جائزہ') }}</button></td></tr></tbody>
      </table>
    </div>
    <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="selected = null">
      <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 space-y-4">
        <h3 class="text-xl font-semibold">{{ selected.adjustment_number }}</h3>
        <p>{{ t(selected.adjustment_type) }} · {{ t(selected.reason) }} · {{ t(selected.status) }}</p>
        <p v-if="selected.reason_notes">{{ selected.reason_notes }}</p>
        <ul class="divide-y rounded border"><li v-for="(item, index) in items" :key="index" class="flex justify-between p-3"><span>{{ item.product_name }} · <bdi>{{ item.batch_number }}</bdi></span><strong>{{ formatNumber(item.quantity_adjusted) }}</strong></li></ul>
        <div class="flex justify-end gap-3"><button class="rounded border px-4 py-2" @click="selected = null">{{ pick('Close', 'بند کریں') }}</button><template v-if="selected.status === 'pending'"><button :disabled="busy" class="rounded border px-4 py-2" @click="decide(false)">{{ t('reject') }}</button><button :disabled="busy" class="rounded bg-primary px-4 py-2 text-primary-foreground" @click="decide(true)">{{ t('approve') }}</button></template></div>
      </div>
    </div>
  </div>
</template>
