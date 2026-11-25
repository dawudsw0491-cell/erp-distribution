CREATE OR REPLACE FUNCTION public.recover_posted_goods_receipt_imei(
  p_goods_receipt_item_id uuid,
  p_imei_1 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_item record;
  v_receipt_unit_id uuid;
  v_product_unit_id uuid;
  v_unit_code text;
  v_unit_cost numeric(20,6);
  v_movement_count integer;
  v_movement_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_permission('purchasing.approve') THEN
    RAISE EXCEPTION 'Permission denied: purchasing.approve';
  END IF;

  IF p_imei_1 IS NULL
     OR p_imei_1 !~ '^[0-9]{15}$'
     OR NOT public.is_valid_imei(p_imei_1) THEN
    RAISE EXCEPTION 'IMEI harus 15 digit dan lolos validasi checksum';
  END IF;

  SELECT
    gr.id AS receipt_id,
    gr.receipt_number,
    gr.warehouse_id,
    gr.posted_at,
    gr.status,
    gri.id AS item_id,
    gri.quantity_received,
    gri.unit_cost AS receipt_unit_cost,
    gri.inventory_status,
    poi.product_variant_id,
    pv.product_id,
    p.tracking_type
  INTO v_item
  FROM public.goods_receipt_items gri
  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
  JOIN public.purchase_order_items poi ON poi.id = gri.purchase_order_item_id
  JOIN public.product_variants pv ON pv.id = poi.product_variant_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE gri.id = p_goods_receipt_item_id
  FOR UPDATE OF gri, gr;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item Goods Receipt tidak ditemukan';
  END IF;

  IF v_item.status <> 'posted' THEN
    RAISE EXCEPTION 'Pemulihan hanya untuk Goods Receipt posted';
  END IF;

  IF v_item.tracking_type <> 'imei' THEN
    RAISE EXCEPTION 'Produk bukan kategori tracking IMEI';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goods_receipt_unit_identifiers
    WHERE normalized_value = p_imei_1
  ) OR EXISTS (
    SELECT 1
    FROM public.product_unit_identifiers
    WHERE normalized_value = p_imei_1
  ) THEN
    RAISE EXCEPTION 'IMEI sudah terdaftar pada unit lain';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.goods_receipt_units
    WHERE goods_receipt_item_id = p_goods_receipt_item_id
  ) >= v_item.quantity_received THEN
    RAISE EXCEPTION 'Seluruh unit pada item ini sudah memiliki identitas';
  END IF;

  SELECT
    COUNT(*),
    (array_agg(id ORDER BY id))[1]
  INTO v_movement_count, v_movement_id
  FROM public.inventory_movements
  WHERE source_reference_type = 'goods_receipt'
    AND source_reference_id = v_item.receipt_id
    AND product_variant_id = v_item.product_variant_id
    AND warehouse_id = v_item.warehouse_id
    AND status = 'posted'
    AND movement_type = 'purchase'
    AND product_unit_id IS NULL
    AND quantity_delta = 1;

  IF v_movement_count <> 1 THEN
    RAISE EXCEPTION 'Tidak ditemukan tepat satu movement stok agregat yang aman untuk ditautkan; pemulihan dibatalkan';
  END IF;

  SELECT COALESCE(ib.average_unit_cost, v_item.receipt_unit_cost)
  INTO v_unit_cost
  FROM public.inventory_balances ib
  WHERE ib.product_variant_id = v_item.product_variant_id
    AND ib.warehouse_id = v_item.warehouse_id;

  v_unit_cost := COALESCE(v_unit_cost, v_item.receipt_unit_cost, 0);

  v_unit_code := v_item.receipt_number || '-REC-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.goods_receipt_units(goods_receipt_item_id, unit_code)
  VALUES (p_goods_receipt_item_id, v_unit_code)
  RETURNING id INTO v_receipt_unit_id;

  INSERT INTO public.goods_receipt_unit_identifiers(
    goods_receipt_unit_id,
    identifier_type,
    identifier_value,
    normalized_value
  )
  VALUES (v_receipt_unit_id, 'IMEI_1', p_imei_1, p_imei_1);

  INSERT INTO public.product_units(
    product_variant_id,
    product_id,
    warehouse_id,
    unit_code,
    unit_status,
    received_at,
    unit_cost,
    notes
  )
  VALUES (
    v_item.product_variant_id,
    v_item.product_id,
    v_item.warehouse_id,
    v_unit_code,
    v_item.inventory_status,
    v_item.posted_at,
    v_unit_cost,
    'IMEI recovery for posted Goods Receipt ' || v_item.receipt_number
  )
  RETURNING id INTO v_product_unit_id;

  INSERT INTO public.product_unit_identifiers(
    product_unit_id,
    identifier_type,
    identifier_value
  )
  VALUES (v_product_unit_id, 'IMEI_1', p_imei_1);

  UPDATE public.inventory_movements
  SET
    product_unit_id = v_product_unit_id,
    notes = COALESCE(notes, '') || ' [serialized identity recovered]'
  WHERE id = v_movement_id;

  RETURN v_product_unit_id;
END;
$function$;
