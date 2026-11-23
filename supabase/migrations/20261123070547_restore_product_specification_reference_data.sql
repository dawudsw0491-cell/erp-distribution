-- Restore canonical Product Variant specification dictionary after Development data reset.
-- These are system reference definitions, not business Product records.
BEGIN;

INSERT INTO public.product_attributes (attribute_code, attribute_name, description, is_active)
VALUES
  ('RAM', 'RAM', 'Kapasitas memori RAM pada product variant.', TRUE),
  ('ROM', 'ROM', 'Kapasitas penyimpanan internal pada product variant.', TRUE),
  ('COLOR', 'Color', 'Warna produk pada product variant.', TRUE),
  ('WARRANTY', 'Warranty', 'Template jenis garansi yang dapat digunakan ulang pada product variant.', TRUE)
ON CONFLICT (attribute_code) DO UPDATE
SET attribute_name = EXCLUDED.attribute_name,
    description = EXCLUDED.description,
    is_active = TRUE;

WITH warranty_attribute AS (
  SELECT id FROM public.product_attributes WHERE attribute_code = 'WARRANTY'
),
templates(value_name, value_code) AS (
  VALUES
    ('SEIN', 'SEIN'),
    ('TAM', 'TAM'),
    ('B-CELL', 'B_CELL'),
    ('DISTRIBUTOR', 'DISTRIBUTOR'),
    ('INTERNASIONAL', 'INTERNASIONAL'),
    ('GARANSI TOKO', 'GARANSI_TOKO'),
    ('TANPA GARANSI', 'TANPA_GARANSI')
)
INSERT INTO public.product_attribute_values (attribute_id, value_code, value_name, description, is_active)
SELECT a.id, t.value_code, t.value_name, 'Warranty template reusable untuk product variant.', TRUE
FROM warranty_attribute a
CROSS JOIN templates t
ON CONFLICT (attribute_id, value_name) DO UPDATE
SET is_active = TRUE;

COMMIT;
