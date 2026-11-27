create or replace function public.sales_create_invoice_with_payment(
 p_delivery_order_id uuid,p_invoice_date date,p_due_date date,p_notes text,p_items jsonb,
 p_initial_payment_amount numeric,p_payment_date date,p_payment_method text,p_reference_number text,p_payment_notes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_do public.delivery_orders%rowtype; v_scheme text; v_so_due_date date; v_due_date date;
 v_invoice_id uuid; v_total numeric(20,2); v_payment_number text;
begin
 select * into v_do from public.delivery_orders where id=p_delivery_order_id;
 if not found then raise exception 'Delivery Order tidak ditemukan.'; end if;
 select payment_scheme,payment_due_date into v_scheme,v_so_due_date from public.sales_orders where id=v_do.sales_order_id;
 if v_scheme is null or v_scheme='unspecified' then v_scheme:='credit'; end if;
 if v_scheme='credit' then
   v_due_date:=coalesce(p_due_date,v_so_due_date);
   if v_due_date is null or v_due_date<p_invoice_date then raise exception 'Jatuh tempo kredit wajib valid dan tidak boleh sebelum tanggal invoice.'; end if;
 else v_due_date:=p_invoice_date; end if;
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