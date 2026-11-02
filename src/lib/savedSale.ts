export interface SavedInvoice {id:string;invoice_number:string;invoice_date:string;customer_name:string;customer_phone:string|null;cashier_name:string;payment_method:string;net_amount:number;total_amount:number;tax_amount:number;discount_amount:number;received_amount:number|null;change_amount:number|null;previous_balance:number|null;notes:string|null;patient_name?:string|null;doctor_name?:string|null;prescription_note?:string|null}
export interface SavedItem {id:string;product_name:string;batch_number:string;quantity:number;sale_quantity:number|null;bonus_quantity:number;is_loose_sale:boolean;unit_price:number;discount_percent:number;line_total:number;controlled_substance?:number;drap_registration_number?:string|null}
export interface SavedSale {invoice:SavedInvoice;items:SavedItem[];shop:Record<string,string|number|null>|null}
export function savedSaleText(sale:SavedSale,format:(v:number)=>string){const i=sale.invoice;return [String(sale.shop?.company_name||'Pharmacy POS'),`Invoice ${i.invoice_number}`,i.invoice_date,...sale.items.map(l=>`${l.product_name} x${l.sale_quantity??l.quantity}${l.bonus_quantity?` +${l.bonus_quantity} free`:''}: ${format(l.line_total)}`),`${i.payment_method==='credit'?'Credit / Udhar total':'Total paid'}: ${format(i.net_amount)}`,`Received: ${format(i.received_amount||0)}`,`Change: ${format(i.change_amount||0)}`,i.notes||'','Thank you for your purchase.'].filter(Boolean).join('\n')}

/** Bounded draft summary: all amounts come from the saved invoice, never the live cart. */
export function savedSaleSummary(sale:SavedSale,format:(value:number)=>string){
 const invoice=sale.invoice,encoder=new TextEncoder()
 const header=[String(sale.shop?.company_name||'Pharmacy POS').slice(0,100),`Invoice ${invoice.invoice_number}`,invoice.invoice_date]
 const footer=[`${invoice.payment_method==='credit'?'Credit / Udhar total':'Total paid'}: ${format(invoice.net_amount)}`,`Received: ${format(invoice.received_amount||0)}`,`Change: ${format(invoice.change_amount||0)}`]
 const lines:string[]=[]
 for(const item of sale.items){const line=`${item.product_name.slice(0,80)} x${item.sale_quantity??item.quantity}: ${format(item.line_total)}`;const candidate=[...header,...lines,line,`+${sale.items.length} more items`,...footer].join('\n');if(encoder.encode(candidate).length>1700)break;lines.push(line)}
 if(lines.length<sale.items.length)lines.push(`+${sale.items.length-lines.length} more items. Full saved receipt available from the pharmacy.`)
 return [...header,...lines,...footer].join('\n')
}
