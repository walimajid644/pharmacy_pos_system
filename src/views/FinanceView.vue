<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels'
const label=useWorkspaceLabels()
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { executeQuery } from '@/lib/database'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import { useDialogKeyboard } from '@/composables/useDialogKeyboard'
import SupplierLedgerView from './SupplierLedgerView.vue'
const route=useRoute(), { formatCurrency,pick }=useI18n(), toast=useToast()
const expense=computed(()=>route.path==='/expenses')
type Customer={id:string; name:string; current_balance:number}
type Entry={id:string; number:string; kind:string; party:string; category:string; description:string; amount_cents:number; method:string; entry_date:string; status:string; reference:string; void_reason:string|null;shift_status:string|null}
const customers=ref<Customer[]>([]), entries=ref<Entry[]>([]), busy=ref(false), loading=ref(false), error=ref(''), supplierMode=ref(false)
const today=()=>{const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
const form=ref({requestId:crypto.randomUUID(),customerId:String(route.query.customer||''), category:'General', description:'', amount:'', method:'cash', reference:'', entryDate:today()})
const query=ref(''), from=ref(''), to=ref(''), selected=ref<Entry|null>(null), reason=ref(''), printing=ref<Entry|null>(null)
const voidDialog=ref<HTMLElement|null>(null),voidError=ref('')
const closedCash=computed(()=>selected.value?.method==='cash'&&selected.value.shift_status==='closed')
useDialogKeyboard(voidDialog,()=>{if(!busy.value)selected.value=null})
const selectedCustomer=computed(()=>customers.value.find(c=>c.id===form.value.customerId))
const visible=computed(()=>entries.value.filter(e=>(!expense.value||e.kind==='expense')&&(!from.value||e.entry_date.slice(0,10)>=from.value)&&(!to.value||e.entry_date.slice(0,10)<=to.value)&&`${e.number} ${e.party} ${e.category} ${e.description} ${e.reference}`.toLowerCase().includes(query.value.toLowerCase())))
const total=(direction:'in'|'out')=>visible.value.filter(e=>e.status==='posted'&&(direction==='in'?['receipt','sale'].includes(e.kind):(['expense','supplier','refund'].includes(e.kind)&&e.method!=='credit_note'))).reduce((sum,e)=>sum+e.amount_cents,0)/100
onMounted(load)
watch(()=>route.path,()=>{supplierMode.value=false;form.value.requestId=crypto.randomUUID();form.value.amount='';form.value.description='';selected.value=null;void load()})
async function load(){loading.value=true;error.value='';try{
 customers.value=await executeQuery<Customer>("SELECT id,first_name || ' ' || last_name || ' · ' || customer_code AS name,current_balance FROM customers WHERE deleted_at IS NULL AND (is_active=1 OR current_balance>0) ORDER BY first_name")
 entries.value=await executeQuery<Entry>(`SELECT a.id,a.number,a.kind,COALESCE(c.first_name || ' ' || c.last_name,'Business expense') AS party,a.category,a.description,a.amount_cents,a.method,a.reference,a.entry_date,a.status,a.void_reason,sh.status AS shift_status FROM account_entries a LEFT JOIN customers c ON c.id=a.customer_id LEFT JOIN cashier_shifts sh ON sh.id=a.shift_id
 UNION ALL SELECT p.id,p.voucher_number,'supplier',s.name,'Supplier payment',COALESCE(p.notes,''),p.amount_cents,p.method,COALESCE(p.reference,''),p.paid_at,'posted',NULL,NULL FROM supplier_payments p JOIN suppliers s ON s.id=p.supplier_id
 UNION ALL SELECT i.id,i.invoice_number,'sale',COALESCE(c.first_name || ' ' || c.last_name,'Walk-in'),'Sale payment',COALESCE(i.notes,''),CAST(ROUND(i.net_amount*100) AS INTEGER),i.payment_method,'',i.invoice_date,'posted',NULL,NULL FROM sales_invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.status='completed' AND i.payment_method<>'credit'
 UNION ALL SELECT r.id,COALESCE(r.refund_reference,r.return_number),'refund',COALESCE(c.first_name || ' ' || c.last_name,'Walk-in'),'Sales refund',r.return_number,CAST(ROUND(r.refund_amount*100) AS INTEGER),r.refund_method,COALESCE(r.refund_reference,''),r.return_date,'posted',NULL,NULL FROM sales_returns r JOIN sales_invoices i ON i.id=r.original_invoice_id LEFT JOIN customers c ON c.id=i.customer_id WHERE r.status='refunded' ORDER BY entry_date DESC`)
}catch(e){error.value=String(e)}finally{loading.value=false}}
async function save(){busy.value=true;try{const n=Number(form.value.amount), cents=Math.round(n*100);if(!Number.isFinite(n)||n<=0||Math.abs(n*100-cents)>0.00001)throw new Error('Enter a positive amount with at most two decimals')
 const number=await invoke<string>('record_account_entry',{request:{...form.value,kind:expense.value?'expense':'receipt',customerId:expense.value?null:form.value.customerId||null,amountCents:cents}})
 toast.success(`${expense.value?'Expense':'Receipt'} saved: ${number}`);form.value.requestId=crypto.randomUUID();form.value.amount='';form.value.description='';form.value.reference='';await load()
}catch(e){toast.error(String(e))}finally{busy.value=false}}
async function voidEntry(){if(!selected.value||closedCash.value)return;voidError.value='';busy.value=true;try{await invoke('void_account_entry',{id:selected.value.id,reason:reason.value});selected.value=null;reason.value='';await load()}catch(e){voidError.value=String(e);toast.error(voidError.value)}finally{busy.value=false}}
async function printEntry(e:Entry){printing.value=e;const {nextTick}=await import('vue');await nextTick();document.body.classList.add('printing-commercial');const clean=()=>{document.body.classList.remove('printing-commercial');printing.value=null};window.addEventListener('afterprint',clean,{once:true});try{window.print()}catch{clean()}}
</script>
<template>
 <div class="tool-terminal finance-terminal">
  <header class="tool-header"><div><h1>{{ expense?label('Expenses'):label('Payments & Receipts') }}</h1><p>{{ expense?'Record business spending and track cash outflows':'Customer balance collections, supplier payments and sale receipts' }}</p></div><button :disabled="loading" @click="load">{{ label('Refresh') }}</button></header>
  <div v-if="!expense" class="commercial-tabs"><button :aria-pressed="!supplierMode" @click="supplierMode=false;load()">{{ label('Receipts & history') }}</button><button :aria-pressed="supplierMode" @click="supplierMode=true">{{ label('Pay supplier') }}</button></div>
  <p v-if="error" class="commercial-error" role="alert">{{ error }}</p>
  <SupplierLedgerView v-if="supplierMode && !expense" />
  <div v-else class="commercial-split">
   <section class="commercial-main"><div class="commercial-filters"><input v-model="query" type="search" :placeholder="label('Search number, party, category or reference')" aria-label="Search entries"/><label>{{ label('From') }}<input v-model="from" type="date"/></label><label>{{ label('To') }}<input v-model="to" type="date"/></label><button @click="query='';from='';to=''">{{ label('Clear') }}</button></div>
    <div class="commercial-table-scroll"><p v-if="loading" role="status">Loading entries…</p><table v-else><thead><tr><th>{{ label('Voucher / date') }}</th><th>{{ label('Party / description') }}</th><th>{{ label('Type') }}</th><th>{{ label('Method') }}</th><th>{{ label('Amount') }}</th><th>{{ label('Status') }}</th><th>{{ label('Actions') }}</th></tr></thead><tbody>
     <tr v-for="e in visible" :key="e.kind+e.id"><td>{{ e.number }}<small>{{ e.entry_date.slice(0,10) }}</small></td><td>{{ e.party }}<small>{{ e.category }} · {{ e.description }} {{ e.reference }}</small><small v-if="e.void_reason">Voided: {{ e.void_reason }}</small></td><td>{{ e.kind }}</td><td>{{ e.method }}</td><td>{{ formatCurrency(e.amount_cents/100) }}</td><td>{{ e.status }}</td><td><button @click="printEntry(e)">{{ label('Print') }}</button> <button v-if="['receipt','expense'].includes(e.kind)&&e.status==='posted'" @click="selected=e;reason='';voidError=''">{{ label('Void') }}</button></td></tr>
     <tr v-if="!visible.length"><td colspan="7" class="commercial-empty">{{ label('No entries match these filters.') }}</td></tr>
    </tbody></table></div>
    <footer class="tool-summary"><div><small>{{ label('Entries shown') }}</small><strong>{{ visible.length }}</strong></div><div v-if="!expense"><small>{{ label('Receipts / sales') }}</small><strong>{{ formatCurrency(total('in')) }}</strong></div><div><small>{{ expense?label('Expenses'):'Payments / expenses / refunds' }}</small><strong>{{ formatCurrency(total('out')) }}</strong></div></footer>
   </section>
   <aside class="commercial-dock"><h2>{{ expense?label('Record expense'):label('Collect customer balance') }}</h2><p class="commercial-hint">{{ expense?'Cash expenses reduce the open drawer balance.':'Collections reduce an existing customer balance. Sale payments appear in history automatically.' }}</p>
    <form @submit.prevent="save"><label v-if="!expense">{{ label('Customer') }}<select v-model="form.customerId" required><option value="">{{ label('Select customer') }}</option><option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
     <p v-if="selectedCustomer&&!expense">Outstanding: <strong>{{ formatCurrency(selectedCustomer.current_balance) }}</strong></p>
     <label v-if="expense">{{ label('Category') }}<input v-model="form.category" required maxlength="80" list="expense-categories"/><datalist id="expense-categories"><option v-for="c in ['Rent','Utilities','Salaries','Transport','Supplies','Maintenance','General']" :key="c">{{ c }}</option></datalist></label>
     <label>{{ label('Description') }}<input v-model="form.description" required maxlength="500"/></label><label>{{ label('Amount (Rs)') }}<input v-model="form.amount" required type="number" min="0.01" step="0.01"/></label>
     <label>{{ label('Method') }}<select v-model="form.method"><option value="cash">{{ label('Cash drawer') }}</option><option value="bank">{{ label('Bank') }}</option><option value="mobile">{{ label('Mobile') }}</option></select></label>
     <label>{{ label('Date') }}<input v-model="form.entryDate" type="date" required :max="today()"/></label><label>{{ label('Reference') }}<input v-model="form.reference" maxlength="100"/></label><button class="bg-primary" :disabled="busy">{{ busy?label('Saving…'):expense?label('Save expense'):label('Record receipt') }}</button>
    </form>
   </aside>
  </div>
  <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="selected=null"><form ref="voidDialog" tabindex="-1" role="dialog" aria-modal="true" :aria-label="pick('Void entry','اندراج منسوخ کریں')" class="commercial-dialog" @submit.prevent="voidEntry"><h2>Void {{ selected.number }}</h2><p>This preserves the original entry and reverses its balance effect. Cash entries can only be voided while their drawer is open.</p><p v-if="closedCash" role="alert" class="commercial-error">{{ pick('This cash voucher belongs to a closed drawer and cannot be voided. Keep the voucher and ask a manager or accountant to reconcile a correction in the current period.','اس نقد واؤچر کی کیش شفٹ بند ہو چکی ہے۔ اسے منسوخ نہیں کیا جا سکتا۔ واؤچر محفوظ رکھیں اور موجودہ مدت میں درستگی کے لیے منیجر یا اکاؤنٹنٹ سے رابطہ کریں۔') }}</p><p v-if="voidError" role="alert" class="commercial-error">{{ voidError }}</p><label>{{ label('Reason') }}<textarea v-model="reason" required maxlength="500"/></label><div><button type="button" :disabled="busy" @click="selected=null">{{ label('Cancel') }}</button> <button :disabled="busy||closedCash" class="bg-destructive">{{ label('Confirm void') }}</button></div></form></div>
 </div>
 <Teleport to="body"><section v-if="printing" class="commercial-print"><h1>{{ expense?'Expense voucher':'Payment / receipt voucher' }}</h1><h2>{{ printing.number }}</h2><p>{{ printing.entry_date }} · {{ printing.status }}</p><p>{{ printing.party }}</p><p>{{ printing.description }}</p><p>{{ printing.method }} · {{ printing.reference }}</p><h2>{{ formatCurrency(printing.amount_cents/100) }}</h2><p v-if="printing.void_reason">VOID: {{ printing.void_reason }}</p></section></Teleport>
</template>
