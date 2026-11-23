-- Repair Stock Opname aggregate IMEI posting and completeness validation.
-- Development only until validated; preserves existing function ACLs via CREATE OR REPLACE.
BEGIN;

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
                  product_variant_id IN (
                      SELECT pv.id
                      FROM public.product_variants pv
                      JOIN public.products p ON p.id = pv.product_id
                      WHERE p.tracking_type = 'imei'
                  )
                  AND aggregate_reconciliation_variance IS NULL
              )
          )
    ) THEN
        RAISE EXCEPTION 'Reconciliation is incomplete.';
    END IF;

    INSERT INTO public.inventory_balances (
        product_variant_id,
        product_id,
        warehouse_id
    )
    SELECT DISTINCT
        i.product_variant_id,
        pv.product_id,
        v_session.warehouse_id
    FROM public.stock_opname_items i
    JOIN public.product_variants pv ON pv.id = i.product_variant_id
    WHERE i.session_id = p_session_id
      AND i.is_required = TRUE
    ON CONFLICT (product_variant_id, warehouse_id) WHERE product_variant_id IS NOT NULL
    DO NOTHING;

    PERFORM b.id
    FROM public.inventory_balances b
    JOIN (
        SELECT DISTINCT product_variant_id
        FROM public.stock_opname_items
        WHERE session_id = p_session_id
          AND is_required = TRUE
    ) i ON i.product_variant_id = b.product_variant_id
    WHERE b.warehouse_id = v_session.warehouse_id
    ORDER BY b.product_variant_id
    FOR UPDATE OF b;

    FOR v_item IN
        SELECT
            i.id,
            i.product_variant_id,
            pv.product_id,
            i.inventory_status,
            i.reconciliation_variance,
            i.aggregate_reconciliation_variance,
            p.tracking_type
        FROM public.stock_opname_items i
        JOIN public.product_variants pv ON pv.id = i.product_variant_id
        JOIN public.products p ON p.id = pv.product_id
        WHERE i.session_id = p_session_id
          AND i.is_required = TRUE
        ORDER BY i.product_variant_id, i.inventory_status
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
        WHERE product_variant_id = v_item.product_variant_id
          AND warehouse_id = v_session.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Inventory balance not found for product %.',
                v_item.product_variant_id;
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
            product_variant_id,
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
            v_item.product_variant_id,
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
        WHERE product_variant_id = v_item.product_variant_id
          AND warehouse_id = v_session.warehouse_id;

        UPDATE public.inventory_movements
        SET
            product_id = v_item.product_id,
            status = 'posted',
            posted_by = v_user_id,
            posted_at = clock_timestamp()
        WHERE id = v_movement_id;

        INSERT INTO public.inventory_valuation_logs (
            inventory_movement_id,
            product_variant_id,
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
            v_item.product_variant_id,
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
        FROM public.stock_opname_items i
        JOIN public.product_variants pv
          ON pv.id = i.product_variant_id
        JOIN public.products p
          ON p.id = pv.product_id
        WHERE i.session_id = p_session_id
          AND i.is_required = TRUE
          AND (
              i.counted_quantity IS NULL
              OR i.counted_at IS NULL
              OR (
                  p.tracking_type = 'imei'
                  AND i.counted_aggregate_quantity IS NULL
              )
          )
    ) THEN
        RAISE EXCEPTION 'All required Stock Opname items must be counted before review.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_opname_items i
        JOIN public.stock_opname_sessions s
            ON s.id = i.session_id
        JOIN public.product_variants pv
            ON pv.id = i.product_variant_id
        JOIN public.products p
            ON p.id = pv.product_id
        WHERE i.session_id = p_session_id
          AND i.is_required = TRUE
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

COMMIT;
