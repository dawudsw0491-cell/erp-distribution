-- Restore the six canonical top-level categories required by Product Management.
-- These are system classification references, not operational Product records.
INSERT INTO public.product_categories (category_code, category_name, parent_id, description, is_active)
VALUES
  ('CAT_SMARTPHONE', 'SMARTPHONE', NULL, 'Kategori utama produk smartphone.', TRUE),
  ('CAT_TABLET', 'TABLET', NULL, 'Kategori utama produk tablet.', TRUE),
  ('CAT_AKSESORIS', 'AKSESORIS', NULL, 'Kategori utama aksesoris elektronik.', TRUE),
  ('CAT_KOMPUTER_LAPTOP', 'KOMPUTER DAN LAPTOP', NULL, 'Kategori utama komputer dan laptop.', TRUE),
  ('CAT_NETWORKING', 'NETWORKING', NULL, 'Kategori utama perangkat jaringan.', TRUE),
  ('CAT_KOMPONEN_ELEKTRONIK', 'KOMPONEN ELEKTRONIK', NULL, 'Kategori utama komponen elektronik.', TRUE)
ON CONFLICT (category_code) DO UPDATE
SET category_name = EXCLUDED.category_name,
    parent_id = NULL,
    description = EXCLUDED.description,
    is_active = TRUE;
