
-- ============================================================
-- FILE 30: CREATE INVENTORY VALUATION LOGS
-- PROJECT: ERP Distribution
-- PURPOSE: Immutable inventory valuation history
-- VALUATION: MOVING AVERAGE PER WAREHOUSE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_valuation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    inventory_movement_id UUID NOT NULL
        REFERENCES public.inventory_movements(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    warehouse_id UUID NOT NULL
        REFERENCES public.warehouses(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    transaction_type VARCHAR(30) NOT NULL,

    quantity_before NUMERIC(18,3) NOT NULL,
    quantity_after NUMERIC(18,3) NOT NULL,
    quantity_delta NUMERIC(18,3) NOT NULL,

    value_before NUMERIC(20,4) NOT NULL,
    value_after NUMERIC(20,4) NOT NULL,
    inventory_value_delta NUMERIC(20,4) NOT NULL,

    average_cost_before NUMERIC(20,6) NOT NULL,
    average_cost_after NUMERIC(20,6) NOT NULL,

    created_by UUID NOT NULL
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_inventory_valuation_movement
        UNIQUE (inventory_movement_id),

    CONSTRAINT chk_valuation_transaction_type
        CHECK (
            transaction_type IN (
                'purchase',
                'sale',
                'transfer_in',
                'transfer_out',
                'adjustment',
                'customer_return',
                'supplier_return',
                'opening_balance'
            )
        ),

    CONSTRAINT chk_valuation_quantity
        CHECK (
            quantity_before >= 0
            AND quantity_after >= 0
        ),

    CONSTRAINT chk_valuation_value
        CHECK (
            value_before >= 0
            AND value_after >= 0
        ),

    CONSTRAINT chk_valuation_average_cost
        CHECK (
            average_cost_before >= 0
            AND average_cost_after >= 0
        ),

    CONSTRAINT chk_valuation_quantity_delta
        CHECK (
            quantity_delta <> 0
            AND quantity_delta = quantity_after - quantity_before
        ),

    CONSTRAINT chk_valuation_value_delta
        CHECK (
            inventory_value_delta =
                value_after - value_before
        ),

    CONSTRAINT chk_valuation_average_before
        CHECK (
            (
                quantity_before = 0
                AND value_before = 0
                AND average_cost_before = 0
            )
            OR
            (
                quantity_before > 0
                AND average_cost_before =
                    ROUND(value_before / quantity_before, 6)
            )
        ),

    CONSTRAINT chk_valuation_average_after
        CHECK (
            (
                quantity_after = 0
                AND value_after = 0
                AND average_cost_after = 0
            )
            OR
            (
                quantity_after > 0
                AND average_cost_after =
                    ROUND(value_after / quantity_after, 6)
            )
        )
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_valuation_logs_variant
ON public.inventory_valuation_logs(product_variant_id);

CREATE INDEX IF NOT EXISTS idx_valuation_logs_warehouse
ON public.inventory_valuation_logs(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_valuation_logs_created_at
ON public.inventory_valuation_logs(created_at);

-- ============================================================
-- VALIDATION AGAINST MOVEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION
public.validate_inventory_valuation_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_movement RECORD;
BEGIN
    SELECT
        movement_type,
        status,
        product_variant_id,
        warehouse_id
    INTO v_movement
    FROM public.inventory_movements
    WHERE id = NEW.inventory_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Inventory movement tidak ditemukan.';
    END IF;

    IF v_movement.status <> 'posted' THEN
        RAISE EXCEPTION
            'Valuation log hanya boleh dibuat untuk movement posted.';
    END IF;

    IF v_movement.movement_type = 'status_change' THEN
        RAISE EXCEPTION
            'Status change tidak menghasilkan valuation log.';
    END IF;

    IF NEW.transaction_type <> v_movement.movement_type THEN
        RAISE EXCEPTION
            'Transaction type tidak sesuai dengan movement.';
    END IF;

    IF NEW.product_variant_id <> v_movement.product_variant_id
       OR NEW.warehouse_id <> v_movement.warehouse_id THEN
        RAISE EXCEPTION
            'Referensi variant atau warehouse tidak sesuai movement.';
    END IF;

    IF NEW.quantity_delta <> v_movement.quantity_delta THEN
        RAISE EXCEPTION
            'Quantity delta tidak sesuai movement.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory_valuation_log
ON public.inventory_valuation_logs;

CREATE TRIGGER trg_validate_inventory_valuation_log
BEFORE INSERT
ON public.inventory_valuation_logs
FOR EACH ROW
EXECUTE FUNCTION public.validate_inventory_valuation_log();

-- ============================================================
-- APPEND-ONLY PROTECTION
-- ============================================================

CREATE OR REPLACE FUNCTION
public.prevent_inventory_valuation_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Inventory valuation log bersifat immutable. '
        'Gunakan movement kompensasi untuk koreksi.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_valuation_log_update_delete
ON public.inventory_valuation_logs;

CREATE TRIGGER trg_prevent_valuation_log_update_delete
BEFORE UPDATE OR DELETE
ON public.inventory_valuation_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inventory_valuation_log_change();

-- ============================================================
-- RLS AND PRIVILEGES
-- ============================================================

ALTER TABLE public.inventory_valuation_logs
ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE
ON public.inventory_valuation_logs
FROM anon, authenticated;

-- ============================================================
-- END OF FILE 30
-- ============================================================
