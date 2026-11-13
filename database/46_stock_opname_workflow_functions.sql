
-- ============================================================
-- HEXACORE ERP
-- FILE 46: STOCK OPNAME WORKFLOW RPC
-- ============================================================
-- Functions:
--   1. create_stock_opname
--   2. start_stock_opname
--   3. record_stock_opname_count
--   4. record_stock_opname_unit_count
--
-- This migration does NOT:
--   - Post inventory adjustments
--   - Change inventory balances
--   - Change product_units status
--   - Create inventory movements
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. CREATE STOCK OPNAME SESSION
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_stock_opname(
    p_warehouse_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_opname_number TEXT;
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

    IF NOT EXISTS (
        SELECT 1
        FROM public.warehouses w
        WHERE w.id = p_warehouse_id
          AND w.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Active warehouse not found.';
    END IF;

    v_session_id := gen_random_uuid();

    v_opname_number :=
        'OPN-' ||
        TO_CHAR(NOW(), 'YYYYMMDD') ||
        '-' ||
        UPPER(SUBSTRING(REPLACE(v_session_id::TEXT, '-', '') FROM 1 FOR 8));

    INSERT INTO public.stock_opname_sessions (
        id,
        opname_number,
        warehouse_id,
        status,
        notes,
        created_by
    )
    VALUES (
        v_session_id,
        v_opname_number,
        p_warehouse_id,
        'draft',
        NULLIF(BTRIM(p_notes), ''),
        v_user_id
    );

    RETURN v_session_id;
END;
$$;

-- ------------------------------------------------------------
-- 2. START STOCK OPNAME AND CAPTURE SYSTEM SNAPSHOT
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

    SELECT
        s.warehouse_id,
        s.status
    INTO
        v_warehouse_id,
        v_status
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

    -- Snapshot all non-zero inventory status buckets.
    -- Unit cost is allocated using current moving average cost.

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
        b.product_variant_id,
        x.inventory_status,
        x.quantity,
        COALESCE(b.average_unit_cost, 0),
        ROUND(
            x.quantity * COALESCE(b.average_unit_cost, 0),
            4
        )
    FROM public.inventory_balances b
    CROSS JOIN LATERAL (
        VALUES
            ('available'::VARCHAR, b.available_quantity),
            ('reserved'::VARCHAR, b.reserved_quantity),
            ('quarantine'::VARCHAR, b.quarantine_quantity),
            ('damaged'::VARCHAR, b.damaged_quantity),
            ('repair'::VARCHAR, b.repair_quantity)
    ) AS x(inventory_status, quantity)
    WHERE b.warehouse_id = v_warehouse_id
      AND x.quantity > 0;

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
-- 3. RECORD QUANTITY PRODUCT PHYSICAL COUNT
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_stock_opname_count(
    p_item_id UUID,
    p_counted_quantity NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_product_id UUID;
    v_tracking_type TEXT;
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

    IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
        RAISE EXCEPTION 'Counted quantity must be zero or greater.';
    END IF;

    SELECT
        i.session_id,
        pv.product_id,
        p.tracking_type
    INTO
        v_session_id,
        v_product_id,
        v_tracking_type
    FROM public.stock_opname_items i
    JOIN public.product_variants pv
        ON pv.id = i.product_variant_id
    JOIN public.products p
        ON p.id = pv.product_id
    WHERE i.id = p_item_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname item not found.';
    END IF;

    IF v_tracking_type IS DISTINCT FROM 'quantity' THEN
        RAISE EXCEPTION
            'Aggregate count is only allowed for quantity-tracked products.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.stock_opname_sessions s
        WHERE s.id = v_session_id
          AND s.status = 'counting'
    ) THEN
        RAISE EXCEPTION 'Session is not in counting status.';
    END IF;

    UPDATE public.stock_opname_items
    SET
        counted_quantity = p_counted_quantity,
        notes = NULLIF(BTRIM(p_notes), ''),
        counted_by = v_user_id,
        counted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_item_id;

    RETURN p_item_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. RECORD SERIALIZED UNIT PHYSICAL COUNT
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_stock_opname_unit_count(
    p_item_id UUID,
    p_product_unit_id UUID,
    p_is_present BOOLEAN,
    p_observed_status VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_warehouse_id UUID;
    v_item_variant_id UUID;
    v_item_status TEXT;
    v_tracking_type TEXT;
    v_unit_variant_id UUID;
    v_unit_warehouse_id UUID;
    v_unit_status TEXT;
    v_count_id UUID;
    v_present_count NUMERIC;
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

    IF p_is_present IS NULL THEN
        RAISE EXCEPTION 'Physical presence must be specified.';
    END IF;

    IF p_observed_status IS NOT NULL
       AND p_observed_status NOT IN (
           'available',
           'reserved',
           'quarantine',
           'damaged',
           'repair'
       )
    THEN
        RAISE EXCEPTION 'Invalid observed inventory status.';
    END IF;

    SELECT
        s.id,
        s.warehouse_id,
        i.product_variant_id,
        i.inventory_status,
        p.tracking_type
    INTO
        v_session_id,
        v_warehouse_id,
        v_item_variant_id,
        v_item_status,
        v_tracking_type
    FROM public.stock_opname_items i
    JOIN public.stock_opname_sessions s
        ON s.id = i.session_id
    JOIN public.product_variants pv
        ON pv.id = i.product_variant_id
    JOIN public.products p
        ON p.id = pv.product_id
    WHERE i.id = p_item_id
      AND s.status = 'counting'
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Stock Opname item not found or session is not counting.';
    END IF;

    IF v_tracking_type NOT IN ('imei', 'serial') THEN
        RAISE EXCEPTION
            'Unit count is only allowed for IMEI or serial tracked products.';
    END IF;

    SELECT
        u.product_variant_id,
        u.warehouse_id,
        u.unit_status
    INTO
        v_unit_variant_id,
        v_unit_warehouse_id,
        v_unit_status
    FROM public.product_units u
    WHERE u.id = p_product_unit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product unit not found.';
    END IF;

    IF v_unit_variant_id <> v_item_variant_id THEN
        RAISE EXCEPTION
            'Product unit does not belong to the selected product variant.';
    END IF;

    IF v_unit_warehouse_id <> v_warehouse_id THEN
        RAISE EXCEPTION
            'Product unit does not belong to the session warehouse.';
    END IF;

    IF v_unit_status <> v_item_status THEN
        RAISE EXCEPTION
            'Product unit status does not match the Stock Opname item status.';
    END IF;

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
        NOW()
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

    -- Current count is based on registered units physically found.
    SELECT COUNT(*)::NUMERIC
    INTO v_present_count
    FROM public.stock_opname_unit_counts c
    WHERE c.opname_item_id = p_item_id
      AND c.is_present = TRUE;

    UPDATE public.stock_opname_items
    SET
        counted_quantity = v_present_count,
        counted_by = v_user_id,
        counted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_item_id;

    RETURN v_count_id;
END;
$$;

-- ------------------------------------------------------------
-- 5. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION
    public.create_stock_opname(UUID, TEXT)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
    public.start_stock_opname(UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
    public.record_stock_opname_count(UUID, NUMERIC, TEXT)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
    public.record_stock_opname_unit_count(
        UUID, UUID, BOOLEAN, VARCHAR, TEXT
    )
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.create_stock_opname(UUID, TEXT)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.start_stock_opname(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.record_stock_opname_count(UUID, NUMERIC, TEXT)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.record_stock_opname_unit_count(
        UUID, UUID, BOOLEAN, VARCHAR, TEXT
    )
TO authenticated;

COMMIT;

-- ============================================================
-- END FILE 46
-- ============================================================
