export interface PurchasePreferences {
  purchase_default_quantity: number;
  purchase_default_tax: number;
  purchase_default_discount: number;
  purchase_show_tax: number;
  purchase_show_discount: number;
  purchase_fill_remaining: number;
}
export const purchaseDefaults: PurchasePreferences = {
  purchase_default_quantity: 1,
  purchase_default_tax: 17,
  purchase_default_discount: 0,
  purchase_show_tax: 1,
  purchase_show_discount: 1,
  purchase_fill_remaining: 1,
};
export function purchasePreferences(
  settings: Partial<PurchasePreferences> | null,
): PurchasePreferences {
  return Object.fromEntries(
    Object.entries(purchaseDefaults).map(([key, fallback]) => [
      key,
      settings?.[key as keyof PurchasePreferences] ?? fallback,
    ]),
  ) as unknown as PurchasePreferences;
}
