
-- ============================================================
-- HEXACORE ERP
-- FILE 45: STOCK OPNAME FOUNDATION
-- ============================================================
-- Purpose:
--   1. Create stock opname sessions
--   2. Create stock opname item snapshots
--   3. Create serialized unit counting records
--   4. Enable RLS and read-only access policies
--
-- IMPORTANT:
--   - Does not modify inventory balances.
--   - Does not create inventory movements.
--   - Does not change product_units status.
--   - Writes will be performed by controlled RPC functions.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. PRE-FLIGHT: PREVENT UNKNOWN EXISTING STRUCTURES
-- ------------------------------------------------------------

DO $$
BEGIN
    IF to_regclass('public.stock_opname_sessions') IS NOT NULL
       OR to_regclass('public.stock_opname_items') IS NOT NULL
       OR to_regclass('public.stock_opname_unit_counts') IS NOT NULL
    THEN
        RAISE EXCEPTION
            'Stock Opname table already exists. Inspect existing structures before applying this migration.';
    END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1. STOCK OPNAME SESSIONS
-- ------------------------------------------------------------

CREATE TABLE public.stock_opname_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    opname_number VARCHAR(50) NOT NULL UNIQUE,

    warehouse_id UUID NOT NULL
        REFERENCES public.warehouses(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    snapshot_at TIMESTAMPTZ,

    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,

    approved_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    approved_at TIMESTAMPTZ,

    posted_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    posted_at TIMESTAMPTZ,

    cancelled_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    cancelled_at TIMESTAMPTZ,

    notes TEXT,

    created_by UUID NOT NULL
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_stock_opname_session_status
        CHECK (
            status IN (
                'draft',
                'counting',
                'review',
                'approved',
                'posted',
                'cancelled'
            )
        ),

    CONSTRAINT chk_stock_opname_approval_metadata
        CHECK (
            (approved_by IS NULL AND approved_at IS NULL)
            OR
            (approved_by IS NOT NULL AND approved_at IS NOT NULL)
        ),

    CONSTRAINT chk_stock_opname_posting_metadata
        CHECK (
            (status = 'posted'
                AND posted_by IS NOT NULL
                AND posted_at IS NOT NULL)
            OR
            (status <> 'posted')
        ),

    CONSTRAINT chk_stock_opname_cancellation_metadata
        CHECK (
            (status = 'cancelled'
                AND cancelled_by IS NOT NULL
                AND cancelled_at IS NOT NULL)
            OR
            (status <> 'cancelled')
        )
);

-- ------------------------------------------------------------
-- 2. STOCK OPNAME ITEMS
-- One row per product variant and inventory status.
-- ------------------------------------------------------------

CREATE TABLE public.stock_opname_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL
        REFERENCES public.stock_opname_sessions(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    inventory_status VARCHAR(30) NOT NULL,

    snapshot_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    counted_quantity NUMERIC(18,3),

    variance_quantity NUMERIC(18,3)
        GENERATED ALWAYS AS (
            counted_quantity - snapshot_quantity
        ) STORED,

    snapshot_average_unit_cost NUMERIC(20,6) NOT NULL DEFAULT 0,

    snapshot_inventory_value NUMERIC(20,4) NOT NULL DEFAULT 0,

    notes TEXT,

    counted_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    counted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_stock_opname_item
        UNIQUE (
            session_id,
            product_variant_id,
            inventory_status
        ),

    CONSTRAINT chk_stock_opname_item_inventory_status
        CHECK (
            inventory_status IN (
                'available',
                'reserved',
                'quarantine',
                'damaged',
                'repair'
            )
        ),

    CONSTRAINT chk_stock_opname_snapshot_quantity
        CHECK (snapshot_quantity >= 0),

    CONSTRAINT chk_stock_opname_counted_quantity
        CHECK (
            counted_quantity IS NULL
            OR counted_quantity >= 0
        ),

    CONSTRAINT chk_stock_opname_snapshot_cost
        CHECK (snapshot_average_unit_cost >= 0),

    CONSTRAINT chk_stock_opname_snapshot_value
        CHECK (snapshot_inventory_value >= 0),

    CONSTRAINT chk_stock_opname_count_metadata
        CHECK (
            (counted_by IS NULL AND counted_at IS NULL)
            OR
            (counted_by IS NOT NULL AND counted_at IS NOT NULL)
        )
);

