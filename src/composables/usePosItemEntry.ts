import { computed, nextTick, ref } from 'vue';
import { useCartStore } from '@/stores/cart';
import { useI18n } from '@/lib/i18n';
import type { PosProduct } from '@/lib/pos';
import type { usePosCartLines } from './usePosCartLines';

export function usePosItemEntry(
  addToCart: ReturnType<typeof usePosCartLines>['addToCart'],
  closeSearch: () => void,
) {
  const cart = useCartStore();
  const { pick } = useI18n();
  const pendingProduct = ref<PosProduct | null>(null);
  const itemCode = ref('');
  const itemCodeInput = ref<HTMLInputElement | null>(null);
  const entryQuantityInput = ref<HTMLInputElement | null>(null);
  const entryQuantity = ref<number | string>(1);
  const entryBonus = ref<number | string>(0);
  const entryDiscount = ref<number | string>(0);
  const entryLoose = ref(false);
  const entryError = ref('');
  const entryStock = computed(
    () =>
      pendingProduct.value?.recordedStock ??
      pendingProduct.value?.batches.reduce(
        (sum, batch) => sum + Number(batch.quantity_in_stock),
        0,
      ) ??
      0,
  );
  const entryPrice = computed(() =>
    pendingProduct.value
      ? cart.unitPrice(pendingProduct.value) *
        (entryLoose.value ? 1 : pendingProduct.value.pack_size)
      : 0,
  );

  function clearEntry() {
    pendingProduct.value = null;
    itemCode.value = '';
    entryQuantity.value = 1;
    entryBonus.value = 0;
    entryDiscount.value = 0;
    entryLoose.value = false;
    entryError.value = '';
  }
  function selectProductForEntry(product: PosProduct, loose = false) {
    clearEntry();
    pendingProduct.value = product;
    itemCode.value = product.sku;
    entryLoose.value = loose;
    closeSearch();
    void nextTick(() => {
      entryQuantityInput.value?.focus({ preventScroll: true });
      entryQuantityInput.value?.select();
    });
  }
  function commitEntry(event?: Event) {
    if (event instanceof KeyboardEvent && (event.repeat || event.isComposing)) return;
    const quantity = Number(entryQuantity.value),
      bonus = Number(entryBonus.value),
      discount = Number(entryDiscount.value);
    if (!pendingProduct.value) return;
    if (
      entryQuantity.value === '' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      entryBonus.value === '' ||
      !Number.isSafeInteger(bonus) ||
      bonus < 0 ||
      entryDiscount.value === '' ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100
    ) {
      entryError.value = pick(
        'Enter a whole quantity of 1 or more, a bonus of 0 or more, and a discount from 0–100%.',
        'مقدار کم از کم ۱، بونس صفر یا زیادہ اور رعایت ۰ تا ۱۰۰ فیصد درج کریں۔',
      );
      return;
    }
    if (addToCart(pendingProduct.value, entryLoose.value, quantity, bonus, discount)) {
      clearEntry();
      void nextTick(() => itemCodeInput.value?.focus({ preventScroll: true }));
    }
  }
  return {
    pendingProduct,
    itemCode,
    itemCodeInput,
    entryQuantityInput,
    entryQuantity,
    entryBonus,
    entryDiscount,
    entryLoose,
    entryError,
    entryPrice,
    entryStock,
    selectProductForEntry,
    commitEntry,
    clearEntry,
  };
}
