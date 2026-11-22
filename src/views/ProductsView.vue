<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Product } from '@/lib/types';
import { encodeCode39 } from '@/lib/code39';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/composables/useToast';
import { useProductCatalog } from '@/composables/useProductCatalog';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import BatchManager from '@/components/BatchManager.vue';
import ProductTable from '@/components/products/ProductTable.vue';
import ProductFormDialog from '@/components/products/ProductFormDialog.vue';
import BarcodeLabelDialog from '@/components/products/BarcodeLabelDialog.vue';

const router = useRouter();
const toast = useToast();
const { pick, formatNumber } = useI18n();
const {
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
} = useProductCatalog();
const labelProduct = ref<Product | null>(null);
function openLabel(product: Product) {
  if (!product.barcode) {
    toast.warning('Add a barcode to this product before printing labels');
    return;
  }
  if (!encodeCode39(product.barcode)) {
    toast.warning(
      'This barcode cannot fit a 75 mm Code 39 label. Use up to 15 uppercase letters, digits, or Code 39 symbols.',
    );
    return;
  }
  labelProduct.value = product;
}
</script>

<template>
  <div class="inventory-terminal compact-workspace">
    <Card class="inventory-panel">
      <!-- Header -->
      <div class="inventory-header">
        <div>
          <h1 class="heading-2 mb-1">{{ pick('Products & Inventory', 'مصنوعات اور اسٹاک') }}</h1>
          <p class="body-sm text-text-secondary">
            {{ pick('Product catalogue · stock & batches', 'مصنوعات کی فہرست · اسٹاک اور بیچ') }}
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="md" @click="router.push('/catalog-import')">
            {{ pick('Import', 'درآمد') }}
          </Button>
          <Button variant="outline" size="md" @click="router.push('/catalog-bulk')">
            {{ pick('Bulk setup', 'اجتماعی ترتیب') }}
          </Button>
          <Button permission="catalog.write" variant="primary" size="md" @click="openAddModal">
            <span class="text-lg leading-none">+</span>
            {{ pick('Add Product', 'مصنوعات شامل کریں') }}
          </Button>
        </div>
      </div>

      <nav
        class="product-register-links"
        :aria-label="pick('Product registers', 'مصنوعات کے رجسٹر')"
      >
        <Button size="sm" variant="outline" @click="router.push('/categories')">{{
          pick('Categories', 'زمرے')
        }}</Button>
        <Button size="sm" variant="outline" @click="router.push('/manufacturers')">{{
          pick('Companies', 'کمپنیاں')
        }}</Button>
        <Button size="sm" variant="outline" @click="router.push('/shelf-locations')">{{
          pick('Shelves / Locations', 'شیلف / مقامات')
        }}</Button>
      </nav>
      <!-- Search -->
      <div class="inventory-search">
        <Input
          id="products-search"
          v-model="searchQuery"
          size="lg"
          :label="pick('Item / barcode', 'آئٹم / بارکوڈ')"
          :title="pick('Products search (F4)', 'مصنوعات کی تلاش (F4)')"
          aria-keyshortcuts="F4"
          type="search"
          :placeholder="
            pick('Search by name, SKU, or barcode...', 'نام، کوڈ یا بار کوڈ سے تلاش کریں...')
          "
          prefix-text="🔍"
        />
        <kbd class="text-xs px-2 py-1 rounded border">F4</kbd>
      </div>

      <!-- Table -->
      <ProductTable
        :products="filteredProducts"
        :total-products="products.length"
        :loading="loading"
        :search-query="searchQuery"
        :categories="categories"
        :manufacturers="manufacturers"
        :stocks="productStocks"
        @batches="openBatchManager"
        @edit="openEditModal"
        @label="openLabel"
        @delete="deleteProduct"
      />
      <footer class="inventory-summary">
        <div>
          <small class="body-xs text-text-secondary">{{
            pick('Products shown', 'دکھائی گئی مصنوعات')
          }}</small>
          <strong class="number-display-sm text-brand-600"
            >{{ formatNumber(filteredProducts.length) }} /
            {{ formatNumber(products.length) }}</strong
          >
        </div>
        <div>
          <small class="body-xs text-text-secondary">{{ pick('Low stock', 'کم اسٹاک') }}</small>
          <strong class="number-display-sm text-danger-600">{{
            formatNumber(products.filter(isLowStock).length)
          }}</strong>
        </div>
        <div>
          <small class="body-xs text-text-secondary">{{
            pick('Active products', 'فعال مصنوعات')
          }}</small>
          <strong class="number-display-sm text-brand-600">{{
            formatNumber(products.filter((product) => product.is_active).length)
          }}</strong>
        </div>
      </footer>
    </Card>

    <!-- Modal -->
    <ProductFormDialog
      v-if="showModal"
      v-model="formData"
      :editing-product="!!editingProduct"
      :loading="loading"
      :categories="categories"
      :manufacturers="manufacturers"
      :shelf-locations="shelfLocations"
      @close="showModal = false"
      @save="saveProduct"
    />
    <!-- Batch Manager Modal -->
    <BatchManager
      v-if="selectedProduct"
      :product="selectedProduct"
      :is-open="showBatchManager"
      @close="closeBatchManager"
    />
    <BarcodeLabelDialog
      v-if="labelProduct"
      :key="labelProduct.id"
      :product="labelProduct"
      @close="labelProduct = null"
    />
  </div>
</template>

<style scoped>
.product-register-links {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
}
</style>