-- ------------------------------------------------------------
-- 3. STOCK OPNAME UNIT COUNTS
-- Individual IMEI / SERIAL unit verification.
-- ------------------------------------------------------------

CREATE TABLE public.stock_opname_unit_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    opname_item_id UUID NOT NULL
        REFERENCES public.stock_opname_items(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    product_unit_id UUID NOT NULL
        REFERENCES public.product_units(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    is_present BOOLEAN NOT NULL DEFAULT TRUE,

    observed_status VARCHAR(30),

    notes TEXT,

    counted_by UUID
        REFERENCES auth.users(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    counted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_stock_opname_unit_count
        UNIQUE (
            opname_item_id,
            product_unit_id
        ),

    CONSTRAINT chk_stock_opname_unit_observed_status
        CHECK (
            observed_status IS NULL
            OR observed_status IN (
                'available',
                'reserved',
                'quarantine',
                'damaged',
                'repair'
            )
        ),

    CONSTRAINT chk_stock_opname_unit_count_metadata
        CHECK (
            (counted_by IS NULL AND counted_at IS NULL)
            OR
            (counted_by IS NOT NULL AND counted_at IS NOT NULL)
        )
);

-- ------------------------------------------------------------
-- 4. INDEXES
-- ------------------------------------------------------------

CREATE INDEX idx_stock_opname_sessions_warehouse
    ON public.stock_opname_sessions(warehouse_id);

CREATE INDEX idx_stock_opname_sessions_status
    ON public.stock_opname_sessions(status);

CREATE INDEX idx_stock_opname_sessions_created_at
    ON public.stock_opname_sessions(created_at DESC);

CREATE INDEX idx_stock_opname_items_session
    ON public.stock_opname_items(session_id);

CREATE INDEX idx_stock_opname_items_variant
    ON public.stock_opname_items(product_variant_id);

CREATE INDEX idx_stock_opname_unit_counts_item
    ON public.stock_opname_unit_counts(opname_item_id);

CREATE INDEX idx_stock_opname_unit_counts_unit
    ON public.stock_opname_unit_counts(product_unit_id);

-- ------------------------------------------------------------
-- 5. ENABLE RLS
-- ------------------------------------------------------------

ALTER TABLE public.stock_opname_sessions
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_opname_items
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_opname_unit_counts
    ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 6. READ POLICIES
-- ------------------------------------------------------------

CREATE POLICY stock_opname_sessions_select
ON public.stock_opname_sessions
FOR SELECT
TO authenticated
USING (
    public.has_permission('inventory.view')
    OR public.has_permission('inventory.opname')
    OR public.is_owner()
);

CREATE POLICY stock_opname_items_select
ON public.stock_opname_items
FOR SELECT
TO authenticated
USING (
    public.has_permission('inventory.view')
    OR public.has_permission('inventory.opname')
    OR public.is_owner()
);

CREATE POLICY stock_opname_unit_counts_select
ON public.stock_opname_unit_counts
FOR SELECT
TO authenticated
USING (
    public.has_permission('inventory.view')
    OR public.has_permission('inventory.opname')
    OR public.is_owner()
);

-- ------------------------------------------------------------
-- 7. TABLE PRIVILEGES
-- ------------------------------------------------------------

GRANT SELECT
ON public.stock_opname_sessions,
   public.stock_opname_items,
   public.stock_opname_unit_counts
TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.stock_opname_sessions,
   public.stock_opname_items,
   public.stock_opname_unit_counts
FROM anon, authenticated;

COMMIT;

-- ============================================================
-- END FILE 45
-- ============================================================
