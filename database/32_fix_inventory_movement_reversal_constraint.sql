
-- ============================================================
-- FILE 32: FIX INVENTORY MOVEMENT REVERSAL CONSTRAINT
-- PURPOSE: Allow opposite quantity direction for reversals
-- DEPENDENCY: database/26_create_inventory_movements.sql
-- ============================================================

BEGIN;

ALTER TABLE public.inventory_movements
DROP CONSTRAINT IF EXISTS chk_inventory_movement_direction;

ALTER TABLE public.inventory_movements
ADD CONSTRAINT chk_inventory_movement_direction
CHECK (
    (
        movement_type = 'status_change'
        AND quantity_delta = 0
        AND reversal_of_id IS NULL
    )
    OR
    (
        movement_type = 'adjustment'
        AND quantity_delta <> 0
    )
    OR
    (
        movement_type IN (
            'purchase',
            'transfer_in',
            'customer_return',
            'opening_balance'
        )
        AND quantity_delta > 0
        AND reversal_of_id IS NULL
    )
    OR
    (
        movement_type IN (
            'sale',
            'transfer_out',
            'supplier_return'
        )
        AND quantity_delta < 0
        AND reversal_of_id IS NULL
    )
    OR
    (
        movement_type IN (
            'purchase',
            'sale',
            'transfer_in',
            'transfer_out',
            'adjustment',
            'customer_return',
            'supplier_return',
            'opening_balance'
        )
        AND quantity_delta <> 0
        AND reversal_of_id IS NOT NULL
    )
);

COMMIT;

-- ============================================================
-- END OF FILE 32
-- ============================================================
