
-- =====================================================
-- FILE 24: CREATE PRODUCT UNITS
-- PROJECT: ERP Distribution
-- PURPOSE: Mencatat setiap unit fisik produk
-- MODULE: INVENTORY MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    -- NULL hanya untuk unit sold atau in_transit.
    warehouse_id UUID
        REFERENCES public.warehouses(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    unit_code VARCHAR(100) NOT NULL UNIQUE,

    unit_status VARCHAR(30) NOT NULL DEFAULT 'available',

    received_at TIMESTAMPTZ,

    -- Informasi biaya unit, bukan sumber utama valuasi stok.
    unit_cost NUMERIC(18,4),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_product_unit_code_not_empty
        CHECK (LENGTH(TRIM(unit_code)) > 0),

    CONSTRAINT chk_product_unit_status
        CHECK (
            unit_status IN (
                'available',
                'reserved',
                'quarantine',
                'damaged',
                'repair',
                'sold',
                'in_transit'
            )
        ),

    CONSTRAINT chk_product_unit_cost
        CHECK (
            unit_cost IS NULL OR unit_cost >= 0
        ),

    CONSTRAINT chk_product_unit_warehouse_status
        CHECK (
            (
                unit_status IN ('sold', 'in_transit')
                AND warehouse_id IS NULL
            )
            OR
            (
                unit_status NOT IN ('sold', 'in_transit')
                AND warehouse_id IS NOT NULL
            )
        )
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_product_units_variant
ON public.product_units(product_variant_id);

CREATE INDEX IF NOT EXISTS idx_product_units_warehouse
ON public.product_units(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_product_units_status
ON public.product_units(unit_status);

CREATE INDEX IF NOT EXISTS idx_product_units_variant_warehouse
ON public.product_units(product_variant_id, warehouse_id);


-- =====================================================
-- VALIDASI TRACKING TYPE
-- Hanya produk IMEI atau SERIAL yang boleh
-- memiliki record product_units.
-- =====================================================

CREATE OR REPLACE FUNCTION
public.validate_product_unit_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_tracking_type VARCHAR(30);
BEGIN
    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
        ON p.id = pv.product_id
    WHERE pv.id = NEW.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product variant tidak ditemukan.';
    END IF;

    IF v_tracking_type NOT IN ('imei', 'serial') THEN
        RAISE EXCEPTION
            'Product unit hanya boleh dibuat untuk produk dengan tracking_type IMEI atau SERIAL.';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_validate_product_unit_tracking
ON public.product_units;

CREATE TRIGGER trg_validate_product_unit_tracking
BEFORE INSERT OR UPDATE OF product_variant_id
ON public.product_units
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_unit_tracking();


-- =====================================================
-- AUTOMATIC UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION
public.set_product_unit_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_product_unit_updated_at
ON public.product_units;

CREATE TRIGGER trg_product_unit_updated_at
BEFORE UPDATE
ON public.product_units
FOR EACH ROW
EXECUTE FUNCTION public.set_product_unit_updated_at();


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.product_units
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 24
-- =====================================================
