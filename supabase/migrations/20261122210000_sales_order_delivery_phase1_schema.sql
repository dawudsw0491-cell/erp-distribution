-- Sales Phase 1: Sales Order and Delivery Order schema foundation.
-- Source-only migration. Do not apply until the complete posting bridge and RPC
-- implementation have passed review and explicit Development approval.

create sequence if not exists public.sales_order_number_seq;
create sequence if not exists public.delivery_order_number_seq;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  sales_order_number varchar(40) not null unique
    default ('SO-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.sales_order_number_seq')::text, 6, '0')),
  customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on update restrict on delete restrict,
  order_date date not null default current_date,
  status varchar(20) not null default 'draft'
    check (status in ('draft','confirmed','partially_delivered','delivered','cancelled')),
  notes text,
  subtotal numeric(20,2) not null default 0 check (subtotal >= 0),
  created_by uuid not null default auth.uid(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_orders_confirmation_metadata check (
    (status in ('draft','cancelled') and confirmed_at is null)
    or (status in ('confirmed','partially_delivered','delivered') and confirmed_at is not null)
    or status = 'cancelled'
  )
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on update restrict on delete restrict,
  product_variant_id uuid not null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(20,2) not null check (unit_price >= 0),
  line_total numeric(20,2) generated always as (round(quantity * unit_price, 2)) stored,
  notes text,
  created_at timestamptz not null default now(),
  constraint sales_order_item_variant_parent_fk
    foreign key (product_variant_id, product_id)
    references public.product_variants(id, product_id)
    on update restrict on delete restrict
);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  delivery_order_number varchar(40) not null unique
    default ('DO-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.delivery_order_number_seq')::text, 6, '0')),
  sales_order_id uuid not null references public.sales_orders(id) on update restrict on delete restrict,
  customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on update restrict on delete restrict,
  delivery_date date not null default current_date,
  status varchar(20) not null default 'draft'
    check (status in ('draft','posted','cancelled')),
  notes text,
  created_by uuid not null default auth.uid(),
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_orders_post_metadata check (
    (status = 'posted' and posted_by is not null and posted_at is not null)
    or (status <> 'posted' and posted_by is null and posted_at is null)
  )
);

create table if not exists public.delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.delivery_orders(id) on delete restrict,
  sales_order_item_id uuid not null references public.sales_order_items(id) on update restrict on delete restrict,
  product_id uuid not null references public.products(id) on update restrict on delete restrict,
  product_variant_id uuid not null,
  quantity numeric(18,3) not null check (quantity > 0),
  inventory_movement_id uuid unique references public.inventory_movements(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  constraint delivery_order_item_variant_parent_fk
    foreign key (product_variant_id, product_id)
    references public.product_variants(id, product_id)
    on update restrict on delete restrict
);

create index if not exists idx_sales_orders_customer_date
  on public.sales_orders(customer_id, order_date desc);
create index if not exists idx_sales_orders_status_priority
  on public.sales_orders(status, confirmed_at, sales_order_number, id);
create index if not exists idx_sales_order_items_order
  on public.sales_order_items(sales_order_id);
create index if not exists idx_delivery_orders_sales_order
  on public.delivery_orders(sales_order_id, created_at);
create index if not exists idx_delivery_orders_status_date
  on public.delivery_orders(status, delivery_date desc);
create index if not exists idx_delivery_order_items_header
  on public.delivery_order_items(delivery_order_id);
create index if not exists idx_delivery_order_items_source_line
  on public.delivery_order_items(sales_order_item_id);

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;

drop policy if exists sales_orders_read on public.sales_orders;
create policy sales_orders_read on public.sales_orders
for select to authenticated
using (public.has_permission('sales.view') and public.has_warehouse_access(warehouse_id));

drop policy if exists sales_order_items_read on public.sales_order_items;
create policy sales_order_items_read on public.sales_order_items
for select to authenticated
using (public.has_permission('sales.view') and exists (
  select 1 from public.sales_orders so
  where so.id = sales_order_items.sales_order_id
    and public.has_warehouse_access(so.warehouse_id)
));

drop policy if exists delivery_orders_read on public.delivery_orders;
create policy delivery_orders_read on public.delivery_orders
for select to authenticated
using (public.has_permission('sales.view') and public.has_warehouse_access(warehouse_id));

drop policy if exists delivery_order_items_read on public.delivery_order_items;
create policy delivery_order_items_read on public.delivery_order_items
for select to authenticated
using (public.has_permission('sales.view') and exists (
  select 1 from public.delivery_orders d
  where d.id = delivery_order_items.delivery_order_id
    and public.has_warehouse_access(d.warehouse_id)
));

revoke all on public.sales_orders, public.sales_order_items,
  public.delivery_orders, public.delivery_order_items from anon, authenticated;
grant select on public.sales_orders, public.sales_order_items,
  public.delivery_orders, public.delivery_order_items to authenticated;
grant usage, select on sequence public.sales_order_number_seq,
  public.delivery_order_number_seq to authenticated;

comment on table public.sales_orders is
  'Sales Phase 1: order header. Reservation is derived from confirmed line quantity less posted DO quantity.';
comment on table public.sales_order_items is
  'Sales Phase 1: order lines reference canonical Product Variant and parent Product.';
comment on table public.delivery_orders is
  'Sales Phase 1: delivery header. Posting is the only sales inventory recognition boundary.';
comment on table public.delivery_order_items is
  'Sales Phase 1: partial delivery quantities against original Sales Order lines.';


