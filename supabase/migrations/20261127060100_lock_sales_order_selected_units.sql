create or replace function public.sales_create_order_with_payment_terms_and_units(
 p_customer_id uuid,p_warehouse_id uuid,p_order_date date,p_notes text,p_items jsonb,
 p_payment_scheme text,p_payment_due_date date
) returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_order_id uuid; v_item jsonb; v_line_id uuid; v_variant_id uuid; v_unit_id uuid; v_tracking text; v_quantity numeric(18,3); v_unit_ids jsonb;
begin
 if auth.uid() is null or not public.has_permission('sales.create') then raise exception 'Permission sales.create diperlukan.'; end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Sales Order wajib memiliki minimal satu baris.'; end if;
 if exists (select 1 from (select value->>'product_variant_id' variant_id from jsonb_array_elements(p_items)) x group by variant_id having count(*)>1) then raise exception 'Satu Product Variant hanya boleh satu baris dalam SO.'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_variant_id := nullif(v_item->>'product_variant_id','')::uuid; v_quantity := (v_item->>'quantity')::numeric; v_unit_ids := coalesce(v_item->'unit_ids','[]'::jsonb);
   select p.tracking_type into v_tracking from public.product_variants pv join public.products p on p.id=pv.product_id where pv.id=v_variant_id and pv.is_active and p.is_active;
   if not found then raise exception 'Product Variant tidak ditemukan atau tidak aktif.'; end if;
   if jsonb_typeof(v_unit_ids) is distinct from 'array' then raise exception 'Daftar IMEI tidak valid.'; end if;
   if v_tracking in ('imei','serial') and (v_quantity <> trunc(v_quantity) or jsonb_array_length(v_unit_ids) <> v_quantity) then raise exception 'Pilih IMEI/unit sebanyak kuantitas penjualan.'; end if;
   if v_tracking not in ('imei','serial') and jsonb_array_length(v_unit_ids)>0 then raise exception 'Unit IMEI tidak berlaku untuk produk quantity.'; end if;
   perform 1 from public.product_units pu join jsonb_array_elements_text(v_unit_ids) ids(value) on pu.id=ids.value::uuid order by pu.id for update of pu;
   if exists (select 1 from jsonb_array_elements_text(v_unit_ids) ids(value) left join public.product_units pu on pu.id=ids.value::uuid where pu.id is null or pu.product_variant_id<>v_variant_id or pu.warehouse_id<>p_warehouse_id or pu.unit_status<>'available') then raise exception 'IMEI tidak tersedia pada warehouse atau variant yang dipilih.'; end if;
   if (select count(distinct value) from jsonb_array_elements_text(v_unit_ids)) <> jsonb_array_length(v_unit_ids) then raise exception 'IMEI yang sama tidak boleh dipilih lebih dari sekali.'; end if;
   if exists (select 1 from jsonb_array_elements_text(v_unit_ids) ids(value) join public.sales_order_item_units sou on sou.product_unit_id=ids.value::uuid join public.sales_order_items soi on soi.id=sou.sales_order_item_id join public.sales_orders so on so.id=soi.sales_order_id where so.status in ('draft','confirmed','partially_delivered')) then raise exception 'IMEI sudah dipilih pada Sales Order aktif lain.'; end if;
 end loop;
 v_order_id := public.sales_create_order(p_customer_id,p_warehouse_id,p_order_date,p_notes,p_items);
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_variant_id := (v_item->>'product_variant_id')::uuid; v_unit_ids := coalesce(v_item->'unit_ids','[]'::jsonb);
   if jsonb_array_length(v_unit_ids)>0 then
     select soi.id into v_line_id from public.sales_order_items soi where soi.sales_order_id=v_order_id and soi.product_variant_id=v_variant_id;
     for v_unit_id in select value::uuid from jsonb_array_elements_text(v_unit_ids) loop insert into public.sales_order_item_units(sales_order_item_id,product_unit_id) values(v_line_id,v_unit_id); end loop;
   end if;
 end loop;
 update public.sales_orders set payment_scheme=p_payment_scheme,payment_due_date=p_payment_due_date,updated_at=now() where id=v_order_id;
 perform public.sales_confirm_order(v_order_id); return v_order_id;
end;
$function$;
revoke all on function public.sales_create_order_with_payment_terms_and_units(uuid,uuid,date,text,jsonb,text,date) from public,anon;
grant execute on function public.sales_create_order_with_payment_terms_and_units(uuid,uuid,date,text,jsonb,text,date) to authenticated;