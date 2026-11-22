-- Sales Phase 1: atomic Delivery Order posting.
-- Source-only migration; requires the Sales schema and narrow inventory
-- permission bridge migrations to be applied first.

create or replace function public.sales_post_delivery_order(
  p_delivery_order_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_do public.delivery_orders%rowtype;
  v_so public.sales_orders%rowtype;
  v_customer_active boolean;
  v_line record;
  v_total_requested numeric(18,3);
  v_outstanding numeric(18,3);
  v_movement_id uuid;
  v_tracking text;
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;

  select * into v_do
  from public.delivery_orders
  where id = p_delivery_order_id
  for update;
  if not found then raise exception 'Delivery Order tidak ditemukan.'; end if;
  if v_do.status <> 'draft' then
    raise exception 'Hanya Delivery Order draft yang dapat diposting.';
  end if;

  select * into v_so
  from public.sales_orders
  where id = v_do.sales_order_id
  for update;
  if not found then raise exception 'Sales Order tidak ditemukan.'; end if;
  if v_so.status not in ('confirmed','partially_delivered') then
    raise exception 'Sales Order tidak berada pada status yang dapat dikirim.';
  end if;
  if v_so.customer_id <> v_do.customer_id
     or v_so.warehouse_id <> v_do.warehouse_id then
    raise exception 'Referensi pelanggan atau warehouse DO tidak sesuai Sales Order.';
  end if;

  select c.is_active into v_customer_active
  from public.customers c where c.id = v_do.customer_id;
  if coalesce(v_customer_active,false) is not true then
    raise exception 'Pelanggan tidak ditemukan atau tidak aktif.';
  end if;

  if not public.has_warehouse_access(v_do.warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;

  -- Serialize all stock posting for this warehouse before validating
  -- reservation priority, available buckets and unit location.
  perform public.lock_inventory_warehouse(v_do.warehouse_id);

  if not exists (
    select 1 from public.delivery_order_items doi
    where doi.delivery_order_id = v_do.id
  ) then
    raise exception 'Delivery Order kosong tidak dapat diposting.';
  end if;

  -- Validate aggregate quantity per SO line. This also prevents repeated
  -- SO-line references from bypassing the remaining ordered quantity.
  for v_line in
    select doi.sales_order_item_id, sum(doi.quantity)::numeric(18,3) as quantity
    from public.delivery_order_items doi
    where doi.delivery_order_id = v_do.id
    group by doi.sales_order_item_id
    order by doi.sales_order_item_id
  loop
    perform 1
    from public.sales_order_items soi
    where soi.id = v_line.sales_order_item_id
      and soi.sales_order_id = v_so.id
    for update;
    if not found then
      raise exception 'Baris DO tidak berasal dari Sales Order terkait.';
    end if;

    select greatest(
      soi.quantity - coalesce((
        select sum(doi2.quantity)
        from public.delivery_order_items doi2
        join public.delivery_orders d2 on d2.id = doi2.delivery_order_id
        where doi2.sales_order_item_id = soi.id
          and d2.status = 'posted'
      ),0),0
    )::numeric(18,3)
    into v_outstanding
    from public.sales_order_items soi
    where soi.id = v_line.sales_order_item_id;

    if v_line.quantity > v_outstanding then
      raise exception 'Kuantitas DO melebihi sisa SO. Sisa: %, diminta: %.',
        v_outstanding, v_line.quantity;
    end if;

    -- Recheck deterministic soft-reservation priority at posting time.
    if exists (
      select 1
      from public.sales_order_items older_line
      join public.sales_orders older_order on older_order.id = older_line.sales_order_id
      join public.sales_order_line_fulfillment older_fulfillment
        on older_fulfillment.sales_order_item_id = older_line.id
      where older_line.product_variant_id = (
          select soi.product_variant_id
          from public.sales_order_items soi
          where soi.id = v_line.sales_order_item_id
        )
        and older_order.warehouse_id = v_do.warehouse_id
        and older_order.status in ('confirmed','partially_delivered')
        and (older_order.confirmed_at, older_order.sales_order_number, older_order.id)
            < (v_so.confirmed_at, v_so.sales_order_number, v_so.id)
        and older_fulfillment.outstanding_quantity > 0
    ) then
      raise exception 'Ada Sales Order lebih prioritas untuk Product Variant ini.';
    end if;
  end loop;

  -- Prevent assigning one serialized unit to multiple lines in the same DO.
  if exists (
    select doi.product_unit_id
    from public.delivery_order_items doi
    where doi.delivery_order_id = v_do.id
      and doi.product_unit_id is not null
    group by doi.product_unit_id
    having count(*) > 1
  ) then
    raise exception 'Product Unit yang sama tidak boleh muncul lebih dari satu kali dalam DO.';
  end if;

  -- Each DO line becomes one source-linked outbound movement. The movement
  -- is linked back to the DO line before invoking the unchanged inventory
  -- posting algorithm, satisfying the narrow authorization bridge.
  for v_line in
    select
      doi.id as delivery_order_item_id,
      doi.product_id,
      doi.product_variant_id,
      doi.quantity,
      doi.product_unit_id,
      p.tracking_type
    from public.delivery_order_items doi
    join public.products p on p.id = doi.product_id
    where doi.delivery_order_id = v_do.id
    order by doi.created_at, doi.id
    for update of doi
  loop
    v_tracking := v_line.tracking_type;

    if v_tracking = 'serial'
       and (v_line.product_unit_id is null or v_line.quantity <> 1) then
      raise exception 'Produk serial wajib memiliki satu Product Unit per baris DO.';
    end if;
    if v_tracking in ('imei','serial')
       and v_line.quantity <> trunc(v_line.quantity) then
      raise exception 'Kuantitas IMEI/serial harus bilangan bulat.';
    end if;
    if v_tracking = 'quantity' and v_line.product_unit_id is not null then
      raise exception 'Produk quantity tidak boleh menggunakan Product Unit.';
    end if;

    if v_line.product_unit_id is not null and not exists (
      select 1 from public.product_units pu
      where pu.id = v_line.product_unit_id
        and pu.product_variant_id = v_line.product_variant_id
        and pu.warehouse_id = v_do.warehouse_id
        and pu.unit_status = 'available'
    ) then
      raise exception 'Product Unit tidak tersedia di warehouse atau tidak sesuai Variant.';
    end if;

    insert into public.inventory_movements(
      product_id,
      product_variant_id,
      warehouse_id,
      product_unit_id,
      movement_type,
      status,
      quantity_delta,
      inventory_status,
      source_reference_type,
      source_reference_id,
      source_reference_number,
      notes,
      created_by
    ) values (
      v_line.product_id,
      v_line.product_variant_id,
      v_do.warehouse_id,
      v_line.product_unit_id,
      'sale',
      'draft',
      -v_line.quantity,
      'available',
      'delivery_order',
      v_line.delivery_order_item_id,
      v_do.delivery_order_number,
      concat_ws(' — ', 'Posting Delivery Order', v_do.delivery_order_number),
      v_user_id
    ) returning id into v_movement_id;

    update public.delivery_order_items
    set inventory_movement_id = v_movement_id
    where id = v_line.delivery_order_item_id;

    perform public.post_inventory_movement_unlocked(v_movement_id, null);
  end loop;

  -- Marking DO posted changes the derived fulfillment view. The status update
  -- and all inventory movements share this transaction and roll back together.
  update public.delivery_orders
  set status = 'posted',
      posted_by = v_user_id,
      posted_at = clock_timestamp(),
      updated_at = now()
  where id = v_do.id;

  if not exists (
    select 1
    from public.sales_order_line_fulfillment f
    where f.sales_order_id = v_so.id
      and f.outstanding_quantity > 0
  ) then
    update public.sales_orders
    set status = 'delivered', updated_at = now()
    where id = v_so.id;
  else
    update public.sales_orders
    set status = 'partially_delivered', updated_at = now()
    where id = v_so.id;
  end if;

  return v_do.id;
end;
$$;

revoke all on function public.sales_post_delivery_order(uuid) from public, anon;
grant execute on function public.sales_post_delivery_order(uuid) to authenticated;

comment on function public.sales_post_delivery_order(uuid) is
  'Atomically posts a draft Delivery Order through the canonical inventory posting algorithm and updates SO fulfillment.';
