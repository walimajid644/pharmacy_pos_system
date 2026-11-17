import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { formatDate, isExpired, isNearExpiry } from '@/lib/utils';
import type { Product, ProductBatch } from '@/lib/types';
import { roundSaleMoney as money, unallocatedStockBatch, isUnallocatedStockBatch } from '@/lib/pos';

export function usePosCartLines(onAdded: () => void) {
  const cartStore = useCartStore();
  const settingsStore = useSettingsStore();
  const toast = useToast();
  const { pick } = useI18n();
  const lineGross = (item: (typeof cartStore.items)[number]) =>
    money(
      cartStore.unitPrice(item.product) *
        item.quantity *
        (item.isLooseSale ? 1 : item.product.pack_size),
    );

  const lineDiscount = (item: (typeof cartStore.items)[number]) =>
    money(lineGross(item) - cartStore.lineTotal(item));

  const lineCost = (item: (typeof cartStore.items)[number]) =>
    item.batch.cost_price_at_batch *
    (item.quantity + item.bonusQuantity) *
    (item.isLooseSale ? 1 : item.product.pack_size);

  const lineMargin = (item: (typeof cartStore.items)[number]) =>
    cartStore.lineTotal(item) > 0
      ? ((cartStore.lineTotal(item) - lineCost(item)) / cartStore.lineTotal(item)) * 100
      : null;

  function reservedInBatch(batchId: string, excludeIndex = -1) {
    return cartStore.items.reduce(
      (sum, item, index) =>
        sum +
        (index !== excludeIndex && item.batch.id === batchId
          ? (item.quantity + item.bonusQuantity) * (item.isLooseSale ? 1 : item.product.pack_size)
          : 0),
      0,
    );
  }

  function stripsNeeded(units: number, openUnits: number, packSize: number) {
    return packSize > 1 ? Math.max(0, Math.ceil((units - openUnits) / packSize)) : 0;
  }

  function addToCart(
    product: Product & { batches: ProductBatch[] },
    isLooseSale = false,
    quantity = 1,
    bonusQuantity = 0,
    discount = 0,
  ) {
    if (isLooseSale && !product.sell_by_loose_unit) {
      toast.warning('This product cannot be sold as a loose unit');
      return false;
    }
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isSafeInteger(bonusQuantity) ||
      bonusQuantity < 0 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100
    )
      return false;
    // Use recorded stock in expiry order, then allow the selected balance to go negative.
    const batches = product.batches || [];
    const usable = batches.filter(
      (batch) => isUnallocatedStockBatch(batch) || !isExpired(batch.expiry_date),
    );
    const batch =
      usable.find(
        (candidate) =>
          !isUnallocatedStockBatch(candidate) &&
          candidate.quantity_in_stock - reservedInBatch(candidate.id) > 0,
      ) ||
      usable.find((candidate) => !isUnallocatedStockBatch(candidate)) ||
      usable[0] ||
      unallocatedStockBatch(product);

    const loosePlanned = cartStore.items.reduce(
      (sum, item) =>
        sum +
        (item.batch.id === batch.id && item.isLooseSale ? item.quantity + item.bonusQuantity : 0),
      0,
    );
    const needsBreak =
      isLooseSale &&
      stripsNeeded(
        Math.min(loosePlanned + quantity + bonusQuantity, Math.max(0, batch.quantity_in_stock)),
        batch.loose_open_remaining,
        product.pack_size,
      ) >
        stripsNeeded(
          Math.min(loosePlanned, Math.max(0, batch.quantity_in_stock)),
          batch.loose_open_remaining,
          product.pack_size,
        );
    if (
      needsBreak &&
      !confirm(
        pick(
          `Open a strip from batch ${batch.batch_number} (expires ${formatDate(batch.expiry_date)})? This will be logged on the invoice.`,
          `بیچ ${batch.batch_number} کی پٹی کھولیں؟ یہ فیصلہ انوائس میں درج ہوگا۔`,
        ),
      )
    )
      return false;
    cartStore.addItem(product, batch, quantity, isLooseSale, needsBreak, bonusQuantity, discount);
    toast.success(`Added ${isLooseSale ? 'loose unit' : 'pack'} of ${product.name}`);
    onAdded();
    return true;
  }

  function removeFromCart(index: number) {
    cartStore.removeItem(index);
  }

  function updateQuantities(index: number, event: Event, bonus = false) {
    const input = event.target as HTMLInputElement;
    const item = cartStore.items[index];
    if (!item) return;
    const previous = bonus ? item.bonusQuantity : item.quantity;
    const quantity = Number(input.value);
    const restore = () => {
      input.value = String(previous);
    };
    if (input.value === '' || !Number.isSafeInteger(quantity) || quantity < (bonus ? 0 : 1)) {
      restore();
      return;
    }
    const allQuantity = bonus ? item.quantity + quantity : quantity + item.bonusQuantity;
    if (
      item.isLooseSale &&
      stripsNeeded(
        Math.min(allQuantity, Math.max(0, item.batch.quantity_in_stock)),
        item.batch.loose_open_remaining,
        item.product.pack_size,
      ) >
        stripsNeeded(
          Math.min(item.quantity + item.bonusQuantity, Math.max(0, item.batch.quantity_in_stock)),
          item.batch.loose_open_remaining,
          item.product.pack_size,
        )
    ) {
      if (
        !confirm(
          pick(
            `Open a strip from batch ${item.batch.batch_number}?`,
            `بیچ ${item.batch.batch_number} کی پٹی کھولیں؟`,
          ),
        )
      ) {
        restore();
        return;
      }
      item.confirmBreak = true;
    }
    if (bonus) item.bonusQuantity = quantity;
    else cartStore.updateItemQuantity(index, quantity);
  }

  function onLineDiscountAmountChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const item = cartStore.items[index];
    const amount = Number(input.value);
    const gross = lineGross(item);
    if (!Number.isFinite(amount) || amount < 0 || amount > gross) {
      toast.warning('Discount amount must be between zero and the line price');
    } else cartStore.updateItemDiscount(index, gross ? (money(amount) / gross) * 100 : 0);
    input.value = lineDiscount(item).toFixed(2);
  }

  function onLineDiscountChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const discount = Number(input.value);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      toast.warning('Line discount must be between 0% and 100%');
      input.value = String(cartStore.items[index]?.discount ?? 0);
      return;
    }
    cartStore.updateItemDiscount(index, discount);
    input.value = String(cartStore.items[index].discount);
  }

  function getBatchWarning(expiryDate: string): string | null {
    if (!expiryDate) return null;
    if (isExpired(expiryDate)) return pick('EXPIRED', 'میعاد ختم');
    if (isNearExpiry(expiryDate, Number(settingsStore.settings?.near_expiry_days ?? 60)))
      return pick('Near Expiry', 'جلد میعاد ختم');
    return null;
  }

  return {
    lineGross,
    lineDiscount,
    lineMargin,
    reservedInBatch,
    addToCart,
    removeFromCart,
    updateQuantities,
    onLineDiscountAmountChange,
    onLineDiscountChange,
    getBatchWarning,
  };
}
