-- Compact SKU generation for newly created products and variants.
-- Existing SKU values remain unchanged to preserve historical references.
create or replace function public.generate_product_sku()
returns text
language sql
security definer
set search_path = ''
as $function$
  select 'HX' || lpad(nextval('public.product_sku_sequence'::regclass)::text,3,'0');
$function$;

create or replace function public.next_product_variant_sku(p_product_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_product_sku text;
  v_next bigint;
  v_candidate text;
  v_suffix_width integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_permission('master.create') then
    raise exception 'Insufficient permission to create product variants';
  end if;

  select sku into v_product_sku
  from public.products
  where id=p_product_id and is_active=true and product_type='goods'
  for update;

  if not found then raise exception 'Active goods product not found'; end if;

  -- New HX999 products use a one-digit variant suffix; legacy products
  -- retain their two-digit suffix convention.
  v_suffix_width := case when v_product_sku ~ '^HX[0-9]{3}$' then 1 else 2 end;

  select coalesce(max(substring(pv.variant_sku from char_length(v_product_sku)+2)::bigint),0)+1
    into v_next
  from public.product_variants pv
  where pv.product_id=p_product_id
    and left(pv.variant_sku,char_length(v_product_sku)+1)=v_product_sku||'-'
    and substring(pv.variant_sku from char_length(v_product_sku)+2) ~ '^[0-9]+$';

  loop
    v_candidate := v_product_sku || '-' || lpad(v_next::text,v_suffix_width,'0');
    exit when not exists(select 1 from public.product_variants where variant_sku=v_candidate)
      and not exists(select 1 from public.products where sku=v_candidate);
    v_next:=v_next+1;
  end loop;
  return v_candidate;
end;
$function$;

revoke all on function public.generate_product_sku() from public,anon;
grant execute on function public.generate_product_sku() to authenticated,service_role;
revoke all on function public.next_product_variant_sku(uuid) from public,anon;
grant execute on function public.next_product_variant_sku(uuid) to authenticated,service_role;

-- Stock availability in the Sales product picker listens to this table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_balances'
  ) then
    alter publication supabase_realtime add table public.inventory_balances;
  end if;
end $$;
