-- Create product, initial variants, and their specifications atomically.
-- SECURITY INVOKER preserves caller identity, RLS, and table permissions.
create or replace function public.create_product_with_variants(
  p_product jsonb,
  p_variants jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_product_id uuid;
  v_product_sku text;
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_sku text;
  v_variant_name text;
  v_barcode text;
  v_index integer := 0;
  v_variant_results jsonb := '[]'::jsonb;
  v_product_name text;
  v_product_type text;
  v_tracking_type text;
  v_unit text;
  v_category_id uuid;
  v_subcategory_id uuid;
  v_brand_id uuid;
  v_model_id uuid;
  v_condition text;
  v_minimum_stock numeric;
  v_specifications jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('master.create') then
    raise exception 'Insufficient permission to create products';
  end if;

  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'Product payload must be a JSON object';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Variants payload must be a JSON array';
  end if;

  if jsonb_array_length(p_variants) > 100 then
    raise exception 'A product cannot contain more than 100 variants per submission';
  end if;

  v_product_name := upper(regexp_replace(btrim(coalesce(p_product->>'product_name','')), '[[:space:]]+', ' ', 'g'));
  v_product_type := lower(btrim(coalesce(p_product->>'product_type','goods')));
  v_tracking_type := lower(btrim(coalesce(p_product->>'tracking_type','quantity')));
  v_unit := upper(regexp_replace(btrim(coalesce(p_product->>'unit','PCS')), '[[:space:]]+', ' ', 'g'));
  v_category_id := nullif(p_product->>'category_id','')::uuid;
  v_subcategory_id := nullif(p_product->>'product_subcategory_id','')::uuid;
  v_brand_id := nullif(p_product->>'brand_id','')::uuid;
  v_model_id := nullif(p_product->>'model_id','')::uuid;
  v_condition := nullif(upper(btrim(coalesce(p_product->>'product_condition',''))),'');
  v_minimum_stock := coalesce(nullif(p_product->>'minimum_stock','')::numeric,0);

  if v_product_name = '' or length(v_product_name) > 255 then
    raise exception 'Product name is required and must be at most 255 characters';
  end if;
  if v_unit = '' or length(v_unit) > 50 then
    raise exception 'Unit is required and must be at most 50 characters';
  end if;
  if v_product_type not in ('goods','service') then
    raise exception 'Invalid product type';
  end if;
  if v_tracking_type not in ('quantity','imei','serial') then
    raise exception 'Invalid tracking type';
  end if;
  if v_minimum_stock < 0 then
    raise exception 'Minimum stock cannot be negative';
  end if;

  if v_product_type = 'service' then
    v_category_id := null;
    v_subcategory_id := null;
    v_model_id := null;
    v_condition := null;
    v_tracking_type := 'quantity';
    v_minimum_stock := 0;
    if jsonb_array_length(p_variants) <> 0 then
      raise exception 'Service products do not accept stock variants';
    end if;
  else
    if v_condition not in ('BARU','SECOND') then
      raise exception 'Product condition must be BARU or SECOND';
    end if;
    if jsonb_array_length(p_variants) = 0 then
      raise exception 'At least one variant is required for goods';
    end if;
  end if;

  if v_category_id is not null and not exists (
    select 1 from public.product_categories
    where id = v_category_id and is_active = true and parent_id is null
  ) then
    raise exception 'Invalid or inactive top-level category';
  end if;

  if v_subcategory_id is not null and not exists (
    select 1 from public.product_categories
    where id = v_subcategory_id and is_active = true and parent_id = v_category_id
  ) then
    raise exception 'Subcategory does not belong to selected category';
  end if;

  if v_brand_id is not null and not exists (
    select 1 from public.brands where id = v_brand_id and is_active = true
  ) then
    raise exception 'Brand is invalid or inactive';
  end if;

  if v_model_id is not null and not exists (
    select 1 from public.product_models
    where id = v_model_id and is_active = true and brand_id is not distinct from v_brand_id
  ) then
    raise exception 'Product model is invalid, inactive, or belongs to another brand';
  end if;

  v_product_sku := public.generate_product_sku();

  insert into public.products (
    sku, barcode, product_name, category_id, product_subcategory_id,
    product_condition, brand_id, model_id, product_type, tracking_type,
    unit, description, minimum_stock, is_active
  )
  values (
    v_product_sku,
    nullif(btrim(coalesce(p_product->>'barcode','')),''),
    v_product_name,
    v_category_id,
    v_subcategory_id,
    v_condition,
    v_brand_id,
    v_model_id,
    v_product_type,
    v_tracking_type,
    v_unit,
    nullif(btrim(coalesce(p_product->>'description','')),''),
    v_minimum_stock,
    true
  )
  returning id into v_product_id;

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_variant) <> 'object' then
      raise exception 'Each variant must be a JSON object';
    end if;

    v_variant_name := regexp_replace(btrim(coalesce(v_variant->>'variant_name','')), '[[:space:]]+', ' ', 'g');
    v_barcode := nullif(btrim(coalesce(v_variant->>'barcode','')),'');

    if v_variant_name = '' or length(v_variant_name) > 200 then
      raise exception 'Variant name is required and must be at most 200 characters';
    end if;
    if v_barcode is not null and length(v_barcode) > 100 then
      raise exception 'Variant barcode cannot exceed 100 characters';
    end if;

    v_variant_sku := v_product_sku || '-' || lpad(v_index::text, 2, '0');

    insert into public.product_variants (
      product_id, variant_sku, variant_name, barcode, is_active, is_auto_generated
    )
    values (
      v_product_id, v_variant_sku, v_variant_name, v_barcode, true, true
    )
    returning id into v_variant_id;

    v_specifications := jsonb_build_object(
      'RAM', coalesce(v_variant->>'ram',''),
      'ROM', coalesce(v_variant->>'rom',''),
      'COLOR', coalesce(v_variant->>'color',''),
      'WARRANTY', coalesce(v_variant->>'warranty','')
    );

    perform public.save_product_variant_specifications(
      v_product_id, v_variant_id, v_specifications
    );

    v_variant_results := v_variant_results || jsonb_build_array(
      jsonb_build_object(
        'id', v_variant_id,
        'variant_sku', v_variant_sku,
        'variant_name', v_variant_name,
        'barcode', v_barcode
      )
    );
  end loop;

  return jsonb_build_object(
    'product_id', v_product_id,
    'product_sku', v_product_sku,
    'variants', v_variant_results
  );
end;
$function$;

revoke all on function public.create_product_with_variants(jsonb, jsonb) from public;
revoke all on function public.create_product_with_variants(jsonb, jsonb) from anon;
grant execute on function public.create_product_with_variants(jsonb, jsonb) to authenticated;
grant execute on function public.create_product_with_variants(jsonb, jsonb) to service_role;
