<script setup lang="ts">
import { useWorkspaceLabels } from '@/lib/workspaceLabels'
const label=useWorkspaceLabels()
import { onMounted, ref } from 'vue'
import { useDialogKeyboard } from '@/composables/useDialogKeyboard'
import { useRouter } from 'vue-router'
import { executeQuery } from '@/lib/database'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
const router=useRouter(),toast=useToast(),auth=useAuthStore(),{formatCurrency}=useI18n()
type Option={id:string;name:string}
type Item={id:string;name:string;generic_name:string|null;sku:string;barcode:string|null;unit_price:number;pack_size:number;category:string|null;manufacturer:string|null;stock:number;expired_stock:number;reorder_level:number;next_expiry:string|null;is_active:number;drap_registration_number:string|null}
type Batch={id:string;batch_number:string;expiry_date:string;quantity_in_stock:number;loose_open_remaining:number}
const filters=ref({q:'',field:'all',category:'',manufacturer:'',stock:'all',expiry:'all',min:'',max:'',status:'active',controlled:false}), categories=ref<Option[]>([]),manufacturers=ref<Option[]>([]),items=ref<Item[]>([]),batches=ref<Batch[]>([]),selected=ref<Item|null>(null),loading=ref(false),error=ref(''),page=ref(0),count=ref(0)
const batchDialog=ref<HTMLElement|null>(null)
useDialogKeyboard(batchDialog,()=>{selected.value=null})
onMounted(async()=>{try{[categories.value,manufacturers.value]=await Promise.all([executeQuery<Option>("SELECT id,name FROM categories WHERE deleted_at IS NULL AND is_active=1 ORDER BY name"),executeQuery<Option>("SELECT id,name FROM manufacturers WHERE deleted_at IS NULL AND is_active=1 ORDER BY name")]);await search()}catch(e){error.value=String(e)}})
async function search(reset=true){if(loading.value)return;loading.value=true;error.value='';if(reset)page.value=0;try{
 const f=filters.value;if((f.min!==''&&(!Number.isFinite(Number(f.min))||Number(f.min)<0))||(f.max!==''&&(!Number.isFinite(Number(f.max))||Number(f.max)<0))||(f.min!==''&&f.max!==''&&Number(f.min)>Number(f.max)))throw new Error('Check the minimum and maximum prices')
 let where="p.deleted_at IS NULL";const values:unknown[]=[]
 const fields:Record<string,string>={name:'p.name',generic:'p.generic_name',sku:'p.sku',barcode:'p.barcode',registration:'p.drap_registration_number'}
 const terms=f.q.trim().split(/\s+/).filter(Boolean).slice(0,10)
 for(const term of terms){const cols=fields[f.field]?[fields[f.field]]:['p.name','p.generic_name','p.sku','p.barcode','p.drap_registration_number'];where+=' AND ('+cols.map(c=>`COALESCE(${c},'') LIKE ?`).join(' OR ')+')';cols.forEach(()=>values.push(`%${term}%`))}
 if(f.category){where+=' AND p.category_id=?';values.push(f.category)}if(f.manufacturer){where+=' AND p.manufacturer_id=?';values.push(f.manufacturer)}
 if(f.status!=='all'){where+=' AND p.is_active=?';values.push(f.status==='active'?1:0)}if(f.controlled)where+=' AND p.controlled_substance=1'
 if(f.min!==''){where+=' AND p.unit_price>=?';values.push(Number(f.min))}if(f.max!==''){where+=' AND p.unit_price<=?';values.push(Number(f.max))}
 if(f.expiry==='near')where+=" AND EXISTS (SELECT 1 FROM product_batches x WHERE x.product_id=p.id AND x.quantity_in_stock>0 AND x.expiry_date BETWEEN date('now','localtime') AND date('now','localtime','+60 days'))"
 if(f.expiry==='expired')where+=" AND EXISTS (SELECT 1 FROM product_batches x WHERE x.product_id=p.id AND x.quantity_in_stock>0 AND x.expiry_date<date('now','localtime'))"
 const base=`SELECT p.id,p.name,p.generic_name,p.sku,p.barcode,p.unit_price,p.pack_size,p.reorder_level,p.is_active,p.drap_registration_number,c.name AS category,m.name AS manufacturer,
 COALESCE(SUM(CASE WHEN b.expiry_date>=date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) AS stock,
 COALESCE(SUM(CASE WHEN b.expiry_date<date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) AS expired_stock,
 MIN(CASE WHEN b.expiry_date>=date('now','localtime') AND b.quantity_in_stock>0 THEN b.expiry_date END) AS next_expiry
 FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN product_batches b ON b.product_id=p.id WHERE ${where} GROUP BY p.id`
 const stock=f.stock==='low'?'stock<=reorder_level':f.stock==='in'?'stock>0':f.stock==='out'?'stock=0':'1=1'
 const outer=`SELECT * FROM (${base}) WHERE ${stock}`
 const totals=await executeQuery<{total:number}>(`SELECT COUNT(*) AS total FROM (${outer})`,values);count.value=totals[0]?.total||0
 items.value=await executeQuery<Item>(`${outer} ORDER BY name,id LIMIT 100 OFFSET ?`,[...values,page.value*100]);selected.value=null
}catch(e){error.value=String(e)}finally{loading.value=false}}
async function show(item:Item){try{batches.value=await executeQuery<Batch>('SELECT id,batch_number,expiry_date,quantity_in_stock,loose_open_remaining FROM product_batches WHERE product_id=? ORDER BY expiry_date,id',[item.id]);selected.value=item}catch(e){toast.error(String(e))}}
function clear(){filters.value={q:'',field:'all',category:'',manufacturer:'',stock:'all',expiry:'all',min:'',max:'',status:'active',controlled:false};void search()}
function turn(direction:number){page.value+=direction;void search(false)}
</script>
<template>
 <div class="tool-terminal search-terminal"><header class="tool-header"><div><h1>{{ label('Advanced Item Search') }}</h1><p>{{ label('Find medicines by name, generic, SKU, barcode or DRAP registration') }}</p></div><button @click="clear">{{ label('Reset filters') }}</button></header>
 <form class="advanced-search-filters" @submit.prevent="search()"><label class="search-term">{{ label('Search') }}<input v-model="filters.q" type="search" :placeholder="label('Type product name, generic, SKU or barcode')"/></label><label>{{ label('Search field') }}<select v-model="filters.field"><option value="all">{{ label('All product fields') }}</option><option value="name">{{ label('Product name') }}</option><option value="generic">{{ label('Generic name') }}</option><option value="sku">SKU</option><option value="barcode">Barcode</option><option value="registration">DRAP registration</option></select></label>
 <label>{{ label('Category') }}<select v-model="filters.category"><option value="">{{ label('All categories') }}</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><label>{{ label('Manufacturer') }}<select v-model="filters.manufacturer"><option value="">{{ label('All manufacturers') }}</option><option v-for="m in manufacturers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
 <label>{{ label('Stock') }}<select v-model="filters.stock"><option value="all">{{ label('Any stock') }}</option><option value="in">{{ label('Available stock') }}</option><option value="out">{{ label('Out of stock') }}</option><option value="low">{{ label('At / below reorder level') }}</option></select></label><label>{{ label('Expiry') }}<select v-model="filters.expiry"><option value="all">{{ label('Any expiry') }}</option><option value="near">{{ label('Expires within 60 days') }}</option><option value="expired">{{ label('Has expired stock') }}</option></select></label>
 <label>{{ label('Minimum unit price') }}<input v-model="filters.min" type="number" min="0" step="0.01"/></label><label>{{ label('Maximum unit price') }}<input v-model="filters.max" type="number" min="0" step="0.01"/></label><label>{{ label('Status') }}<select v-model="filters.status"><option value="active">{{ label('Active') }}</option><option value="inactive">{{ label('Inactive') }}</option><option value="all">{{ label('All statuses') }}</option></select></label><label class="commercial-check"><input v-model="filters.controlled" type="checkbox"/>{{ label('Controlled products only') }}</label><button class="bg-primary" :disabled="loading">{{ loading?label('Searching…'):label('Search items') }}</button></form>
 <p v-if="error" class="commercial-error" role="alert">{{ error }}</p><div class="commercial-table-scroll"><table><thead><tr><th>{{ label('Product / generic') }}</th><th>{{ label('SKU / barcode') }}</th><th>{{ label('Category / manufacturer') }}</th><th>{{ label('Unit price') }}</th><th>{{ label('Available units') }}</th><th>{{ label('Expired units') }}</th><th>{{ label('Next expiry') }}</th><th>{{ label('Actions') }}</th></tr></thead><tbody><tr v-for="p in items" :key="p.id"><td>{{ p.name }}<small>{{ p.generic_name }} {{ p.is_active?'':'· Inactive' }}</small></td><td>{{ p.sku }}<small>{{ p.barcode }}</small></td><td>{{ p.category||'—' }}<small>{{ p.manufacturer }}</small></td><td>{{ formatCurrency(p.unit_price) }}<small>{{ p.pack_size }} units / pack</small></td><td :class="{'commercial-error':p.stock<=p.reorder_level}">{{ p.stock }}</td><td>{{ p.expired_stock }}</td><td>{{ p.next_expiry||'—' }}</td><td><button @click="show(p)">{{ label('Batches') }}</button> <button v-if="auth.hasRole(['admin','manager'])" @click="router.push('/products')">{{ label('Manage') }}</button></td></tr><tr v-if="!items.length&&!loading"><td colspan="8" class="commercial-empty">{{ label('No items match these filters.') }}</td></tr></tbody></table></div>
 <footer class="tool-summary"><div><small>{{ label('Matching products') }}</small><strong>{{ count }}</strong></div><div><small>{{ label('Page') }}</small><strong>{{ page+1 }} / {{ Math.max(1,Math.ceil(count/100)) }}</strong></div><button :disabled="page===0||loading" @click="turn(-1)">{{ label('Previous') }}</button><button :disabled="(page+1)*100>=count||loading" @click="turn(1)">{{ label('Next') }}</button></footer>
 <div v-if="selected" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="selected=null"><section ref="batchDialog" tabindex="-1" class="commercial-dialog" role="dialog" aria-modal="true" :aria-label="selected.name"><header class="tool-header"><h2>{{ selected.name }} · Batches</h2><button @click="selected=null">{{ label('Close') }}</button></header><p>DRAP: {{ selected.drap_registration_number||'Not recorded' }} · Earliest expiry is sold first.</p><table><thead><tr><th>{{ label('Batch') }}</th><th>{{ label('Expiry') }}</th><th>{{ label('Total units') }}</th><th>{{ label('Opened loose units') }}</th></tr></thead><tbody><tr v-for="b in batches" :key="b.id"><td>{{ b.batch_number }}</td><td>{{ b.expiry_date }}</td><td>{{ b.quantity_in_stock }}</td><td>{{ b.loose_open_remaining }}</td></tr><tr v-if="!batches.length"><td colspan="4">{{ label('No batches recorded.') }}</td></tr></tbody></table></section></div>
 </div>
</template>
