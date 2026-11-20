/**
 * Canonical top-level product categories shared by server validation
 * and client-side product categorization suggestions.
 */
export const MAIN_PRODUCT_CATEGORIES = [
  "SMARTPHONE",
  "TABLET",
  "AKSESORIS",
  "KOMPUTER DAN LAPTOP",
  "NETWORKING",
  "KOMPONEN ELEKTRONIK",
] as const;

export type MainProductCategory =
  (typeof MAIN_PRODUCT_CATEGORIES)[number];
