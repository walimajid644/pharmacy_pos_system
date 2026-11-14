import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { formatDate, isExpired, isNearExpiry } from '@/lib/utils';
import type { Product, ProductBatch } from '@/lib/types';
import { roundSaleMoney as money } from '@/lib/pos';

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

  function addToCart(product: Product & { batches: ProductBatch[] }, isLooseSale = false) {
    if (isLooseSale && !product.sell_by_loose_unit) {
      toast.warning('This product cannot be sold as a loose unit');
      return;
    }
    if (!product.batches || product.batches.length === 0) {
      toast.warning('No stock available for this product');
      return;
    }

    const unitsNeeded = isLooseSale ? 1 : product.pack_size;
    // Keep FEFO: an earlier batch must be exhausted before the next one is used.
    const batch = product.batches.find(
      (candidate) =>
        candidate.quantity_in_stock - reservedInBatch(candidate.id) > 0 &&
        !isExpired(candidate.expiry_date),
    );
    if (!batch) {
      toast.warning(
        `No unexpired batch has enough stock for another ${isLooseSale ? 'loose unit' : 'pack'}`,
      );
      return;
    }
    if (batch.quantity_in_stock - reservedInBatch(batch.id) < unitsNeeded) {
      toast.warning(
        pick(
          'Sell the remaining units from the earliest batch first.',
          'پہلے جلد میعاد ختم ہونے والے بیچ کی باقی اکائیاں فروخت کریں۔',
        ),
      );
      return;
    }
    if (
      !isLooseSale &&
      batch.quantity_in_stock - reservedInBatch(batch.id) - batch.loose_open_remaining < unitsNeeded
    ) {
      toast.warning(
        pick(
          'Only opened loose units remain in this batch.',
          'اس بیچ میں صرف کھلی اکائیاں باقی ہیں۔',
        ),
      );
      return;
    }

    // Check if expired
    if (isExpired(batch.expiry_date)) {
      toast.error('Cannot sell expired product');
      return;
    }

    const existingLoose = cartStore.items.find(
      (item) => item.batch.id === batch.id && item.isLooseSale,
    );
    const loosePlanned = existingLoose ? existingLoose.quantity + existingLoose.bonusQuantity : 0;
    const needsBreak =
      isLooseSale &&
      stripsNeeded(loosePlanned + 1, batch.loose_open_remaining, product.pack_size) >
        stripsNeeded(loosePlanned, batch.loose_open_remaining, product.pack_size);
    if (
      needsBreak &&
      !confirm(
        pick(
          `Open a strip from batch ${batch.batch_number} (expires ${formatDate(batch.expiry_date)})? This will be logged on the invoice.`,
          `بیچ ${batch.batch_number} کی پٹی کھولیں؟ یہ فیصلہ انوائس میں درج ہوگا۔`,
        ),
      )
    )
      return;
    cartStore.addItem(product, batch, 1, isLooseSale, needsBreak);
    toast.success(`Added ${isLooseSale ? 'loose unit' : 'pack'} of ${product.name}`);
    onAdded();
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
    const units = allQuantity * (item.isLooseSale ? 1 : item.product.pack_size);
    if (units + reservedInBatch(item.batch.id, index) > item.batch.quantity_in_stock) {
      toast.warning('Quantity exceeds batch stock');
      restore();
      return;
    }
    if (
      !item.isLooseSale &&
      units + reservedInBatch(item.batch.id, index) >
        item.batch.quantity_in_stock - item.batch.loose_open_remaining
    ) {
      toast.warning('Only opened loose units remain; reduce packs or sell loose units');
      restore();
      return;
    }
    if (
      item.isLooseSale &&
      stripsNeeded(allQuantity, item.batch.loose_open_remaining, item.product.pack_size) >
        stripsNeeded(
          item.quantity + item.bonusQuantity,
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
