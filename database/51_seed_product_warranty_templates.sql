-- Reusable warranty templates are stored as values of the canonical WARRANTY attribute.
-- No duration/year is embedded in the template label.
insert into public.product_attributes (attribute_code, attribute_name, description, is_active)
values ('WARRANTY', 'Warranty', 'Template jenis garansi yang dapat digunakan ulang pada product variant.', true)
on conflict (attribute_code) do update
set attribute_name = excluded.attribute_name,
    description = excluded.description,
    is_active = true;

with warranty_attribute as (
  select id from public.product_attributes where attribute_code = 'WARRANTY'
),
templates(value_name, value_code) as (
  values
    ('SEIN', 'SEIN'),
    ('TAM', 'TAM'),
    ('B-CELL', 'B_CELL'),
    ('DISTRIBUTOR', 'DISTRIBUTOR'),
    ('INTERNASIONAL', 'INTERNASIONAL'),
    ('GARANSI TOKO', 'GARANSI_TOKO'),
    ('TANPA GARANSI', 'TANPA_GARANSI')
)
insert into public.product_attribute_values (attribute_id, value_code, value_name, description, is_active)
select a.id, t.value_code, t.value_name, 'Warranty template reusable untuk product variant.', true
from warranty_attribute a
cross join templates t
on conflict (attribute_id, value_name) do update
set is_active = true;
