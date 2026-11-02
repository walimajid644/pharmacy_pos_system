<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { executeQuery } from '@/lib/database'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/lib/i18n'
import type { CashierShift } from '@/lib/types'

const auth = useAuthStore()
const { pick, formatCurrency, formatDateTime } = useI18n()
const current = ref<CashierShift | null>(null)
const history = ref<CashierShift[]>([])
const openingCash = ref('')
const countedCash = ref('')
const notes = ref('')
const result = ref<CashierShift | null>(null)
const error = ref('')
const busy = ref(false)
const canReview = auth.hasRole(['admin', 'manager'])

function cents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const amount = Math.round(Number(value) * 100)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

async function load() {
  error.value = ''
  try {
    current.value = await invoke<CashierShift | null>('current_shift')
    if (canReview) {
      history.value = await executeQuery<CashierShift>(
        `SELECT sh.id, sh.cashier_id AS cashierId, u.full_name AS cashierName,
                sh.opened_at AS openedAt, sh.opening_cash_cents AS openingCashCents,
                sh.closed_at AS closedAt, sh.counted_cash_cents AS countedCashCents,
                sh.expected_cash_cents AS expectedCashCents, sh.variance_cents AS varianceCents,
                sh.status, sh.notes, closer.full_name AS closedByName
         FROM cashier_shifts sh JOIN users u ON u.id = sh.cashier_id
         LEFT JOIN users closer ON closer.id = sh.closed_by
         ORDER BY sh.opened_at DESC LIMIT 50`
      )
    }
  } catch (cause) { error.value = String(cause) }
}

async function openShift() {
  const amount = cents(openingCash.value)
  if (amount === null) { error.value = pick('Enter an opening float with up to two decimal places.', 'ابتدائی نقد رقم درست درج کریں۔'); return }
  busy.value = true
  error.value = ''
  try {
    await invoke('open_shift', { request: { openingCashCents: amount } })
    openingCash.value = ''
    await load()
  } catch (cause) { error.value = String(cause) }
  finally { busy.value = false }
}

