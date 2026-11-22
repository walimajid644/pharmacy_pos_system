<script setup lang="ts">
import type { Product, Category, Manufacturer } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import CompactPages from '@/components/ui/CompactPages.vue';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{
  products: Product[];
  totalProducts: number;
  loading: boolean;
  searchQuery: string;
  categories: Category[];
  manufacturers: Manufacturer[];
  stocks: Map<string, number>;
}>();
const emit = defineEmits<{
  batches: [product: Product];
  edit: [product: Product];
  label: [product: Product];
  delete: [product: Product];
}>();
const { pick, formatNumber } = useI18n();
function getCategoryName(id: string | null) {
  return props.categories.find((category) => category.id === id)?.name || '-';
}
function getManufacturerName(id: string | null) {
  return props.manufacturers.find((manufacturer) => manufacturer.id === id)?.name || '-';
}
function getStockLevel(id: string) {
  return props.stocks.get(id) || 0;
}
function isLowStock(product: Product) {
  return getStockLevel(product.id) <= product.reorder_level;
}
</script>

<template>
  <div class="inventory-table-scroll">
    <div
      v-if="loading && totalProducts === 0"
      class="text-center py-12 text-muted-foreground"
      role="status"
    >
      {{ pick('Loading products...', 'مصنوعات لوڈ ہو رہی ہیں...') }}
    </div>

    <div
      v-else-if="products.length === 0"
      class="text-center py-12 text-muted-foreground"
      role="status"
    >
      {{
        searchQuery
          ? pick('No products found', 'کوئی مصنوعات نہیں ملیں')
          : pick(
              'No products yet. Add your first product!',
              'ابھی کوئی مصنوعات نہیں۔ پہلی مصنوعات شامل کریں!',
            )
      }}
    </div>

    <CompactPages v-else :items="products" :row-height="64" :header-height="36" v-slot="{ rows }">
      <table class="inventory-table">
        <thead>
          <tr class="border-b bg-muted text-muted-foreground">
            <th class="label text-left p-3">SKU</th>
            <th class="label text-left p-3">{{ pick('Name', 'نام') }}</th>
            <th class="label text-left p-3">{{ pick('Category', 'زمرہ') }}</th>
            <th class="label text-left p-3">{{ pick('Manufacturer', 'بنانے والا') }}</th>
            <th class="label text-right p-3">{{ pick('Price', 'قیمت') }}</th>
            <th class="label text-right p-3">{{ pick('Stock', 'اسٹاک') }}</th>
            <th class="label text-center p-3">{{ pick('Status', 'حیثیت') }}</th>
            <th class="label text-center p-3">
              {{ pick('Actions', 'اقدامات') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="{ item: product } in rows"
            :key="product.id"
            class="border-b hover:bg-accent/50 transition-colors"
          >
            <td class="p-3 mono body-sm">{{ product.sku }}</td>
            <td class="p-3">
              <div class="body font-medium">{{ product.name }}</div>
              <div v-if="product.generic_name" class="body-sm text-text-secondary">
                {{ product.generic_name }}
              </div>
            </td>
            <td class="p-3 body-sm">{{ getCategoryName(product.category_id) }}</td>
            <td class="p-3 body-sm">{{ getManufacturerName(product.manufacturer_id) }}</td>
            <td class="p-3 text-right">
              <div class="number-display-sm text-brand-600">
                {{ formatCurrency(product.unit_price) }}
              </div>
              <small class="body-xs text-text-secondary block">
                {{ pick('Wholesale', 'ہول سیل') }}:
                {{
                  product.wholesale_price == null
                    ? pick('Retail fallback', 'ریٹیل قیمت')
                    : formatCurrency(product.wholesale_price)
                }}
              </small>
            </td>
            <td class="p-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <span class="body-sm" :class="{ 'text-danger-600 font-bold': isLowStock(product) }">
                  {{ formatNumber(getStockLevel(product.id)) }}
                </span>
                <Badge v-if="isLowStock(product)" variant="danger" size="sm" :dot="true">
                  {{ pick('Low', 'کم') }}
                </Badge>
              </div>
            </td>
            <td class="p-3 text-center">
              <Badge :variant="product.is_active ? 'success' : 'neutral'" size="sm">
                {{ product.is_active ? pick('Active', 'فعال') : pick('Inactive', 'غیر فعال') }}
              </Badge>
            </td>
            <td class="p-3 text-center whitespace-nowrap">
              <div class="inline-flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  permission="stock.batches"
                  @click="emit('batches', product)"
                >
                  {{ pick('Batches', 'بیچ') }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  permission="catalog.write"
                  @click="emit('edit', product)"
                >
                  {{ pick('Edit', 'تدوین') }}
                </Button>
                <Button variant="ghost" size="sm" @click="emit('label', product)">
                  {{ pick('Label', 'لیبل') }}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  permission="catalog.write"
                  @click="emit('delete', product)"
                >
                  {{ pick('Delete', 'حذف') }}
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </CompactPages>
  </div>
</template>
