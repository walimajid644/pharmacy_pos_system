import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, nextTick, onUnmounted } from 'vue';
import { executeQuery } from '@/lib/database';
import { useToast } from '@/composables/useToast';
import type { Product, ProductBatch } from '@/lib/types';
import type { PosProduct } from '@/lib/pos';
import Input from '@/components/ui/Input.vue';

export function usePosProductSearch(onAdd: (product: PosProduct, loose: boolean) => void) {
  const toast = useToast();
  const searchQuery = ref('');

  const searchResults = ref<Array<Product & { batches: ProductBatch[] }>>([]);

  const searchLoading = ref(false);

  const searchError = ref(false);

  const highlightedProductIndex = ref(0);

  const searchInput = ref<InstanceType<typeof Input> | null>(null);

  let productSearchTimer: ReturnType<typeof setTimeout> | null = null;

  let productQueryId = 0;

  let productLookup: {
    term: string;
    promise: Promise<Array<Product & { batches: ProductBatch[] }>>;
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
    if (term.length >= 2) {
      searchLoading.value = true;
      // Check if this looks like an exact barcode (no wildcards needed)
      // For exact matches, search immediately without debounce
      const isLikelyBarcode = /^[A-Z0-9\-_]+$/i.test(term) && term.length >= 6;
      if (isLikelyBarcode) {
        void searchProducts();
      } else {
        productSearchTimer = setTimeout(() => void searchProducts(), 150);
      }
    }
  }

  async function searchProducts(addFromSearch = false, loose = false) {
    const term = searchQuery.value.trim();
    const queryId = ++productQueryId;
    if (term.length < (addFromSearch ? 1 : 2)) {
      searchResults.value = [];
      return;
    }

    searchLoading.value = true;
    searchError.value = false;
    // Barcode input and its following Enter share one bounded IPC lookup.
    const lookup =
      productLookup?.term === term ? productLookup : { term, promise: queryProducts(term) };
    productLookup = lookup;
    try {
      const productsWithBatches = await lookup.promise;
      if (queryId !== productQueryId) return;

      // Check for exact barcode match
      const exactMatch = productsWithBatches.find((p) => p.barcode === term);

      searchResults.value = productsWithBatches;
      // If exact barcode match exists, highlight it immediately
      highlightedProductIndex.value = exactMatch ? productsWithBatches.indexOf(exactMatch) : 0;

      if (addFromSearch) {
        // Prioritize exact barcode match, then first result
        const product = exactMatch || productsWithBatches[0];
        if (product) onAdd(product, loose);
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
    const query = `%${term}%`;
    const products = await executeQuery<Product>(
      `SELECT * FROM products
         WHERE (name LIKE ? OR generic_name LIKE ? OR sku LIKE ? OR barcode = ?)
         AND is_active = 1 AND deleted_at IS NULL
         ORDER BY CASE WHEN barcode = ? THEN 0 ELSE 1 END, name LIMIT 20`,
      [query, query, query, term, term],
    );
    // One batch query for the bounded result set, rather than one IPC call per product.
    const batches = products.length
      ? await executeQuery<ProductBatch>(
          `SELECT * FROM product_batches WHERE product_id IN (${products.map(() => '?').join(',')}) AND quantity_in_stock>0 AND expiry_date>=date('now','localtime') ORDER BY expiry_date,id`,
          products.map((p) => p.id),
        )
      : [];
    return products.map((product) => ({
      ...product,
      batches: batches.filter((b) => b.product_id === product.id),
    }));
  }

  // Product search keyboard handler - optimized for speed:
  // Enter key: Fast-path adds highlighted item immediately without additional search
  // Shift+Enter: Same but for loose units
  // Arrow keys: Navigate results with smooth scrolling
  function handleBarcodeInput(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' && searchResults.value.length) {
      event.preventDefault();
      highlightedProductIndex.value =
        (highlightedProductIndex.value + 1) % searchResults.value.length;
      void nextTick(() =>
        document
          .querySelector('.pos-product-row.highlighted')
          ?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'ArrowUp' && searchResults.value.length) {
      event.preventDefault();
      highlightedProductIndex.value =
        (highlightedProductIndex.value - 1 + searchResults.value.length) %
        searchResults.value.length;
      void nextTick(() =>
        document
          .querySelector('.pos-product-row.highlighted')
          ?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (productSearchTimer) clearTimeout(productSearchTimer);
      const highlighted = searchResults.value[highlightedProductIndex.value];

      // Fast path: if we have a highlighted result, add it immediately
      if (highlighted) {
        onAdd(highlighted, event.shiftKey);
      } else {
        // No results yet - trigger immediate search and add
        const term = searchQuery.value.trim();
        // For likely barcodes, do a quick exact-match check
        if (term.length >= 2) {
          void searchProducts(true, event.shiftKey);
        }
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
  function resetProductSearch() {
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
    searchResults,
    searchLoading,
    searchError,
    highlightedProductIndex,
    searchInput,
    onProductSearchInput,
    handleBarcodeInput,
    resetProductSearch,
  };
}
