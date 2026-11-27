-- Sales payment terms from SO through invoice; initial receipts are atomic with invoice creation.
alter table public.sales_orders
  add column if not exists payment_scheme varchar(20) not null default 'unspecified',
  add column if not exists payment_due_date date;
alter table public.sales_orders
  drop constraint if exists sales_orders_payment_scheme_check,
  add constraint sales_orders_payment_scheme_check check (payment_scheme in ('cash','bank_transfer','credit','unspecified')),
  drop constraint if exists sales_orders_payment_due_date_check,
  add constraint sales_orders_payment_due_date_check check (
    (payment_scheme = 'credit' and (payment_due_date is null or payment_due_date >= order_date))
    or (payment_scheme <> 'credit' and payment_due_date is null)
  );
alter table public.sales_invoices add column if not exists payment_scheme varchar(20) not null default 'unspecified';
alter table public.sales_invoices
  drop constraint if exists sales_invoices_payment_scheme_check,
  add constraint sales_invoices_payment_scheme_check check (payment_scheme in ('cash','bank_transfer','credit','unspecified'));

create or replace function public.sales_create_order_with_payment_terms(
 p_customer_id uuid,p_warehouse_id uuid,p_order_date date,p_notes text,p_items jsonb,p_payment_scheme text,p_payment_due_date date
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if p_payment_scheme not in ('cash','bank_transfer','credit') then raise exception 'Skema pembayaran wajib dipilih.'; end if;
 if p_payment_scheme='credit' and (p_payment_due_date is null or p_payment_due_date<coalesce(p_order_date,current_date)) then raise exception 'Tanggal jatuh tempo wajib diisi dan tidak boleh sebelum tanggal SO.'; end if;
 if p_payment_scheme<>'credit' and p_payment_due_date is not null then raise exception 'Jatuh tempo hanya berlaku untuk skema kredit.'; end if;
 v_id:=public.sales_create_order(p_customer_id,p_warehouse_id,p_order_date,p_notes,p_items);
 update public.sales_orders set payment_scheme=p_payment_scheme,payment_due_date=p_payment_due_date,updated_at=now() where id=v_id;
 return v_id;
end $$;

create or replace function public.sales_update_draft_order_with_payment_terms(
 p_sales_order_id uuid,p_customer_id uuid,p_warehouse_id uuid,p_order_date date,p_notes text,p_items jsonb,p_payment_scheme text,p_payment_due_date date
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if p_payment_scheme not in ('cash','bank_transfer','credit') then raise exception 'Skema pembayaran wajib dipilih.'; end if;
 if p_payment_scheme='credit' and (p_payment_due_date is null or p_payment_due_date<p_order_date) then raise exception 'Tanggal jatuh tempo wajib diisi dan tidak boleh sebelum tanggal SO.'; end if;
 if p_payment_scheme<>'credit' and p_payment_due_date is not null then raise exception 'Jatuh tempo hanya berlaku untuk skema kredit.'; end if;
 v_id:=public.sales_update_draft_order(p_sales_order_id,p_customer_id,p_warehouse_id,p_order_date,p_notes,p_items);
 update public.sales_orders set payment_scheme=p_payment_scheme,payment_due_date=p_payment_due_date,updated_at=now() where id=v_id;
 return v_id;
end $$;

create or replace function public.sales_create_invoice_with_payment(
 p_delivery_order_id uuid,p_invoice_date date,p_due_date date,p_notes text,p_items jsonb,
 p_initial_payment_amount numeric,p_payment_date date,p_payment_method text,p_reference_number text,p_payment_notes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_do public.delivery_orders%rowtype;
 v_scheme text;
 v_so_due_date date;
 v_due_date date;
 v_invoice_id uuid;
 v_total numeric(20,2);
 v_payment_number text;
begin
 select * into v_do from public.delivery_orders where id=p_delivery_order_id;
 if not found then raise exception 'Delivery Order tidak ditemukan.'; end if;
 select payment_scheme,payment_due_date into v_scheme,v_so_due_date from public.sales_orders where id=v_do.sales_order_id;
 if v_scheme is null or v_scheme='unspecified' then raise exception 'Skema pembayaran Sales Order belum ditentukan.'; end if;
 if v_scheme='credit' then
   v_due_date:=coalesce(p_due_date,v_so_due_date);
   if v_due_date is null or v_due_date<p_invoice_date then raise exception 'Jatuh tempo kredit wajib valid dan tidak boleh sebelum tanggal invoice.'; end if;
 else v_due_date:=p_invoice_date;
 end if;
 if coalesce(p_initial_payment_amount,0)<0 then raise exception 'Nominal pembayaran awal tidak valid.'; end if;
 if coalesce(p_initial_payment_amount,0)>0 then
   if p_payment_date is null or p_payment_method not in ('cash','bank_transfer','card','other') then raise exception 'Tanggal dan metode pembayaran awal wajib valid.'; end if;
   if v_scheme in ('cash','bank_transfer') and p_payment_method<>v_scheme then raise exception 'Metode pembayaran harus sama dengan skema pembayaran pada Sales Order.'; end if;
   if length(coalesce(p_reference_number,''))>120 or length(coalesce(p_payment_notes,''))>2000 then raise exception 'Referensi atau catatan pembayaran terlalu panjang.'; end if;
 end if;
 v_invoice_id:=public.sales_create_invoice(p_delivery_order_id,p_invoice_date,v_due_date,p_notes,p_items);
 select subtotal into v_total from public.sales_invoices where id=v_invoice_id for update;
 update public.sales_invoices set payment_scheme=v_scheme where id=v_invoice_id;
 if coalesce(p_initial_payment_amount,0)>0 then
   if p_initial_payment_amount>v_total then raise exception 'Pembayaran awal melebihi total invoice.'; end if;
   v_payment_number:='PAY-'||to_char(p_payment_date,'YYYYMMDD')||'-'||lpad(nextval('public.sales_invoice_payment_number_seq')::text,6,'0');
   insert into public.sales_invoice_payments(invoice_id,payment_number,payment_date,amount,payment_method,reference_number,notes,received_by)
   values(v_invoice_id,v_payment_number,p_payment_date,p_initial_payment_amount,p_payment_method,nullif(btrim(p_reference_number),''),nullif(btrim(p_payment_notes),''),auth.uid());
   update public.sales_invoices set paid_amount=p_initial_payment_amount,status=case when p_initial_payment_amount>=subtotal then 'paid' else 'partially_paid' end,updated_at=now() where id=v_invoice_id;
 end if;
 return v_invoice_id;
end $$;

revoke all on function public.sales_create_order_with_payment_terms(uuid,uuid,date,text,jsonb,text,date) from public,anon;
revoke all on function public.sales_update_draft_order_with_payment_terms(uuid,uuid,uuid,date,text,jsonb,text,date) from public,anon;
revoke all on function public.sales_create_invoice_with_payment(uuid,date,date,text,jsonb,numeric,date,text,text,text) from public,anon;
grant execute on function public.sales_create_order_with_payment_terms(uuid,uuid,date,text,jsonb,text,date) to authenticated;
grant execute on function public.sales_update_draft_order_with_payment_terms(uuid,uuid,uuid,date,text,jsonb,text,date) to authenticated;
grant execute on function public.sales_create_invoice_with_payment(uuid,date,date,text,jsonb,numeric,date,text,text,text) to authenticated;
