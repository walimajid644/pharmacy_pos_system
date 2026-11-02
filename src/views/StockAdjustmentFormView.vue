<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter,useRoute } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { invoke } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useI18n } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils'
import type { AdjustmentReason, AdjustmentType } from '@/lib/types'

type BatchOption = { id: string; product_id: string; product_name: string; batch_number: string; quantity_in_stock: number; cost_price_at_batch: number; expiry_date: string }
type Line = { batch_id: string; quantity: number }
const router = useRouter(),route=useRoute()
const auth = useAuthStore()
const toast = useToast()
const { pick, t, formatNumber } = useI18n()
const batches = ref<BatchOption[]>([])
const type = ref<AdjustmentType>('decrease')
const reason = ref<AdjustmentReason>('damaged')
const notes = ref('')
const lines = ref<Line[]>([{ batch_id: '', quantity: 1 }])
const saving = ref(false)
const reasons: AdjustmentReason[] = ['damaged', 'expired', 'stolen', 'lost', 'found', 'count_error', 'return_to_supplier', 'other']
const total = computed(() => lines.value.reduce((sum, line) => {
  const batch = batches.value.find(b => b.id === line.batch_id)
  return sum + Number(line.quantity || 0) * Number(batch?.cost_price_at_batch || 0)
}, 0))

async function loadBatches() {
  try {
    batches.value = await executeQuery<BatchOption>(
      `SELECT pb.id, pb.product_id, p.name AS product_name, pb.batch_number,
        pb.quantity_in_stock, pb.cost_price_at_batch, pb.expiry_date
       FROM product_batches pb JOIN products p ON p.id = pb.product_id
       WHERE p.deleted_at IS NULL ORDER BY p.name, pb.expiry_date`
    )
  } catch (error) { console.error(error); toast.error(pick('Could not load batches', 'بیچ لوڈ نہیں ہو سکے')) }
}

async function save() {
  if (!auth.currentUser || !lines.value.length || lines.value.some(line => !line.batch_id || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
    toast.warning(pick('Choose a batch and a positive whole number for every line', 'ہر آئٹم کے لیے بیچ اور مثبت پوری تعداد منتخب کریں'))
    return
  }
  const quantities = new Map<string, number>()
  for (const line of lines.value) quantities.set(line.batch_id, (quantities.get(line.batch_id) || 0) + Number(line.quantity))
  if (type.value === 'decrease' && [...quantities].some(([id, quantity]) => quantity > (batches.value.find(b => b.id === id)?.quantity_in_stock || 0))) {
    toast.warning(pick('An adjustment exceeds the available batch stock', 'ترمیم دستیاب بیچ اسٹاک سے زیادہ ہے'))
    return
  }
  saving.value = true
  try {
    await invoke('submit_stock_adjustment', { request: {
      userId: auth.currentUser.id,
      timestamp: new Date().toISOString(),
      adjustmentType: type.value,
      reason: reason.value,
      notes: notes.value || null,
      items: lines.value.map(line => ({ batchId: line.batch_id, quantity: Number(line.quantity) }))
    } })
    toast.success(pick('Adjustment submitted for approval', 'اسٹاک ترمیم منظوری کے لیے جمع ہو گئی'))
    router.push('/stock-adjustments')
  } catch (error) {
    console.error(error)
    toast.error(pick('Could not save adjustment', 'اسٹاک ترمیم محفوظ نہیں ہو سکی'))
  } finally { saving.value = false }
}

onMounted(async()=>{await loadBatches();if(typeof route.query.batch==='string'&&batches.value.some(b=>b.id===route.query.batch))lines.value=[{batch_id:route.query.batch,quantity:1}];if(route.query.reason==='expired'||route.query.reason==='return_to_supplier')reason.value=route.query.reason})
</script>

<template>
  <div class="tool-terminal max-w-4xl space-y-5 p-6">
    <header class="tool-header "><h2 class="text-2xl font-bold">{{ pick('New stock adjustment', 'نئی اسٹاک ترمیم') }}</h2><p class="text-muted-foreground">{{ pick('Stock changes apply after approval', 'منظوری کے بعد اسٹاک میں تبدیلی ہو گی') }}</p></header>
    <form class="space-y-5 rounded-lg border bg-card p-5" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2"><label>{{ pick('Type', 'قسم') }}<select v-model="type" class="block w-full rounded border bg-background p-2"><option value="decrease">{{ t('decrease') }}</option><option value="increase">{{ t('increase') }}</option></select></label><label>{{ pick('Reason', 'وجہ') }}<select v-model="reason" class="block w-full rounded border bg-background p-2"><option v-for="item in reasons" :key="item" :value="item">{{ t(item) }}</option></select></label></div>
      <label class="block">{{ pick('Notes', 'نوٹس') }}<textarea v-model="notes" class="block w-full rounded border bg-background p-2" /></label>
      <div class="space-y-3"><h3 class="font-semibold">{{ pick('Batches', 'بیچ') }}</h3><div v-for="(line, index) in lines" :key="index" class="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
        <select v-model="line.batch_id" class="rounded border bg-background p-2" required><option value="">{{ pick('Choose product and batch', 'مصنوعات اور بیچ منتخب کریں') }}</option><option v-for="batch in batches" :key="batch.id" :value="batch.id">{{ batch.product_name }} · {{ batch.batch_number }} · {{ formatNumber(batch.quantity_in_stock) }} {{ pick('in stock', 'اسٹاک میں') }}</option></select>
        <input v-model.number="line.quantity" type="number" min="1" step="1" class="rounded border bg-background p-2" required />
        <button type="button" class="rounded border px-3" :disabled="lines.length === 1" @click="lines.splice(index, 1)">{{ pick('Remove', 'ہٹائیں') }}</button>
      </div><button type="button" class="text-primary" @click="lines.push({ batch_id: '', quantity: 1 })">+ {{ pick('Add batch', 'بیچ شامل کریں') }}</button></div>
      <p>{{ pick('Value at cost', 'لاگت پر قیمت') }}: {{ formatCurrency(total) }}</p>
      <div class="flex gap-3"><button :disabled="saving" class="rounded bg-primary px-4 py-2 text-primary-foreground">{{ saving ? pick('Saving...', 'محفوظ ہو رہا ہے...') : pick('Submit for approval', 'منظوری کے لیے جمع کریں') }}</button><button type="button" class="rounded border px-4 py-2" @click="router.push('/stock-adjustments')">{{ t('cancel') }}</button></div>
    </form>
  </div>
</template>
