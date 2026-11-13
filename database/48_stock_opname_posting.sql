
-- ============================================================
-- HEXACORE ERP
-- FILE 48: STOCK OPNAME SNAPSHOT CORRECTION & POSTING
-- ============================================================
-- Scope:
--   1. Include active variants with zero system stock.
--   2. Snapshot all inventory status buckets.
--   3. Validate snapshot integrity before posting.
--   4. Post quantity-tracked adjustments atomically.
--   5. Preserve serialized discrepancies for investigation.
--
-- IMPORTANT:
--   - Serialized units are NOT automatically written off.
--   - No automatic sold/quarantine/damaged status changes.
--   - Positive adjustment requires a valid moving average cost.
--   - Posting and valuation logging occur in one transaction.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. REPLACE START FUNCTION
-- Include all active variants and all inventory buckets,
-- including zero-balance variants.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_stock_opname(
    p_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_warehouse_id UUID;
    v_status TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION 'Permission denied: inventory.opname required.';
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

    INSERT INTO public.stock_opname_items (
        session_id,
        product_variant_id,
        inventory_status,
        snapshot_quantity,
        snapshot_average_unit_cost,
        snapshot_inventory_value
    )
    SELECT
        p_session_id,
        pv.id,
        x.inventory_status,
        COALESCE(x.quantity, 0),
        COALESCE(b.average_unit_cost, 0),
        ROUND(
            COALESCE(x.quantity, 0)
            * COALESCE(b.average_unit_cost, 0),
            4
        )
    FROM public.product_variants pv
    JOIN public.products p
        ON p.id = pv.product_id
    CROSS JOIN LATERAL (
        VALUES
            ('available'::VARCHAR),
            ('reserved'::VARCHAR),
            ('quarantine'::VARCHAR),
            ('damaged'::VARCHAR),
            ('repair'::VARCHAR)
    ) AS x(inventory_status)
    LEFT JOIN public.inventory_balances b
        ON b.product_variant_id = pv.id
       AND b.warehouse_id = v_warehouse_id
    LEFT JOIN LATERAL (
        SELECT
            CASE x.inventory_status
                WHEN 'available' THEN b.available_quantity
                WHEN 'reserved' THEN b.reserved_quantity
                WHEN 'quarantine' THEN b.quarantine_quantity
                WHEN 'damaged' THEN b.damaged_quantity
                WHEN 'repair' THEN b.repair_quantity
            END AS quantity
    ) q ON TRUE
    WHERE pv.is_active = TRUE
      AND p.is_active = TRUE
    ORDER BY pv.id, x.inventory_status;

    UPDATE public.stock_opname_sessions
    SET
        status = 'counting',
        snapshot_at = NOW(),
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;

-- ------------------------------------------------------------
-- 2. CREATE POST STOCK OPNAME FUNCTION
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_stock_opname(
    p_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_session RECORD;
    v_item RECORD;
    v_balance RECORD;

    v_movement_id UUID;

    v_quantity_before NUMERIC;
    v_quantity_after NUMERIC;
    v_value_before NUMERIC;
    v_value_after NUMERIC;
    v_value_delta NUMERIC;

    v_average_before NUMERIC;
    v_average_after NUMERIC;

    v_snapshot_total NUMERIC;
    v_delta NUMERIC;
    v_bucket_quantity NUMERIC;

BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT (
        public.has_permission('inventory.opname')
        OR public.is_owner()
    ) THEN
        RAISE EXCEPTION 'Permission denied: inventory.opname required.';
    END IF;

    -- --------------------------------------------------------
    -- A. LOCK SESSION AND VALIDATE STATUS
    -- --------------------------------------------------------

    SELECT
        s.id,
        s.opname_number,
        s.warehouse_id,
        s.status,
        s.created_by,
        s.approved_by,
        s.snapshot_at
    INTO v_session
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_session.status <> 'approved' THEN
        RAISE EXCEPTION 'Only approved sessions can be posted.';
    END IF;

    IF v_session.approved_by IS NULL THEN
        RAISE EXCEPTION 'Approved user metadata is missing.';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items i
        WHERE i.session_id = p_session_id
          AND i.counted_quantity IS NULL
    ) THEN
        RAISE EXCEPTION
            'Cannot post: one or more items have not been counted.';
    END IF;

    -- --------------------------------------------------------
    -- B. CREATE ZERO BALANCE ROWS IF NECESSARY
    -- --------------------------------------------------------

    INSERT INTO public.inventory_balances (
        product_variant_id,
        warehouse_id
    )
    SELECT DISTINCT
        i.product_variant_id,
        v_session.warehouse_id
    FROM public.stock_opname_items i
    WHERE i.session_id = p_session_id
    ON CONFLICT (product_variant_id, warehouse_id)
    DO NOTHING;

    -- Lock all affected balance rows in deterministic order.
    PERFORM b.id
    FROM public.inventory_balances b
    JOIN (
        SELECT DISTINCT product_variant_id
        FROM public.stock_opname_items
        WHERE session_id = p_session_id
    ) i
        ON i.product_variant_id = b.product_variant_id
    WHERE b.warehouse_id = v_session.warehouse_id
    ORDER BY b.product_variant_id
    FOR UPDATE OF b;

    -- --------------------------------------------------------
    -- C. SNAPSHOT INTEGRITY VALIDATION
    -- Reject if stock changed after opname snapshot.
    -- --------------------------------------------------------

    FOR v_item IN
        SELECT
            i.product_variant_id,
            i.inventory_status,
            i.snapshot_quantity,
            i.snapshot_average_unit_cost
        FROM public.stock_opname_items i
        WHERE i.session_id = p_session_id
        ORDER BY i.product_variant_id, i.inventory_status
    LOOP
        SELECT *
        INTO v_balance
        FROM public.inventory_balances b
        WHERE b.product_variant_id = v_item.product_variant_id
          AND b.warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Inventory balance missing for product variant %.',
                v_item.product_variant_id;
        END IF;

        v_bucket_quantity :=
            CASE v_item.inventory_status
                WHEN 'available' THEN v_balance.available_quantity
                WHEN 'reserved' THEN v_balance.reserved_quantity
                WHEN 'quarantine' THEN v_balance.quarantine_quantity
                WHEN 'damaged' THEN v_balance.damaged_quantity
                WHEN 'repair' THEN v_balance.repair_quantity
            END;

        IF v_bucket_quantity IS DISTINCT FROM v_item.snapshot_quantity THEN
            RAISE EXCEPTION
                'Stock changed after snapshot for variant %, status %. Create a new Stock Opname session.',
                v_item.product_variant_id,
                v_item.inventory_status;
        END IF;

        SELECT COALESCE(SUM(i.snapshot_quantity), 0)
        INTO v_snapshot_total
        FROM public.stock_opname_items i
        WHERE i.session_id = p_session_id
          AND i.product_variant_id = v_item.product_variant_id;

        IF v_balance.on_hand_quantity IS DISTINCT FROM v_snapshot_total THEN
            RAISE EXCEPTION
                'On-hand quantity changed after snapshot for variant %. Create a new Stock Opname session.',
                v_item.product_variant_id;
        END IF;

        IF v_balance.average_unit_cost
           IS DISTINCT FROM v_item.snapshot_average_unit_cost THEN
            RAISE EXCEPTION
                'Average cost changed after snapshot for variant %. Create a new Stock Opname session.',
                v_item.product_variant_id;
        END IF;
    END LOOP;

    -- --------------------------------------------------------
    -- D. POST QUANTITY-TRACKED ADJUSTMENTS
    -- Serialized items remain investigation records.
    -- --------------------------------------------------------

    FOR v_item IN
        SELECT
            i.id,
            i.product_variant_id,
            i.inventory_status,
            i.snapshot_quantity,
            i.counted_quantity,
            i.variance_quantity,
            i.snapshot_average_unit_cost,
            p.tracking_type
        FROM public.stock_opname_items i
        JOIN public.product_variants pv
            ON pv.id = i.product_variant_id
        JOIN public.products p
            ON p.id = pv.product_id
        WHERE i.session_id = p_session_id
        ORDER BY i.product_variant_id, i.inventory_status
    LOOP
        -- Serialized differences are retained for investigation.
        -- No automatic unit status change or write-off.
        IF v_item.tracking_type IN ('imei', 'serial') THEN
            CONTINUE;
        END IF;

        IF v_item.tracking_type <> 'quantity' THEN
            RAISE EXCEPTION
                'Unsupported tracking type for variant %.',
                v_item.product_variant_id;
        END IF;

        v_delta := v_item.counted_quantity - v_item.snapshot_quantity;

        IF v_delta = 0 THEN
            CONTINUE;
        END IF;

        SELECT *
        INTO v_balance
        FROM public.inventory_balances b
        WHERE b.product_variant_id = v_item.product_variant_id
          AND b.warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        v_bucket_quantity :=
            CASE v_item.inventory_status
                WHEN 'available' THEN v_balance.available_quantity
                WHEN 'reserved' THEN v_balance.reserved_quantity
                WHEN 'quarantine' THEN v_balance.quarantine_quantity
                WHEN 'damaged' THEN v_balance.damaged_quantity
                WHEN 'repair' THEN v_balance.repair_quantity
            END;

        IF v_bucket_quantity + v_delta < 0 THEN
            RAISE EXCEPTION
                'Adjustment would create negative stock for variant %, status %.',
                v_item.product_variant_id,
                v_item.inventory_status;
        END IF;

        v_quantity_before := v_balance.on_hand_quantity;
        v_quantity_after := v_quantity_before + v_delta;

        v_value_before := v_balance.inventory_value;
        v_average_before := v_balance.average_unit_cost;

        IF v_delta > 0 AND v_average_before <= 0 THEN
            RAISE EXCEPTION
                'Cannot post positive adjustment for variant % because no valid average cost exists. Cost determination is required first.',
                v_item.product_variant_id;
        END IF;

        v_value_delta := ROUND(v_delta * v_average_before, 4);
        v_value_after := v_value_before + v_value_delta;

        IF v_value_after < 0 THEN
            RAISE EXCEPTION
                'Adjustment would create negative inventory value for variant %.',
                v_item.product_variant_id;
        END IF;

        IF v_quantity_after = 0 THEN
            v_value_after := 0;
            v_average_after := 0;
        ELSE
            v_average_after :=
                ROUND(v_value_after / v_quantity_after, 6);
        END IF;

        -- ----------------------------------------------------
        -- E. CREATE ADJUSTMENT MOVEMENT
        -- ----------------------------------------------------

        INSERT INTO public.inventory_movements (
            product_variant_id,
            warehouse_id,
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
            v_item.product_variant_id,
            v_session.warehouse_id,
            'adjustment',
            'draft',
            v_delta,
            v_item.inventory_status,
            'stock_opname',
            p_session_id,
            v_session.opname_number,
            'Stock Opname adjustment. Item ID: ' || v_item.id::TEXT,
            v_session.created_by,
            v_session.approved_by,
            NOW()
        )
        RETURNING id INTO v_movement_id;

        -- ----------------------------------------------------
        -- F. UPDATE INVENTORY BALANCE
        -- ----------------------------------------------------

        UPDATE public.inventory_balances
        SET
            available_quantity =
                available_quantity +
                CASE WHEN v_item.inventory_status = 'available'
                     THEN v_delta ELSE 0 END,

            reserved_quantity =
                reserved_quantity +
                CASE WHEN v_item.inventory_status = 'reserved'
                     THEN v_delta ELSE 0 END,

            quarantine_quantity =
                quarantine_quantity +
                CASE WHEN v_item.inventory_status = 'quarantine'
                     THEN v_delta ELSE 0 END,

            damaged_quantity =
                damaged_quantity +
                CASE WHEN v_item.inventory_status = 'damaged'
                     THEN v_delta ELSE 0 END,

            repair_quantity =
                repair_quantity +
                CASE WHEN v_item.inventory_status = 'repair'
                     THEN v_delta ELSE 0 END,

            on_hand_quantity = v_quantity_after,
            inventory_value = v_value_after,
            average_unit_cost = v_average_after,
            updated_at = NOW()
        WHERE product_variant_id = v_item.product_variant_id
          AND warehouse_id = v_session.warehouse_id;

        -- ----------------------------------------------------
        -- G. POST MOVEMENT
        -- ----------------------------------------------------

        UPDATE public.inventory_movements
        SET
            status = 'posted',
            posted_by = v_user_id,
            posted_at = NOW()
        WHERE id = v_movement_id;

        -- ----------------------------------------------------
        -- H. IMMUTABLE VALUATION LOG
        -- ----------------------------------------------------

        INSERT INTO public.inventory_valuation_logs (
            inventory_movement_id,
            product_variant_id,
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
            v_item.product_variant_id,
            v_session.warehouse_id,
            'adjustment',
            v_quantity_before,
            v_quantity_after,
            v_delta,
            v_value_before,
            v_value_after,
            v_value_after - v_value_before,
            v_average_before,
            v_average_after,
            v_user_id
        );
    END LOOP;

    -- --------------------------------------------------------
    -- I. COMPLETE SESSION
    -- --------------------------------------------------------

    UPDATE public.stock_opname_sessions
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;

-- ------------------------------------------------------------
-- 3. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION
    public.start_stock_opname(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.start_stock_opname(UUID)
TO authenticated;

REVOKE ALL ON FUNCTION
    public.post_stock_opname(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.post_stock_opname(UUID)
TO authenticated;

COMMIT;

-- ============================================================
-- END FILE 48
-- ============================================================