-- Read model for deterministic soft reservation and partial fulfillment.
-- Reservation is not a separate ledger: it is derived from confirmed SO
-- lines and quantities in posted delivery notes.
create or replace view public.sales_order_line_fulfillment
with (security_invoker = true)
as
select
  soi.id as sales_order_item_id,
  soi.sales_order_id,
  soi.product_id,
  soi.product_variant_id,
  soi.quantity as ordered_quantity,
  coalesce(sum(case when d.status = 'posted' then doi.quantity else 0 end), 0)::numeric(18,3)
    as delivered_quantity,
  greatest(
    soi.quantity - coalesce(sum(case when d.status = 'posted' then doi.quantity else 0 end), 0),
    0
  )::numeric(18,3) as outstanding_quantity
from public.sales_order_items soi
join public.sales_orders so on so.id = soi.sales_order_id
left join public.delivery_order_items doi on doi.sales_order_item_id = soi.id
left join public.delivery_orders d on d.id = doi.delivery_order_id
group by soi.id, soi.sales_order_id, soi.product_id, soi.product_variant_id, soi.quantity;

revoke all on public.sales_order_line_fulfillment from anon, authenticated;
grant select on public.sales_order_line_fulfillment to authenticated;



-- All writes are performed through authenticated, permission-checked RPCs.
create or replace function public.sales_create_order(
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
  v_order_id uuid;
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
  if not public.has_warehouse_access(p_warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;
  if not exists (select 1 from public.customers c where c.id=p_customer_id and c.is_active) then
    raise exception 'Pelanggan tidak ditemukan atau tidak aktif.';
  end if;
  if length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Catatan Sales Order maksimal 2000 karakter.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Sales Order wajib memiliki minimal satu baris.';
  end if;

  insert into public.sales_orders(customer_id, warehouse_id, order_date, notes, created_by)
  values (p_customer_id, p_warehouse_id, coalesce(p_order_date,current_date), nullif(btrim(p_notes),''), v_user_id)
  returning id into v_order_id;

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
    join public.products p on p.id=pv.product_id
    where pv.id=v_variant_id and pv.is_active and p.is_active;
    if not found then raise exception 'Product Variant tidak ditemukan atau tidak aktif.'; end if;

    if v_tracking in ('imei','serial') and v_quantity <> trunc(v_quantity) then
      raise exception 'Produk IMEI/serial wajib menggunakan kuantitas bilangan bulat.';
    end if;

    insert into public.sales_order_items(
      sales_order_id, product_id, product_variant_id, quantity, unit_price
    ) values (v_order_id, v_product_id, v_variant_id, v_quantity, v_unit_price);
  end loop;

  update public.sales_orders
  set subtotal = coalesce((
    select sum(i.line_total)
    from public.sales_order_items i
    where i.sales_order_id = v_order_id
  ),0)
  where id = v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.sales_confirm_order(p_sales_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.sales_orders%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;
  select * into v_order from public.sales_orders
  where id=p_sales_order_id for update;
  if not found then raise exception 'Sales Order tidak ditemukan.'; end if;
  if not public.has_warehouse_access(v_order.warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;
  if v_order.status <> 'draft' then raise exception 'Hanya Sales Order draft yang dapat dikonfirmasi.'; end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id=v_order.id) then
    raise exception 'Sales Order kosong tidak dapat dikonfirmasi.';
  end if;

  update public.sales_orders so
  set status='confirmed',
      subtotal=coalesce((select sum(i.line_total) from public.sales_order_items i where i.sales_order_id=so.id),0),
      confirmed_by=v_user_id,
      confirmed_at=clock_timestamp(),
      updated_at=now()
  where so.id=v_order.id;
  return v_order.id;
end;
$$;

create or replace function public.sales_cancel_order(p_sales_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.sales_orders%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;
  select * into v_order from public.sales_orders
  where id=p_sales_order_id for update;
  if not found then raise exception 'Sales Order tidak ditemukan.'; end if;
  if not public.has_warehouse_access(v_order.warehouse_id) then
    raise exception 'Akses warehouse ditolak.';
  end if;
  if v_order.status not in ('draft','confirmed') then
    raise exception 'Status Sales Order tidak dapat dibatalkan.';
  end if;
  if exists (
    select 1 from public.delivery_order_items doi
    join public.delivery_orders d on d.id=doi.delivery_order_id
    join public.sales_order_items soi on soi.id=doi.sales_order_item_id
    where soi.sales_order_id=v_order.id and d.status='posted'
  ) then
    raise exception 'Sales Order dengan pengiriman terposting tidak dapat dibatalkan.';
  end if;

  -- A cancelled SO cannot retain an actionable draft DO.
  update public.delivery_orders
  set status='cancelled', updated_at=now()
  where sales_order_id=v_order.id and status='draft';

  update public.sales_orders
  set status='cancelled', cancelled_by=v_user_id, cancelled_at=now(), updated_at=now()
  where id=v_order.id;
  return v_order.id;
end;
$$;

revoke all on function public.sales_create_order(uuid,uuid,date,text,jsonb) from public, anon;
revoke all on function public.sales_confirm_order(uuid) from public, anon;
revoke all on function public.sales_cancel_order(uuid) from public, anon;
grant execute on function public.sales_create_order(uuid,uuid,date,text,jsonb) to authenticated;
grant execute on function public.sales_confirm_order(uuid) to authenticated;
grant execute on function public.sales_cancel_order(uuid) to authenticated;


alter table public.delivery_order_items
  add column if not exists product_unit_id uuid
  references public.product_units(id) on update restrict on delete restrict;

create index if not exists idx_delivery_order_items_product_unit
  on public.delivery_order_items(product_unit_id)
  where product_unit_id is not null;

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

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Delivery Order wajib memiliki minimal satu baris.';
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

revoke all on function public.sales_create_delivery_order(uuid,date,text,jsonb) from public, anon;
grant execute on function public.sales_create_delivery_order(uuid,date,text,jsonb) to authenticated;
