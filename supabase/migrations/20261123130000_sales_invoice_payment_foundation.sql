-- Sales Invoice and Payment foundation.
-- Invoice lines are sourced only from posted Delivery Order lines.
-- No GL journal is written here; accounting source-event mapping is a later phase.

create sequence if not exists public.sales_invoice_number_seq;
create sequence if not exists public.sales_invoice_payment_number_seq;

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number varchar(48) not null unique default (
    'INV-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.sales_invoice_number_seq')::text, 6, '0')
  ),
  customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on update restrict on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  status varchar(20) not null default 'issued'
    check (status in ('issued','partially_paid','paid','void')),
  subtotal numeric(20,2) not null default 0 check (subtotal >= 0),
  paid_amount numeric(20,2) not null default 0 check (paid_amount >= 0),
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_by uuid,
  voided_at timestamptz,
  constraint sales_invoice_due_date_check check (due_date is null or due_date >= invoice_date),
  constraint sales_invoice_payment_bound check (paid_amount <= subtotal),
  constraint sales_invoice_void_metadata check (
    (status = 'void' and voided_by is not null and voided_at is not null)
    or (status <> 'void' and voided_by is null and voided_at is null)
  )
);

create table if not exists public.sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices(id) on update restrict on delete restrict,
  delivery_order_item_id uuid not null references public.delivery_order_items(id) on update restrict on delete restrict,
  sales_order_item_id uuid not null references public.sales_order_items(id) on update restrict on delete restrict,
  product_id uuid not null references public.products(id) on update restrict on delete restrict,
  product_variant_id uuid not null,
  product_name_snapshot varchar(255) not null,
  variant_sku_snapshot varchar(120) not null,
  variant_name_snapshot varchar(255) not null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(20,2) not null check (unit_price >= 0),
  line_total numeric(20,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  constraint sales_invoice_item_variant_parent_fk foreign key (product_variant_id, product_id)
    references public.product_variants(id, product_id) on update restrict on delete restrict
);

create table if not exists public.sales_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices(id) on update restrict on delete restrict,
  payment_number varchar(48) not null unique,
  payment_date date not null default current_date,
  amount numeric(20,2) not null check (amount > 0),
  payment_method varchar(20) not null check (payment_method in ('cash','bank_transfer','card','other')),
  reference_number varchar(120),
  notes text,
  received_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_invoices_customer_date on public.sales_invoices(customer_id, invoice_date desc);
create index if not exists idx_sales_invoices_status_due on public.sales_invoices(status, due_date);
create index if not exists idx_sales_invoice_items_invoice on public.sales_invoice_items(invoice_id);
create index if not exists idx_sales_invoice_items_do_line on public.sales_invoice_items(delivery_order_item_id);
create index if not exists idx_sales_invoice_payments_invoice_date on public.sales_invoice_payments(invoice_id, payment_date desc);

alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_items enable row level security;
alter table public.sales_invoice_payments enable row level security;

drop policy if exists sales_invoices_read on public.sales_invoices;
create policy sales_invoices_read on public.sales_invoices for select to authenticated
using (public.has_permission('sales.view') and public.has_warehouse_access(warehouse_id));

drop policy if exists sales_invoice_items_read on public.sales_invoice_items;
create policy sales_invoice_items_read on public.sales_invoice_items for select to authenticated
using (public.has_permission('sales.view') and exists (
  select 1 from public.sales_invoices i where i.id = sales_invoice_items.invoice_id
  and public.has_warehouse_access(i.warehouse_id)
));

drop policy if exists sales_invoice_payments_read on public.sales_invoice_payments;
create policy sales_invoice_payments_read on public.sales_invoice_payments for select to authenticated
using (public.has_permission('sales.view') and exists (
  select 1 from public.sales_invoices i where i.id = sales_invoice_payments.invoice_id
  and public.has_warehouse_access(i.warehouse_id)
));

revoke all on public.sales_invoices, public.sales_invoice_items, public.sales_invoice_payments from public, anon, authenticated;
grant select on public.sales_invoices, public.sales_invoice_items, public.sales_invoice_payments to authenticated;
revoke all on sequence public.sales_invoice_number_seq, public.sales_invoice_payment_number_seq from public, anon, authenticated;
grant usage, select on sequence public.sales_invoice_number_seq, public.sales_invoice_payment_number_seq to authenticated;

