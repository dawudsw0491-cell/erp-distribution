create table if not exists public.sales_order_item_units (
 id uuid primary key default gen_random_uuid(),
 sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
 product_unit_id uuid not null references public.product_units(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique (sales_order_item_id,product_unit_id)
);
create index if not exists idx_sales_order_item_units_line on public.sales_order_item_units(sales_order_item_id);
create index if not exists idx_sales_order_item_units_unit on public.sales_order_item_units(product_unit_id);
alter table public.sales_order_item_units enable row level security;
drop policy if exists sales_order_item_units_read on public.sales_order_item_units;
create policy sales_order_item_units_read on public.sales_order_item_units for select to authenticated using (
 exists (select 1 from public.sales_order_items soi join public.sales_orders so on so.id=soi.sales_order_id
 where soi.id=sales_order_item_units.sales_order_item_id and public.has_warehouse_access(so.warehouse_id) and public.has_permission('sales.view'))
);
grant select on public.sales_order_item_units to authenticated;
