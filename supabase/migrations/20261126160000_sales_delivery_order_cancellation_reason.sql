-- Allow an unused draft Delivery Order to be cancelled with an auditable reason.
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.delivery_orders
  ADD CONSTRAINT delivery_orders_cancellation_reason_check
  CHECK (
    (status = 'cancelled' AND cancellation_reason IS NOT NULL
      AND length(btrim(cancellation_reason)) BETWEEN 5 AND 500)
    OR
    (status <> 'cancelled' AND cancellation_reason IS NULL)
  );

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

  -- Preserve global lock order: Sales Order -> Delivery Order -> warehouse.
  SELECT d.sales_order_id INTO v_sales_order_id
  FROM public.delivery_orders d
  WHERE d.id = p_delivery_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery Order tidak ditemukan.'; END IF;

  SELECT * INTO v_so
  FROM public.sales_orders
  WHERE id = v_sales_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order tidak ditemukan.'; END IF;

  SELECT * INTO v_do
  FROM public.delivery_orders
  WHERE id = p_delivery_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery Order tidak ditemukan.'; END IF;

  IF v_do.sales_order_id <> v_so.id THEN
    RAISE EXCEPTION 'Referensi Sales Order Delivery Order tidak sesuai.';
  END IF;
  IF v_do.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya Delivery Order draft yang belum diposting dapat dibatalkan.';
  END IF;
  IF v_so.status NOT IN ('confirmed','partially_delivered') THEN
    RAISE EXCEPTION 'Status Sales Order tidak memungkinkan pembatalan Delivery Order.';
  END IF;
  IF NOT public.has_warehouse_access(v_do.warehouse_id) THEN
    RAISE EXCEPTION 'Akses warehouse ditolak.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.delivery_order_items doi
    LEFT JOIN public.inventory_movements im ON im.id = doi.inventory_movement_id
    WHERE doi.delivery_order_id = v_do.id
      AND (im.status = 'posted' OR im.id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Delivery Order memiliki movement stok. Pembatalan otomatis ditolak; perlu reversal terkontrol.';
  END IF;

  UPDATE public.delivery_orders
  SET status = 'cancelled',
      cancellation_reason = v_reason,
      updated_at = now()
  WHERE id = v_do.id;

  RETURN v_do.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_cancel_delivery_order(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sales_cancel_delivery_order(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.sales_cancel_delivery_order(uuid,text) IS
  'Cancels only an unposted draft DO, requiring a reason and preserving posted inventory movements.';
