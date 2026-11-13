
-- ============================================================
-- HEXACORE ERP
-- FILE 47: STOCK OPNAME REVIEW & APPROVAL
-- ============================================================
-- Functions:
--   1. submit_stock_opname_review
--   2. approve_stock_opname
--   3. cancel_stock_opname
--
-- Approval policy:
--   - Owner may approve own Stock Opname.
--   - Non-owner users cannot approve their own documents.
--   - Approval does not directly change inventory balances.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. SUBMIT STOCK OPNAME FOR REVIEW
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_stock_opname_review(
    p_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_status TEXT;
    v_item_count BIGINT;
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

    SELECT s.status
    INTO v_status
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_status <> 'counting' THEN
        RAISE EXCEPTION
            'Only counting sessions can be submitted for review.';
    END IF;

    SELECT COUNT(*)
    INTO v_item_count
    FROM public.stock_opname_items i
    WHERE i.session_id = p_session_id;

    IF v_item_count = 0 THEN
        RAISE EXCEPTION
            'Cannot submit an empty Stock Opname session.';
    END IF;

    -- Every item must have a physical count.
    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items i
        WHERE i.session_id = p_session_id
          AND i.counted_quantity IS NULL
    ) THEN
        RAISE EXCEPTION
            'All Stock Opname items must be counted before review.';
    END IF;

    -- Every registered serialized unit must have
    -- an explicit present/missing count record.
    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items i
        JOIN public.product_variants pv
            ON pv.id = i.product_variant_id
        JOIN public.products p
            ON p.id = pv.product_id
        JOIN public.stock_opname_sessions s
            ON s.id = i.session_id
        WHERE i.session_id = p_session_id
          AND p.tracking_type IN ('imei', 'serial')
          AND (
              SELECT COUNT(*)
              FROM public.product_units u
              WHERE u.product_variant_id = i.product_variant_id
                AND u.warehouse_id = s.warehouse_id
                AND u.unit_status = i.inventory_status
          ) <> (
              SELECT COUNT(*)
              FROM public.stock_opname_unit_counts c
              WHERE c.opname_item_id = i.id
          )
    ) THEN
        RAISE EXCEPTION
            'Serialized count is incomplete. Every registered unit must be recorded as present or missing.';
    END IF;

    UPDATE public.stock_opname_sessions
    SET
        status = 'review',
        submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;


-- ------------------------------------------------------------
-- 2. APPROVE STOCK OPNAME
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_stock_opname(
    p_session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_created_by UUID;
    v_status TEXT;
    v_is_owner BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_owner := public.is_owner();

    IF NOT (
        public.has_permission('inventory.opname')
        OR v_is_owner
    ) THEN
        RAISE EXCEPTION
            'Permission denied: inventory.opname required.';
    END IF;

    SELECT
        s.created_by,
        s.status
    INTO
        v_created_by,
        v_status
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_status <> 'review' THEN
        RAISE EXCEPTION
            'Only sessions in review can be approved.';
    END IF;

    -- Maker-checker applies to non-owner users.
    -- Owner is allowed to approve their own document
    -- during the single-user setup phase.
    IF v_created_by = v_user_id
       AND NOT COALESCE(v_is_owner, FALSE) THEN
        RAISE EXCEPTION
            'Segregation of duties violation: creator cannot approve own Stock Opname.';
    END IF;

    UPDATE public.stock_opname_sessions
    SET
        status = 'approved',
        approved_by = v_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;


-- ------------------------------------------------------------
-- 3. CANCEL STOCK OPNAME
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_stock_opname(
    p_session_id UUID,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
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
        RAISE EXCEPTION
            'Permission denied: inventory.opname required.';
    END IF;

    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Cancellation reason is required.';
    END IF;

    SELECT s.status
    INTO v_status
    FROM public.stock_opname_sessions s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Opname session not found.';
    END IF;

    IF v_status NOT IN ('draft', 'counting', 'review') THEN
        RAISE EXCEPTION
            'Only draft, counting, or review sessions can be cancelled.';
    END IF;

    UPDATE public.stock_opname_sessions
    SET
        status = 'cancelled',
        cancelled_by = v_user_id,
        cancelled_at = NOW(),
        notes = CONCAT_WS(
            E'\n',
            NULLIF(notes, ''),
            'Cancellation reason: ' || BTRIM(p_reason)
        ),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$$;


-- ------------------------------------------------------------
-- 4. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION
    public.submit_stock_opname_review(UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
    public.approve_stock_opname(UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
    public.cancel_stock_opname(UUID, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.submit_stock_opname_review(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.approve_stock_opname(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.cancel_stock_opname(UUID, TEXT)
TO authenticated;

COMMIT;

-- ============================================================
-- END FILE 47
-- ============================================================
