-- Sales Phase 1: controlled editing of draft Sales Orders.
-- Existing SO lines are replaced only while the header is draft and no DO exists.
create or replace function public.sales_update_draft_order(
  p_sales_order_id uuid,
  p_customer_id uuid,
  p_warehouse_id uuid,
  p_order_date date,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.sales_orders%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity numeric(18,3);
  v_unit_price numeric(20,2);
  v_tracking text;
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;

  select * into v_order
  from public.sales_orders
  where id = p_sales_order_id
  for update;

  if not found then
    raise exception 'Sales Order tidak ditemukan.';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'Hanya Sales Order draft yang dapat diubah.';
  end if;
  if not public.has_warehouse_access(v_order.warehouse_id)
     or not public.has_warehouse_access(p_warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;
  if exists (
    select 1 from public.delivery_orders d
    where d.sales_order_id = v_order.id
  ) then
    raise exception 'Sales Order yang sudah memiliki Delivery Order tidak dapat diedit.';
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.is_active
  ) then
    raise exception 'Pelanggan tidak ditemukan atau tidak aktif.';
  end if;
  if p_order_date is null then
    raise exception 'Tanggal Sales Order wajib diisi.';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 100 then
    raise exception 'Sales Order wajib memiliki 1 sampai 100 baris.';
  end if;

  delete from public.sales_order_items
  where sales_order_id = v_order.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := nullif(v_item->>'product_variant_id','')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;

    if v_variant_id is null or v_quantity is null or v_quantity <= 0
       or v_unit_price is null or v_unit_price < 0 then
      raise exception 'Baris Sales Order tidak valid.';
    end if;

    select pv.product_id, p.tracking_type
      into v_product_id, v_tracking
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_variant_id and pv.is_active and p.is_active;
    if not found then
      raise exception 'Product Variant tidak ditemukan atau tidak aktif.';
    end if;
    if v_tracking in ('imei','serial') and v_quantity <> trunc(v_quantity) then
      raise exception 'Produk IMEI/serial wajib menggunakan kuantitas bilangan bulat.';
    end if;

    insert into public.sales_order_items(
      sales_order_id, product_id, product_variant_id, quantity, unit_price
    ) values (
      v_order.id, v_product_id, v_variant_id, v_quantity, v_unit_price
    );
  end loop;

  update public.sales_orders
  set customer_id = p_customer_id,
      warehouse_id = p_warehouse_id,
      order_date = p_order_date,
      notes = nullif(btrim(p_notes),''),
      subtotal = coalesce((
        select sum(i.line_total)
        from public.sales_order_items i
        where i.sales_order_id = v_order.id
      ),0),
      updated_at = now()
  where id = v_order.id;

  return v_order.id;
end;
$$;

revoke all on function public.sales_update_draft_order(uuid,uuid,uuid,date,text,jsonb) from public, anon;
grant execute on function public.sales_update_draft_order(uuid,uuid,uuid,date,text,jsonb) to authenticated;

comment on function public.sales_update_draft_order(uuid,uuid,uuid,date,text,jsonb) is
  'Updates only a draft Sales Order with no Delivery Orders; replaces its lines atomically and revalidates canonical active Product Variants.';
