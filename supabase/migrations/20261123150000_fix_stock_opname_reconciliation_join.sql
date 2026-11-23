-- Fix UPDATE FROM target-table reference in Stock Opname reconciliation.
-- Keep Variant-scoped reconciliation and aggregate IMEI logic from MD-014.
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
            WHERE im.product_variant_id = i.product_variant_id
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
            WHERE im.product_variant_id = i.product_variant_id
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
                WHERE im.product_variant_id = i.product_variant_id
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
                WHERE im.product_variant_id = i.product_variant_id
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
                    WHERE im.product_variant_id = i.product_variant_id
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
    FROM public.stock_opname_sessions s,
         public.product_variants pv
    JOIN public.products p
        ON p.id = pv.product_id
    WHERE pv.id = i.product_variant_id
      AND i.session_id = s.id
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