create or replace function public.sales_create_invoice(
  p_delivery_order_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_do public.delivery_orders%rowtype;
  v_invoice_id uuid;
  v_item jsonb;
  v_do_item_id uuid;
  v_quantity numeric(18,3);
  v_available numeric(18,3);
  v_total numeric(20,2) := 0;
  v_line record;
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;
  select * into v_do from public.delivery_orders where id = p_delivery_order_id for update;
  if not found or v_do.status <> 'posted' then
    raise exception 'Invoice hanya dapat dibuat dari Delivery Order yang sudah posted.';
  end if;
  if not public.has_warehouse_access(v_do.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
  if p_invoice_date is null or (p_due_date is not null and p_due_date < p_invoice_date) then
    raise exception 'Tanggal invoice atau jatuh tempo tidak valid.';
  end if;
  if length(coalesce(p_notes,'')) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Invoice wajib memiliki 1 sampai 100 baris.';
  end if;

  if exists (
    select 1 from (
      select (x->>'delivery_order_item_id')::uuid as do_item_id,
             sum((x->>'quantity')::numeric) as requested
      from jsonb_array_elements(p_items) x
      group by (x->>'delivery_order_item_id')::uuid
    ) requested
    where requested.do_item_id is null or requested.requested <= 0
       or requested.requested > (
         select doi.quantity - coalesce(sum(case when si.id is not null then sii.quantity else 0 end),0)
         from public.delivery_order_items doi
         join public.delivery_orders d on d.id = doi.delivery_order_id
         left join public.sales_invoice_items sii on sii.delivery_order_item_id = doi.id
         left join public.sales_invoices si on si.id = sii.invoice_id and si.status <> 'void'
         where doi.id = requested.do_item_id and d.id = v_do.id and d.status = 'posted'
         group by doi.id, doi.quantity
       )
  ) then raise exception 'Kuantitas invoice melebihi sisa kuantitas Delivery Order atau baris tidak valid.'; end if;

  insert into public.sales_invoices(customer_id, warehouse_id, invoice_date, due_date, notes, created_by)
  values (v_do.customer_id, v_do.warehouse_id, p_invoice_date, p_due_date, nullif(btrim(p_notes),''), v_user_id)
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_do_item_id := nullif(v_item->>'delivery_order_item_id','')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    select doi.id, doi.sales_order_item_id, doi.product_id, doi.product_variant_id,
           doi.quantity, soi.unit_price, p.product_name, pv.variant_sku, pv.variant_name,
           p.tracking_type
      into v_line
    from public.delivery_order_items doi
    join public.sales_order_items soi on soi.id = doi.sales_order_item_id
    join public.products p on p.id = doi.product_id
    join public.product_variants pv on pv.id = doi.product_variant_id
    where doi.id = v_do_item_id and doi.delivery_order_id = v_do.id;
    if not found then raise exception 'Baris Delivery Order tidak ditemukan.'; end if;
    if v_line.tracking_type in ('imei','serial') and v_quantity <> trunc(v_quantity) then
      raise exception 'Produk IMEI/serial wajib menggunakan kuantitas bilangan bulat.';
    end if;
    select v_line.quantity - coalesce(sum(sii.quantity),0) into v_available
    from public.sales_invoice_items sii
    join public.sales_invoices si on si.id = sii.invoice_id and si.status <> 'void'
    where sii.delivery_order_item_id = v_do_item_id;
    if v_quantity <= 0 or v_quantity > v_available then raise exception 'Kuantitas invoice melebihi sisa Delivery Order.'; end if;
    insert into public.sales_invoice_items(
      invoice_id, delivery_order_item_id, sales_order_item_id, product_id, product_variant_id,
      product_name_snapshot, variant_sku_snapshot, variant_name_snapshot, quantity, unit_price
    ) values (
      v_invoice_id, v_do_item_id, v_line.sales_order_item_id, v_line.product_id, v_line.product_variant_id,
      v_line.product_name, v_line.variant_sku, v_line.variant_name, v_quantity, v_line.unit_price
    );
  end loop;

  select coalesce(sum(line_total),0) into v_total from public.sales_invoice_items where invoice_id = v_invoice_id;
  update public.sales_invoices set subtotal = v_total, updated_at = now() where id = v_invoice_id;
  return v_invoice_id;
end;
$$;

create or replace function public.sales_record_invoice_payment(
  p_invoice_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.sales_invoices%rowtype;
  v_payment_id uuid;
  v_payment_number text;
begin
  if v_user_id is null or not public.has_permission('sales.create') then
    raise exception 'Permission sales.create diperlukan.';
  end if;
  select * into v_invoice from public.sales_invoices where id = p_invoice_id for update;
  if not found or v_invoice.status = 'void' then raise exception 'Invoice tidak ditemukan atau sudah void.'; end if;
  if not public.has_warehouse_access(v_invoice.warehouse_id) then raise exception 'Akses warehouse ditolak.'; end if;
  if p_payment_date is null or p_amount is null or p_amount <= 0 then raise exception 'Tanggal dan nominal pembayaran wajib valid.'; end if;
  if p_payment_method not in ('cash','bank_transfer','card','other') then raise exception 'Metode pembayaran tidak valid.'; end if;
  if length(coalesce(p_reference_number,'')) > 120 or length(coalesce(p_notes,'')) > 2000 then raise exception 'Referensi atau catatan terlalu panjang.'; end if;
  if p_amount > v_invoice.subtotal - v_invoice.paid_amount then raise exception 'Pembayaran melebihi sisa tagihan.'; end if;

  v_payment_number := 'PAY-' || to_char(p_payment_date,'YYYYMMDD') || '-' ||
    lpad(nextval('public.sales_invoice_payment_number_seq')::text, 6, '0');
  insert into public.sales_invoice_payments(invoice_id,payment_number,payment_date,amount,payment_method,reference_number,notes,received_by)
  values (p_invoice_id,v_payment_number,p_payment_date,p_amount,p_payment_method,nullif(btrim(p_reference_number),''),nullif(btrim(p_notes),''),v_user_id)
  returning id into v_payment_id;

  update public.sales_invoices
  set paid_amount = paid_amount + p_amount,
      status = case when paid_amount + p_amount >= subtotal then 'paid' else 'partially_paid' end,
      updated_at = now()
  where id = p_invoice_id;
  return v_payment_id;
end;
$$;

revoke all on function public.sales_create_invoice(uuid,date,date,text,jsonb) from public, anon;
revoke all on function public.sales_record_invoice_payment(uuid,date,numeric,text,text,text) from public, anon;
grant execute on function public.sales_create_invoice(uuid,date,date,text,jsonb) to authenticated;
grant execute on function public.sales_record_invoice_payment(uuid,date,numeric,text,text,text) to authenticated;

comment on table public.sales_invoices is 'Customer invoice sourced from posted Delivery Orders; AR outstanding is subtotal minus recorded payments.';
comment on table public.sales_invoice_items is 'Immutable invoice line snapshots linked to source Delivery Order and Sales Order lines.';
comment on table public.sales_invoice_payments is 'Receipts allocated directly to one invoice; accounting journal integration is a later phase.';
