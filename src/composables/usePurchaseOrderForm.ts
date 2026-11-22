import { useWorkspaceLabels } from '@/lib/workspaceLabels';
import { useSettingsStore } from '@/stores/settings';
import { purchasePreferences } from '@/lib/purchasePreferences';
import { reportDiagnostic } from '@/lib/diagnostics';
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { executeQuery } from '@/lib/database';
import { invoke } from '@tauri-apps/api/core';
import { usePurchaseDraftStore } from '@/stores/purchaseDraft';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import type { Supplier, Product, PurchaseOrder, PurchaseOrderItem } from '@/lib/types';
import type { PurchaseOrderFormData, PurchaseOrderLine } from '@/lib/purchaseOrderForm';

export function usePurchaseOrderForm() {
  const uiLabel = useWorkspaceLabels();
  const settingsStore = useSettingsStore();
  const preferences = computed(() => purchasePreferences(settingsStore.settings));
  const router = useRouter();
  const route = useRoute();
  const authStore = useAuthStore();
  const draftStore = usePurchaseDraftStore();
  const fromSuggestions = ref(false);
  const { showToast } = useToast();

  const poId = route.params.id as string;
  const isEditing = computed(() => !!poId);

  const suppliers = ref<Supplier[]>([]);
  const products = ref<Product[]>([]);
  const loading = ref(true);
  const saving = ref(false);

  // PO Form Data
  const po = ref<PurchaseOrderFormData>({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    discount_amount: 0,
    shipping_cost: 0,
    notes: '',
  });

  const lineItems = ref<PurchaseOrderLine[]>([]);
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  const subtotal = computed(() => {
    return lineItems.value.reduce((sum, item) => {
      const base = roundMoney(item.quantity_ordered * item.unit_cost);
      return sum + roundMoney(base * (1 - item.discount_percent / 100));
    }, 0);
  });

  const taxAmount = computed(() => {
    return lineItems.value.reduce((sum, item) => {
      const base = roundMoney(item.quantity_ordered * item.unit_cost);
      const taxableAmount = roundMoney(base * (1 - item.discount_percent / 100));
      return sum + roundMoney(taxableAmount * (item.tax_rate / 100));
    }, 0);
  });

  const totalAmount = computed(() => {
    return roundMoney(
      subtotal.value +
        taxAmount.value -
        Number(po.value.discount_amount) +
        Number(po.value.shipping_cost),
    );
  });

  onMounted(async () => {
    await loadData();
  });

  async function loadData() {
    loading.value = true;
    try {
      await settingsStore.loadSettings();
      // Load suppliers
      suppliers.value = await executeQuery<Supplier>(
        'SELECT * FROM suppliers WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name',
      );

      // Load products
      products.value = await executeQuery<Product>(
        'SELECT * FROM products WHERE deleted_at IS NULL AND is_active = 1 ORDER BY name',
      );

      // If editing, load existing PO
      if (isEditing.value) {
        await loadExistingPO();
      } else {
        const pending = route.query.suggestions === '1' ? draftStore.take() : null;
        if (pending) {
          po.value.supplier_id = pending.supplierId;
          po.value.notes = pending.notes;
          lineItems.value = pending.items.flatMap((item) => {
            const product = products.value.find((p) => p.id === item.productId);
            return product
              ? [
                  {
                    product_id: product.id,
                    product_name: product.name,
                    quantity_ordered: item.quantity,
                    unit_cost: product.cost_price,
                    tax_rate: preferences.value.purchase_default_tax,
                    discount_percent: preferences.value.purchase_default_discount,
                    line_total: roundMoney(item.quantity * product.cost_price),
                  },
                ]
              : [];
          });
          lineItems.value.forEach(calculateLineTotal);
          fromSuggestions.value = true;
          if (lineItems.value.length !== pending.items.length)
            showToast(
              uiLabel('Some products are no longer active. Review the remaining draft lines.'),
              'warning',
            );
          if (!lineItems.value.length) addLineItem();
        } else {
          addLineItem();
        }
      }
    } catch {
      showToast(uiLabel('Error loading data'), 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      loading.value = false;
    }
  }

  async function loadExistingPO() {
    try {
      const [existingPO] = await executeQuery<PurchaseOrder>(
        'SELECT * FROM purchase_orders WHERE id = ?',
        [poId],
      );

      if (!existingPO) {
        showToast(uiLabel('Purchase order not found'), 'error');
        router.push('/purchase-orders');
        return;
      }

      po.value = {
        supplier_id: existingPO.supplier_id,
        order_date: existingPO.order_date.split('T')[0],
        expected_delivery_date: existingPO.expected_delivery_date?.split('T')[0] || '',
        discount_amount: existingPO.discount_amount,
        shipping_cost: existingPO.shipping_cost,
        notes: existingPO.notes || '',
      };

      // Load line items
      const items = await executeQuery<PurchaseOrderItem & { product_name: string }>(
        `SELECT poi.*, p.name as product_name
         FROM purchase_order_items poi
         JOIN products p ON poi.product_id = p.id
         WHERE poi.po_id = ?`,
        [poId],
      );

      lineItems.value = items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent,
        line_total: item.line_total,
      }));
    } catch {
      showToast(uiLabel('Error loading purchase order'), 'error');
      reportDiagnostic('operation_failed', 'workspace');
    }
  }

  function addLineItem() {
    lineItems.value.push({
      product_id: '',
      quantity_ordered: preferences.value.purchase_default_quantity,
      unit_cost: 0,
      tax_rate: preferences.value.purchase_default_tax,
      discount_percent: preferences.value.purchase_default_discount,
      line_total: 0,
    });
  }

  function removeLineItem(index: number) {
    if (lineItems.value.length === 1) {
      showToast(uiLabel('Cannot remove the last line item'), 'error');
      return;
    }
    lineItems.value.splice(index, 1);
  }

  function selectProduct(item: PurchaseOrderLine, product: Product) {
    item.product_id = product.id;
    item.product_name = product.name;
    item.unit_cost = product.cost_price;
    calculateLineTotal(item);
  }

  function calculateLineTotal(item: PurchaseOrderLine) {
    const base = roundMoney(item.quantity_ordered * item.unit_cost);
    const discounted = roundMoney(base * (1 - item.discount_percent / 100));
    item.line_total = roundMoney(discounted + roundMoney((discounted * item.tax_rate) / 100));
  }

  async function savePO(status: 'draft' | 'sent') {
    if (!validatePO()) return;
    if (!authStore.currentUser) {
      showToast(uiLabel('Please sign in before saving an order'), 'error');
      return;
    }
    saving.value = true;
    try {
      await invoke('save_purchase_order', {
        request: {
          poId: isEditing.value ? poId : null,
          supplierId: po.value.supplier_id,
          orderDate: po.value.order_date,
          expectedDeliveryDate: po.value.expected_delivery_date || null,
          notes: po.value.notes || null,
          discountAmount: Number(po.value.discount_amount),
          shippingCost: Number(po.value.shipping_cost),
          status,
          userId: authStore.currentUser.id,
          timestamp: new Date().toISOString(),
          items: lineItems.value.map((item) => ({
            productId: item.product_id,
            quantityOrdered: Number(item.quantity_ordered),
            unitCost: Number(item.unit_cost),
            taxRate: Number(item.tax_rate),
            discountPercent: Number(item.discount_percent),
          })),
        },
      });
      showToast(
        uiLabel(
          isEditing.value
            ? 'Purchase order updated successfully'
            : 'Purchase order created successfully',
        ),
        'success',
      );
      router.push('/purchase-orders');
    } catch {
      showToast(uiLabel('Error saving purchase order'), 'error');
      reportDiagnostic('operation_failed', 'workspace');
    } finally {
      saving.value = false;
    }
  }
  function validatePO(): boolean {
    if (!po.value.supplier_id) {
      showToast(uiLabel('Please select a supplier'), 'error');
      return false;
    }

    if (!po.value.order_date) {
      showToast(uiLabel('Please select order date'), 'error');
      return false;
    }

    if (lineItems.value.length === 0) {
      showToast(uiLabel('Please add at least one line item'), 'error');
      return false;
    }

    const discount = Number(po.value.discount_amount);
    const shipping = Number(po.value.shipping_cost);
    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > subtotal.value ||
      !Number.isFinite(shipping) ||
      shipping < 0 ||
      Math.abs(roundMoney(discount) - discount) > 0.0000001 ||
      Math.abs(roundMoney(shipping) - shipping) > 0.0000001
    ) {
      showToast(
        uiLabel(
          'Enter a valid discount and shipping cost (up to two decimals); discount cannot exceed subtotal',
        ),
        'error',
      );
      return false;
    }

    for (const item of lineItems.value) {
      if (!item.product_id) {
        showToast(uiLabel('Please select products for all line items'), 'error');
        return false;
      }
      if (item.quantity_ordered <= 0) {
        showToast(uiLabel('Quantity must be greater than 0'), 'error');
        return false;
      }
      if (item.unit_cost < 0) {
        showToast(uiLabel('Unit cost cannot be negative'), 'error');
        return false;
      }
    }

    return true;
  }

  function cancel() {
    if (confirm(uiLabel('Are you sure you want to cancel? Unsaved changes will be lost.'))) {
      router.push('/purchase-orders');
    }
  }

  return {
    preferences,
    isEditing,
    suppliers,
    products,
    loading,
    saving,
    po,
    lineItems,
    fromSuggestions,
    subtotal,
    taxAmount,
    totalAmount,
    addLineItem,
    removeLineItem,
    selectProduct,
    calculateLineTotal,
    savePO,
    cancel,
  };
}
