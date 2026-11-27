-- Sales users need read-only visibility into stock for warehouses they can access.
drop policy if exists sales_stock_visibility on public.inventory_balances;
create policy sales_stock_visibility
on public.inventory_balances
for select
to authenticated
using (
  public.has_permission('sales.create')
  and public.has_warehouse_access(warehouse_id)
);