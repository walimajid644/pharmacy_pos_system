import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CartItem, Product, ProductBatch } from '@/lib/types'

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const discountAmount = ref(0)
  const taxRate = ref(0)
  const customerType=ref<'retail'|'wholesale'>('retail')
  const unitPrice=(product:Product)=>customerType.value==='wholesale'?product.wholesale_price??product.unit_price:product.unit_price
  function setCustomerType(value:string){customerType.value=value==='wholesale'?'wholesale':'retail'}

  const money = (value: number) => Math.round(value * 100) / 100

  function lineTotal(item: CartItem): number {
    const units = item.quantity * (item.isLooseSale ? 1 : item.product.pack_size)
    return money(unitPrice(item.product) * units * (1 - item.discount / 100))
  }

  const subtotal = computed(() => money(items.value.reduce((sum, item) => sum + lineTotal(item), 0)))

  const taxAmount = computed(() => {
    return money(subtotal.value * taxRate.value / 100)
  })

  const total = computed(() => {
    return money(subtotal.value + taxAmount.value - discountAmount.value)
  })

  const itemCount = computed(() => items.value.length)

  function addItem(product: Product, batch: ProductBatch, quantity: number = 1, isLooseSale: boolean = false, confirmBreak: boolean = false) {
    const existingIndex = items.value.findIndex(
      (item) => item.product.id === product.id && item.batch.id === batch.id && item.isLooseSale === isLooseSale
    )

    if (existingIndex !== -1) {
      items.value[existingIndex].quantity += quantity
      items.value[existingIndex].confirmBreak ||= confirmBreak
    } else {
      items.value.push({
        product,
        batch,
        quantity,
        bonusQuantity: 0,
        isLooseSale,
        discount: 0,
        confirmBreak,
      })
    }
  }

  function removeItem(index: number) {
    items.value.splice(index, 1)
  }

  function updateItemQuantity(index: number, quantity: number) {
    if (quantity <= 0) {
      removeItem(index)
    } else {
      items.value[index].quantity = quantity
    }
  }

  function updateItemDiscount(index: number, discount: number) {
    items.value[index].discount = Math.max(0, Math.min(100, discount))
  }

  function clearCart() {
    items.value = []
    discountAmount.value = 0
    customerType.value='retail'
  }

  function setTaxRate(rate: number) {
    taxRate.value = Math.max(0, Math.min(100, rate))
  }

  function setDiscountAmount(amount: number) {
    discountAmount.value = Math.max(0, amount)
  }

  return {
    items,
    customerType,unitPrice,setCustomerType,
    subtotal,
    lineTotal,
    taxAmount,
    total,
    itemCount,
    discountAmount,
    taxRate,
    addItem,
    removeItem,
    updateItemQuantity,
    updateItemDiscount,
    clearCart,
    setTaxRate,
    setDiscountAmount,
  }
})
