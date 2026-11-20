-- Add canonical RAM and ROM specification attributes.
-- COLOR and WARRANTY already exist in the live database and are not recreated.
insert into public.product_attributes (attribute_code, attribute_name, description, is_active)
values
  ('RAM', 'RAM', 'Kapasitas memori RAM pada product variant.', true),
  ('ROM', 'ROM', 'Kapasitas penyimpanan internal pada product variant.', true)
on conflict (attribute_code) do nothing;

-- Removing a variant specification is an update to the variant's specification set.
-- It does not delete the shared attribute value or product-level attribute assignment.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_variant_attribute_values'
      and policyname = 'product_variant_attribute_values_delete'
  ) then
    create policy product_variant_attribute_values_delete
      on public.product_variant_attribute_values
      for delete
      to authenticated
      using (public.has_permission('master.update'));
  end if;
end
$$;
