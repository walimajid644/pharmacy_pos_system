import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, onUnmounted } from 'vue';
import { executeQuery } from '@/lib/database';
import { useToast } from '@/composables/useToast';
import type { Product, ProductBatch } from '@/lib/types';
import type { PosProduct } from '@/lib/pos';
import { isExpired } from '@/lib/utils';
import { isUnallocatedStockBatch } from '@/lib/pos';
import Input from '@/components/ui/Input.vue';

export function usePosProductSearch(onSelect: (product: PosProduct, loose: boolean) => void) {
  const toast = useToast();
  const searchQuery = ref('');
  const searchMatchingWords = ref(false);
  const searchGeneric = ref(false);
  const productSearchOpen = ref(false);

  const searchResults = ref<PosProduct[]>([]);

  const searchLoading = ref(false);

  const searchError = ref(false);

  const highlightedProductIndex = ref(0);

  const searchInput = ref<InstanceType<typeof Input> | null>(null);

  let productSearchTimer: ReturnType<typeof setTimeout> | null = null;

  let productQueryId = 0;

  let productLookup: {
    key: string;
    promise: Promise<PosProduct[]>;
  } | null = null;

  // Optimized search input handler:
  // - Barcode patterns (alphanumeric 6+ chars) search immediately for fast scanning
  // - Partial text searches debounce by 150ms to avoid query spam while typing
  // - Exact barcode matches get auto-highlighted in results
  function onProductSearchInput() {
    productQueryId++;
    if (productSearchTimer) clearTimeout(productSearchTimer);
    searchResults.value = [];
    searchLoading.value = false;
    searchError.value = false;
    highlightedProductIndex.value = 0;
    const term = searchQuery.value.trim();
    if (productSearchOpen.value) {
      searchLoading.value = true;
      // Check if this looks like an exact barcode (no wildcards needed)
      // For exact matches, search immediately without debounce
      const isLikelyBarcode = /^[A-Z0-9\-_]+$/i.test(term) && term.length >= 6;
      if (!term || isLikelyBarcode) {
        void searchProducts();
      } else {
        productSearchTimer = setTimeout(() => void searchProducts(), 150);
      }
    }
  }

  async function searchProducts(selectFromSearch = false, loose = false) {
    const term = searchQuery.value.trim();
    const queryId = ++productQueryId;
    searchLoading.value = true;
    searchError.value = false;
    // Barcode input and its following Enter share one bounded IPC lookup.
    const key = JSON.stringify([term, searchMatchingWords.value, searchGeneric.value]);
    const lookup =
      productLookup?.key === key ? productLookup : { key, promise: queryProducts(term) };
    productLookup = lookup;
    try {
      const productsWithBatches = await lookup.promise;
      if (queryId !== productQueryId) return;

      // Check for exact barcode match
      const exactMatch = term ? productsWithBatches.find((p) => p.barcode === term) : undefined;

      searchResults.value = productsWithBatches;
      // If exact barcode match exists, highlight it immediately
      highlightedProductIndex.value = exactMatch ? productsWithBatches.indexOf(exactMatch) : 0;

      if (selectFromSearch) {
        // Prioritize exact barcode match, then first result
        const product = exactMatch || productsWithBatches[0];
        if (product) onSelect(product, loose);
      }
    } catch {
      if (queryId === productQueryId) {
        searchError.value = true;
        searchResults.value = [];
        reportDiagnostic('operation_failed', 'pos');
        toast.error('Could not search products');
      }
    } finally {
      if (productLookup === lookup) productLookup = null;
      if (queryId === productQueryId) searchLoading.value = false;
    }
  }

  async function queryProducts(term: string) {
    // Treat scanned/user-entered characters literally, including LIKE wildcards.
    const pattern = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
    const words = searchMatchingWords.value ? term.split(/\s+/).filter(Boolean) : [term];
    const column = searchGeneric.value ? 'generic_name' : 'name';
    const textConditions = words.map(() => `${column} LIKE ? ESCAPE '\\'`).join(' AND ') || '1 = 1';
    const products = await executeQuery<Product & { manufacturer_name: string | null }>(
      `SELECT *, (SELECT m.name FROM manufacturers m WHERE m.id = products.manufacturer_id AND m.deleted_at IS NULL) AS manufacturer_name FROM products
         WHERE (? = '' OR (${textConditions}) OR sku LIKE ? ESCAPE '\\' OR barcode = ?)
         AND is_active = 1 AND deleted_at IS NULL
         ORDER BY CASE WHEN ? <> '' AND barcode = ? THEN 0 ELSE 1 END,
           TRIM(name) COLLATE NOCASE, sku COLLATE NOCASE, id LIMIT 50`,
      [term, ...words.map(pattern), pattern(term), term, term, term],
    );
    // One batch query for the bounded result set, rather than one IPC call per product.
    const batches = products.length
      ? await executeQuery<ProductBatch>(
          `SELECT * FROM product_batches WHERE product_id IN (${products.map(() => '?').join(',')}) ORDER BY expiry_date,id`,
          products.map((p) => p.id),
        )
      : [];
    return products.map((product) => {
      const recordedBatches = batches.filter((batch) => batch.product_id === product.id);
      return {
        ...product,
        recordedStock: recordedBatches.reduce(
          (sum, batch) => sum + Number(batch.quantity_in_stock),
          0,
        ),
        // Show saved balances separately; expired batches stay unavailable for allocation.
        batches: recordedBatches.filter(
          (batch) => isUnallocatedStockBatch(batch) || !isExpired(batch.expiry_date),
        ),
      };
    });
  }

  // Keyboard selection inside the product-search dialog:
  // Enter key: Fast-path selects the highlighted item for entry without additional search
  // Shift+Enter: Same but for loose units
  // Arrow keys: Navigate results; the dialog follows the selected page.
  function handleBarcodeInput(event: KeyboardEvent) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.key === 'ArrowDown' && searchResults.value.length) {
      event.preventDefault();
      highlightedProductIndex.value =
        (highlightedProductIndex.value + 1) % searchResults.value.length;
    } else if (event.key === 'ArrowUp' && searchResults.value.length) {
      event.preventDefault();
      highlightedProductIndex.value =
        (highlightedProductIndex.value - 1 + searchResults.value.length) %
        searchResults.value.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (productSearchTimer) clearTimeout(productSearchTimer);
      const highlighted = searchResults.value[highlightedProductIndex.value];

      // Fast path: if we have a highlighted result, add it immediately
      if (highlighted) {
        onSelect(highlighted, event.shiftKey);
      } else {
        // No results yet - trigger immediate search and add
        void searchProducts(true, event.shiftKey);
      }
    } else if (event.key === 'Escape') {
      if (productSearchTimer) clearTimeout(productSearchTimer);
      // A scanner can dispatch input and Escape before the child model re-renders.
      if (event.target instanceof HTMLInputElement) event.target.value = '';
      searchQuery.value = '';
      searchResults.value = [];
      searchLoading.value = false;
      searchError.value = false;
      productQueryId++;
    }
  }
  function openProductSearch(event?: KeyboardEvent) {
    if (
      event &&
      (event.key !== 'Enter' ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey)
    )
      return;
    event?.preventDefault();
    event?.stopPropagation();
    if (productSearchOpen.value) return;
    productSearchOpen.value = true;
    void searchProducts();
  }
  function resetProductSearch() {
    if (productSearchTimer) clearTimeout(productSearchTimer);
    productSearchTimer = null;
    productSearchOpen.value = false;
    productLookup = null;
    searchQuery.value = '';
    searchResults.value = [];
    searchLoading.value = false;
    searchError.value = false;
    productQueryId++;
  }
  onUnmounted(() => {
    if (productSearchTimer) clearTimeout(productSearchTimer);
    productQueryId++;
  });

  return {
    searchQuery,
    searchMatchingWords,
    searchGeneric,
    productSearchOpen,
    openProductSearch,
    resetProductSearch,
    searchResults,
    searchLoading,
    searchError,
    highlightedProductIndex,
    searchInput,
    onProductSearchInput,
    handleBarcodeInput,
  };
}
