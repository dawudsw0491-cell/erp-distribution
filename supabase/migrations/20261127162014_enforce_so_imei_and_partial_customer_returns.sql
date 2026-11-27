create or replace function public.sales_return_create_draft(
  p_return_type text,p_source_document_id uuid,p_return_date date,p_reason text,p_notes text,p_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_return_id uuid; v_doc record; v_item jsonb; v_line record;
  v_source_line uuid; v_qty numeric(18,3); v_unit uuid; v_unit_code text; v_tracking text;
  v_remaining numeric(18,3); v_count integer:=0;
begin
  if v_user is null or p_return_type not in ('customer','supplier') then raise exception 'Jenis retur atau sesi tidak valid.'; end if;
  if p_return_date is null or nullif(btrim(p_reason),'') is null or length(p_reason)>500 or length(coalesce(p_notes,''))>2000 then
    raise exception 'Tanggal, alasan, atau catatan retur tidak valid.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception 'Retur harus memiliki 1 sampai 100 baris.';
  end if;
  if p_return_type='customer' then
    if not public.has_permission('sales.return') then raise exception 'Permission sales.return diperlukan.'; end if;
    select d.id,d.customer_id,d.warehouse_id,d.delivery_order_number,d.status
      into v_doc from public.delivery_orders d where d.id=p_source_document_id;
    if not found or v_doc.status not in ('posted','partially_returned') then raise exception 'Sumber customer return harus Delivery Order posted.'; end if;
    if not public.has_warehouse_access(v_doc.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
    insert into public.sales_returns(return_type,source_delivery_order_id,customer_id,warehouse_id,return_date,reason,notes,created_by)
    values('customer',v_doc.id,v_doc.customer_id,v_doc.warehouse_id,p_return_date,btrim(p_reason),nullif(btrim(p_notes),''),v_user)
    returning id into v_return_id;
  else
    if not public.has_permission('purchasing.create') then raise exception 'Permission purchasing.create diperlukan.'; end if;
    select g.id,g.supplier_id,g.warehouse_id,g.receipt_number,g.status
      into v_doc from public.goods_receipts g where g.id=p_source_document_id;
    if not found or v_doc.status not in ('posted','partially_returned') then raise exception 'Sumber supplier return harus Goods Receipt posted.'; end if;
    if not public.has_warehouse_access(v_doc.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
    insert into public.sales_returns(return_type,source_goods_receipt_id,supplier_id,warehouse_id,return_date,reason,notes,created_by)
    values('supplier',v_doc.id,v_doc.supplier_id,v_doc.warehouse_id,p_return_date,btrim(p_reason),nullif(btrim(p_notes),''),v_user)
    returning id into v_return_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count:=v_count+1;
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(v_item->>'source_line_id','') !~* '^[0-9a-f-]{36}$'
       or coalesce(v_item->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' then
      raise exception 'Format baris retur tidak valid.';
    end if;
    v_source_line:=(v_item->>'source_line_id')::uuid;
    v_qty:=(v_item->>'quantity')::numeric;
    v_unit:=nullif(v_item->>'product_unit_id','')::uuid;
    v_unit_code:=nullif(btrim(v_item->>'product_unit_code'),'');
    if v_qty<=0 then raise exception 'Kuantitas retur harus lebih dari nol.'; end if;

    if p_return_type='customer' then
      select doi.id,doi.product_id,doi.product_variant_id,doi.product_unit_id as source_unit,
        doi.quantity,p.product_name,p.tracking_type,pv.variant_sku,pv.variant_name
      into v_line
      from public.delivery_order_items doi
      join public.products p on p.id=doi.product_id
      join public.product_variants pv on pv.id=doi.product_variant_id
      where doi.id=v_source_line and doi.delivery_order_id=p_source_document_id;
      if not found then raise exception 'Baris bukan bagian dari Delivery Order sumber.'; end if;
      if v_line.source_unit is not null then
        if v_unit is not null and v_unit is distinct from v_line.source_unit then raise exception 'Product Unit tidak sesuai baris Delivery Order.'; end if;
        v_unit:=v_line.source_unit;
      elsif v_unit_code is not null then
        raise exception 'Customer return mengikuti Product Unit yang tercatat pada Delivery Order.';
      end if;
      if v_line.tracking_type='serial' and (v_unit is null or v_qty<>1) then raise exception 'Produk serial wajib satu Product Unit per baris.'; end if;
      if v_line.tracking_type in ('imei','serial') and v_qty<>trunc(v_qty) then raise exception 'Kuantitas IMEI/serial harus bulat.'; end if;
      if v_unit is not null and v_qty<>1 then raise exception 'Product Unit individual hanya boleh diretur satu unit per baris.'; end if;
      if v_line.tracking_type='quantity' and v_unit is not null then raise exception 'Produk quantity tidak menggunakan Product Unit.'; end if;
      select v_line.quantity-coalesce(sum(ri.quantity),0) into v_remaining
      from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id
      where ri.source_delivery_order_item_id=v_source_line and r.status='posted';
      if v_qty>v_remaining then raise exception 'Kuantitas melebihi sisa yang dapat diretur.'; end if;
      insert into public.sales_return_items(return_id,source_delivery_order_item_id,product_id,product_variant_id,product_unit_id,quantity,inventory_status,product_name_snapshot,variant_sku_snapshot,variant_name_snapshot)
      values(v_return_id,v_source_line,v_line.product_id,v_line.product_variant_id,v_unit,v_qty,'quarantine',v_line.product_name,v_line.variant_sku,v_line.variant_name);
    else
      select gri.id,pv.product_id,pv.id as product_variant_id,gri.quantity_received,p.product_name,p.tracking_type,pv.variant_sku,pv.variant_name,gri.inventory_status
      into v_line
      from public.goods_receipt_items gri
      join public.purchase_order_items poi on poi.id=gri.purchase_order_item_id
      join public.product_variants pv on pv.id=poi.product_variant_id
      join public.products p on p.id=pv.product_id
      where gri.id=v_source_line and gri.goods_receipt_id=p_source_document_id;
      if not found then raise exception 'Baris bukan bagian dari Goods Receipt sumber.'; end if;
      if v_line.tracking_type='serial' and (v_unit is null or v_qty<>1) then raise exception 'Produk serial wajib satu Product Unit per baris.'; end if;
      if v_line.tracking_type in ('imei','serial') and v_qty<>trunc(v_qty) then raise exception 'Kuantitas IMEI/serial harus bulat.'; end if;
      if v_line.tracking_type='quantity' and v_unit is not null then raise exception 'Produk quantity tidak menggunakan Product Unit.'; end if;
      if v_unit_code is not null then
        select pu.id into v_unit
        from public.goods_receipt_units gru
        join public.product_units pu on pu.unit_code=gru.unit_code
        where gru.goods_receipt_item_id=v_source_line
          and gru.unit_code=v_unit_code
          and pu.product_variant_id=v_line.product_variant_id
          and pu.warehouse_id=(select warehouse_id from public.goods_receipts where id=p_source_document_id)
          and pu.unit_status=v_line.inventory_status;
        if not found then raise exception 'Unit code tidak tersedia pada Goods Receipt atau sudah tidak berada pada bucket sumber.'; end if;
      end if;
      if v_unit is not null and not exists (
        select 1 from public.goods_receipt_units gru join public.product_units pu on pu.unit_code=gru.unit_code
        where gru.goods_receipt_item_id=v_source_line and pu.id=v_unit and pu.product_variant_id=v_line.product_variant_id
      ) then raise exception 'Product Unit tidak berasal dari baris Goods Receipt.'; end if;
      if v_line.tracking_type in ('imei','serial')
         and exists (select 1 from public.goods_receipt_units gru where gru.goods_receipt_item_id=v_source_line)
         and (v_unit is null or v_qty<>1) then
        raise exception 'Goods Receipt yang mencatat unit IMEI/serial wajib diretur per Product Unit.';
      end if;
      select v_line.quantity_received-coalesce(sum(ri.quantity),0) into v_remaining
      from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id
      where ri.source_goods_receipt_item_id=v_source_line and r.status='posted';
      if v_qty>v_remaining then raise exception 'Kuantitas melebihi sisa yang dapat diretur.'; end if;
      insert into public.sales_return_items(return_id,source_goods_receipt_item_id,product_id,product_variant_id,product_unit_id,quantity,inventory_status,product_name_snapshot,variant_sku_snapshot,variant_name_snapshot)
      values(v_return_id,v_source_line,v_line.product_id,v_line.product_variant_id,v_unit,v_qty,v_line.inventory_status,v_line.product_name,v_line.variant_sku,v_line.variant_name);
    end if;
  end loop;
  if exists(select 1 from public.sales_return_items where return_id=v_return_id and product_unit_id is not null group by product_unit_id having count(*)>1) then
    raise exception 'Product Unit tidak boleh muncul lebih dari satu kali dalam satu retur.';
  end if;
  return v_return_id;
end; $$;


create or replace function public.sales_return_post(p_return_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_return public.sales_returns%rowtype; v_doc_status text;
  v_line record; v_source_qty numeric(18,3); v_returned numeric(18,3);
  v_cost numeric(20,6); v_movement uuid; v_tracking text;
begin
  if v_user is null or not public.has_permission('finance.approve') then raise exception 'Permission finance.approve diperlukan untuk posting retur.'; end if;
  select * into v_return from public.sales_returns where id=p_return_id;
  if not found then raise exception 'Retur tidak ditemukan.'; end if;

  -- Global order: source parent -> return header -> source lines -> warehouse -> inventory movement/balance.
  if v_return.return_type='customer' then
    perform 1 from public.delivery_orders where id=v_return.source_delivery_order_id and status in ('posted','partially_returned') for update;
  else
    perform 1 from public.goods_receipts where id=v_return.source_goods_receipt_id and status='posted' for update;
  end if;
  if not found then raise exception 'Dokumen sumber tidak lagi berstatus posted.'; end if;

  select * into v_return from public.sales_returns where id=p_return_id for update;
  if v_return.status<>'approved' then raise exception 'Retur harus approved dan belum pernah diposting.'; end if;
  if v_return.created_by=v_user then raise exception 'Pembuat retur tidak boleh menjadi poster.'; end if;
  if v_return.approved_by=v_user then raise exception 'Approver tidak boleh memposting retur yang sama.'; end if;
  if v_return.return_type='customer' and not public.has_permission('sales.return') then raise exception 'Permission sales.return diperlukan.'; end if;
  if v_return.return_type='supplier' and not public.has_permission('purchasing.approve') then raise exception 'Permission purchasing.approve diperlukan.'; end if;
  if not public.has_warehouse_access(v_return.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;

  if v_return.return_type='customer' then
    perform 1 from public.delivery_order_items where delivery_order_id=v_return.source_delivery_order_id order by id for update;
  else
    perform 1 from public.goods_receipt_items where goods_receipt_id=v_return.source_goods_receipt_id order by id for update;
  end if;
  perform public.lock_inventory_warehouse(v_return.warehouse_id);

  for v_line in
    select ri.*,p.tracking_type
    from public.sales_return_items ri join public.products p on p.id=ri.product_id
    where ri.return_id=p_return_id order by ri.id for update of ri
  loop
    if v_return.return_type='customer' then
      select doi.quantity into v_source_qty from public.delivery_order_items doi
      where doi.id=v_line.source_delivery_order_item_id and doi.delivery_order_id=v_return.source_delivery_order_id;
      select coalesce(sum(ri.quantity),0) into v_returned from public.sales_return_items ri
      join public.sales_returns r on r.id=ri.return_id
      where ri.source_delivery_order_item_id=v_line.source_delivery_order_item_id
        and (r.status='posted' or (ri.return_id=p_return_id and ri.id<v_line.id));
      if v_line.quantity>v_source_qty-v_returned then raise exception 'Kuantitas customer return melebihi sisa sumber.'; end if;
      if v_line.product_unit_id is not null and exists (
        select 1 from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id
        where ri.source_delivery_order_item_id=v_line.source_delivery_order_item_id
          and ri.product_unit_id=v_line.product_unit_id and r.status='posted'
      ) then raise exception 'Product Unit sudah pernah diretur dari sumber ini.'; end if;
      if v_line.tracking_type='serial' and (v_line.product_unit_id is null or v_line.quantity<>1) then raise exception 'Serial return wajib satu unit.'; end if;
      if v_line.tracking_type in ('imei','serial') and v_line.quantity<>trunc(v_line.quantity) then raise exception 'IMEI/serial quantity harus bulat.'; end if;
      if v_line.product_unit_id is not null and not exists (
        select 1 from public.delivery_order_items doi where doi.id=v_line.source_delivery_order_item_id and doi.product_unit_id=v_line.product_unit_id
      ) then raise exception 'Product Unit tidak cocok dengan DO line.'; end if;
      select abs(vl.inventory_value_delta)/nullif(abs(vl.quantity_delta),0) into v_cost
      from public.delivery_order_items doi
      join public.inventory_valuation_logs vl on vl.inventory_movement_id=doi.inventory_movement_id
      where doi.id=v_line.source_delivery_order_item_id and vl.transaction_type='sale';
      if v_line.product_unit_id is not null then
        select pu.unit_cost into v_cost from public.product_units pu where pu.id=v_line.product_unit_id;
      end if;
      if v_cost is null or v_cost<0 then raise exception 'Historical inventory cost customer return tidak valid.'; end if;
    else
      select gri.quantity_received into v_source_qty from public.goods_receipt_items gri
      where gri.id=v_line.source_goods_receipt_item_id and gri.goods_receipt_id=v_return.source_goods_receipt_id;
      select coalesce(sum(ri.quantity),0) into v_returned from public.sales_return_items ri
      join public.sales_returns r on r.id=ri.return_id
      where ri.source_goods_receipt_item_id=v_line.source_goods_receipt_item_id
        and (r.status='posted' or (ri.return_id=p_return_id and ri.id<v_line.id));
      if v_line.quantity>v_source_qty-v_returned then raise exception 'Kuantitas supplier return melebihi sisa sumber.'; end if;
      if v_line.product_unit_id is not null and exists (
        select 1 from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id
        where ri.source_goods_receipt_item_id=v_line.source_goods_receipt_item_id
          and ri.product_unit_id=v_line.product_unit_id and r.status='posted'
      ) then raise exception 'Product Unit sudah pernah diretur dari sumber ini.'; end if;
      if v_line.tracking_type='serial' and (v_line.product_unit_id is null or v_line.quantity<>1) then raise exception 'Serial return wajib satu unit.'; end if;
      if v_line.tracking_type in ('imei','serial') and v_line.quantity<>trunc(v_line.quantity) then raise exception 'IMEI/serial quantity harus bulat.'; end if;
      if v_line.product_unit_id is not null and not exists (
        select 1 from public.goods_receipt_units gru join public.product_units pu on pu.unit_code=gru.unit_code
        where gru.goods_receipt_item_id=v_line.source_goods_receipt_item_id
          and pu.id=v_line.product_unit_id and pu.product_variant_id=v_line.product_variant_id
          and pu.warehouse_id=v_return.warehouse_id and pu.unit_status=v_line.inventory_status
      ) then raise exception 'Product Unit tidak lagi berada pada warehouse/status sumber.'; end if;
      v_cost:=null; -- supplier return is valued at current warehouse average cost by the inventory engine.
    end if;

    insert into public.inventory_movements(
      product_id,product_variant_id,warehouse_id,product_unit_id,movement_type,status,
      quantity_delta,inventory_status,source_reference_type,source_reference_id,source_reference_number,
      notes,created_by,approved_by,approved_at
    ) values (
      v_line.product_id,v_line.product_variant_id,v_return.warehouse_id,v_line.product_unit_id,
      case when v_return.return_type='customer' then 'customer_return' else 'supplier_return' end,
      'draft',
      case when v_return.return_type='customer' then v_line.quantity else -v_line.quantity end,
      case when v_return.return_type='customer' then 'quarantine' else v_line.inventory_status end,
      case when v_return.return_type='customer' then 'customer_return' else 'supplier_return' end,
      v_line.id,v_return.return_number,
      concat_ws(' — ','Returns',v_return.return_number),v_return.created_by,v_return.approved_by,v_return.approved_at
    ) returning id into v_movement;

    update public.sales_return_items set inventory_movement_id=v_movement where id=v_line.id;
    perform public.post_inventory_movement_unlocked(v_movement,v_cost);
  end loop;

  update public.sales_returns set status='posted',posted_by=v_user,posted_at=now(),updated_at=now() where id=p_return_id;
  return p_return_id;
end; $$;

revoke all on function public.sales_return_create_draft(text,uuid,date,text,text,jsonb) from public,anon;
revoke all on function public.sales_return_approve(uuid) from public,anon;
revoke all on function public.sales_return_post(uuid) from public,anon;
grant execute on function public.sales_return_create_draft(text,uuid,date,text,text,jsonb) to authenticated;
grant execute on function public.sales_return_approve(uuid) to authenticated;
grant execute on function public.sales_return_post(uuid) to authenticated;


create or replace function public.enforce_sales_order_imei_on_delivery_item() returns trigger language plpgsql set search_path='' as $$ declare v_tracking text; begin select p.tracking_type into v_tracking from public.products p where p.id=new.product_id; if v_tracking='imei' then if new.product_unit_id is null then raise exception 'Produk IMEI wajib menggunakan unit yang dipilih pada Sales Order.'; end if; if not exists(select 1 from public.sales_order_item_units sou where sou.sales_order_item_id=new.sales_order_item_id and sou.product_unit_id=new.product_unit_id) then raise exception 'IMEI Delivery Order harus berasal dari pilihan IMEI pada Sales Order.'; end if; if new.quantity<>1 then raise exception 'Setiap IMEI harus menjadi satu unit pada Delivery Order.'; end if; end if; return new; end; $$;
drop trigger if exists delivery_order_item_imei_from_so on public.delivery_order_items;
create trigger delivery_order_item_imei_from_so before insert or update of sales_order_item_id,product_id,quantity,product_unit_id on public.delivery_order_items for each row execute function public.enforce_sales_order_imei_on_delivery_item();
revoke all on function public.enforce_sales_order_imei_on_delivery_item() from public,anon,authenticated;