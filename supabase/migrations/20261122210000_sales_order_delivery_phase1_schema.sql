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

