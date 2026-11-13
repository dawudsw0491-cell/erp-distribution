
-- ============================================================
-- FILE 43: FIX PRODUCT UNIT RETURN STATUS
-- PROJECT: HEXACORE ERP
-- PURPOSE:
--   1. Add returned_to_supplier unit status
--   2. Preserve warehouse location integrity
-- DEPENDENCY: FILE 24
-- ============================================================

BEGIN;

-- 1. Replace unit status constraint
ALTER TABLE public.product_units
DROP CONSTRAINT IF EXISTS chk_product_unit_status;

ALTER TABLE public.product_units
ADD CONSTRAINT chk_product_unit_status
CHECK (
    unit_status IN (
        'available',
        'reserved',
        'quarantine',
        'damaged',
        'repair',
        'sold',
        'in_transit',
        'returned_to_supplier'
    )
);

-- 2. Replace warehouse/status consistency constraint
ALTER TABLE public.product_units
DROP CONSTRAINT IF EXISTS chk_product_unit_warehouse_status;

ALTER TABLE public.product_units
ADD CONSTRAINT chk_product_unit_warehouse_status
CHECK (
    (
        unit_status IN (
            'sold',
            'in_transit',
            'returned_to_supplier'
        )
        AND warehouse_id IS NULL
    )
    OR
    (
        unit_status NOT IN (
            'sold',
            'in_transit',
            'returned_to_supplier'
        )
        AND warehouse_id IS NOT NULL
    )
);

COMMIT;

-- ============================================================
-- END OF FILE 43
-- ============================================================
