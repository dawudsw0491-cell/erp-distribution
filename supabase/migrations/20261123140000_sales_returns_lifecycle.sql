-- RET-001 Returns lifecycle foundation.
-- Source-controlled only: do not apply to connected Development before clean-baseline replay.
-- Customer returns enter quarantine; supplier returns use current warehouse average cost.
create sequence if not exists public.sales_return_number_seq;

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_number varchar(48) not null unique default (
    'RET-' || to_char(current_date,'YYYYMMDD') || '-' ||
    lpad(nextval('public.sales_return_number_seq')::text,6,'0')
  ),
  return_type varchar(16) not null check (return_type in ('customer','supplier')),
  source_delivery_order_id uuid references public.delivery_orders(id) on update restrict on delete restrict,
  source_goods_receipt_id uuid references public.goods_receipts(id) on update restrict on delete restrict,
  customer_id uuid references public.customers(id) on update restrict on delete restrict,
  supplier_id uuid references public.suppliers(id) on update restrict on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on update restrict on delete restrict,
  return_date date not null default current_date,
  reason varchar(500) not null,
  notes text,
  status varchar(16) not null default 'draft'
    check (status in ('draft','approved','posted','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  constraint sales_returns_source_shape check (
    (return_type='customer' and source_delivery_order_id is not null and source_goods_receipt_id is null
      and customer_id is not null and supplier_id is null)
    or
    (return_type='supplier' and source_goods_receipt_id is not null and source_delivery_order_id is null
      and supplier_id is not null and customer_id is null)
  ),
  constraint sales_returns_approval_metadata check (
    (status in ('approved','posted') and approved_by is not null and approved_at is not null)
    or (status in ('draft','cancelled') and approved_by is null and approved_at is null)
  ),
  constraint sales_returns_post_metadata check (
    (status='posted' and posted_by is not null and posted_at is not null)
    or (status<>'posted' and posted_by is null and posted_at is null)
  )
);

create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on update restrict on delete restrict,
  source_delivery_order_item_id uuid references public.delivery_order_items(id) on update restrict on delete restrict,
  source_goods_receipt_item_id uuid references public.goods_receipt_items(id) on update restrict on delete restrict,
  product_id uuid not null references public.products(id) on update restrict on delete restrict,
  product_variant_id uuid not null,
  product_unit_id uuid references public.product_units(id) on update restrict on delete restrict,
  quantity numeric(18,3) not null check (quantity > 0),
  inventory_status varchar(20) not null check (inventory_status in ('available','reserved','quarantine','damaged','repair')),
  product_name_snapshot varchar(255) not null,
  variant_sku_snapshot varchar(120) not null,
  variant_name_snapshot varchar(255) not null,
  inventory_movement_id uuid unique references public.inventory_movements(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  constraint sales_return_item_source_shape check (
    (source_delivery_order_item_id is not null and source_goods_receipt_item_id is null)
    or (source_delivery_order_item_id is null and source_goods_receipt_item_id is not null)
  ),
  constraint sales_return_item_variant_parent_fk foreign key (product_variant_id,product_id)
    references public.product_variants(id,product_id) on update restrict on delete restrict
);

create index sales_returns_type_status_date_idx on public.sales_returns(return_type,status,return_date desc);
create index sales_returns_customer_idx on public.sales_returns(customer_id,created_at desc);
create index sales_returns_supplier_idx on public.sales_returns(supplier_id,created_at desc);
create index sales_return_items_return_idx on public.sales_return_items(return_id);
create index sales_return_items_do_source_idx on public.sales_return_items(source_delivery_order_item_id);
create index sales_return_items_gr_source_idx on public.sales_return_items(source_goods_receipt_item_id);
create index sales_return_items_unit_idx on public.sales_return_items(product_unit_id) where product_unit_id is not null;

alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
create policy sales_returns_read on public.sales_returns for select to authenticated using (
  public.has_warehouse_access(warehouse_id)
  and ((return_type='customer' and public.has_permission('sales.view'))
    or (return_type='supplier' and public.has_permission('purchasing.view')))
);
create policy sales_return_items_read on public.sales_return_items for select to authenticated using (
  exists (select 1 from public.sales_returns r where r.id=return_id
    and public.has_warehouse_access(r.warehouse_id)
    and ((r.return_type='customer' and public.has_permission('sales.view'))
      or (r.return_type='supplier' and public.has_permission('purchasing.view'))))
);
revoke all on public.sales_returns,public.sales_return_items from public,anon,authenticated;
grant select on public.sales_returns,public.sales_return_items to authenticated;
revoke all on sequence public.sales_return_number_seq from public,anon,authenticated;
grant usage,select on sequence public.sales_return_number_seq to authenticated;

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
    if not found or v_doc.status<>'posted' then raise exception 'Sumber customer return harus Delivery Order posted.'; end if;
    if not public.has_warehouse_access(v_doc.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
    insert into public.sales_returns(return_type,source_delivery_order_id,customer_id,warehouse_id,return_date,reason,notes,created_by)
    values('customer',v_doc.id,v_doc.customer_id,v_doc.warehouse_id,p_return_date,btrim(p_reason),nullif(btrim(p_notes),''),v_user)
    returning id into v_return_id;
  else
    if not public.has_permission('purchasing.create') then raise exception 'Permission purchasing.create diperlukan.'; end if;
    select g.id,g.supplier_id,g.warehouse_id,g.receipt_number,g.status
      into v_doc from public.goods_receipts g where g.id=p_source_document_id;
    if not found or v_doc.status<>'posted' then raise exception 'Sumber supplier return harus Goods Receipt posted.'; end if;
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

create or replace function public.sales_return_approve(p_return_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_return public.sales_returns%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_return from public.sales_returns where id=p_return_id for update;
  if not found or v_return.status<>'draft' then raise exception 'Hanya retur draft yang dapat disetujui.'; end if;
  if v_return.created_by=v_user then raise exception 'Pembuat retur tidak boleh menyetujui retur sendiri.'; end if;
  if v_return.return_type='customer' and not public.has_permission('sales.return') then raise exception 'Permission sales.return diperlukan.'; end if;
  if v_return.return_type='supplier' and not public.has_permission('purchasing.approve') then raise exception 'Permission purchasing.approve diperlukan.'; end if;
  update public.sales_returns set status='approved',approved_by=v_user,approved_at=now(),updated_at=now() where id=p_return_id;
  return p_return_id;
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
    perform 1 from public.delivery_orders where id=v_return.source_delivery_order_id and status='posted' for update;
  else
    perform 1 from public.goods_receipts where id=v_return.source_goods_receipt_id and status='posted' for update;
  end if;
  if not found then raise exception 'Dokumen sumber tidak lagi berstatus posted.'; end if;

  select * into v_return from public.sales_returns where id=p_return_id for update;
  if v_return.status<>'approved' then raise exception 'Retur harus approved dan belum pernah diposting.'; end if;
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

CREATE OR REPLACE FUNCTION public.post_inventory_movement_unlocked(p_movement_id uuid, p_unit_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

DECLARE
    v_user_id UUID;
    v_product_id UUID;
    v_movement RECORD;
    v_tracking_type VARCHAR(30);
    v_balance RECORD;

    v_quantity NUMERIC(18,3);
    v_quantity_before NUMERIC(18,3);
    v_quantity_after NUMERIC(18,3);

    v_value_before NUMERIC(20,4);
    v_value_after NUMERIC(20,4);
    v_value_delta NUMERIC(20,4);

    v_average_before NUMERIC(20,6);
    v_average_after NUMERIC(20,6);

    v_unit_status VARCHAR(30);
    v_bucket_before NUMERIC(18,3);

    v_has_imei1 BOOLEAN;
    v_has_serial BOOLEAN;

BEGIN

    -- ========================================================
    -- 1. AUTHENTICATION AND AUTHORIZATION
    -- ========================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;


    -- ========================================================
    -- 2. LOCK AND READ MOVEMENT
    -- ========================================================

    SELECT *
    INTO v_movement
    FROM public.inventory_movements
    WHERE id = p_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory movement tidak ditemukan.';
    END IF;


    IF v_movement.movement_type = 'sale' THEN
        IF v_movement.source_reference_type IS DISTINCT FROM 'delivery_order'
           OR v_movement.source_reference_id IS NULL
           OR v_movement.quantity_delta >= 0
           OR v_movement.inventory_status <> 'available'
           OR NOT public.has_permission('sales.create')
           OR NOT public.has_warehouse_access(v_movement.warehouse_id)
           OR NOT EXISTS (
               SELECT 1
               FROM public.delivery_order_items doi
               JOIN public.delivery_orders d
                 ON d.id = doi.delivery_order_id
               JOIN public.sales_order_items soi
                 ON soi.id = doi.sales_order_item_id
               WHERE doi.id = v_movement.source_reference_id
                 AND doi.inventory_movement_id = v_movement.id
                 AND d.status = 'draft'
                 AND d.warehouse_id = v_movement.warehouse_id
                 AND doi.product_id = v_movement.product_id
                 AND doi.product_variant_id = v_movement.product_variant_id
                 AND doi.product_unit_id IS NOT DISTINCT FROM v_movement.product_unit_id
                 AND v_movement.quantity_delta = -doi.quantity
                 AND soi.product_id = doi.product_id
                 AND soi.product_variant_id = doi.product_variant_id
                 AND d.sales_order_id = soi.sales_order_id
                 AND v_movement.created_by = v_user_id
           ) THEN
            RAISE EXCEPTION
                'Movement sale hanya dapat diposting melalui Delivery Order yang valid.';
        END IF;
    ELSIF v_movement.movement_type = 'customer_return' THEN
        IF NOT public.has_permission('sales.return')
           OR NOT public.has_permission('finance.approve')
           OR v_movement.source_reference_type IS DISTINCT FROM 'customer_return'
           OR NOT EXISTS (
               SELECT 1 FROM public.sales_returns r
               JOIN public.sales_return_items ri ON ri.return_id = r.id
               WHERE ri.id = v_movement.source_reference_id
                 AND ri.inventory_movement_id = v_movement.id
                 AND r.return_type = 'customer' AND r.status = 'approved'
           ) THEN
            RAISE EXCEPTION 'Customer return hanya dapat diposting melalui Returns approved dengan permission yang sesuai.';
        END IF;
    ELSIF v_movement.movement_type = 'supplier_return' THEN
        IF NOT public.has_permission('purchasing.approve')
           OR NOT public.has_permission('finance.approve')
           OR v_movement.source_reference_type IS DISTINCT FROM 'supplier_return'
           OR NOT EXISTS (
               SELECT 1 FROM public.sales_returns r
               JOIN public.sales_return_items ri ON ri.return_id = r.id
               WHERE ri.id = v_movement.source_reference_id
                 AND ri.inventory_movement_id = v_movement.id
                 AND r.return_type = 'supplier' AND r.status = 'approved'
           ) THEN
            RAISE EXCEPTION 'Supplier return hanya dapat diposting melalui Returns approved dengan permission yang sesuai.';
        END IF;
    ELSIF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.update.';
    END IF;

    IF v_movement.status <> 'draft' THEN
        RAISE EXCEPTION
            'Hanya movement draft yang dapat diposting.';
    END IF;

    IF v_movement.movement_type IN (
        'transfer_in',
        'transfer_out'
    ) THEN
        RAISE EXCEPTION
            'Transfer harus diproses melalui fungsi transfer khusus.';
    END IF;

    IF v_movement.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Reversal harus diproses melalui fungsi reversal khusus.';
    END IF;


    -- ========================================================
    -- 3. APPROVAL VALIDATION
    -- ========================================================

    IF v_movement.movement_type IN (
        'customer_return',
        'supplier_return',
        'opening_balance'
    ) THEN

        IF v_movement.approved_by IS NULL
           OR v_movement.approved_at IS NULL THEN
            RAISE EXCEPTION
                'Transaksi ini wajib mendapatkan approval.';
        END IF;

        IF v_movement.approved_by = v_movement.created_by THEN
            RAISE EXCEPTION
                'Pembuat transaksi tidak boleh menyetujui transaksinya sendiri.';
        END IF;

        IF v_movement.approved_by = v_user_id THEN
            RAISE EXCEPTION
                'Approver tidak boleh melakukan posting transaksinya sendiri.';
        END IF;

        IF NOT public.has_permission('finance.approve') THEN
            RAISE EXCEPTION
                'Posting transaksi ini memerlukan permission finance.approve.';
        END IF;

    END IF;


    -- ========================================================
    -- 4. PRODUCT TRACKING TYPE
    -- ========================================================

    SELECT pv.product_id, p.tracking_type
    INTO v_product_id, v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_movement.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product variant atau produk tidak ditemukan.';
    END IF;

    IF v_movement.product_id IS NOT NULL
       AND v_movement.product_id IS DISTINCT FROM v_product_id THEN
        RAISE EXCEPTION
            'Product ID tidak sesuai dengan parent Product Variant.';
    END IF;


    -- ========================================================
    -- 5. MOVEMENT TYPE AND TRACKING VALIDATION
    -- ========================================================

    IF v_movement.movement_type = 'status_change' THEN

        IF v_tracking_type NOT IN ('imei', 'serial') THEN
            RAISE EXCEPTION
                'Status change hanya didukung untuk produk IMEI/serial.';
        END IF;

        IF v_movement.product_unit_id IS NULL THEN
            RAISE EXCEPTION
                'Status change wajib memiliki product_unit_id.';
        END IF;

        IF v_movement.status_from NOT IN (
            'available', 'reserved', 'quarantine',
            'damaged', 'repair'
        ) OR v_movement.status_to NOT IN (
            'available', 'reserved', 'quarantine',
            'damaged', 'repair'
        ) THEN
            RAISE EXCEPTION 'Status unit tidak valid.';
        END IF;

        IF v_movement.status_from = v_movement.status_to THEN
            RAISE EXCEPTION
                'Status awal dan status tujuan tidak boleh sama.';
        END IF;

    ELSE

        IF v_tracking_type = 'quantity'
           AND v_movement.product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id.';
        END IF;

        IF v_tracking_type = 'serial' THEN

            IF v_movement.product_unit_id IS NULL
               OR ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION
                    'Produk serial wajib diproses satu unit dengan product_unit_id.';
            END IF;

        ELSIF v_tracking_type = 'imei' THEN

            IF v_movement.product_unit_id IS NULL
               AND v_movement.quantity_delta <> TRUNC(v_movement.quantity_delta) THEN
                RAISE EXCEPTION
                    'Aggregate IMEI movement harus menggunakan kuantitas bilangan bulat.';
            END IF;

            IF v_movement.product_unit_id IS NOT NULL
               AND ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION
                    'Unit IMEI individual hanya boleh diproses satu unit.';
            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- 6. VALIDATE SERIALIZED IDENTIFIERS
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL
       AND v_movement.movement_type <> 'status_change' THEN

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'IMEI_1'
        )
        INTO v_has_imei1;

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'SERIAL_NUMBER'
        )
        INTO v_has_serial;

        IF v_tracking_type = 'imei' AND NOT v_has_imei1 THEN
            RAISE EXCEPTION
                'IMEI_1 wajib tersedia sebelum posting.';
        END IF;

        IF v_tracking_type = 'serial' AND NOT v_has_serial THEN
            RAISE EXCEPTION
                'SERIAL_NUMBER wajib tersedia sebelum posting.';
        END IF;

    END IF;


    -- ========================================================
    -- 7. PREPARE AND LOCK INVENTORY BALANCE
    -- ========================================================

    INSERT INTO public.inventory_balances (
        product_variant_id,
        product_id,
        warehouse_id
    )
    VALUES (
        v_movement.product_variant_id,
        v_product_id,
        v_movement.warehouse_id
    )
    ON CONFLICT (product_variant_id, warehouse_id) WHERE product_variant_id IS NOT NULL
    DO NOTHING;

    SELECT *
    INTO v_balance
    FROM public.inventory_balances
    WHERE product_variant_id = v_movement.product_variant_id
      AND warehouse_id = v_movement.warehouse_id
    FOR UPDATE;

    v_quantity_before := v_balance.on_hand_quantity;
    v_value_before := v_balance.inventory_value;
    v_average_before := v_balance.average_unit_cost;


    -- ========================================================
    -- 8. STATUS CHANGE FOR SERIALIZED UNIT
    -- ========================================================

    IF v_movement.movement_type = 'status_change' THEN

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_movement.product_unit_id
          AND product_variant_id = v_movement.product_variant_id
          AND warehouse_id = v_movement.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Product unit tidak ditemukan di warehouse terkait.';
        END IF;

        IF v_unit_status <> v_movement.status_from THEN
            RAISE EXCEPTION
                'Status unit aktual tidak sesuai status_from.';
        END IF;

        UPDATE public.inventory_balances
        SET
            available_quantity =
                available_quantity
                + CASE WHEN v_movement.status_from = 'available' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'available' THEN 1 ELSE 0 END,

            reserved_quantity =
                reserved_quantity
                + CASE WHEN v_movement.status_from = 'reserved' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'reserved' THEN 1 ELSE 0 END,

            quarantine_quantity =
                quarantine_quantity
                + CASE WHEN v_movement.status_from = 'quarantine' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'quarantine' THEN 1 ELSE 0 END,

            damaged_quantity =
                damaged_quantity
                + CASE WHEN v_movement.status_from = 'damaged' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'damaged' THEN 1 ELSE 0 END,

            repair_quantity =
                repair_quantity
                + CASE WHEN v_movement.status_from = 'repair' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'repair' THEN 1 ELSE 0 END,

            updated_at = NOW()
        WHERE id = v_balance.id;

        UPDATE public.product_units
        SET unit_status = v_movement.status_to
        WHERE id = v_movement.product_unit_id;

        UPDATE public.inventory_movements
        SET
            product_id = v_product_id,
            status = 'posted',
            posted_by = v_user_id,
            posted_at = NOW()
        WHERE id = p_movement_id;

        RETURN p_movement_id;

    END IF;


    -- ========================================================
    -- 9. INVENTORY STATUS AND MOVEMENT DIRECTION
    -- ========================================================

    IF v_movement.inventory_status NOT IN (
        'available',
        'reserved',
        'quarantine',
        'damaged',
        'repair'
    ) THEN
        RAISE EXCEPTION 'Inventory status tidak valid.';
    END IF;

    IF v_movement.movement_type = 'customer_return' THEN

        IF v_movement.quantity_delta <= 0 THEN
            RAISE EXCEPTION
                'Customer return harus menambah persediaan.';
        END IF;

        IF v_movement.inventory_status <> 'quarantine' THEN
            RAISE EXCEPTION
                'Customer return wajib masuk quarantine.';
        END IF;

        IF v_movement.source_reference_id IS NULL
           OR v_movement.source_reference_type IS NULL THEN
            RAISE EXCEPTION
                'Customer return wajib memiliki referensi transaksi penjualan asal.';
        END IF;

    END IF;

    IF v_movement.movement_type = 'supplier_return'
       AND v_movement.quantity_delta >= 0 THEN
        RAISE EXCEPTION
            'Supplier return harus mengurangi persediaan.';
    END IF;


    -- ========================================================
    -- 10. SERIALIZED UNIT VALIDATION
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL THEN

        IF v_movement.movement_type = 'customer_return' THEN

            -- Sold unit has no warehouse.
            -- It must be returned to quarantine at destination warehouse.

            SELECT unit_status
            INTO v_unit_status
            FROM public.product_units
            WHERE id = v_movement.product_unit_id
              AND product_variant_id = v_movement.product_variant_id
              AND warehouse_id IS NULL
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Customer return hanya dapat menerima unit sold yang belum berada di gudang.';
            END IF;

            IF v_unit_status <> 'sold' THEN
                RAISE EXCEPTION
                    'Customer return hanya dapat menerima unit berstatus sold.';
            END IF;

        ELSE

            SELECT unit_status
            INTO v_unit_status
            FROM public.product_units
            WHERE id = v_movement.product_unit_id
              AND product_variant_id = v_movement.product_variant_id
              AND warehouse_id = v_movement.warehouse_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Product unit tidak ditemukan di warehouse terkait.';
            END IF;

            IF v_movement.quantity_delta > 0
               AND v_unit_status IN ('sold', 'in_transit', 'returned_to_supplier') THEN
                RAISE EXCEPTION
                    'Unit tidak dapat diterima dengan status saat ini.';
            END IF;

            IF v_movement.quantity_delta < 0
               AND v_unit_status <> v_movement.inventory_status THEN
                RAISE EXCEPTION
                    'Status unit tidak sesuai dengan inventory_status movement.';
            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- 11. VALIDATE OUTBOUND STOCK BUCKET
    -- ========================================================

    v_quantity := ABS(v_movement.quantity_delta);

    IF v_movement.quantity_delta < 0 THEN

        v_bucket_before :=
            CASE v_movement.inventory_status
                WHEN 'available' THEN v_balance.available_quantity
                WHEN 'reserved' THEN v_balance.reserved_quantity
                WHEN 'quarantine' THEN v_balance.quarantine_quantity
                WHEN 'damaged' THEN v_balance.damaged_quantity
                WHEN 'repair' THEN v_balance.repair_quantity
                ELSE 0
            END;

        IF v_bucket_before < v_quantity THEN
            RAISE EXCEPTION
                'Stok pada bucket % tidak mencukupi. Tersedia: %, diperlukan: %.',
                v_movement.inventory_status,
                v_bucket_before,
                v_quantity;
        END IF;

    END IF;


    -- ========================================================
    -- 12. DETERMINE INVENTORY VALUE
    -- ========================================================

    IF v_movement.quantity_delta > 0 THEN

        IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
            RAISE EXCEPTION
                'Transaksi masuk memerlukan p_unit_cost yang valid.';
        END IF;

        v_value_delta := ROUND(
            v_quantity * p_unit_cost,
            4
        );

    ELSE

        IF v_quantity_before < v_quantity THEN
            RAISE EXCEPTION
                'Total stok tidak mencukupi untuk transaksi keluar.';
        END IF;

        IF v_average_before IS NULL OR v_average_before < 0 THEN
            RAISE EXCEPTION
                'Average unit cost tidak valid.';
        END IF;

        v_value_delta := -ROUND(
            v_quantity * v_average_before,
            4
        );

    END IF;


    -- ========================================================
    -- 13. CALCULATE NEW BALANCE
    -- ========================================================

    v_quantity_after :=
        v_quantity_before + v_movement.quantity_delta;

    v_value_after :=
        v_value_before + v_value_delta;

    IF v_quantity_after < 0 OR v_value_after < 0 THEN
        RAISE EXCEPTION
            'Hasil transaksi menyebabkan saldo negatif.';
    END IF;

    IF v_quantity_after = 0 THEN

        IF ABS(v_value_after) > 0.0001 THEN
            RAISE EXCEPTION
                'Nilai persediaan harus nol ketika kuantitas menjadi nol.';
        END IF;

        v_value_after := 0;
        v_average_after := 0;

    ELSE

        v_average_after := ROUND(
            v_value_after / v_quantity_after,
            6
        );

    END IF;


    -- ========================================================
    -- 14. UPDATE INVENTORY BALANCES
    -- ========================================================

    UPDATE public.inventory_balances
    SET
        available_quantity =
            available_quantity
            + CASE WHEN v_movement.inventory_status = 'available'
                   THEN v_movement.quantity_delta ELSE 0 END,

        reserved_quantity =
            reserved_quantity
            + CASE WHEN v_movement.inventory_status = 'reserved'
                   THEN v_movement.quantity_delta ELSE 0 END,

        quarantine_quantity =
            quarantine_quantity
            + CASE WHEN v_movement.inventory_status = 'quarantine'
                   THEN v_movement.quantity_delta ELSE 0 END,

        damaged_quantity =
            damaged_quantity
            + CASE WHEN v_movement.inventory_status = 'damaged'
                   THEN v_movement.quantity_delta ELSE 0 END,

        repair_quantity =
            repair_quantity
            + CASE WHEN v_movement.inventory_status = 'repair'
                   THEN v_movement.quantity_delta ELSE 0 END,

        on_hand_quantity = v_quantity_after,
        inventory_value = v_value_after,
        average_unit_cost = v_average_after,
        updated_at = NOW()

    WHERE id = v_balance.id;


    -- ========================================================
    -- 15. UPDATE SERIALIZED UNIT STATUS AND LOCATION
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL THEN

        IF v_movement.movement_type = 'customer_return' THEN

            UPDATE public.product_units
            SET
                unit_status = 'quarantine',
                warehouse_id = v_movement.warehouse_id,
                unit_cost = p_unit_cost,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSIF v_movement.movement_type = 'supplier_return' THEN

            UPDATE public.product_units
            SET
                unit_status = 'returned_to_supplier',
                warehouse_id = NULL,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSIF v_movement.quantity_delta > 0 THEN

            UPDATE public.product_units
            SET
                unit_status = v_movement.inventory_status,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSE

            UPDATE public.product_units
            SET
                unit_status = 'sold',
                warehouse_id = NULL,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        END IF;

    END IF;


    -- ========================================================
    -- 16. MARK MOVEMENT AS POSTED
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        product_id = v_product_id,
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id = p_movement_id;


    -- ========================================================
    -- 17. CREATE INVENTORY VALUATION LOG
    -- ========================================================

    INSERT INTO public.inventory_valuation_logs (
        inventory_movement_id,
        product_variant_id,
        product_id,
        warehouse_id,
        transaction_type,
        quantity_before,
        quantity_after,
        quantity_delta,
        value_before,
        value_after,
        inventory_value_delta,
        average_cost_before,
        average_cost_after,
        created_by
    )
    VALUES (
        p_movement_id,
        v_movement.product_variant_id,
        v_product_id,
        v_movement.warehouse_id,
        v_movement.movement_type,
        v_quantity_before,
        v_quantity_after,
        v_movement.quantity_delta,
        v_value_before,
        v_value_after,
        v_value_delta,
        v_average_before,
        v_average_after,
        v_user_id
    );

    RETURN p_movement_id;

END;
$function$


create or replace function public.sales_return_cancel_draft(p_return_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_return public.sales_returns%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_return from public.sales_returns where id=p_return_id for update;
  if not found or v_return.status<>'draft' then raise exception 'Hanya retur draft yang dapat dibatalkan.'; end if;
  if v_return.return_type='customer' and not public.has_permission('sales.return') then raise exception 'Permission sales.return diperlukan.'; end if;
  if v_return.return_type='supplier' and not public.has_permission('purchasing.create') then raise exception 'Permission purchasing.create diperlukan.'; end if;
  update public.sales_returns set status='cancelled',updated_at=now() where id=p_return_id;
  return p_return_id;
end; $$;

revoke all on function public.sales_return_cancel_draft(uuid) from public,anon;
grant execute on function public.sales_return_cancel_draft(uuid) to authenticated;
