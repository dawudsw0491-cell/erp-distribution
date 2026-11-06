
-- =====================================================
-- FILE 29: CREATE INVENTORY BALANCES
-- PROJECT: ERP Distribution
-- PURPOSE: Saldo persediaan per variasi, gudang,
--          dan status persediaan
-- VALUATION: MOVING AVERAGE PER WAREHOUSE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    warehouse_id UUID NOT NULL
        REFERENCES public.warehouses(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    -- Saldo berdasarkan status persediaan
    available_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    reserved_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    quarantine_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    damaged_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    repair_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    -- Total seluruh stok fisik
    on_hand_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,

    -- Nilai persediaan internal
    inventory_value NUMERIC(20,4) NOT NULL DEFAULT 0,

    -- Moving Average per variasi dan gudang
    average_unit_cost NUMERIC(20,6) NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Satu saldo per variasi dan gudang
    CONSTRAINT uq_inventory_balance_variant_warehouse
        UNIQUE (product_variant_id, warehouse_id),

    -- Seluruh kuantitas tidak boleh negatif
    CONSTRAINT chk_inventory_quantities
        CHECK (
            available_quantity >= 0
            AND reserved_quantity >= 0
            AND quarantine_quantity >= 0
            AND damaged_quantity >= 0
            AND repair_quantity >= 0
            AND on_hand_quantity >= 0
        ),

    -- Total stok harus sama dengan seluruh status
    CONSTRAINT chk_inventory_status_total
        CHECK (
            on_hand_quantity =
                available_quantity
                + reserved_quantity
                + quarantine_quantity
                + damaged_quantity
                + repair_quantity
        ),

    -- Validasi nilai persediaan
    CONSTRAINT chk_inventory_value
        CHECK (inventory_value >= 0),

    CONSTRAINT chk_inventory_average_cost
        CHECK (average_unit_cost >= 0),

    -- Saldo nol harus memiliki nilai dan biaya rata-rata nol
    CONSTRAINT chk_inventory_zero_balance
        CHECK (
            on_hand_quantity > 0
            OR (
                inventory_value = 0
                AND average_unit_cost = 0
            )
        )
);


-- =====================================================
-- INDEXES
-- =====================================================

-- Unique constraint sudah menyediakan indeks
-- untuk product_variant_id + warehouse_id.

CREATE INDEX IF NOT EXISTS idx_inventory_balances_warehouse
ON public.inventory_balances(warehouse_id);


-- =====================================================
-- AUTOMATIC UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION
public.set_inventory_balance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_inventory_balance_updated_at
ON public.inventory_balances;

CREATE TRIGGER trg_inventory_balance_updated_at
BEFORE UPDATE
ON public.inventory_balances
FOR EACH ROW
EXECUTE FUNCTION public.set_inventory_balance_updated_at();


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.inventory_balances
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 29
-- =====================================================
