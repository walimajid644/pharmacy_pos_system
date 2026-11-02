// Isolated signed-in UI fixture. It cannot access the desktop database or change real money/stock.
import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {RouterView} from 'vue-router'
import router from '../../src/router'
import App from '../../src/App.vue'
import {localDateKey} from '../../src/lib/businessDay'
import {useCartStore} from '../../src/stores/cart'
import {usePurchaseDraftStore} from '../../src/stores/purchaseDraft'
import {useAuthStore} from '../../src/stores/auth'
import '../../src/assets/styles/index.css'
const params=new URLSearchParams(location.search),view=params.get('view')||'/pos'
const stamp=new Date().toISOString()
const user={id:'test-user',username:'tester',full_name:'Test Pharmacist',role:params.get('role')||'admin',is_active:true,last_login:null,created_at:stamp,updated_at:stamp,deleted_at:null,must_change_password:false}
const product={id:'p1',sku:'MED-1',name:'Test medicine',generic_name:'Test generic',barcode:'123456789',unit_price:10,wholesale_price:7.5,cost_price:5,pack_size:10,sell_by_loose_unit:true,reorder_level:10,current_stock:0,is_active:1,deleted_at:null,updated_at:stamp,created_at:stamp,controlled_substance:params.get('controlled')==='1',drap_registration_number:'TEST-DRAP'}
const batch={id:'b1',product_id:'p1',batch_number:'B-1',expiry_date:'2099-12-31',quantity_in_stock:100,loose_open_remaining:10,cost_price_at_batch:5,received_date:stamp}
const customer={id:'c1',customer_code:'C1',first_name:'Test',last_name:'Customer',name:'Test Customer',current_balance:100,credit_limit:150,customer_type:params.get('pricing')||'retail',is_active:1}
const moreCustomers=[customer,{...customer,id:'c2',customer_code:'C2',first_name:'Second',current_balance:200},{...customer,id:'c3',customer_code:'C3',first_name:'Credit',current_balance:-25},{...customer,id:'c4',customer_code:'C4',first_name:'Settled',current_balance:0}]
const datePlus=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return localDateKey(d)}
const doc={id:'d1',number:'EST-TEST',kind:'estimate',customer_id:'c1',customer_name:'Test Customer',document_date:'2026-01-01',due_date:'2099-12-31',notes:'UI fixture',status:'open',subtotal_cents:100,invoice_id:null}
const saved={invoice:{id:'saved-1',invoice_number:'INV-SAVED',invoice_date:stamp,customer_name:'Saved Customer',customer_phone:'03001234567',cashier_name:'Saved Cashier',payment_method:'cash',net_amount:7,total_amount:7,tax_amount:0,discount_amount:0,received_amount:10,change_amount:3,previous_balance:100,notes:'Saved receipt notes'},items:[{id:'saved-line',product_name:'Saved Medicine',batch_number:'SavedBatch',quantity:1,sale_quantity:1,bonus_quantity:0,is_loose_sale:true,unit_price:7,discount_percent:0,line_total:7}],shop:{company_name:'Test Pharmacy',show_drap:1}}
const fixture={calls:[] as Array<{command:string;query?:string;args?:any}>,shortage:false,expired:false,converted:false,openUnits:10,saved,held:5,unheld:100,holdStatus:'held',logoutMode:'ok',clockOffset:0,productDelay:0,failProductSearch:false,nearExpiryDays:Number(params.get('days')||60),statementDelays:{} as Record<string,number>,statementFailCustomer:'',catalogInvalid:false,importError:false,bulkError:false}
Object.assign(window,{fixture})
if(params.get('app')==='1'){const realNow=Date.now.bind(Date);Date.now=()=>realNow()+fixture.clockOffset}
Object.assign(window,{__TAURI_INTERNALS__:{metadata:{currentWindow:{label:'main'}},transformCallback:()=>1,invoke:async(command:string,args:any={})=>{
 fixture.calls.push({command,query:args.query,args})
 if(command==='plugin:event|listen')return 1
 if(command==='plugin:event|unlisten')return null
 if(command==='logout_user'&&fixture.logoutMode==='hang')return new Promise(()=>{})
 if(command==='logout_user'&&fixture.logoutMode==='fail')throw new Error('Synthetic bridge failure')
 if(command==='login_user')return user
 if(command==='current_shift')return {id:'shift1',cashierId:user.id,cashierName:user.full_name,status:'open'}
 if(command==='saved_sale')return fixture.saved
 if(command==='checkout_sale'){fixture.saved={...fixture.saved,invoice:{...fixture.saved.invoice,id:'saved-credit',invoice_number:'INV-CREDIT',net_amount:args.request.expectedNetAmount,total_amount:args.request.expectedSubtotal,payment_method:args.request.paymentMethod,patient_name:args.request.patientName,doctor_name:args.request.doctorName,prescription_note:args.request.prescriptionNote,received_amount:args.request.paymentMethod==='credit'?0:args.request.expectedNetAmount,change_amount:0},items:[{...fixture.saved.items[0],product_name:product.name,batch_number:batch.batch_number,controlled_substance:product.controlled_substance?1:0,drap_registration_number:product.drap_registration_number,quantity:2,sale_quantity:2,unit_price:product.unit_price,line_total:args.request.expectedSubtotal}]};return {invoiceId:'saved-credit',invoiceNumber:'INV-CREDIT',subtotal:args.request.expectedSubtotal,taxAmount:0,discountAmount:0,netAmount:args.request.expectedNetAmount,receivedAmount:0,changeAmount:0}}
 if(command==='open_whatsapp_receipt')return null
 if(command==='customer_statement'){const chosen=moreCustomers.find(c=>c.id===args.customerId)||customer;const wait=fixture.statementDelays[chosen.id]||0;if(wait)await new Promise(r=>setTimeout(r,wait));if(fixture.statementFailCustomer===chosen.id)throw new Error('Synthetic statement failure');return {customer:chosen,entries:[{id:'opening',kind:'opening',reference:'OPEN-'+chosen.id,amount_cents:chosen.current_balance*100,occurred_at:stamp,description:'Opening balance'}],aging:{current:0,days30:0,days60:0,days90:0,unknown:Math.max(0,chosen.current_balance*100),credit:Math.max(0,-chosen.current_balance*100)}}}
 if(command==='cashier_performance')return [{id:'test-user',full_name:'Test Cashier',invoice_count:2,invoiced:300,return_count:1,refunds:50,net_sales:250,average_bill:150,return_rate:50,cash:0,card:100,mobile:0,credit:200}]
 if(command==='hold_batch'){fixture.held+=args.request.quantity;fixture.unheld-=args.request.quantity;return args.request.requestId}
 if(command==='resolve_batch_hold'){fixture.holdStatus=args.action;if(args.action==='released'){fixture.unheld+=fixture.held;fixture.held=0}return null}
 if(command==='preview_catalog_import'){const rows=args.request.rows;return {valid:!fixture.catalogInvalid,products:new Set(rows.map((r:any)=>r.product.sku)).size,batches:rows.filter((r:any)=>r.batch).length,newCategories:0,newManufacturers:0,rows:rows.map((r:any,i:number)=>({row:r.sourceRow||i+2,sku:r.product.sku,name:r.product.name,errors:fixture.catalogInvalid?['Synthetic duplicate SKU']:[],warnings:[]}))}}
 if(command==='import_catalog'){if(fixture.importError)throw new Error('Synthetic import failure; nothing changed');return {operationId:args.request.requestId,products:new Set(args.request.rows.map((r:any)=>r.product.sku)).size,batches:args.request.rows.filter((r:any)=>r.batch).length,categories:0,manufacturers:0}}
 if(command==='bulk_update_catalog'){if(fixture.bulkError)throw new Error('Product has stock or transaction history; pack size cannot be changed');return {operationId:args.request.requestId,products:args.request.products.length,batches:0,categories:0,manufacturers:0}}
 if(command==='controlled_sales_report')return {rows:[{id:'controlled-line',invoice_number:'INV-CONTROLLED',invoice_date:stamp,cashier_name:'Saved Cashier',patient_name:'Synthetic Patient',doctor_name:'Synthetic Doctor',prescription_note:'Reviewed Rx REF-123',product_name:'Saved controlled medicine',batch_number:'B-SAVED',drap:'SAVED-DRAP',quantity:12,bonus_units:2,regulatory_snapshot:1}],total:101,units:1212}
 if(command==='validate_fbr_sandbox')return {status:'invalid',message:'Sandbox validation rejected a synthetic item',response:'{"validationResponse":{"statusCode":"00","status":"Invalid"}}'}
 if(command==='purchase_suggestions')return [{productId:'p1',name:product.name,sku:product.sku,packSize:10,available:0,incoming:0,recentUnits:30,dailyRate:1,daysCover:0,reorderLevel:10,targetStock:37,suggestedUnits:40,estimatedCost:5,urgency:0,supplierName:'Test Supplier'}]
 if(command==='read_audit_log')return {events:[{id:'event',event_type:'shift_open',actor_id:user.id,actor_name:user.full_name,occurred_at:stamp,entity_type:'cashier_shift',entity_id:'shift1',reference:'SHIFT-1',details:'Opening cash Rs 100',historical:1}],total:101,types:['shift_open'],users:[{id:user.id,full_name:user.full_name}]}
 if(command==='database_select'){
  const q=(args.query||'').toLowerCase()
  if(q.includes('from app_settings'))return [{id:'settings',company_name:'Test Pharmacy',tax_rate:0,near_expiry_days:fixture.nearExpiryDays}]
  if(q.includes('as days_until_expiry'))return [{batch_id:'b1',product_id:'p1',product_name:product.name,sku:product.sku,batch_number:batch.batch_number,expiry_date:datePlus(-1),quantity_in_stock:fixture.unheld,quarantined_stock:fixture.held,unit_price:10,batch_value:(fixture.unheld+fixture.held)*10,days_until_expiry:-1}]
  if(q.includes('from account_entries'))return [{id:'expense',number:'EX-TEST',kind:'expense',party:'Business expense',category:'Rent',description:'Test expense',amount_cents:1000,method:'cash',reference:'',entry_date:stamp,status:'posted',void_reason:null,shift_status:'closed'}]
  if(q.includes('from commercial_document_items l join products')&&q.includes('as available'))return [{name:product.name,quantity:2,available:fixture.shortage?0:100,active:1,quoted:100,current:1000}]
  if(q.includes('from commercial_document_items'))return [{product_id:'p1',quantity:2,unit_price_cents:100}]
  if(q.includes('from commercial_documents'))return fixture.converted?[]:[{...doc,due_date:fixture.expired?'2000-01-01':doc.due_date}]
  if(q.includes('from batch_holds h join'))return [{id:'hold1',batch_id:'b1',quantity:fixture.held,reason:'Safety hold',status:fixture.holdStatus,created_at:stamp,created_by_name:'Manager',name:product.name,batch_number:batch.batch_number,expiry_date:batch.expiry_date}]
  if(q.includes('count('))return [{count:1,total:1}]
  if(q.includes('from sales_invoices')||q.includes('from sales_dashboard'))return []
  if(q.includes('from suppliers'))return [{id:'s1',name:'Test Supplier',is_active:1}]
  if(q.includes('from products')){if(fixture.productDelay)await new Promise(r=>setTimeout(r,fixture.productDelay));if(fixture.failProductSearch)throw new Error('Synthetic search failure');return [product]}
  if(q.includes('from product_batches')){const first={...batch,name:product.name,sku:product.sku,quantity_in_stock:fixture.unheld,held:fixture.held,quarantined:fixture.held,loose_open_remaining:fixture.openUnits};return params.get('expiry')==='1'?[{...first,expiry_date:datePlus(10)},{...first,id:'b2',batch_number:'LATER-30',expiry_date:datePlus(30),held:0,quarantined:0},{...first,id:'b3',batch_number:'EXPIRED-1',expiry_date:datePlus(-1)}]:[first]}
  if(q.includes('from customers'))return params.get('customers')==='many'?moreCustomers:[customer]
  return []
 }
 if(['database_execute','touch_session','logout_user'].includes(command))return null
 throw new Error(`Unexpected fixture mutation: ${command}`)
}}})
const app=createApp(params.get('app')==='1'?App:{render:()=>h(RouterView)})
app.use(createPinia())
if(view!='/login')useAuthStore().currentUser=user as any
app.use(router)
await router.replace(view)
await router.isReady()
app.mount('#app')
Object.assign(window,{testRouter:router,testAuth:useAuthStore(),testCart:useCartStore(),testDraft:usePurchaseDraftStore(),fixtureReady:true})
