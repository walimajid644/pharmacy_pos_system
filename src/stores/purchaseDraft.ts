import {defineStore} from 'pinia'
import {ref} from 'vue'
export const usePurchaseDraftStore=defineStore('purchaseDraft',()=>{
 const pending=ref<{supplierId:string;items:Array<{productId:string;quantity:number}>;notes:string}|null>(null)
 function stage(draft:NonNullable<typeof pending.value>){pending.value=draft}
 function take(){const value=pending.value;pending.value=null;return value}
 function clear(){pending.value=null}
 return {pending,stage,take,clear}
})
