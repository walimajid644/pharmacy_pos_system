import { reportDiagnostic } from '@/lib/diagnostics';
import { diagnosticReason } from '@/lib/diagnosticContext';
import { ref, computed, onMounted } from 'vue';
import { executeQuery, executeUpdate } from '@/lib/database';
import { generateUUID } from '@/lib/utils';
import { createProductForm, validateProductDetails, productDetailValues } from '@/lib/productForm';
import { useToast } from '@/composables/useToast';
import { useI18n } from '@/lib/i18n';
import type { Product, Category, Manufacturer } from '@/lib/types';

export function useProductCatalog() {
  const toast = useToast();
  const { pick } = useI18n();
  const products = ref<Product[]>([]);
  const categories = ref<Category[]>([]);
  const manufacturers = ref<Manufacturer[]>([]);
  const shelfLocations = ref<Category[]>([]);
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
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadManufacturers(),
      loadShelfLocations(),
    ]);
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
    } catch (error) {
      const supportId = reportDiagnostic('operation_failed', 'catalog', {
        operation: 'product_load',
        reason: diagnosticReason(error),
      });
      toast.error(`Failed to load products. Support code: ${supportId}`);
    } finally {
      loading.value = false;
    }
  }

  async function loadCategories() {
    try {
      categories.value = await executeQuery<Category>(
        'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
    }
  }

  async function loadManufacturers() {
    try {
      manufacturers.value = await executeQuery<Manufacturer>(
        'SELECT * FROM manufacturers WHERE deleted_at IS NULL ORDER BY name',
      );
    } catch {
      reportDiagnostic('operation_failed', 'catalog');
    }
  }

  async function loadShelfLocations() {
    try {
      shelfLocations.value = await executeQuery<Category>(
        'SELECT * FROM shelf_locations WHERE deleted_at IS NULL ORDER BY name',
      );
    } catch (error) {
      const code = reportDiagnostic('operation_failed', 'catalog', {
        operation: 'register_load',
        reason: diagnosticReason(error),
      });
      toast.error(
        `${pick('Could not load shelf locations. Restart the updated app or reopen Products.', 'شیلف کے مقامات لوڈ نہیں ہو سکے۔ اپ ڈیٹ شدہ ایپ یا مصنوعات دوبارہ کھولیں۔')} ${pick('Support code', 'سپورٹ کوڈ')}: ${code}`,
      );
    }
  }

  function openAddModal() {
    editingProduct.value = null;
    formData.value = createProductForm();
    showModal.value = true;
  }

  function openEditModal(product: Product) {
    editingProduct.value = product;
    const currentStock = productStocks.value.get(product.id) || 0;
    const stockInPacks = Math.floor(currentStock / product.pack_size);
    const stockInLoose = currentStock % product.pack_size;

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
      sell_by_loose_unit: Boolean(product.sell_by_loose_unit),
      drap_registration_number: product.drap_registration_number || '',
      controlled_substance: Boolean(product.controlled_substance),
      reorder_level: product.reorder_level,
      is_active: Boolean(product.is_active),

      shelf_location: product.shelf_location ?? '',
      remarks: product.remarks ?? '',
      uom: product.uom ?? 'box',
      pack_type: product.pack_type ?? '',
      ext_disc_percent: product.ext_disc_percent ?? 0,
      stm_level: product.stm_level ?? 0,
      maintain_batch: Boolean(product.maintain_batch),
      fridge_item: Boolean(product.fridge_item),
      registration_date: product.registration_date ?? '',

      // Read-only stock display
      stock_in_loose: stockInLoose,
      stock_in_packs: stockInPacks,
    };
    showModal.value = true;
  }

  async function saveProduct() {
    if (loading.value) return;
    const detailError = validateProductDetails(formData.value);
    if (detailError) {
      toast.warning(detailError);
      return;
    }
    const shelfName = formData.value.shelf_location.trim();
    const shelf = shelfLocations.value.find(
      (item) => item.name.toLowerCase() === shelfName.toLowerCase(),
    );
    const unchangedShelf =
      editingProduct.value?.shelf_location?.trim().toLowerCase() === shelfName.toLowerCase();
    if (shelfName && (!shelf || !shelf.is_active) && !unchangedShelf) {
      toast.warning(
        pick(
          'Choose an active shelf/location from the register, or leave it blank.',
          'رجسٹر سے فعال شیلف یا مقام منتخب کریں، یا خالی چھوڑیں۔',
        ),
      );
      return;
    }
    if (shelf) formData.value.shelf_location = shelf.name;
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
            is_active = ?, updated_at = ?,
            shelf_location = ?, remarks = ?, uom = ?, pack_type = ?, ext_disc_percent = ?,
            stm_level = ?, maintain_batch = ?, fridge_item = ?, registration_date = ?
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
            ...productDetailValues(formData.value),
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
            is_active, created_at, updated_at,
            shelf_location, remarks, uom, pack_type, ext_disc_percent,
            stm_level, maintain_batch, fridge_item, registration_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            ...productDetailValues(formData.value),
          ],
        );
        toast.success('Product created successfully');
      }

      showModal.value = false;
      await loadProducts();
    } catch (error: unknown) {
      const supportId = reportDiagnostic('operation_failed', 'catalog', {
        operation: 'product_save',
        reason: diagnosticReason(error),
      });
      const message =
        diagnosticReason(error) === 'schema_mismatch'
          ? pick(
              'Product fields are unavailable. Restart the app to complete the database update.',
              'مصنوعات کے خانے دستیاب نہیں۔ ڈیٹابیس اپ ڈیٹ مکمل کرنے کے لیے ایپ دوبارہ چلائیں۔',
            )
          : pick(
              'Could not save the product. Check its code, barcode and selected category/company.',
              'مصنوعات محفوظ نہیں ہو سکی۔ کوڈ، بارکوڈ اور منتخب زمرے یا کمپنی کی جانچ کریں۔',
            );
      toast.error(`${message} ${pick('Support code', 'سپورٹ کوڈ')}: ${supportId}`, 8000);
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
    shelfLocations,
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
