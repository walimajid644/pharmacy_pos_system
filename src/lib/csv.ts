/** Quote CSV fields and prevent text cells becoming spreadsheet formulas. */
export function csvCell(value:unknown):string {
 let text=value==null?'':String(value)
 if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(text))text="'"+text
 return '"'+text.replace(/"/g,'""')+'"'
}
