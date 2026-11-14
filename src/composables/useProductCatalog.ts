import { reportDiagnostic } from '@/lib/diagnostics';
import { errorMessage } from '@/lib/errors';
import { ref, computed, onMounted } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { generateUUID } from '@/lib/utils';
import { createProductForm } from '@/lib/productForm';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import type { Product, Category, Manufacturer } from '@/lib/types';

export function useProductCatalog() {
  const toast = useToast();
  const { pick } = useI18n();
  const products = ref<Product[]>([]);
  const categories = ref<Category[]>([]);
  const manufacturers = ref<Manufacturer[]>([]);
  const searchQuery = ref('');
  const loading = ref(false);
  const showModal = ref(false);
  const editingProduct = ref<Product | null>(null);
  const showBatchManager = ref(false);
  const selectedProduct = ref<Product | null>(null);
  const productStocks = ref<Map<string, number>>(new Map());
  const formData = ref(createProductForm());

  const filteredProducts = computed(() => {
    if (!searchQuery.value) return products.value;

    const query = searchQuery.value.toLowerCase();
    return products.value.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)),
    );
  });

  onMounted(async () => {
    await Promise.all([loadProducts(), loadCategories(), loadManufacturers()]);
  });

  async function loadProducts() {
    loading.value = true;
    try {
      const rows = await executeQuery<Product & { current_stock: number }>(
        `SELECT p.*, COALESCE(SUM(pb.quantity_in_stock), 0) AS current_stock
         FROM products p LEFT JOIN product_batches pb ON pb.product_id = p.id
         WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY p.name`,
      );
      products.value = rows;
      productStocks.value = new Map(
        rows.map((product) => [product.id, Number(product.current_stock)]),
      );
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
      toast.error('Failed to load products');
    } finally {
      loading.value = false;
    }
  }

  async function loadCategories() {
    try {
      categories.value = await executeQuery<Category>(
        'SELECT * FROM categories WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
    }
  }

  async function loadManufacturers() {
    try {
      manufacturers.value = await executeQuery<Manufacturer>(
        'SELECT * FROM manufacturers WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
    }
  }

  function openAddModal() {
    editingProduct.value = null;
    formData.value = createProductForm();
    showModal.value = true;
  }

  function openEditModal(product: Product) {
    editingProduct.value = product;
    formData.value = {
      sku: product.sku,
      name: product.name,
      generic_name: product.generic_name || '',
      barcode: product.barcode || '',
      category_id: product.category_id || '',
      manufacturer_id: product.manufacturer_id || '',
      unit_price: product.unit_price,
      wholesale_price: product.wholesale_price ?? '',
      cost_price: product.cost_price,
      pack_size: product.pack_size,
      sell_by_loose_unit: product.sell_by_loose_unit,
      drap_registration_number: product.drap_registration_number || '',
      controlled_substance: product.controlled_substance,
      reorder_level: product.reorder_level,
      is_active: product.is_active,
    };
    showModal.value = true;
  }

  async function saveProduct() {
    if (!formData.value.name.trim() || !formData.value.sku.trim()) {
      toast.warning('Name and SKU are required');
      return;
    }
    if (
      !Number.isFinite(Number(formData.value.unit_price)) ||
      Number(formData.value.unit_price) < 0 ||
      !Number.isFinite(Number(formData.value.cost_price)) ||
      Number(formData.value.cost_price) < 0 ||
      !Number.isInteger(Number(formData.value.pack_size)) ||
      Number(formData.value.pack_size) < 1 ||
      !Number.isInteger(Number(formData.value.reorder_level)) ||
      Number(formData.value.reorder_level) < 0
    ) {
      toast.warning(
        pick(
          'Enter valid prices, pack size, and reorder level',
          'درست قیمتیں، پیک سائز اور دوبارہ آرڈر کی حد درج کریں',
        ),
      );
      return;
    }

    const wholesale =
      formData.value.wholesale_price === '' ? null : Number(formData.value.wholesale_price);
    if (
      wholesale !== null &&
      (!Number.isFinite(wholesale) ||
        wholesale < 0 ||
        wholesale > 100000000 ||
        Math.abs(wholesale * 100 - Math.round(wholesale * 100)) > 0.00001)
    ) {
      toast.warning(
        pick(
          'Use a valid wholesale price with at most two decimals, or leave blank for retail.',
          'درست ہول سیل قیمت دو اعشاری ہندسوں تک درج کریں، یا ریٹیل کے لیے خالی رکھیں۔',
        ),
      );
      return;
    }
    loading.value = true;
    try {
      const now = new Date().toISOString();

      if (editingProduct.value) {
        // Update existing product
        await executeUpdate(
          `UPDATE products SET 
            sku = ?, name = ?, generic_name = ?, barcode = ?,
            category_id = ?, manufacturer_id = ?,
            unit_price = ?, wholesale_price = ?, cost_price = ?, pack_size = ?,
            sell_by_loose_unit = ?, drap_registration_number = ?,
            controlled_substance = ?, reorder_level = ?,
            is_active = ?, updated_at = ?
           WHERE id = ?`,
          [
            formData.value.sku,
            formData.value.name,
            formData.value.generic_name || null,
            formData.value.barcode || null,
            formData.value.category_id || null,
            formData.value.manufacturer_id || null,
            formData.value.unit_price,
            wholesale,
            formData.value.cost_price,
            formData.value.pack_size,
            formData.value.sell_by_loose_unit ? 1 : 0,
            formData.value.drap_registration_number || null,
            formData.value.controlled_substance ? 1 : 0,
            formData.value.reorder_level,
            formData.value.is_active ? 1 : 0,
            now,
            editingProduct.value.id,
          ],
        );
        toast.success('Product updated successfully');
      } else {
        // Create new product
        const id = generateUUID();
        await executeUpdate(
          `INSERT INTO products (
            id, sku, name, generic_name, barcode,
            category_id, manufacturer_id,
            unit_price, wholesale_price, cost_price, pack_size,
            sell_by_loose_unit, drap_registration_number,
            controlled_substance, reorder_level,
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            formData.value.sku,
            formData.value.name,
            formData.value.generic_name || null,
            formData.value.barcode || null,
            formData.value.category_id || null,
            formData.value.manufacturer_id || null,
            formData.value.unit_price,
            wholesale,
            formData.value.cost_price,
            formData.value.pack_size,
            formData.value.sell_by_loose_unit ? 1 : 0,
            formData.value.drap_registration_number || null,
            formData.value.controlled_substance ? 1 : 0,
            formData.value.reorder_level,
            formData.value.is_active ? 1 : 0,
            now,
            now,
          ],
        );
        toast.success('Product created successfully');
      }

      showModal.value = false;
      await loadProducts();
    } catch (error: unknown) {
      reportDiagnostic('operation_failed', 'catalog');
      toast.error('Failed to save product: ' + errorMessage(error));
    } finally {
      loading.value = false;
    }
  }

  async function deleteProduct(product: Product) {
    if (
      !confirm(
        pick(
          `Delete ${product.name} from active products?`,
          `کیا ${product.name} کو فعال مصنوعات سے حذف کریں؟`,
        ),
      )
    )
      return;
    loading.value = true;
    try {
      await executeUpdate('UPDATE products SET deleted_at = ? WHERE id = ?', [
        new Date().toISOString(),
        product.id,
      ]);
      toast.success('Product deleted successfully');
      await loadProducts();
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
      toast.error('Failed to delete product');
    } finally {
      loading.value = false;
    }
  }
  function openBatchManager(product: Product) {
    selectedProduct.value = product;
    showBatchManager.value = true;
  }

  function closeBatchManager() {
    showBatchManager.value = false;
    selectedProduct.value = null;
    // Reload products to update stock levels
    loadProducts();
  }
  function getStockLevel(productId: string): number {
    return productStocks.value.get(productId) || 0;
  }
  function isLowStock(product: Product): boolean {
    const stock = getStockLevel(product.id);
    return stock <= product.reorder_level;
  }

  return {
    products,
    categories,
    manufacturers,
    searchQuery,
    loading,
    showModal,
    editingProduct,
    formData,
    showBatchManager,
    selectedProduct,
    productStocks,
    filteredProducts,
    openAddModal,
    openEditModal,
    saveProduct,
    deleteProduct,
    openBatchManager,
    closeBatchManager,
    isLowStock,
  };
}