async function closeShift() {
  if (!current.value || current.value.cashierId !== auth.currentUser?.id && !canReview) return
  const amount = cents(countedCash.value)
  if (amount === null) { error.value = pick('Enter the blind cash count with up to two decimal places.', 'نقد رقم کی گنتی درست درج کریں۔'); return }
  if (!confirm(pick('Submit the blind count and close this shift?', 'گنی ہوئی رقم جمع کر کے شفٹ بند کریں؟'))) return
  busy.value = true
  error.value = ''
  try {
    result.value = await invoke<CashierShift>('close_shift', { request: {
      shiftId: current.value.id, countedCashCents: amount, notes: notes.value.trim() || null,
    } })
    countedCash.value = ''
    notes.value = ''
    await load()
  } catch (cause) { error.value = String(cause) }
  finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <main class="tool-terminal mx-auto max-w-6xl space-y-5 p-6">
    <header class="tool-header flex items-center justify-between">
      <div><h1 class="text-2xl font-bold">{{ pick('Cash Drawer & Shifts', 'کیش دراز اور شفٹیں') }}</h1><p class="text-sm text-muted-foreground">{{ pick('Open a shift before selling. Count cash without seeing the expected total.', 'فروخت سے پہلے شفٹ کھولیں۔ متوقع رقم دیکھے بغیر نقدی گنیں۔') }}</p></div>
      <button class="rounded border px-3 py-2" @click="load">{{ pick('Refresh', 'تازہ کریں') }}</button>
    </header>
    <p v-if="error" role="alert" class="rounded border border-red-400 p-3 text-red-700">{{ error }}</p>
    <section v-if="current" class="rounded-xl border bg-card p-5 shadow-sm">
      <h2 class="text-lg font-semibold">{{ pick('Open shift', 'کھلی شفٹ') }}</h2>
      <p>{{ current.cashierName }} · {{ formatDateTime(current.openedAt) }}</p>
      <p class="mt-1 text-sm text-muted-foreground">{{ pick('Opening float', 'ابتدائی رقم') }}: {{ formatCurrency(current.openingCashCents / 100) }}</p>
      <form class="mt-5 max-w-lg space-y-3" @submit.prevent="closeShift">
        <label class="block text-sm font-medium">{{ pick('Blind cash count (Rs)', 'گنی ہوئی نقد رقم (روپے)') }}<input v-model="countedCash" type="text" inputmode="decimal" required class="mt-1 w-full rounded border bg-background p-2" /></label>
        <label class="block text-sm font-medium">{{ pick('Handover notes', 'حوالگی کے نوٹس') }}<textarea v-model="notes" class="mt-1 w-full rounded border bg-background p-2" rows="3" /></label>
        <button :disabled="busy || current.cashierId !== auth.currentUser?.id && !canReview" class="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{{ pick('Close shift and reconcile', 'شفٹ بند کریں اور حساب ملائیں') }}</button>
      </form>
    </section>
    <section v-else class="max-w-lg rounded-xl border bg-card p-5 shadow-sm">
      <h2 class="text-lg font-semibold">{{ pick('Open a new shift', 'نئی شفٹ کھولیں') }}</h2>
      <form class="mt-4 space-y-3" @submit.prevent="openShift">
        <label class="block text-sm font-medium">{{ pick('Opening cash (Rs)', 'ابتدائی نقد رقم (روپے)') }}<input v-model="openingCash" type="text" inputmode="decimal" required class="mt-1 w-full rounded border bg-background p-2" /></label>
        <button :disabled="busy" class="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{{ pick('Open shift', 'شفٹ کھولیں') }}</button>
      </form>
    </section>
    <section v-if="result" class="rounded-xl border border-green-500 bg-card p-5" role="status">
      <h2 class="font-semibold">{{ pick('Shift closed', 'شفٹ بند ہوگئی') }}</h2>
      <p>{{ pick('Expected cash', 'متوقع نقد رقم') }}: {{ formatCurrency((result.expectedCashCents ?? 0) / 100) }}</p>
      <p>{{ pick('Counted cash', 'گنی ہوئی نقد رقم') }}: {{ formatCurrency((result.countedCashCents ?? 0) / 100) }}</p>
      <p>{{ pick('Variance', 'فرق') }}: {{ formatCurrency((result.varianceCents ?? 0) / 100) }}</p>
    </section>
    <section v-if="canReview" class="rounded-xl border bg-card p-5">
      <h2 class="mb-3 text-lg font-semibold">{{ pick('Recent shifts', 'حالیہ شفٹیں') }}</h2>
      <p v-if="!history.length" class="text-sm text-muted-foreground">{{ pick('No shifts recorded yet.', 'ابھی کوئی شفٹ درج نہیں ہوئی۔') }}</p>
      <div v-else class="overflow-x-auto"><table class="w-full min-w-[850px] text-sm"><thead><tr class="border-b text-left"><th class="p-2">{{ pick('Cashier', 'کیشئر') }}</th><th class="p-2">{{ pick('Opened', 'کھولی گئی') }}</th><th class="p-2">{{ pick('Closed by', 'بند کرنے والا') }}</th><th class="p-2">{{ pick('Status', 'حیثیت') }}</th><th class="p-2 text-right">{{ pick('Expected', 'متوقع') }}</th><th class="p-2 text-right">{{ pick('Counted', 'گنی گئی') }}</th><th class="p-2 text-right">{{ pick('Variance', 'فرق') }}</th></tr></thead><tbody><tr v-for="shift in history" :key="shift.id" class="border-b"><td class="p-2">{{ shift.cashierName }}</td><td class="p-2">{{ formatDateTime(shift.openedAt) }}</td><td class="p-2">{{ shift.closedByName || '—' }}<small v-if="shift.notes" class="block text-muted-foreground">{{ shift.notes }}</small></td><td class="p-2">{{ shift.status }}</td><td class="p-2 text-right">{{ shift.expectedCashCents === null ? '—' : formatCurrency(shift.expectedCashCents / 100) }}</td><td class="p-2 text-right">{{ shift.countedCashCents === null ? '—' : formatCurrency(shift.countedCashCents / 100) }}</td><td class="p-2 text-right">{{ shift.varianceCents === null ? '—' : formatCurrency(shift.varianceCents / 100) }}</td></tr></tbody></table></div>
    </section>
  </main>
</template>
