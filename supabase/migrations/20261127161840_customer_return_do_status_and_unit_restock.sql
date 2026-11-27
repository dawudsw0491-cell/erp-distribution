alter table public.delivery_orders drop constraint if exists delivery_orders_status_check;
alter table public.delivery_orders add constraint delivery_orders_status_check check (status in ('draft','posted','partially_returned','returned','cancelled'));
alter table public.delivery_orders drop constraint if exists delivery_orders_post_metadata;
alter table public.delivery_orders add constraint delivery_orders_post_metadata check (((status in ('posted','partially_returned','returned')) and posted_by is not null and posted_at is not null) or (status in ('draft','cancelled') and posted_by is null and posted_at is null));
alter table public.sales_return_items add column if not exists restock_movement_id uuid unique references public.inventory_movements(id) on update restrict on delete restrict;
create or replace function public.sync_delivery_order_return_status() returns trigger language plpgsql security definer set search_path='' as $$
declare v_total numeric(18,3); v_returned numeric(18,3);
begin
 if new.return_type<>'customer' or new.status<>'posted' or old.status='posted' then return new; end if;
 select coalesce(sum(quantity),0) into v_total from public.delivery_order_items where delivery_order_id=new.source_delivery_order_id;
 select coalesce(sum(ri.quantity),0) into v_returned from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id where r.source_delivery_order_id=new.source_delivery_order_id and r.return_type='customer' and r.status='posted';
 update public.delivery_orders set status=case when v_returned>=v_total then 'returned' else 'partially_returned' end,updated_at=now() where id=new.source_delivery_order_id and status in ('posted','partially_returned');
 return new;
end; $$;
drop trigger if exists sales_returns_sync_delivery_order_status on public.sales_returns;
create trigger sales_returns_sync_delivery_order_status after update of status on public.sales_returns for each row execute function public.sync_delivery_order_return_status();
create or replace function public.sales_return_restock_unit(p_return_item_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_line public.sales_return_items%rowtype; v_return public.sales_returns%rowtype; v_unit public.product_units%rowtype; v_movement uuid;
begin
 if v_user is null or not public.has_permission('sales.return') or not public.has_permission('inventory.update') then raise exception 'Permission sales.return dan inventory.update diperlukan.'; end if;
 select * into v_line from public.sales_return_items where id=p_return_item_id for update;
 if not found or v_line.product_unit_id is null then raise exception 'Baris retur tidak memiliki Product Unit individual.'; end if;
 select * into v_return from public.sales_returns where id=v_line.return_id for update;
 if not found or v_return.return_type<>'customer' or v_return.status<>'posted' then raise exception 'Restok hanya dapat dilakukan dari customer return yang sudah posted.'; end if;
 if v_line.inventory_movement_id is null or v_line.restock_movement_id is not null then raise exception 'Unit belum masuk quarantine atau sudah pernah direstok.'; end if;
 if not public.has_warehouse_access(v_return.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
 perform public.lock_inventory_warehouse(v_return.warehouse_id);
 select * into v_unit from public.product_units where id=v_line.product_unit_id and product_variant_id=v_line.product_variant_id and warehouse_id=v_return.warehouse_id and unit_status='quarantine' for update;
 if not found then raise exception 'Unit tidak berada pada quarantine warehouse retur.'; end if;
 insert into public.inventory_movements(product_id,product_variant_id,warehouse_id,product_unit_id,movement_type,status,quantity_delta,status_from,status_to,source_reference_type,source_reference_id,source_reference_number,notes,created_by)
 values(v_line.product_id,v_line.product_variant_id,v_return.warehouse_id,v_line.product_unit_id,'status_change','draft',0,'quarantine','available','customer_return_restock',v_line.id,v_return.return_number,'Restok setelah pemeriksaan retur',v_user) returning id into v_movement;
 perform public.post_inventory_movement_unlocked(v_movement,null);
 update public.sales_return_items set restock_movement_id=v_movement where id=v_line.id;
 return v_movement;
end; $$;
revoke all on function public.sync_delivery_order_return_status() from public,anon,authenticated;
revoke all on function public.sales_return_restock_unit(uuid) from public,anon;
grant execute on function public.sales_return_restock_unit(uuid) to authenticated;