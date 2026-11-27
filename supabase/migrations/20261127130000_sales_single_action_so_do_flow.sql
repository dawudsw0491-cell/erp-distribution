alter table public.sales_orders add column if not exists cancellation_reason text;

create or replace function public.sales_create_order_with_payment_terms(
 p_customer_id uuid,p_warehouse_id uuid,p_order_date date,p_notes text,p_items jsonb,
 p_payment_scheme text,p_payment_due_date date
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_user_id uuid:=auth.uid();
begin
 if v_user_id is null or not public.has_permission('sales.create') then raise exception 'Permission sales.create diperlukan.'; end if;
 if p_payment_scheme not in ('cash','bank_transfer','credit') then raise exception 'Skema pembayaran wajib dipilih.'; end if;
 if p_payment_scheme='credit' and (p_payment_due_date is null or p_payment_due_date<coalesce(p_order_date,current_date)) then raise exception 'Tanggal jatuh tempo wajib diisi dan tidak boleh sebelum tanggal SO.'; end if;
 if p_payment_scheme<>'credit' and p_payment_due_date is not null then raise exception 'Jatuh tempo hanya berlaku untuk skema kredit.'; end if;
 v_id:=public.sales_create_order(p_customer_id,p_warehouse_id,p_order_date,p_notes,p_items);
 update public.sales_orders set payment_scheme=p_payment_scheme,payment_due_date=p_payment_due_date,updated_at=now() where id=v_id;
 perform public.sales_confirm_order(v_id);
 return v_id;
end $$;

create or replace function public.sales_create_and_post_delivery_order(
 p_sales_order_id uuid,p_delivery_date date,p_notes text,p_items jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_do_id uuid;
begin
 v_do_id:=public.sales_create_delivery_order(p_sales_order_id,p_delivery_date,p_notes,p_items);
 perform public.sales_post_delivery_order(v_do_id);
 return v_do_id;
end $$;

create or replace function public.sales_cancel_order(p_sales_order_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_order public.sales_orders%rowtype; v_user_id uuid:=auth.uid(); v_reason text:=nullif(btrim(p_reason),'');
begin
 if v_user_id is null or not public.has_permission('sales.create') then raise exception 'Permission sales.create diperlukan.'; end if;
 if v_reason is null or length(v_reason)<5 or length(v_reason)>500 then raise exception 'Alasan pembatalan wajib 5 sampai 500 karakter.'; end if;
 select * into v_order from public.sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales Order tidak ditemukan.'; end if;
 if not public.has_warehouse_access(v_order.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
 if v_order.status not in ('confirmed','draft') then raise exception 'Status Sales Order tidak dapat dibatalkan.'; end if;
 if exists(select 1 from public.delivery_order_items doi join public.delivery_orders d on d.id=doi.delivery_order_id join public.sales_order_items soi on soi.id=doi.sales_order_item_id where soi.sales_order_id=v_order.id and d.status='posted') then
  raise exception 'Sales Order dengan pengiriman terposting tidak dapat dibatalkan.';
 end if;
 update public.delivery_orders set status='cancelled',cancellation_reason='SO dibatalkan: '||v_reason,updated_at=now() where sales_order_id=v_order.id and status='draft';
 update public.sales_orders set status='cancelled',cancelled_by=v_user_id,cancelled_at=now(),cancellation_reason=v_reason,updated_at=now() where id=v_order.id;
 return v_order.id;
end $$;

revoke all on function public.sales_create_and_post_delivery_order(uuid,date,text,jsonb) from public;
grant execute on function public.sales_create_and_post_delivery_order(uuid,date,text,jsonb) to authenticated;
revoke all on function public.sales_cancel_order(uuid,text) from public;
grant execute on function public.sales_cancel_order(uuid,text) to authenticated;
