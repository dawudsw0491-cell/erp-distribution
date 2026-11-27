create or replace function public.sales_cancel_delivery_order(p_delivery_order_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sales_order_id uuid;
  v_so public.sales_orders%rowtype;
  v_do public.delivery_orders%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_line record;
  v_balance public.inventory_balances%rowtype;
  v_quantity numeric(18,3);
  v_value_delta numeric(20,4);
  v_quantity_after numeric(18,3);
  v_value_after numeric(20,4);
  v_average_after numeric(20,6);
  v_reversal_id uuid;
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;
  if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib 5 sampai 500 karakter.';
  end if;

  select d.sales_order_id into v_sales_order_id
  from public.delivery_orders d where d.id = p_delivery_order_id;
  if not found then raise exception 'Delivery Order tidak ditemukan.'; end if;

  select * into v_so from public.sales_orders
  where id = v_sales_order_id for update;
  if not found then raise exception 'Sales Order tidak ditemukan.'; end if;

  select * into v_do from public.delivery_orders
  where id = p_delivery_order_id for update;
  if not found then raise exception 'Delivery Order tidak ditemukan.'; end if;
  if v_do.sales_order_id <> v_so.id then
    raise exception 'Referensi Sales Order Delivery Order tidak sesuai.';
  end if;
  if v_do.status not in ('draft','posted') then
    raise exception 'Hanya DO Draft atau Posted yang dapat dibatalkan.';
  end if;
  if v_so.status not in ('confirmed','partially_delivered','delivered','cancelled') then
    raise exception 'Status Sales Order tidak memungkinkan pembatalan Delivery Order.';
  end if;
  if not public.has_warehouse_access(v_do.warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;

  perform public.lock_inventory_warehouse(v_do.warehouse_id);

  if v_do.status = 'draft' then
    if exists (
      select 1 from public.delivery_order_items doi
      join public.inventory_movements im on im.id = doi.inventory_movement_id
      where doi.delivery_order_id = v_do.id
    ) then
      raise exception 'DO Draft memiliki movement stok. Pembatalan otomatis ditolak.';
    end if;

    update public.delivery_orders
    set status = 'cancelled', cancellation_reason = v_reason, updated_at = now()
    where id = v_do.id;
    return v_do.id;
  end if;

  -- An active invoice is a financial document and must be voided before its DO can be cancelled.
  if exists (
    select 1
    from public.sales_invoice_items sii
    join public.sales_invoices si on si.id = sii.invoice_id
    join public.delivery_order_items doi on doi.id = sii.delivery_order_item_id
    where doi.delivery_order_id = v_do.id
      and si.voided_at is null
  ) then
    raise exception 'DO memiliki invoice aktif. Void invoice terlebih dahulu sebelum membatalkan DO.';
  end if;

  if not exists (
    select 1 from public.delivery_order_items doi
    where doi.delivery_order_id = v_do.id
  ) then
    raise exception 'DO Posted tidak memiliki detail item.';
  end if;

  if exists (
    select 1
    from public.delivery_order_items doi
    left join public.inventory_movements im on im.id = doi.inventory_movement_id
    left join public.inventory_valuation_logs vl on vl.inventory_movement_id = im.id
    where doi.delivery_order_id = v_do.id
      and (
        im.id is null
        or im.status <> 'posted'
        or im.movement_type <> 'sale'
        or im.source_reference_type <> 'delivery_order'
        or im.source_reference_id <> doi.id
        or im.quantity_delta <> -doi.quantity
        or vl.inventory_movement_id is null
      )
  ) then
    raise exception 'Riwayat movement atau valuasi DO tidak lengkap; reversal otomatis dihentikan.';
  end if;

  if exists (
    select 1
    from public.delivery_order_items doi
    join public.inventory_movements im on im.id = doi.inventory_movement_id
    join public.inventory_movements reversal on reversal.reversal_of_id = im.id
  ) then
    raise exception 'Movement DO sudah pernah direversal.';
  end if;

  for v_line in
    select
      doi.id as delivery_order_item_id,
      doi.product_id,
      doi.product_variant_id,
      doi.quantity,
      doi.product_unit_id,
      im.id as original_movement_id,
      im.posted_at as original_posted_at,
      vl.average_cost_before
    from public.delivery_order_items doi
    join public.inventory_movements im on im.id = doi.inventory_movement_id
    join public.inventory_valuation_logs vl on vl.inventory_movement_id = im.id
    where doi.delivery_order_id = v_do.id
    order by im.created_at, im.id
    for update of doi, im
  loop
    if v_line.average_cost_before < 0 then
      raise exception 'Nilai biaya historis movement tidak valid.';
    end if;

    if v_line.product_unit_id is not null then
      perform 1
      from public.product_units pu
      where pu.id = v_line.product_unit_id
        and pu.product_variant_id = v_line.product_variant_id
        and pu.unit_status = 'sold'
        and pu.warehouse_id is null
      for update;
      if not found then
        raise exception 'Unit serial tidak lagi berada pada status sold. Periksa histori unit sebelum reversal.';
      end if;

      if exists (
        select 1 from public.inventory_movements later
        where later.product_unit_id = v_line.product_unit_id
          and later.status = 'posted'
          and later.id <> v_line.original_movement_id
          and later.posted_at > v_line.original_posted_at
      ) then
        raise exception 'Unit serial sudah memiliki pergerakan setelah DO ini. Reversal otomatis ditolak.';
      end if;
    end if;

    select * into v_balance
    from public.inventory_balances
    where product_variant_id = v_line.product_variant_id
      and warehouse_id = v_do.warehouse_id
    for update;
    if not found then
      raise exception 'Saldo inventory untuk variant DO tidak ditemukan.';
    end if;

    v_quantity := v_line.quantity;
    v_value_delta := round(v_quantity * v_line.average_cost_before, 4);
    v_quantity_after := v_balance.on_hand_quantity + v_quantity;
    v_value_after := v_balance.inventory_value + v_value_delta;
    if v_quantity_after <= 0 or v_value_after < 0 then
      raise exception 'Hasil reversal menghasilkan saldo atau nilai inventory tidak valid.';
    end if;
    v_average_after := round(v_value_after / v_quantity_after, 6);

    insert into public.inventory_movements (
      product_id, product_variant_id, warehouse_id, product_unit_id,
      movement_type, status, quantity_delta, inventory_status,
      source_reference_type, source_reference_id, source_reference_number,
      reversal_of_id, notes, created_by, posted_by, posted_at
    ) values (
      v_line.product_id, v_line.product_variant_id, v_do.warehouse_id, v_line.product_unit_id,
      'sale', 'posted', v_quantity, 'available',
      'delivery_order_cancel', v_line.delivery_order_item_id, v_do.delivery_order_number,
      v_line.original_movement_id, concat('Reversal pembatalan ',v_do.delivery_order_number,' — ',v_reason),
      v_user_id, v_user_id, clock_timestamp()
    ) returning id into v_reversal_id;

    update public.inventory_balances
    set available_quantity = available_quantity + v_quantity,
        on_hand_quantity = v_quantity_after,
        inventory_value = v_value_after,
        average_unit_cost = v_average_after,
        updated_at = now()
    where id = v_balance.id;

    insert into public.inventory_valuation_logs (
      inventory_movement_id, product_variant_id, product_id, warehouse_id,
      transaction_type, quantity_before, quantity_after, quantity_delta,
      value_before, value_after, inventory_value_delta,
      average_cost_before, average_cost_after, created_by
    ) values (
      v_reversal_id, v_line.product_variant_id, v_line.product_id, v_do.warehouse_id,
      'sale_reversal', v_balance.on_hand_quantity, v_quantity_after, v_quantity,
      v_balance.inventory_value, v_value_after, v_value_delta,
      v_balance.average_unit_cost, v_average_after, v_user_id
    );

    if v_line.product_unit_id is not null then
      update public.product_units
      set unit_status = 'available', warehouse_id = v_do.warehouse_id, updated_at = now()
      where id = v_line.product_unit_id;
    end if;
  end loop;

  update public.delivery_orders
  set status = 'cancelled',
      cancellation_reason = v_reason,
      posted_by = null,
      posted_at = null,
      updated_at = now()
  where id = v_do.id;

  if not exists (
    select 1 from public.sales_order_line_fulfillment f
    where f.sales_order_id = v_so.id and f.delivered_quantity > 0
  ) then
    update public.sales_orders set status = 'confirmed', updated_at = now()
    where id = v_so.id and status <> 'cancelled';
  elsif exists (
    select 1 from public.sales_order_line_fulfillment f
    where f.sales_order_id = v_so.id and f.outstanding_quantity > 0
  ) then
    update public.sales_orders set status = 'partially_delivered', updated_at = now()
    where id = v_so.id and status <> 'cancelled';
  else
    update public.sales_orders set status = 'delivered', updated_at = now()
    where id = v_so.id and status <> 'cancelled';
  end if;

  return v_do.id;
end;
$$;

revoke all on function public.sales_cancel_delivery_order(uuid,text) from public;
grant execute on function public.sales_cancel_delivery_order(uuid,text) to authenticated;
