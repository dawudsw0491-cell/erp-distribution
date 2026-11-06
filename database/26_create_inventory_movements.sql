
-- ============================================================
-- FILE 26: CREATE INVENTORY MOVEMENTS
-- PROJECT: ERP Distribution
-- PURPOSE: Inventory transaction ledger
-- DESIGN: CONTROLLED POSTING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    movement_group_id UUID,

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    warehouse_id UUID NOT NULL
        REFERENCES public.warehouses(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    product_unit_id UUID
        REFERENCES public.product_units(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    movement_type VARCHAR(30) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    -- Kuantitas bertanda:
    -- masuk positif, keluar negatif.
    -- status_change menggunakan 0.
    quantity_delta NUMERIC(18,3) NOT NULL,

    inventory_status VARCHAR(30),

    status_from VARCHAR(30),
    status_to VARCHAR(30),

    -- Referensi dokumen sumber.
    source_reference_type VARCHAR(50),
    source_reference_id UUID,
    source_reference_number VARCHAR(100),

    -- Reversal mengacu langsung ke movement asli.
    reversal_of_id UUID
        REFERENCES public.inventory_movements(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    notes TEXT,

    created_by UUID NOT NULL
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    posted_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    posted_at TIMESTAMPTZ,

    approved_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,

    approved_at TIMESTAMPTZ,

    CONSTRAINT chk_inventory_movement_type
        CHECK (
            movement_type IN (
                'purchase',
                'sale',
                'transfer_in',
                'transfer_out',
                'adjustment',
                'customer_return',
                'supplier_return',
                'opening_balance',
                'status_change'
            )
        ),

    CONSTRAINT chk_inventory_movement_status
        CHECK (
            status IN ('draft', 'posted', 'cancelled')
        ),

    CONSTRAINT chk_inventory_movement_quantity
        CHECK (
            (movement_type = 'status_change'
                AND quantity_delta = 0)
            OR
            (movement_type <> 'status_change'
                AND quantity_delta <> 0)
        ),

    CONSTRAINT chk_inventory_movement_direction
        CHECK (
            movement_type = 'status_change'
            OR movement_type = 'adjustment'
            OR (
                movement_type IN (
                    'purchase',
                    'transfer_in',
                    'customer_return',
                    'opening_balance'
                )
                AND quantity_delta > 0
            )
            OR (
                movement_type IN (
                    'sale',
                    'transfer_out',
                    'supplier_return'
                )
                AND quantity_delta < 0
            )
        ),

    CONSTRAINT chk_inventory_movement_stock_status
        CHECK (
            (
                movement_type = 'status_change'
                AND status_from IS NOT NULL
                AND status_to IS NOT NULL
                AND status_from <> status_to
                AND inventory_status IS NULL
            )
            OR
            (
                movement_type <> 'status_change'
                AND inventory_status IN (
                    'available',
                    'reserved',
                    'quarantine',
                    'damaged',
                    'repair'
                )
                AND status_from IS NULL
                AND status_to IS NULL
            )
        ),

    CONSTRAINT chk_inventory_movement_posted_metadata
        CHECK (
            (
                status = 'posted'
                AND posted_by IS NOT NULL
                AND posted_at IS NOT NULL
            )
            OR
            status <> 'posted'
        ),

    CONSTRAINT chk_inventory_movement_approval_metadata
        CHECK (
            (approved_by IS NULL AND approved_at IS NULL)
            OR
            (approved_by IS NOT NULL AND approved_at IS NOT NULL)
        ),

    CONSTRAINT chk_inventory_movement_no_self_reversal
        CHECK (
            reversal_of_id IS NULL OR reversal_of_id <> id
        )
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant
ON public.inventory_movements(product_variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse
ON public.inventory_movements(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_status
ON public.inventory_movements(status);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_group
ON public.inventory_movements(movement_group_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
ON public.inventory_movements(created_at);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_reversal
ON public.inventory_movements(reversal_of_id)
WHERE reversal_of_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_unit
ON public.inventory_movements(product_unit_id)
WHERE product_unit_id IS NOT NULL;

-- ============================================================
-- TRANSFER GROUP VALIDATION
-- Satu group dapat berisi transfer_out dan transfer_in.
-- Validasi pasangan dan atomicity dilakukan oleh posting function.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_group_type
ON public.inventory_movements(movement_group_id, movement_type)
WHERE movement_group_id IS NOT NULL
  AND movement_type IN ('transfer_in', 'transfer_out');

-- ============================================================
-- RLS
-- Belum diberikan policy akses.
-- Akses akan diatur setelah fungsi posting dan RBAC siap.
-- ============================================================

ALTER TABLE public.inventory_movements
ENABLE ROW LEVEL SECURITY;

-- Tidak memberikan akses langsung kepada anon/authenticated.
-- Posting dilakukan melalui fungsi terkontrol pada tahap berikutnya.
REVOKE INSERT, UPDATE, DELETE
ON public.inventory_movements
FROM anon, authenticated;

-- ============================================================
-- END OF FILE 26
-- ============================================================
