-- MD-013: count identified IMEI units and untagged SKU aggregate stock separately.
-- NULL means the aggregate physical count has not been recorded yet.
-- Snapshot and reconciliation columns isolate untagged SKU stock from identified units.
ALTER TABLE public.stock_opname_items
    ADD COLUMN IF NOT EXISTS snapshot_aggregate_quantity numeric(18,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS counted_aggregate_quantity numeric(18,3),
    ADD COLUMN IF NOT EXISTS book_aggregate_quantity_at_count numeric(18,3),
    ADD COLUMN IF NOT EXISTS aggregate_reconciliation_variance numeric(18,3);

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
    IF v_tracking_type = 'imei' AND p_counted_quantity <> trunc(p_counted_quantity) THEN
        RAISE EXCEPTION 'Aggregate IMEI stock count must be a whole unit quantity.';
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
            OR EXISTS (
                SELECT 1
                FROM public.stock_opname_items i
                JOIN public.products p ON p.id = i.product_id
                WHERE i.id = (x.value->>'item_id')::uuid
                  AND p.tracking_type = 'imei'
                  AND (x.value->>'counted_quantity')::numeric
                      <> trunc((x.value->>'counted_quantity')::numeric)
            )
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
        counted_quantity = CASE
            WHEN v_tracking_type = 'imei'
                 AND counted_aggregate_quantity IS NULL
                THEN NULL
            WHEN v_tracking_type = 'imei'
                THEN v_present_count + counted_aggregate_quantity
            ELSE v_present_count
        END,
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


-- ------------------------------------------------------------
-- 4. SNAPSHOT AGGREGATE IMEI STOCK
-- ------------------------------------------------------------
-- Preserve the untagged SKU quantity at snapshot time. The balance bucket
-- contains aggregate stock plus individually registered units; subtract the
-- registered units so their later physical count never changes aggregate stock.

CREATE OR REPLACE FUNCTION public.start_stock_opname(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_warehouse_id uuid;
    v_status text;
    v_snapshot_at timestamptz;
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

    SELECT s.warehouse_id, s.status
    INTO v_warehouse_id, v_status
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft sessions can be started.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.warehouses w
        WHERE w.id = v_warehouse_id
          AND w.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Warehouse is inactive.';
    END IF;

    PERFORM public.lock_inventory_warehouse(v_warehouse_id);
    v_snapshot_at := clock_timestamp();

    -- Reject inconsistent books where registered IMEI units exceed the
    -- total balance bucket. Do not clamp the aggregate snapshot to zero.
    IF EXISTS (
        SELECT 1
        FROM public.products p
        CROSS JOIN LATERAL (
            VALUES
                ('available'::varchar),
                ('reserved'::varchar),
                ('quarantine'::varchar),
                ('damaged'::varchar),
                ('repair'::varchar)
        ) AS x(inventory_status)
        LEFT JOIN public.inventory_balances b
            ON b.product_id = p.id
           AND b.warehouse_id = v_warehouse_id
        CROSS JOIN LATERAL (
            SELECT CASE x.inventory_status
                WHEN 'available' THEN b.available_quantity
                WHEN 'reserved' THEN b.reserved_quantity
                WHEN 'quarantine' THEN b.quarantine_quantity
                WHEN 'damaged' THEN b.damaged_quantity
                WHEN 'repair' THEN b.repair_quantity
            END AS quantity
        ) q
        WHERE p.is_active = TRUE
          AND p.product_type = 'goods'
          AND p.tracking_type = 'imei'
          AND (
              SELECT COUNT(*)::numeric
              FROM public.product_units u
              WHERE u.product_id = p.id
                AND u.warehouse_id = v_warehouse_id
                AND u.unit_status = x.inventory_status
          ) > COALESCE(q.quantity, 0)
    ) THEN
        RAISE EXCEPTION
            'Registered IMEI units exceed an inventory balance bucket. Reconcile inventory before starting Stock Opname.';
    END IF;

    INSERT INTO public.stock_opname_items (
        session_id,
        product_id,
        inventory_status,
        snapshot_quantity,
        snapshot_aggregate_quantity,
        snapshot_average_unit_cost,
        snapshot_inventory_value,
        is_required
    )
    SELECT
        p_session_id,
        p.id,
        x.inventory_status,
        COALESCE(q.quantity, 0),
        CASE
            WHEN p.tracking_type = 'imei' THEN
                COALESCE(q.quantity, 0) - (
                    SELECT COUNT(*)::numeric
                    FROM public.product_units u
                    WHERE u.product_id = p.id
                      AND u.warehouse_id = v_warehouse_id
                      AND u.unit_status = x.inventory_status
                )
            ELSE 0
        END,
        COALESCE(b.average_unit_cost, 0),
        ROUND(
            COALESCE(q.quantity, 0)
            * COALESCE(b.average_unit_cost, 0),
            4
        ),
        TRUE
    FROM public.products p
    CROSS JOIN LATERAL (
        VALUES
            ('available'::varchar),
            ('reserved'::varchar),
            ('quarantine'::varchar),
            ('damaged'::varchar),
            ('repair'::varchar)
    ) AS x(inventory_status)
    LEFT JOIN public.inventory_balances b
        ON b.product_id = p.id
       AND b.warehouse_id = v_warehouse_id
    CROSS JOIN LATERAL (
        SELECT CASE x.inventory_status
            WHEN 'available' THEN b.available_quantity
            WHEN 'reserved' THEN b.reserved_quantity
            WHEN 'quarantine' THEN b.quarantine_quantity
            WHEN 'damaged' THEN b.damaged_quantity
            WHEN 'repair' THEN b.repair_quantity
        END AS quantity
    ) q
    WHERE p.is_active = TRUE
      AND p.product_type = 'goods'
      AND (
          p.tracking_type NOT IN ('imei', 'serial')
          OR COALESCE(q.quantity, 0) > 0
      )
    ORDER BY p.id, x.inventory_status;

    UPDATE public.stock_opname_sessions
    SET
        status = 'counting',
        snapshot_at = v_snapshot_at,
        started_at = v_snapshot_at,
        updated_at = v_snapshot_at
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$function$;

-- ------------------------------------------------------------
-- 5. RECONCILE TOTAL STOCK AND AGGREGATE IMEI STOCK SEPARATELY
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_stock_opname(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_updated integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    UPDATE public.stock_opname_items i
    SET
        mutation_quantity = COALESCE((
            SELECT SUM(
                CASE
                    WHEN im.movement_type = 'status_change'
                         AND im.status_from = i.inventory_status
                        THEN -1
                    WHEN im.movement_type = 'status_change'
                         AND im.status_to = i.inventory_status
                        THEN 1
                    WHEN im.movement_type <> 'status_change'
                         AND im.inventory_status = i.inventory_status
                        THEN im.quantity_delta
                    ELSE 0
                END
            )
            FROM public.inventory_movements im
            WHERE im.product_id = i.product_id
              AND im.warehouse_id = s.warehouse_id
              AND im.status = 'posted'
              AND im.posted_at > s.snapshot_at
              AND im.posted_at <= i.counted_at
        ), 0),

        book_quantity_at_count = i.snapshot_quantity + COALESCE((
            SELECT SUM(
                CASE
                    WHEN im.movement_type = 'status_change'
                         AND im.status_from = i.inventory_status
                        THEN -1
                    WHEN im.movement_type = 'status_change'
                         AND im.status_to = i.inventory_status
                        THEN 1
                    WHEN im.movement_type <> 'status_change'
                         AND im.inventory_status = i.inventory_status
                        THEN im.quantity_delta
                    ELSE 0
                END
            )
            FROM public.inventory_movements im
            WHERE im.product_id = i.product_id
              AND im.warehouse_id = s.warehouse_id
              AND im.status = 'posted'
              AND im.posted_at > s.snapshot_at
              AND im.posted_at <= i.counted_at
        ), 0),

        reconciliation_variance = i.counted_quantity - (
            i.snapshot_quantity + COALESCE((
                SELECT SUM(
                    CASE
                        WHEN im.movement_type = 'status_change'
                             AND im.status_from = i.inventory_status
                            THEN -1
                        WHEN im.movement_type = 'status_change'
                             AND im.status_to = i.inventory_status
                            THEN 1
                        WHEN im.movement_type <> 'status_change'
                             AND im.inventory_status = i.inventory_status
                            THEN im.quantity_delta
                        ELSE 0
                    END
                )
                FROM public.inventory_movements im
                WHERE im.product_id = i.product_id
                  AND im.warehouse_id = s.warehouse_id
                  AND im.status = 'posted'
                  AND im.posted_at > s.snapshot_at
                  AND im.posted_at <= i.counted_at
            ), 0)
        ),

        book_aggregate_quantity_at_count = CASE
            WHEN p.tracking_type = 'imei'
                 AND i.counted_aggregate_quantity IS NOT NULL
            THEN i.snapshot_aggregate_quantity + COALESCE((
                SELECT SUM(im.quantity_delta)
                FROM public.inventory_movements im
                WHERE im.product_id = i.product_id
                  AND im.warehouse_id = s.warehouse_id
                  AND im.product_unit_id IS NULL
                  AND im.status = 'posted'
                  AND im.movement_type <> 'status_change'
                  AND im.inventory_status = i.inventory_status
                  AND im.posted_at > s.snapshot_at
                  AND im.posted_at <= i.counted_at
            ), 0)
            ELSE NULL
        END,

        aggregate_reconciliation_variance = CASE
            WHEN p.tracking_type = 'imei'
                 AND i.counted_aggregate_quantity IS NOT NULL
            THEN i.counted_aggregate_quantity - (
                i.snapshot_aggregate_quantity + COALESCE((
                    SELECT SUM(im.quantity_delta)
                    FROM public.inventory_movements im
                    WHERE im.product_id = i.product_id
                      AND im.warehouse_id = s.warehouse_id
                      AND im.product_unit_id IS NULL
                      AND im.status = 'posted'
                      AND im.movement_type <> 'status_change'
                      AND im.inventory_status = i.inventory_status
                      AND im.posted_at > s.snapshot_at
                      AND im.posted_at <= i.counted_at
                ), 0)
            )
            ELSE NULL
        END,

        reconciliation_status = 'reconciled'
    FROM public.stock_opname_sessions s
    JOIN public.products p
        ON p.id = i.product_id
    WHERE i.session_id = s.id
      AND s.id = p_session_id
      AND s.status = 'counting'
      AND s.snapshot_at IS NOT NULL
      AND i.is_required = TRUE
      AND i.counted_at IS NOT NULL
      AND i.counted_quantity IS NOT NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$function$;

-- ------------------------------------------------------------
-- 6. SUBMIT ONLY AFTER ALL REGISTERED IMEI/SERIAL UNITS ARE COUNTED
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_stock_opname_review(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_status text;
    v_item_count bigint;
    v_updated integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION 'Permission denied: inventory.opname required.';
    END IF;

    SELECT s.status
    INTO v_status
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_status <> 'counting' THEN
        RAISE EXCEPTION 'Only counting sessions can be submitted for review.';
    END IF;

    SELECT COUNT(*)
    INTO v_item_count
    FROM public.stock_opname_items
    WHERE session_id = p_session_id
      AND is_required = TRUE;

    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'Cannot submit an empty Stock Opname session.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items
        WHERE session_id = p_session_id
          AND is_required = TRUE
          AND (counted_quantity IS NULL OR counted_at IS NULL)
    ) THEN
        RAISE EXCEPTION 'All required Stock Opname items must be counted before review.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items i
        JOIN public.stock_opname_sessions s
            ON s.id = i.session_id
        JOIN public.products p
            ON p.id = i.product_id
        WHERE i.session_id = p_session_id
          AND i.is_required = TRUE
          AND p.tracking_type IN ('imei', 'serial')
          AND (
              SELECT COUNT(*)
              FROM public.product_units u
              WHERE u.product_id = i.product_id
                AND u.warehouse_id = s.warehouse_id
                AND u.unit_status = i.inventory_status
          ) <> (
              SELECT COUNT(*)
              FROM public.stock_opname_unit_counts c
              WHERE c.opname_item_id = i.id
          )
    ) THEN
        RAISE EXCEPTION
            'Serialized count is incomplete. Every registered IMEI/serial unit must be recorded as present or missing.';
    END IF;

    v_updated := public.reconcile_stock_opname(p_session_id);

    IF v_updated <> v_item_count THEN
        RAISE EXCEPTION
            'Reconciliation incomplete. Expected %, processed %.',
            v_item_count, v_updated;
    END IF;

    UPDATE public.stock_opname_sessions
    SET
        status = 'review',
        submitted_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$function$;

-- ------------------------------------------------------------
-- 7. POST QUANTITY ADJUSTMENTS AND IMEI AGGREGATE ADJUSTMENTS
-- ------------------------------------------------------------
-- Individual IMEI/Serial units remain investigation records. Only the
-- untagged IMEI aggregate variance changes SKU stock.

CREATE OR REPLACE FUNCTION public.post_stock_opname_unlocked(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_session record;
    v_item record;
    v_balance record;
    v_movement_id uuid;
    v_delta numeric;
    v_qty_before numeric;
    v_qty_after numeric;
    v_value_before numeric;
    v_value_after numeric;
    v_avg_before numeric;
    v_avg_after numeric;
    v_bucket numeric;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    SELECT *
    INTO v_session
    FROM public.stock_opname_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND OR v_session.status <> 'approved' THEN
        RAISE EXCEPTION 'Only approved sessions can be posted.';
    END IF;

    IF v_session.approved_by IS NULL THEN
        RAISE EXCEPTION 'Approved user metadata is missing.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items
        WHERE session_id = p_session_id
          AND is_required = TRUE
          AND (
              counted_quantity IS NULL
              OR reconciliation_variance IS NULL
              OR reconciliation_status <> 'reconciled'
              OR (
                  product_id IN (
                      SELECT id FROM public.products WHERE tracking_type = 'imei'
                  )
                  AND aggregate_reconciliation_variance IS NULL
              )
          )
    ) THEN
        RAISE EXCEPTION 'Reconciliation is incomplete.';
    END IF;

    INSERT INTO public.inventory_balances (
        product_id,
        warehouse_id
    )
    SELECT DISTINCT
        product_id,
        v_session.warehouse_id
    FROM public.stock_opname_items
    WHERE session_id = p_session_id
      AND is_required = TRUE
    ON CONFLICT (product_id, warehouse_id)
    DO NOTHING;

    PERFORM b.id
    FROM public.inventory_balances b
    JOIN (
        SELECT DISTINCT product_id
        FROM public.stock_opname_items
        WHERE session_id = p_session_id
          AND is_required = TRUE
    ) i ON i.product_id = b.product_id
    WHERE b.warehouse_id = v_session.warehouse_id
    ORDER BY b.product_id
    FOR UPDATE OF b;

    FOR v_item IN
        SELECT
            i.id,
            i.product_id,
            i.inventory_status,
            i.reconciliation_variance,
            i.aggregate_reconciliation_variance,
            p.tracking_type
        FROM public.stock_opname_items i
        JOIN public.products p ON p.id = i.product_id
        WHERE i.session_id = p_session_id
          AND i.is_required = TRUE
        ORDER BY i.product_id, i.inventory_status
    LOOP
        IF v_item.tracking_type = 'serial' THEN
            CONTINUE;
        ELSIF v_item.tracking_type = 'imei' THEN
            v_delta := v_item.aggregate_reconciliation_variance;
            IF v_delta IS NULL THEN
                RAISE EXCEPTION
                    'Aggregate IMEI reconciliation is missing for item %.',
                    v_item.id;
            END IF;
        ELSIF v_item.tracking_type = 'quantity' THEN
            v_delta := v_item.reconciliation_variance;
        ELSE
            RAISE EXCEPTION 'Unsupported tracking type.';
        END IF;

        IF v_delta = 0 THEN
            CONTINUE;
        END IF;

        SELECT *
        INTO v_balance
        FROM public.inventory_balances
        WHERE product_id = v_item.product_id
          AND warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Inventory balance not found for product %.',
                v_item.product_id;
        END IF;

        v_bucket := CASE v_item.inventory_status
            WHEN 'available' THEN v_balance.available_quantity
            WHEN 'reserved' THEN v_balance.reserved_quantity
            WHEN 'quarantine' THEN v_balance.quarantine_quantity
            WHEN 'damaged' THEN v_balance.damaged_quantity
            WHEN 'repair' THEN v_balance.repair_quantity
            ELSE NULL
        END;

        IF v_bucket IS NULL THEN
            RAISE EXCEPTION
                'Invalid inventory status: %.',
                v_item.inventory_status;
        END IF;

        IF v_bucket + v_delta < 0 THEN
            RAISE EXCEPTION
                'Adjustment would create negative stock for product %, status %.',
                v_item.product_id,
                v_item.inventory_status;
        END IF;

        v_qty_before := v_balance.on_hand_quantity;
        v_qty_after := v_qty_before + v_delta;
        v_value_before := v_balance.inventory_value;

        IF v_qty_after < 0 THEN
            RAISE EXCEPTION 'Adjustment would create negative on-hand stock.';
        END IF;

        v_avg_before := v_balance.average_unit_cost;

        IF v_delta > 0 AND v_avg_before <= 0 THEN
            RAISE EXCEPTION
                'Valid average cost required for positive adjustment.';
        END IF;

        -- Keep moving-average valuation consistent for aggregate IMEI stock.
        v_value_after := v_value_before + ROUND(v_delta * v_avg_before, 4);

        IF v_value_after < 0 THEN
            RAISE EXCEPTION
                'Negative inventory value is not allowed.';
        END IF;

        IF v_qty_after = 0 THEN
            v_value_after := 0;
            v_avg_after := 0;
        ELSE
            v_avg_after := ROUND(v_value_after / v_qty_after, 6);
        END IF;

        INSERT INTO public.inventory_movements (
            product_id,
            warehouse_id,
            product_unit_id,
            movement_type,
            status,
            quantity_delta,
            inventory_status,
            source_reference_type,
            source_reference_id,
            source_reference_number,
            notes,
            created_by,
            approved_by,
            approved_at
        )
        VALUES (
            v_item.product_id,
            v_session.warehouse_id,
            NULL,
            'adjustment',
            'draft',
            v_delta,
            v_item.inventory_status,
            'stock_opname',
            p_session_id,
            v_session.opname_number,
            CASE
                WHEN v_item.tracking_type = 'imei'
                    THEN 'Stock Opname aggregate IMEI adjustment. Item: ' || v_item.id::text
                ELSE 'Stock Opname quantity adjustment. Item: ' || v_item.id::text
            END,
            v_session.created_by,
            v_session.approved_by,
            clock_timestamp()
        )
        RETURNING id INTO v_movement_id;

        UPDATE public.inventory_balances
        SET
            available_quantity = available_quantity +
                CASE WHEN v_item.inventory_status = 'available' THEN v_delta ELSE 0 END,
            reserved_quantity = reserved_quantity +
                CASE WHEN v_item.inventory_status = 'reserved' THEN v_delta ELSE 0 END,
            quarantine_quantity = quarantine_quantity +
                CASE WHEN v_item.inventory_status = 'quarantine' THEN v_delta ELSE 0 END,
            damaged_quantity = damaged_quantity +
                CASE WHEN v_item.inventory_status = 'damaged' THEN v_delta ELSE 0 END,
            repair_quantity = repair_quantity +
                CASE WHEN v_item.inventory_status = 'repair' THEN v_delta ELSE 0 END,
            on_hand_quantity = v_qty_after,
            inventory_value = v_value_after,
            average_unit_cost = v_avg_after,
            updated_at = clock_timestamp()
        WHERE product_id = v_item.product_id
          AND warehouse_id = v_session.warehouse_id;

        UPDATE public.inventory_movements
        SET
            status = 'posted',
            posted_by = v_user_id,
            posted_at = clock_timestamp()
        WHERE id = v_movement_id;

        INSERT INTO public.inventory_valuation_logs (
            inventory_movement_id,
            product_id,
            warehouse_id,
            transaction_type,
            quantity_before,
            quantity_after,
            quantity_delta,
            value_before,
            value_after,
            inventory_value_delta,
            average_cost_before,
            average_cost_after,
            created_by
        )
        VALUES (
            v_movement_id,
            v_item.product_id,
            v_session.warehouse_id,
            'adjustment',
            v_qty_before,
            v_qty_after,
            v_delta,
            v_value_before,
            v_value_after,
            v_value_after - v_value_before,
            v_avg_before,
            v_avg_after,
            v_user_id
        );
    END LOOP;

    UPDATE public.stock_opname_sessions
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$function$;

-- Preserve the warehouse-wide lock around Stock Opname posting.
CREATE OR REPLACE FUNCTION public.post_stock_opname(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_warehouse_id uuid;
BEGIN
    SELECT warehouse_id
    INTO v_warehouse_id
    FROM public.stock_opname_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session tidak ditemukan.';
    END IF;

    PERFORM public.lock_inventory_warehouse(v_warehouse_id);
    RETURN public.post_stock_opname_unlocked(p_session_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.start_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_stock_opname(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reconcile_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_stock_opname(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_stock_opname_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_stock_opname_review(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.post_stock_opname_unlocked(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;
