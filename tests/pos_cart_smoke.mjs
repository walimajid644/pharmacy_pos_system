import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore } from '../src/stores/cart.ts'

setActivePinia(createPinia())
const cart = useCartStore()
const product = { id: 'p', name: 'Test', unit_price: 2.5, pack_size: 10 }
const batch = { id: 'b', cost_price_at_batch: 1.5 }
cart.addItem(product, batch, 2, false)
cart.items[0].bonusQuantity = 1
cart.updateItemDiscount(0, 10)
assert.equal(cart.lineTotal(cart.items[0]), 45, 'Free packs do not increase the charge')
cart.setTaxRate(10)
cart.setDiscountAmount(2)
assert.equal(cart.total, 47.5)
cart.addItem(product, batch, 3, true)
cart.items[1].bonusQuantity = 2
assert.equal(cart.lineTotal(cart.items[1]), 7.5, 'Loose bonus units are also free')
assert.equal(cart.subtotal, 52.5)
assert.equal(cart.total, 55.75)
cart.clearCart()
assert.equal(cart.items.length, 0)
assert.equal(cart.discountAmount, 0)
console.log('POS cart: pack/loose bonus quantities, discounts, tax and clearing passed')

const multiPrice = {id:'multi',name:'Dual price',unit_price:10,wholesale_price:7.5,pack_size:10}
cart.addItem(multiPrice,batch,2,false)
cart.setTaxRate(0)
assert.equal(cart.subtotal,200)
cart.setCustomerType('wholesale')
assert.equal(cart.subtotal,150,'Existing cart follows selected customer price list')
assert.equal(multiPrice.unit_price,10,'Retail catalog price is not overwritten')
cart.items[0].bonusQuantity=1
cart.updateItemDiscount(0,10)
assert.equal(cart.subtotal,135,'Wholesale discount and free-pack handling stay correct')
cart.setCustomerType('retail')
assert.equal(cart.subtotal,180)
cart.clearCart()
cart.setCustomerType('wholesale')
cart.addItem({...multiPrice,id:'fallback',wholesale_price:null},batch,1,true)
assert.equal(cart.subtotal,10,'Null wholesale falls back to retail')
cart.clearCart()
cart.setCustomerType('wholesale')
cart.addItem({...multiPrice,id:'free',wholesale_price:0},batch,1,true)
assert.equal(cart.subtotal,0,'Explicit zero wholesale is not treated as blank')
cart.clearCart()
assert.equal(cart.customerType,'retail')
console.log('Retail/wholesale switching, null fallback, explicit zero and clearing passed')
