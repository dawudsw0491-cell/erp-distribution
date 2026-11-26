-- Permit cancelling an unposted duplicate DO after its parent SO is fulfilled.
-- Posted DOs and any DO linked to inventory movements remain non-cancellable.
CREATE OR REPLACE FUNCTION public.sales_cancel_delivery_order(
  p_delivery_order_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sales_order_id uuid;
  v_so public.sales_orders%rowtype;
  v_do public.delivery_orders%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF v_user_id IS NULL OR NOT public.has_permission('sales.create') THEN
    RAISE EXCEPTION 'Permission sales.create diperlukan.';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib 5 sampai 500 karakter.';
  END IF;

  SELECT d.sales_order_id INTO v_sales_order_id
  FROM public.delivery_orders d WHERE d.id = p_delivery_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery Order tidak ditemukan.'; END IF;

  SELECT * INTO v_so FROM public.sales_orders WHERE id = v_sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order tidak ditemukan.'; END IF;

  SELECT * INTO v_do FROM public.delivery_orders WHERE id = p_delivery_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery Order tidak ditemukan.'; END IF;
  IF v_do.sales_order_id <> v_so.id THEN RAISE EXCEPTION 'Referensi Sales Order Delivery Order tidak sesuai.'; END IF;
  IF v_do.status <> 'draft' THEN RAISE EXCEPTION 'Hanya Delivery Order draft yang belum diposting dapat dibatalkan.'; END IF;

  -- A duplicate draft DO may remain after another DO completes the SO.
  IF v_so.status NOT IN ('confirmed','partially_delivered','delivered','cancelled') THEN
    RAISE EXCEPTION 'Status Sales Order tidak memungkinkan pembatalan Delivery Order.';
  END IF;
  IF NOT public.has_warehouse_access(v_do.warehouse_id) THEN
    RAISE EXCEPTION 'Akses warehouse ditolak.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_order_items doi
    JOIN public.inventory_movements im ON im.id = doi.inventory_movement_id
    WHERE doi.delivery_order_id = v_do.id
  ) THEN
    RAISE EXCEPTION 'Delivery Order memiliki movement stok. Pembatalan otomatis ditolak; perlu reversal terkontrol.';
  END IF;

  UPDATE public.delivery_orders
  SET status = 'cancelled', cancellation_reason = v_reason, updated_at = now()
  WHERE id = v_do.id;
  RETURN v_do.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_cancel_delivery_order(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sales_cancel_delivery_order(uuid,text) TO authenticated;
