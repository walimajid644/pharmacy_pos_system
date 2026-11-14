export function createProductForm() {
  return {
    sku: '',
    name: '',
    generic_name: '',
    barcode: '',
    category_id: '',
    manufacturer_id: '',
    unit_price: 0,
    wholesale_price: '' as number | string,
    cost_price: 0,
    pack_size: 1,
    sell_by_loose_unit: false,
    drap_registration_number: '',
    controlled_substance: false,
    reorder_level: 10,
    is_active: true,
  };
}

export type ProductFormData = ReturnType<typeof createProductForm>;
