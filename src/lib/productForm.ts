export function createProductForm() {
  return {
    // Core fields (persisted to DB)
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

    // Registration metadata (persisted alongside the core product fields).
    shelf_location: '',
    remarks: '',
    uom: 'box' as string,
    pack_type: '',
    ext_disc_percent: 0,
    stm_level: 0,
    maintain_batch: false,
    fridge_item: false,
    registration_date: '',

    // Read-only stock display
    stock_in_loose: 0 as number,
    stock_in_packs: 0 as number,
  };
}

export type ProductFormData = ReturnType<typeof createProductForm>;

export function validateProductDetails(form: ProductFormData): string | null {
  if (form.shelf_location.trim().length > 80)
    return 'Shelf / location must be at most 80 characters.';
  if (form.remarks.trim().length > 1000) return 'Remarks must be at most 1000 characters.';
  if (form.pack_type.trim().length > 40) return 'Pack type must be at most 40 characters.';
  if (!['box', 'strip', 'unit', 'bottle'].includes(form.uom)) return 'Choose a valid UOM.';
  const discount = Number(form.ext_disc_percent);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100)
    return 'Extra discount must be between 0 and 100 percent.';
  const level = Number(form.stm_level);
  if (!Number.isSafeInteger(level) || level < 0 || level > 1000000000)
    return 'STM level must be a whole number between 0 and 1000000000.';
  if (form.registration_date) {
    const date = new Date(`${form.registration_date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.registration_date) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== form.registration_date
    )
      return 'Enter a valid registration date.';
  }
  return null;
}

export function productDetailValues(form: ProductFormData) {
  return [
    form.shelf_location.trim(),
    form.remarks.trim(),
    form.uom,
    form.pack_type.trim(),
    Number(form.ext_disc_percent),
    Number(form.stm_level),
    form.maintain_batch ? 1 : 0,
    form.fridge_item ? 1 : 0,
    form.registration_date || null,
  ];
}
