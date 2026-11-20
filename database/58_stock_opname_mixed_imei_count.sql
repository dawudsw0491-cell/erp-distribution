-- MD-013: count identified IMEI units and untagged SKU aggregate stock separately.
ALTER TABLE public.stock_opname_items
    ADD COLUMN IF NOT EXISTS counted_aggregate_quantity numeric(18,3) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_stock_opname_count(p_item_id uuid, p_counted_quantity numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_warehouse_id UUID;
    v_tracking_type TEXT;
    v_counted_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION
            'Permission denied: inventory.opname required.';
    END IF;

    IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
        RAISE EXCEPTION
            'Counted quantity must be zero or greater.';
    END IF;

    SELECT
        i.session_id,
        s.warehouse_id,
        p.tracking_type
    INTO
        v_session_id,
        v_warehouse_id,
        v_tracking_type
    FROM public.stock_opname_items i
    JOIN public.stock_opname_sessions s
        ON s.id = i.session_id
    JOIN public.products p
        ON p.id = i.product_id
    WHERE i.id = p_item_id
    FOR UPDATE OF i, s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname item not found.';
    END IF;

    IF v_tracking_type NOT IN ('quantity', 'imei') THEN
        RAISE EXCEPTION 'Aggregate count is allowed for quantity or IMEI products.';
    END IF;

    PERFORM public.lock_inventory_warehouse(v_warehouse_id);

    IF NOT EXISTS (
        SELECT 1
        FROM public.stock_opname_sessions s
        WHERE s.id = v_session_id
          AND s.status = 'counting'
    ) THEN
        RAISE EXCEPTION 'Session is not in counting status.';
    END IF;

    v_counted_at := clock_timestamp();

    UPDATE public.stock_opname_items
    SET
        counted_aggregate_quantity = CASE WHEN v_tracking_type = 'imei' THEN p_counted_quantity ELSE 0 END,
        counted_quantity = p_counted_quantity + CASE
            WHEN v_tracking_type = 'imei' THEN (
                SELECT COUNT(*)::numeric
                FROM public.stock_opname_unit_counts c
                WHERE c.opname_item_id = p_item_id AND c.is_present = TRUE
            )
            ELSE 0
        END,
        notes = NULLIF(BTRIM(p_notes), ''),
        counted_by = v_user_id,
        counted_at = v_counted_at,
        updated_at = v_counted_at,
        mutation_quantity = 0,
        book_quantity_at_count = NULL,
        reconciliation_variance = NULL,
        reconciliation_status = 'pending'
    WHERE id = p_item_id;

    RETURN p_item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_stock_opname_counts_bulk(p_session_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_warehouse_id uuid;
    v_item_count integer;
    v_updated_count integer;
    v_counted_at timestamptz;
    v_item record;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION
            'Permission denied: inventory.opname required.';
    END IF;

    IF p_session_id IS NULL THEN
        RAISE EXCEPTION 'Session ID is required.';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Items must be a non-empty JSON array.';
    END IF;

    IF jsonb_array_length(p_items) > 5000 THEN
        RAISE EXCEPTION 'Maximum 5000 items per batch.';
    END IF;

    SELECT warehouse_id
    INTO v_warehouse_id
    FROM public.stock_opname_sessions
    WHERE id = p_session_id
      AND status = 'counting'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found or not in counting status.';
    END IF;

    PERFORM public.lock_inventory_warehouse(v_warehouse_id);

    v_item_count := jsonb_array_length(p_items);

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS x(value)
        WHERE
            jsonb_typeof(x.value) <> 'object'
            OR COALESCE(x.value->>'item_id', '') !~
                '^[0-9a-fA-F-]{36}$'
            OR COALESCE(x.value->>'counted_quantity', '') !~
                '^[0-9]{1,15}(\.[0-9]{1,3})?$'
            OR COALESCE(x.value->>'notes', '') IS NULL
            OR length(COALESCE(x.value->>'notes', '')) > 2000
    ) THEN
        RAISE EXCEPTION 'Invalid item data in batch.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS x(value)
        GROUP BY x.value->>'item_id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate item ID in batch.';
    END IF;

    FOR v_item IN
        SELECT
            (x.value->>'item_id')::uuid AS item_id,
            (x.value->>'counted_quantity')::numeric AS counted_quantity,
            NULLIF(BTRIM(x.value->>'notes'), '') AS notes
        FROM jsonb_array_elements(p_items) AS x(value)
    LOOP
        IF v_item.counted_quantity < 0 THEN
            RAISE EXCEPTION 'Counted quantity must be zero or greater.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.stock_opname_items i
            JOIN public.products p
                ON p.id = i.product_id
            WHERE i.id = v_item.item_id
              AND i.session_id = p_session_id
              AND p.tracking_type IN ('quantity', 'imei')
        ) THEN
            RAISE EXCEPTION
                'Item % is invalid, outside this session, or not eligible for aggregate count.',
                v_item.item_id;
        END IF;
    END LOOP;

    v_counted_at := clock_timestamp();

    UPDATE public.stock_opname_items i
    SET
        counted_aggregate_quantity = CASE WHEN (SELECT tracking_type FROM public.products WHERE id = i.product_id) = 'imei' THEN x.counted_quantity ELSE 0 END,
        counted_quantity = x.counted_quantity + CASE
            WHEN (SELECT tracking_type FROM public.products WHERE id = i.product_id) = 'imei' THEN (
                SELECT COUNT(*)::numeric
                FROM public.stock_opname_unit_counts c
                WHERE c.opname_item_id = i.id AND c.is_present = TRUE
            )
            ELSE 0
        END,
        notes = x.notes,
        counted_by = v_user_id,
        counted_at = v_counted_at,
        updated_at = v_counted_at,
        mutation_quantity = 0,
        book_quantity_at_count = NULL,
        reconciliation_variance = NULL,
        reconciliation_status = 'pending'
    FROM (
        SELECT
            (value->>'item_id')::uuid AS item_id,
            (value->>'counted_quantity')::numeric AS counted_quantity,
            NULLIF(BTRIM(value->>'notes'), '') AS notes
        FROM jsonb_array_elements(p_items)
    ) AS x
    WHERE i.id = x.item_id
      AND i.session_id = p_session_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count <> v_item_count THEN
        RAISE EXCEPTION
            'Batch update mismatch. Expected %, updated %.',
            v_item_count,
            v_updated_count;
    END IF;

    RETURN v_updated_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_stock_opname_unit_count(p_item_id uuid, p_product_unit_id uuid, p_is_present boolean, p_observed_status character varying DEFAULT NULL::character varying, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_warehouse_id UUID;
    v_item_product_id UUID;
    v_item_status TEXT;
    v_tracking_type TEXT;
    v_unit_product_id UUID;
    v_unit_warehouse_id UUID;
    v_unit_status TEXT;
    v_count_id UUID;
    v_present_count NUMERIC;
    v_counted_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION
            'Permission denied: inventory.opname required.';
    END IF;

    IF p_is_present IS NULL THEN
        RAISE EXCEPTION 'Physical presence must be specified.';
    END IF;

    IF p_observed_status IS NOT NULL
       AND p_observed_status NOT IN (
           'available', 'reserved', 'quarantine', 'damaged', 'repair'
       )
    THEN
        RAISE EXCEPTION 'Invalid observed inventory status.';
    END IF;

    SELECT
        s.id,
        s.warehouse_id,
        i.product_id,
        i.inventory_status,
        p.tracking_type
    INTO
        v_session_id,
        v_warehouse_id,
        v_item_product_id,
        v_item_status,
        v_tracking_type
    FROM public.stock_opname_items i
    JOIN public.stock_opname_sessions s
        ON s.id = i.session_id
    JOIN public.products p
        ON p.id = i.product_id
    WHERE i.id = p_item_id
      AND s.status = 'counting'
    FOR UPDATE OF i, s;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Stock Opname item not found or session is not counting.';
    END IF;

    IF v_tracking_type NOT IN ('imei', 'serial') THEN
        RAISE EXCEPTION
            'Unit count is only allowed for IMEI or serial tracked products.';
    END IF;

    PERFORM public.lock_inventory_warehouse(v_warehouse_id);

    SELECT
        u.product_id,
        u.warehouse_id,
        u.unit_status
    INTO
        v_unit_product_id,
        v_unit_warehouse_id,
        v_unit_status
    FROM public.product_units u
    WHERE u.id = p_product_unit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product unit not found.';
    END IF;

    IF v_unit_product_id IS DISTINCT FROM v_item_product_id THEN
        RAISE EXCEPTION
            'Product unit does not belong to the selected product.';
    END IF;

    IF v_unit_warehouse_id IS DISTINCT FROM v_warehouse_id THEN
        RAISE EXCEPTION
            'Product unit does not belong to the session warehouse.';
    END IF;

    IF v_unit_status IS DISTINCT FROM v_item_status THEN
        RAISE EXCEPTION
            'Product unit status does not match the Stock Opname item status.';
    END IF;

    v_counted_at := clock_timestamp();

    INSERT INTO public.stock_opname_unit_counts (
        opname_item_id,
        product_unit_id,
        is_present,
        observed_status,
        notes,
        counted_by,
        counted_at
    )
    VALUES (
        p_item_id,
        p_product_unit_id,
        p_is_present,
        p_observed_status,
        NULLIF(BTRIM(p_notes), ''),
        v_user_id,
        v_counted_at
    )
    ON CONFLICT (
        opname_item_id,
        product_unit_id
    )
    DO UPDATE SET
        is_present = EXCLUDED.is_present,
        observed_status = EXCLUDED.observed_status,
        notes = EXCLUDED.notes,
        counted_by = EXCLUDED.counted_by,
        counted_at = EXCLUDED.counted_at
    RETURNING id INTO v_count_id;

    SELECT COUNT(*)::NUMERIC
    INTO v_present_count
    FROM public.stock_opname_unit_counts c
    WHERE c.opname_item_id = p_item_id
      AND c.is_present = TRUE;

    UPDATE public.stock_opname_items
    SET
        counted_quantity = v_present_count + COALESCE(counted_aggregate_quantity, 0),
        counted_by = v_user_id,
        counted_at = v_counted_at,
        updated_at = v_counted_at,
        mutation_quantity = 0,
        book_quantity_at_count = NULL,
        reconciliation_variance = NULL,
        reconciliation_status = 'pending'
    WHERE id = p_item_id;

    RETURN v_count_id;
END;
$function$
;
