import assert from 'node:assert/strict'
import {savedSaleText,savedSaleSummary} from '../src/lib/savedSale.ts'
const sale={invoice:{invoice_number:'INV-SAVED',invoice_date:'2026-10-31',payment_method:'credit',net_amount:17,received_amount:0,change_amount:0,notes:'Saved note'},items:Array.from({length:100},(_,i)=>({product_name:'محفوظ دوا '.repeat(15)+i,quantity:1,sale_quantity:1,bonus_quantity:0,line_total:7})),shop:{company_name:'Test pharmacy'}}
const format=n=>`Rs ${n.toFixed(2)}`
assert(savedSaleText(sale,format).includes('Credit / Udhar total: Rs 17.00'))
const summary=savedSaleSummary(sale,format)
assert(new TextEncoder().encode(summary).length<=1800)
assert(summary.includes('more items'))
assert(summary.includes('Credit / Udhar total: Rs 17.00'))
assert(summary.includes('Received: Rs 0.00'))
console.log('Saved receipt amounts and UTF-8 bounded digital summary passed')
