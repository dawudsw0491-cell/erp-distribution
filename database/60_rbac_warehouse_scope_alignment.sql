-- SEC-003 / INT-002: canonical Purchasing permission and warehouse scope hardening.
-- Source-only change. Apply to a development database and run the two-warehouse test
-- suite before any live deployment. This file does not apply itself to Supabase.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- SECURITY INVOKER evaluates the request JWT through has_warehouse_access().
-- SECURITY DEFINER business RPCs retain the request JWT, so their writes are checked here.
CREATE OR REPLACE FUNCTION private.enforce_warehouse_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_row jsonb;
    v_warehouse_id uuid;
BEGIN
    -- Preserve the trusted server-only service-role path.
    IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    FOR v_row IN
        SELECT value
        FROM jsonb_array_elements(
            CASE TG_OP
                WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
                WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
                ELSE jsonb_build_array(to_jsonb(OLD), to_jsonb(NEW))
            END
        ) AS row_versions(value)
    LOOP
        v_warehouse_id := NULL;

        CASE TG_TABLE_NAME
            WHEN 'purchase_orders',
                 'goods_receipts',
                 'inventory_movements',
                 'inventory_balances',
                 'stock_opname_sessions' THEN
                v_warehouse_id := NULLIF(v_row ->> 'warehouse_id', '')::uuid;

            WHEN 'product_units' THEN
                -- NULL is the existing unassigned/historical unit state.
                v_warehouse_id := NULLIF(v_row ->> 'warehouse_id', '')::uuid;
                IF v_warehouse_id IS NULL THEN CONTINUE; END IF;

            WHEN 'purchase_order_items' THEN
                SELECT po.warehouse_id
                  INTO v_warehouse_id
                  FROM public.purchase_orders po
                 WHERE po.id = NULLIF(v_row ->> 'purchase_order_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Purchase Order not found'
                        USING ERRCODE = '42501';
                END IF;

            WHEN 'goods_receipt_items' THEN
                SELECT gr.warehouse_id
                  INTO v_warehouse_id
                  FROM public.goods_receipts gr
                 WHERE gr.id = NULLIF(v_row ->> 'goods_receipt_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Goods Receipt not found'
                        USING ERRCODE = '42501';
                END IF;

            WHEN 'goods_receipt_units' THEN
                SELECT gr.warehouse_id
                  INTO v_warehouse_id
                  FROM public.goods_receipt_items gri
                  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
                 WHERE gri.id = NULLIF(v_row ->> 'goods_receipt_item_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Goods Receipt item not found'
                        USING ERRCODE = '42501';
                END IF;

            WHEN 'goods_receipt_unit_identifiers' THEN
                SELECT gr.warehouse_id
                  INTO v_warehouse_id
                  FROM public.goods_receipt_units gru
                  JOIN public.goods_receipt_items gri ON gri.id = gru.goods_receipt_item_id
                  JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
                 WHERE gru.id = NULLIF(v_row ->> 'goods_receipt_unit_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Goods Receipt unit not found'
                        USING ERRCODE = '42501';
                END IF;

            WHEN 'product_unit_identifiers' THEN
                SELECT pu.warehouse_id
                  INTO v_warehouse_id
                  FROM public.product_units pu
                 WHERE pu.id = NULLIF(v_row ->> 'product_unit_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent product unit not found'
                        USING ERRCODE = '42501';
                END IF;
                IF v_warehouse_id IS NULL THEN CONTINUE; END IF;

            WHEN 'stock_opname_items' THEN
                SELECT s.warehouse_id
                  INTO v_warehouse_id
                  FROM public.stock_opname_sessions s
                 WHERE s.id = NULLIF(v_row ->> 'session_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Stock Opname session not found'
                        USING ERRCODE = '42501';
                END IF;

            WHEN 'stock_opname_unit_counts' THEN
                SELECT s.warehouse_id
                  INTO v_warehouse_id
                  FROM public.stock_opname_items i
                  JOIN public.stock_opname_sessions s ON s.id = i.session_id
                 WHERE i.id = NULLIF(v_row ->> 'opname_item_id', '')::uuid;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse scope parent Stock Opname item not found'
                        USING ERRCODE = '42501';
                END IF;

            ELSE
                RAISE EXCEPTION 'Warehouse scope trigger is not configured for table %', TG_TABLE_NAME
                    USING ERRCODE = '22023';
        END CASE;

        IF v_warehouse_id IS NULL THEN
            RAISE EXCEPTION 'Warehouse scope could not be resolved for table %', TG_TABLE_NAME
                USING ERRCODE = '42501';
        END IF;

        IF NOT public.has_warehouse_access(v_warehouse_id) THEN
            RAISE EXCEPTION 'Warehouse access denied for table %', TG_TABLE_NAME
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_warehouse_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.enforce_warehouse_scope() TO authenticated, service_role;

-- Transfers are represented by two inventory_movements rows; each warehouse
-- is checked independently. Child rows resolve scope through their parent.
DO $block$
DECLARE
    v_table text;
    v_tables text[] := ARRAY[
        'purchase_orders',
        'purchase_order_items',
        'goods_receipts',
        'goods_receipt_items',
        'goods_receipt_units',
        'goods_receipt_unit_identifiers',
        'inventory_movements',
        'inventory_balances',
        'product_units',
        'product_unit_identifiers',
        'stock_opname_sessions',
        'stock_opname_items',
        'stock_opname_unit_counts'
    ];
    v_delete_guarded_tables text[] := ARRAY[
        'purchase_orders',
        'goods_receipts',
        'inventory_movements',
        'inventory_balances',
        'product_units',
        'stock_opname_sessions'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_enforce_warehouse_scope ON public.%I',
            v_table
        );

        IF v_table = ANY(v_delete_guarded_tables) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_enforce_warehouse_scope
                 BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION private.enforce_warehouse_scope()',
                v_table
            );
        ELSE
            EXECUTE format(
                'CREATE TRIGGER trg_enforce_warehouse_scope
                 BEFORE INSERT OR UPDATE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION private.enforce_warehouse_scope()',
                v_table
            );
        END IF;
    END LOOP;
END;
$block$;

-- Purchase Orders.
ALTER POLICY purchase_orders_select ON public.purchase_orders
    USING (
        public.has_permission('purchasing.view')
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY purchase_orders_insert ON public.purchase_orders
    WITH CHECK (
        public.has_permission('purchasing.create')
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY purchase_orders_update ON public.purchase_orders
    USING (
        (
            public.has_permission('purchasing.update')
            OR public.has_permission('purchasing.approve')
        )
        AND public.has_warehouse_access(warehouse_id)
    )
    WITH CHECK (
        (
            public.has_permission('purchasing.update')
            OR public.has_permission('purchasing.approve')
        )
        AND public.has_warehouse_access(warehouse_id)
    );

ALTER POLICY purchase_order_items_select ON public.purchase_order_items
    USING (
        EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND public.has_permission('purchasing.view')
              AND public.has_warehouse_access(po.warehouse_id)
        )
    );
ALTER POLICY purchase_order_items_insert ON public.purchase_order_items
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND public.has_permission('purchasing.create')
              AND public.has_warehouse_access(po.warehouse_id)
        )
    );
ALTER POLICY purchase_order_items_update ON public.purchase_order_items
    USING (
        EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND public.has_permission('purchasing.update')
              AND public.has_warehouse_access(po.warehouse_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.purchase_order_id
              AND public.has_permission('purchasing.update')
              AND public.has_warehouse_access(po.warehouse_id)
        )
    );

-- Goods Receipt is canonicalized to purchasing.* across RPC, Dashboard and RLS.
ALTER POLICY goods_receipts_select ON public.goods_receipts
    USING (
        public.has_permission('purchasing.view')
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY goods_receipts_insert ON public.goods_receipts
    WITH CHECK (
        public.has_permission('purchasing.create')
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY goods_receipts_update ON public.goods_receipts
    USING (
        (
            public.has_permission('purchasing.update')
            OR public.has_permission('purchasing.approve')
        )
        AND public.has_warehouse_access(warehouse_id)
    )
    WITH CHECK (
        (
            public.has_permission('purchasing.update')
            OR public.has_permission('purchasing.approve')
        )
        AND public.has_warehouse_access(warehouse_id)
    );

ALTER POLICY goods_receipt_items_select ON public.goods_receipt_items
    USING (
        EXISTS (
            SELECT 1
            FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND public.has_permission('purchasing.view')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );
ALTER POLICY goods_receipt_items_insert ON public.goods_receipt_items
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND public.has_permission('purchasing.create')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );
ALTER POLICY goods_receipt_items_update ON public.goods_receipt_items
    USING (
        EXISTS (
            SELECT 1
            FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND public.has_permission('purchasing.update')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND public.has_permission('purchasing.update')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );

ALTER POLICY goods_receipt_units_select ON public.goods_receipt_units
    USING (
        EXISTS (
            SELECT 1
            FROM public.goods_receipt_items gri
            JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
            WHERE gri.id = goods_receipt_units.goods_receipt_item_id
              AND public.has_permission('purchasing.view')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );
ALTER POLICY goods_receipt_units_insert ON public.goods_receipt_units
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.goods_receipt_items gri
            JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
            WHERE gri.id = goods_receipt_units.goods_receipt_item_id
              AND public.has_permission('purchasing.create')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );

ALTER POLICY goods_receipt_identifiers_select ON public.goods_receipt_unit_identifiers
    USING (
        EXISTS (
            SELECT 1
            FROM public.goods_receipt_units gru
            JOIN public.goods_receipt_items gri ON gri.id = gru.goods_receipt_item_id
            JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
            WHERE gru.id = goods_receipt_unit_identifiers.goods_receipt_unit_id
              AND public.has_permission('purchasing.view')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );
ALTER POLICY goods_receipt_identifiers_insert ON public.goods_receipt_unit_identifiers
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.goods_receipt_units gru
            JOIN public.goods_receipt_items gri ON gri.id = gru.goods_receipt_item_id
            JOIN public.goods_receipts gr ON gr.id = gri.goods_receipt_id
            WHERE gru.id = goods_receipt_unit_identifiers.goods_receipt_unit_id
              AND public.has_permission('purchasing.create')
              AND public.has_warehouse_access(gr.warehouse_id)
        )
    );

-- Inventory tables.
ALTER POLICY inventory_movements_select ON public.inventory_movements
    USING (
        (public.has_permission('inventory.view') OR public.is_owner())
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY inventory_select_product_units ON public.product_units
    USING (
        (public.has_permission('inventory.view') OR public.is_owner())
        AND (
            warehouse_id IS NULL
            OR public.has_warehouse_access(warehouse_id)
        )
    );
ALTER POLICY inventory_select_product_unit_identifiers ON public.product_unit_identifiers
    USING (
        (public.has_permission('inventory.view') OR public.is_owner())
        AND EXISTS (
            SELECT 1
            FROM public.product_units pu
            WHERE pu.id = product_unit_identifiers.product_unit_id
              AND (
                  pu.warehouse_id IS NULL
                  OR public.has_warehouse_access(pu.warehouse_id)
              )
        )
    );

-- Stock Opname child rows inherit the session warehouse.
ALTER POLICY stock_opname_sessions_select ON public.stock_opname_sessions
    USING (
        (
            public.has_permission('inventory.view')
            OR public.has_permission('inventory.opname')
            OR public.is_owner()
        )
        AND public.has_warehouse_access(warehouse_id)
    );
ALTER POLICY stock_opname_items_select ON public.stock_opname_items
    USING (
        EXISTS (
            SELECT 1
            FROM public.stock_opname_sessions s
            WHERE s.id = stock_opname_items.session_id
              AND (
                  public.has_permission('inventory.view')
                  OR public.has_permission('inventory.opname')
                  OR public.is_owner()
              )
              AND public.has_warehouse_access(s.warehouse_id)
        )
    );
ALTER POLICY stock_opname_unit_counts_select ON public.stock_opname_unit_counts
    USING (
        EXISTS (
            SELECT 1
            FROM public.stock_opname_items i
            JOIN public.stock_opname_sessions s ON s.id = i.session_id
            WHERE i.id = stock_opname_unit_counts.opname_item_id
              AND (
                  public.has_permission('inventory.view')
                  OR public.has_permission('inventory.opname')
                  OR public.is_owner()
              )
              AND public.has_warehouse_access(s.warehouse_id)
        )
    );

COMMIT;
