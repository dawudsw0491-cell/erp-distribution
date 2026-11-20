-- Persist all supported variant specifications in one database transaction.
-- SECURITY INVOKER keeps the caller's RLS and permission checks in force.
create or replace function public.save_product_variant_specifications(
  p_product_id uuid,
  p_variant_id uuid,
  p_specifications jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_item record;
  v_attribute_id uuid;
  v_attribute_value_id uuid;
  v_mapping_id uuid;
  v_value_name text;
  v_value_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.has_permission('master.create')
    or public.has_permission('master.update')
  ) then
    raise exception 'Insufficient permission to manage product variant specifications';
  end if;

  if p_product_id is null or p_variant_id is null then
    raise exception 'Product and variant identifiers are required';
  end if;

  if p_specifications is null or jsonb_typeof(p_specifications) <> 'object' then
    raise exception 'Specifications must be a JSON object';
  end if;

  for v_item in
    select key, value
    from jsonb_each_text(p_specifications)
  loop
    if v_item.key not in ('RAM', 'ROM', 'COLOR', 'WARRANTY') then
      raise exception 'Unsupported variant specification: %', v_item.key;
    end if;

    select id
      into v_attribute_id
    from public.product_attributes
    where attribute_code = v_item.key
      and is_active = true;

    if v_attribute_id is null then
      raise exception 'Specification attribute % is missing or inactive', v_item.key;
    end if;

    v_value_name := upper(regexp_replace(btrim(coalesce(v_item.value, '')), '\s+', ' ', 'g'));

    if length(v_value_name) > 100 then
      raise exception 'Specification % exceeds 100 characters', v_item.key;
    end if;

    select id
      into v_mapping_id
    from public.product_variant_attribute_values
    where product_id = p_product_id
      and product_variant_id = p_variant_id
      and attribute_id = v_attribute_id;

    if v_value_name = '' then
      if v_mapping_id is not null then
        delete from public.product_variant_attribute_values
        where id = v_mapping_id;
      end if;
      continue;
    end if;

    select id
      into v_attribute_value_id
    from public.product_attribute_values
    where attribute_id = v_attribute_id
      and upper(btrim(value_name)) = v_value_name
    order by is_active desc, created_at asc
    limit 1;

    if v_attribute_value_id is null then
      v_value_code :=
        coalesce(
          nullif(left(upper(regexp_replace(v_value_name, '[^A-Z0-9]+', '_', 'g')), 28), ''),
          v_item.key
        )
        || '_'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

      insert into public.product_attribute_values (
        attribute_id,
        value_code,
        value_name,
        description,
        is_active
      )
      values (
        v_attribute_id,
        v_value_code,
        v_value_name,
        'Reusable ' || v_item.key || ' specification template for product variants.',
        true
      )
      returning id into v_attribute_value_id;
    end if;

    if not exists (
      select 1
      from public.product_attribute_assignments
      where product_id = p_product_id
        and attribute_id = v_attribute_id
    ) then
      insert into public.product_attribute_assignments (
        product_id,
        attribute_id,
        is_required,
        display_order,
        is_active
      )
      values (
        p_product_id,
        v_attribute_id,
        false,
        0,
        true
      );
    end if;

    if v_mapping_id is not null then
      update public.product_variant_attribute_values
      set attribute_value_id = v_attribute_value_id,
          updated_at = now()
      where id = v_mapping_id;
    else
      insert into public.product_variant_attribute_values (
        product_id,
        product_variant_id,
        attribute_id,
        attribute_value_id
      )
      values (
        p_product_id,
        p_variant_id,
        v_attribute_id,
        v_attribute_value_id
      );
    end if;

    v_mapping_id := null;
    v_attribute_value_id := null;
    v_attribute_id := null;
  end loop;
end;
$function$;

revoke all on function public.save_product_variant_specifications(uuid, uuid, jsonb) from public;
revoke all on function public.save_product_variant_specifications(uuid, uuid, jsonb) from anon;
grant execute on function public.save_product_variant_specifications(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_product_variant_specifications(uuid, uuid, jsonb) to service_role;
