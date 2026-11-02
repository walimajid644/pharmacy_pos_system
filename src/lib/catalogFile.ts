export const catalogHeaders=['sku','name','generic_name','barcode','category','manufacturer','unit_price','cost_price','wholesale_price','pack_size','sell_by_loose_unit','reorder_level','controlled_substance','drap_registration_number','batch_number','expiry_date','quantity_in_stock','received_date','batch_cost_price'] as const
export type CatalogRow={sourceRow:number;product:{sku:string;name:string;genericName:string|null;barcode:string|null;category:string|null;manufacturer:string|null;retailPrice:number;costPrice:number;wholesalePrice:number|null;packSize:number;sellLoose:boolean;controlled:boolean;drap:string|null;reorderLevel:number};batch:{number:string;expiry:string;quantity:number;received:string;cost:number}|null}
type NumericCell={number:string}
const numeric=(v:unknown):v is NumericCell=>!!v&&typeof v==='object'&&'number' in v
const blank=(v:unknown)=>v==null||typeof v==='string'&&!v.trim()
export function parseCsv(text:string):string[][]{
 text=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,afterQuote=false
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;afterQuote=true}}else cell+=c;continue}
  if(afterQuote&&c!==','&&c!=='\r'&&c!=='\n'&&c!==' '&&c!=='\t')throw new Error('Invalid CSV after closing quote')
  if(c==='"'){if(cell.trim())throw new Error('Quotes must start a CSV cell');quoted=true;cell=''}
  else if(c===','){row.push(cell);cell='';afterQuote=false}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';afterQuote=false}
  else if(!afterQuote)cell+=c
 }
 if(quoted)throw new Error('Unclosed CSV quote');if(cell||row.length){row.push(cell);rows.push(row)}return rows
}
function string(v:unknown,identifier=false):string{
 if(blank(v))return ''
 if(identifier&&(numeric(v)||typeof v==='number'))throw new Error('SKU/barcode cells must be Text in Excel to preserve leading zeros')
 if(numeric(v))return v.number
 if(v instanceof Date)return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${String(v.getUTCDate()).padStart(2,'0')}`
 const s=String(v).trim();if(identifier&&/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s))throw new Error('Scientific notation cannot be used for SKU/barcode; format as Text')
 return s
}
export function normalizeCatalog(data:unknown[][]):CatalogRow[]{
 if(!data.length)throw new Error('File is empty')
 const aliases:Record<string,string>={product_name:'name',generic:'generic_name',retail_price:'unit_price',retail_unit_price:'unit_price',wholesale_unit_price:'wholesale_price',cost:'cost_price',sell_loose:'sell_by_loose_unit',controlled:'controlled_substance',drap:'drap_registration_number',quantity:'quantity_in_stock',expiry:'expiry_date',received:'received_date',batch_cost:'batch_cost_price'}
 const headers=data[0].map(v=>{const h=string(v).toLowerCase().replace(/[\s-]+/g,'_');return aliases[h]||h})
 if(headers.some(h=>!catalogHeaders.includes(h as typeof catalogHeaders[number])))throw new Error('Unknown/blank column. Use the downloaded CSV template headers.')
 if(new Set(headers).size!==headers.length)throw new Error('Duplicate column headers')
 for(const h of ['sku','name','unit_price','cost_price'])if(!headers.includes(h))throw new Error(`Missing required column: ${h}`)
 const rows:CatalogRow[]=[]
 for(let i=1;i<data.length;i++){
  const cells=data[i];if(cells.every(blank))continue
  if(cells.length>headers.length&&cells.slice(headers.length).some(v=>!blank(v)))throw new Error(`Row ${i+1}: more values than headers`)
  const get=(h:string)=>cells[headers.indexOf(h)]
  const str=(h:string,id=false)=>string(get(h),id)
  const num=(h:string,fallback?:number):number=>{if(blank(get(h))){if(fallback!==undefined)return fallback;throw new Error(`${h} is required`)}const v=str(h);if(!/^-?\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v)))throw new Error(`${h}: use a plain number without commas or currency`);return Number(v)}
  const bool=(h:string)=>{const v=str(h).toLowerCase();if(['','0','false','no'].includes(v))return false;if(['1','true','yes'].includes(v))return true;throw new Error(`${h}: use yes/no, true/false or 1/0`)}
  try{
   const cost=num('cost_price'),product={sku:str('sku',true),name:str('name'),genericName:str('generic_name')||null,barcode:str('barcode',true)||null,category:str('category')||null,manufacturer:str('manufacturer')||null,retailPrice:num('unit_price'),costPrice:cost,wholesalePrice:blank(get('wholesale_price'))?null:num('wholesale_price'),packSize:num('pack_size',1),sellLoose:bool('sell_by_loose_unit'),controlled:bool('controlled_substance'),drap:str('drap_registration_number')||null,reorderLevel:num('reorder_level',10)}
   const hasBatch=['batch_number','expiry_date','quantity_in_stock','received_date','batch_cost_price'].some(h=>!blank(get(h)))
   const batch=hasBatch?{number:str('batch_number'),expiry:str('expiry_date'),quantity:num('quantity_in_stock'),received:str('received_date'),cost:num('batch_cost_price',cost)}:null
   rows.push({sourceRow:i+1,product,batch})
  }catch(e){throw new Error(`Row ${i+1}: ${e instanceof Error?e.message:String(e)}`)}
 }
 if(!rows.length||rows.length>5000)throw new Error('Use 1–5000 non-empty data rows per file')
 return rows
}
// Check central-directory sizes before allocating decompressed workbook data.
export function checkXlsxArchive(buffer:ArrayBuffer){
 const v=new DataView(buffer);let end=-1
 for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0)throw new Error('Invalid .xlsx ZIP directory')
 const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true)
 if(count>500||count===65535)throw new Error('Workbook has too many ZIP entries')
 let pos=offset,total=0
 for(let i=0;i<count;i++){
  if(pos+46>buffer.byteLength||v.getUint32(pos,true)!==0x02014b50)throw new Error('Invalid workbook directory')
  const size=v.getUint32(pos+24,true);total+=size
  if(size===0xffffffff||total>25_000_000||v.getUint16(pos+8,true)&1)throw new Error('Workbook is encrypted or expands beyond 25 MB')
  pos+=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true)
 }
}
export async function readCatalogFile(file:File):Promise<Array<{sheet:string;data:unknown[][]}>>{
 if(file.size>5_000_000)throw new Error('File exceeds 5 MB')
 if(/\.csv$/i.test(file.name)){const bytes=await file.arrayBuffer();return [{sheet:'CSV',data:parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}]}
 if(!/\.xlsx$/i.test(file.name))throw new Error('Use UTF-8 .csv or Excel .xlsx. Save older .xls files as .xlsx first.')
 const buffer=await file.arrayBuffer();checkXlsxArchive(buffer)
 const {unzipSync}=await import('fflate');const xml=unzipSync(new Uint8Array(buffer),{filter:e=>e.name.endsWith('.xml')})
 for(const [name,bytes] of Object.entries(xml)){if(bytes.length>25_000_000)throw new Error('Workbook XML is too large');if(name.includes('worksheets/')&&/<(?:\w+:)?f(?=[\s/>])/.test(new TextDecoder().decode(bytes)))throw new Error('Workbook contains formulas. Paste values only before importing.')}
 const {default:read}=await import('read-excel-file/universal')
 return await read<NumericCell>(buffer,{parseNumber:value=>({number:value})}) as unknown as Array<{sheet:string;data:unknown[][]}>
}
export function catalogTemplate():string{return '\uFEFF'+catalogHeaders.join(',')+'\r\n'}
