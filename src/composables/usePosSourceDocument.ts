import { ref, onBeforeUnmount } from 'vue';
import { useCartStore } from '@/stores/cart';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import { executeQuery } from '@/lib/database';
import type { Product, ProductBatch } from '@/lib/types';
import { unallocatedStockBatch, isUnallocatedStockBatch, type CustomerOption } from '@/lib/pos';

export function usePosSourceDocument(
  chooseCustomer: (customer: CustomerOption | null) => void,
  setRemarks: (remarks: string) => void,
) {
  const cartStore = useCartStore();
  let disposed = false;
  onBeforeUnmount(() => {
    disposed = true;
  });
  const toast = useToast();
  const { pick } = useI18n();
  const sourceDocumentId = ref<string | null>(null);

  const sourceDocumentNumber = ref('');

  const sourceDocumentKind = ref('');

  const sourceDocumentLoading = ref(false);

  const sourceDocumentError = ref('');

  const sourcePriceChanges = ref(0);

  async function loadSourceDocument(id: string) {
    if (disposed) return;
    sourceDocumentLoading.value = true;
    sourceDocumentError.value = '';
    try {
      if (cartStore.items.length && !confirm('Replace the current cart with this document?'))
        return;
      const [doc] = await executeQuery<{
        id: string;
        number: string;
        customer_id: string | null;
        customer_name: string;
        notes: string;
        kind: string;
        due_date: string | null;
      }>("SELECT * FROM commercial_documents WHERE id=? AND status='open'", [id]);
      if (!doc)
        throw new Error(
          pick(
            'This estimate or pre-order was cancelled, converted, or is no longer available. Open its register to review it.',
            'یہ تخمینہ یا آرڈر منسوخ، فروخت میں تبدیل یا دستیاب نہیں۔ متعلقہ رجسٹر کھولیں۔',
          ),
        );
      sourceDocumentKind.value = doc.kind;
      const localDate = new Date();
      const localToday = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      if (doc.kind === 'estimate' && doc.due_date && doc.due_date < localToday)
        throw new Error(
          pick(
            'This estimate has expired. Open Estimates, edit its validity date and save before loading it again.',
            'تخمینہ ختم ہو چکا ہے۔ تخمینے میں تاریخ درست کر کے محفوظ کریں اور دوبارہ لوڈ کریں۔',
          ),
        );
      const sourceLines = await executeQuery<{ product_id: string; quantity: number }>(
        'SELECT product_id,quantity FROM commercial_document_items WHERE document_id=?',
        [id],
      );
      if (!sourceLines.length) throw new Error('Document has no items');
      const availability = await executeQuery<{
        name: string;
        quantity: number;
        available: number;
        active: number;
        quoted: number;
        current: number;
      }>(
        "SELECT p.name,l.quantity,p.is_active AS active,l.unit_price_cents AS quoted,CAST(ROUND((CASE WHEN (SELECT customer_type FROM customers WHERE id=(SELECT customer_id FROM commercial_documents WHERE id=l.document_id))='wholesale' THEN COALESCE(p.wholesale_price,p.unit_price) ELSE p.unit_price END)*100) AS INTEGER) AS current,CASE WHEN p.deleted_at IS NULL THEN COALESCE(SUM(CASE WHEN b.expiry_date>=date('now','localtime') THEN b.quantity_in_stock ELSE 0 END),0) ELSE 0 END AS available FROM commercial_document_items l JOIN products p ON p.id=l.product_id LEFT JOIN product_batches b ON b.product_id=p.id WHERE l.document_id=? GROUP BY l.id",
        [id],
      );
      const shortages = availability.filter((l) => !l.active);
      if (shortages.length)
        throw new Error(
          pick(
            'Cannot fulfil this document. Unavailable products: ',
            'آرڈر مکمل نہیں ہو سکتا۔ کم اسٹاک: ',
          ) +
            shortages.map((l) => `${l.name}: ${l.available}/${l.quantity}`).join('; ') +
            pick(
              '. Receive stock or edit the document, then try again.',
              '۔ اسٹاک وصول کریں یا آرڈر درست کر کے دوبارہ کوشش کریں۔',
            ),
        );
      sourcePriceChanges.value = availability.filter((l) => l.quoted !== l.current).length;

      const prepared: Array<{
        product: Product;
        batch: ProductBatch;
        quantity: number;
        loose: boolean;
        breakStrip: boolean;
      }> = [];
      let customer: CustomerOption | null = null;
      if (doc.customer_id) {
        const rows = await executeQuery<CustomerOption>(
          'SELECT id,customer_code,first_name,last_name,phone_number,current_balance,credit_limit,customer_type FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1',
          [doc.customer_id],
        );
        customer = rows[0] || null;
        if (!customer) throw new Error('This customer is unavailable');
      }
      for (const line of sourceLines) {
        const [product] = await executeQuery<Product>(
          'SELECT * FROM products WHERE id=? AND deleted_at IS NULL AND is_active=1',
          [line.product_id],
        );
        if (!product) throw new Error('A product on this document is unavailable');
        const batches = await executeQuery<ProductBatch>(
          "SELECT * FROM product_batches WHERE product_id=? AND (expiry_date>=date('now','localtime') OR id='unallocated-stock:'||product_id) ORDER BY expiry_date,id",
          [product.id],
        );
        if (disposed) return;
        let remaining = line.quantity;
        for (const batch of batches.filter(
          (batch) => batch.quantity_in_stock > 0 && !isUnallocatedStockBatch(batch),
        )) {
          if (!remaining) break;
          const loose = !!product.sell_by_loose_unit;
          const units = loose
            ? Math.min(remaining, batch.quantity_in_stock)
            : Math.min(
                remaining,
                Math.floor(
                  (batch.quantity_in_stock - batch.loose_open_remaining) / product.pack_size,
                ) * product.pack_size,
              );
          if (!units || (!loose && units % product.pack_size !== 0))
            throw new Error(
              `${product.name}: the earliest batch cannot supply whole packs. Review stock or update the document quantity.`,
            );
          const breakStrip = loose && units > batch.loose_open_remaining && product.pack_size > 1;
          if (
            breakStrip &&
            !confirm(
              `${product.name}: fulfil ${units} loose units from batch ${batch.batch_number}? This may open a strip at checkout.`,
            )
          )
            return;
          prepared.push({
            product,
            batch,
            quantity: loose ? units : units / product.pack_size,
            loose,
            breakStrip,
          });
          remaining -= units;
        }
        if (remaining) {
          const loose = !!product.sell_by_loose_unit;
          if (!loose && remaining % product.pack_size !== 0)
            throw new Error(`${product.name}: quantity must be a whole number of packs`);
          prepared.push({
            product,
            batch:
              batches.filter((batch) => !isUnallocatedStockBatch(batch)).at(-1) ||
              batches[0] ||
              unallocatedStockBatch(product),
            quantity: loose ? remaining : remaining / product.pack_size,
            loose,
            breakStrip: false,
          });
        }
      }
      if (disposed) return;
      cartStore.clearCart();
      for (const item of prepared)
        cartStore.addItem(item.product, item.batch, item.quantity, item.loose, item.breakStrip);
      chooseCustomer(customer);
      setRemarks(`${doc.number} · ${doc.customer_name} · ${doc.notes}`.slice(0, 500));
      sourceDocumentId.value = id;
      sourceDocumentNumber.value = doc.number;
      toast.success(
        pick(
          'Document loaded. Review current prices, tax and payment before checkout.',
          'دستاویز لوڈ ہو گئی۔ موجودہ قیمت، ٹیکس اور ادائیگی دیکھ کر فروخت مکمل کریں۔',
        ),
      );
    } catch (error) {
      if (disposed) return;
      sourceDocumentError.value = String(error).replace(/^Error: /, '');
      toast.error(sourceDocumentError.value);
    } finally {
      sourceDocumentLoading.value = false;
    }
  }

  return {
    sourceDocumentId,
    sourceDocumentNumber,
    sourceDocumentKind,
    sourceDocumentLoading,
    sourceDocumentError,
    sourcePriceChanges,
    loadSourceDocument,
  };
}
