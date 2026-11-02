import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {csvCell} from '../src/lib/csv.ts'
import {parseCsv,normalizeCatalog,readCatalogFile,checkXlsxArchive} from '../src/lib/catalogFile.ts'
const csv='\uFEFFsku,name,barcode,unit_price,cost_price,wholesale_price,pack_size,sell_by_loose_unit,batch_number,expiry_date,quantity_in_stock,received_date\r\n0001,"Tablet, \"\"quoted\"\"",0012345,10.25,5,0,10,yes,B1,2099-12-31,17,2026-01-01\r\n'
const rows=normalizeCatalog(parseCsv(csv));assert.equal(rows[0].product.sku,'0001');assert.equal(rows[0].product.barcode,'0012345');assert.equal(rows[0].product.name,'Tablet, "quoted"');assert.equal(rows[0].product.wholesalePrice,0);assert.equal(rows[0].batch.quantity,17);assert.equal(rows[0].sourceRow,2)
assert.throws(()=>parseCsv('a,b\n"broken'),/Unclosed/)
assert.throws(()=>normalizeCatalog(parseCsv('sku,name,unit_price,cost_price,unknown\nA,A,1,1,x')),/Unknown/)
assert.throws(()=>normalizeCatalog(parseCsv('sku,name,unit_price,cost_price,sku\nA,A,1,1,A')),/Duplicate/)
assert.throws(()=>normalizeCatalog(parseCsv('sku,name,unit_price,cost_price\n1E+20,A,1,1')),/Scientific/)
assert.throws(()=>normalizeCatalog(parseCsv('sku,name,unit_price,cost_price\nA,A,"1,200",1')),/plain number/)
assert.throws(()=>normalizeCatalog([['sku','name','unit_price','cost_price'],[{number:'123'},'Medicine',{number:'10'},{number:'5'}]]),/must be Text/)
function workbook(formula=false,numericSku=false){
 const headers=['sku','name','barcode','unit_price','cost_price','pack_size'];const xmlText=(cell,value)=>`<c r="${cell}" t="inlineStr"><is><t>${value}</t></is></c>`
 const head=headers.map((h,i)=>xmlText(String.fromCharCode(65+i)+'1',h)).join('')
 const row=(numericSku?'<c r="A2"><v>1</v></c>':xmlText('A2','0001'))+xmlText('B2','مصنوعی دوا')+xmlText('C2','0012345678901')+`<c r="D2">${formula?'<f>1+1</f>':''}<v>10.25</v></c><c r="E2"><v>5</v></c><c r="F2"><v>10</v></c>`
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Medicines" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:F2"/><sheetData><row r="1">${head}</row><row r="2">${row}</row></sheetData></worksheet>`}
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])))
}
const sheets=await readCatalogFile(new File([workbook()],'medicines.xlsx'));assert.equal(sheets[0].sheet,'Medicines');const excel=normalizeCatalog(sheets[0].data);assert.equal(excel[0].product.sku,'0001');assert.equal(excel[0].product.name,'مصنوعی دوا');assert.equal(excel[0].product.retailPrice,10.25)
await assert.rejects(readCatalogFile(new File([workbook(true)],'formula.xlsx')),/formulas/)
const numeric=await readCatalogFile(new File([workbook(false,true)],'numeric.xlsx'));assert.throws(()=>normalizeCatalog(numeric[0].data),/must be Text/)
await assert.rejects(readCatalogFile(new File(['old'],'old.xls')),/\.xlsx/)
await assert.rejects(readCatalogFile(new File([new Uint8Array([255,255])],'bad.csv')))
const bomb=workbook();const data=new DataView(bomb.buffer,bomb.byteOffset,bomb.byteLength);const end=bomb.length-22,offset=data.getUint32(end+16,true);data.setUint32(offset+24,26000000,true);assert.throws(()=>checkXlsxArchive(bomb.buffer),/25 MB/)
console.log('Catalog parser: quoted UTF-8 CSV, leading zeros, explicit zero, real XLSX, numeric identifiers, formulas, formats and expansion limit passed')

assert.equal(csvCell('=SUM(1,2)'), '"\'=SUM(1,2)"');assert.equal(csvCell('A "quoted", value'), '"A ""quoted"", value"');assert.equal(csvCell(-2), '"-2"');console.log('CSV quoting and formula neutralization passed')
