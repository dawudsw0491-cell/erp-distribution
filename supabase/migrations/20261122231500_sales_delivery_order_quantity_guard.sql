-- Correct aggregate quantity validation for repeated SO line references
-- during draft Delivery Order creation. The source function body is otherwise
-- unchanged from the reviewed Sales schema migration.
create or replace function public.sales_create_delivery_order(
  p_sales_order_id uuid,
  p_delivery_date date,
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
  v_do_id uuid;
  v_item jsonb;
  v_line_id uuid;
  v_quantity numeric(18,3);
  v_unit_id uuid;
  v_line record;
  v_outstanding numeric(18,3);
  v_delivered numeric(18,3);
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;

  select * into v_order from public.sales_orders
  where id=p_sales_order_id for update;
  if not found then raise exception 'Sales Order tidak ditemukan.'; end if;
  if v_order.status not in ('confirmed','partially_delivered') then
    raise exception 'Delivery Order hanya dapat dibuat dari Sales Order confirmed.';
  end if;
  if not public.has_warehouse_access(v_order.warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;
  perform public.lock_inventory_warehouse(v_order.warehouse_id);

  if length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Catatan Delivery Order maksimal 2000 karakter.';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Delivery Order wajib memiliki minimal satu baris.';
  end if;

  -- Aggregate duplicate SO-line references before inserting any draft DO rows.
  -- The per-row loop below remains responsible for unit and FIFO checks.
  if exists (
    select 1
    from (
      select
        (item->>'sales_order_item_id')::uuid as sales_order_item_id,
        sum((item->>'quantity')::numeric) as requested_quantity
      from jsonb_array_elements(p_items) item
      group by (item->>'sales_order_item_id')::uuid
    ) requested
    join public.sales_order_items soi on soi.id = requested.sales_order_item_id
    where soi.sales_order_id = v_order.id
      and requested.requested_quantity > (
        soi.quantity - coalesce((
          select sum(doi.quantity)
          from public.delivery_order_items doi
          join public.delivery_orders d on d.id = doi.delivery_order_id
          where doi.sales_order_item_id = soi.id
            and d.status = 'posted'
        ), 0)
      )
  ) then
    raise exception 'Total kuantitas DO melebihi sisa Sales Order.';
  end if;

  if exists (
    select 1
    from (
      select nullif(item->>'product_unit_id','')::uuid as product_unit_id
      from jsonb_array_elements(p_items) item
      where nullif(item->>'product_unit_id','') is not null
    ) units
    group by units.product_unit_id
    having count(*) > 1
  ) then
    raise exception 'Product Unit yang sama tidak boleh dipakai lebih dari satu kali.';
  end if;

  insert into public.delivery_orders(
    sales_order_id, customer_id, warehouse_id, delivery_date, notes, created_by
  ) values (
    v_order.id, v_order.customer_id, v_order.warehouse_id,
    coalesce(p_delivery_date,current_date), nullif(btrim(p_notes),''), v_user_id
  ) returning id into v_do_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_id := nullif(v_item->>'sales_order_item_id','')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_id := nullif(v_item->>'product_unit_id','')::uuid;

    if v_line_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Baris Delivery Order tidak valid.';
    end if;

    select soi.id, soi.product_id, soi.product_variant_id, soi.quantity,
           p.tracking_type
      into v_line
    from public.sales_order_items soi
    join public.products p on p.id=soi.product_id
    where soi.id=v_line_id and soi.sales_order_id=v_order.id
    for update of soi;
    if not found then raise exception 'Baris Sales Order tidak ditemukan.'; end if;

    select coalesce(sum(doi.quantity),0)
      into v_delivered
    from public.delivery_order_items doi
    join public.delivery_orders d on d.id=doi.delivery_order_id
    where doi.sales_order_item_id=v_line_id and d.status='posted';

    v_outstanding := v_line.quantity - v_delivered;
    if v_quantity > v_outstanding then
      raise exception 'Kuantitas DO melebihi sisa Sales Order. Sisa: %', v_outstanding;
    end if;

    -- Soft reservation priority: an older confirmed order for the same
    -- variant and warehouse must be fulfilled before this order can consume it.
    if exists (
      select 1
      from public.sales_order_items older_line
      join public.sales_orders older_order on older_order.id=older_line.sales_order_id
      join public.sales_order_line_fulfillment older_fulfillment
        on older_fulfillment.sales_order_item_id=older_line.id
      where older_line.product_variant_id=v_line.product_variant_id
        and older_order.warehouse_id=v_order.warehouse_id
        and older_order.status in ('confirmed','partially_delivered')
        and (older_order.confirmed_at, older_order.sales_order_number, older_order.id)
            < (v_order.confirmed_at, v_order.sales_order_number, v_order.id)
        and older_fulfillment.outstanding_quantity > 0
    ) then
      raise exception 'Ada Sales Order lebih prioritas untuk Product Variant ini.';
    end if;

    if v_line.tracking_type='serial' and (v_unit_id is null or v_quantity <> 1) then
      raise exception 'Produk serial wajib memilih satu Product Unit untuk setiap baris.';
    end if;
    if v_unit_id is not null then
      if v_quantity <> 1 or not exists (
        select 1 from public.product_units pu
        where pu.id=v_unit_id
          and pu.product_variant_id=v_line.product_variant_id
          and pu.warehouse_id=v_order.warehouse_id
          and pu.unit_status='available'
      ) then
        raise exception 'Product Unit tidak tersedia, tidak sesuai Variant, atau Warehouse.';
      end if;
      if v_line.tracking_type='quantity' then
        raise exception 'Product Unit tidak boleh dipakai untuk produk quantity.';
      end if;
    end if;

    insert into public.delivery_order_items(
      delivery_order_id, sales_order_item_id, product_id,
      product_variant_id, quantity, product_unit_id
    ) values (
      v_do_id, v_line.id, v_line.product_id,
      v_line.product_variant_id, v_quantity, v_unit_id
    );
  end loop;

  return v_do_id;
end;
$$;


