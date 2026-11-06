
-- =====================================================
-- FILE 19: CREATE PRODUCT VARIANTS
-- PROJECT: ERP Distribution
-- PURPOSE: Menyimpan SKU/variasi produk yang dapat
--          dibeli, dijual, dan dikelola persediaannya
-- MODULE: PRODUCT MASTER DATA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL
        REFERENCES public.products(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    -- Identitas unik variasi/SKU
    variant_code VARCHAR(100) NOT NULL,
    variant_name VARCHAR(255) NOT NULL,

    -- Barcode bersifat opsional, tetapi harus unik
    barcode VARCHAR(100),

    -- Satuan transaksi variasi
    unit VARCHAR(30) NOT NULL DEFAULT 'pcs',

    description TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_product_variants_code
        UNIQUE (variant_code),

    CONSTRAINT chk_variant_code_not_empty
        CHECK (LENGTH(TRIM(variant_code)) > 0),

    CONSTRAINT chk_variant_name_not_empty
        CHECK (LENGTH(TRIM(variant_name)) > 0),

    CONSTRAINT chk_variant_unit_not_empty
        CHECK (LENGTH(TRIM(unit)) > 0),

    CONSTRAINT chk_variant_barcode_not_empty
        CHECK (
            barcode IS NULL
            OR LENGTH(TRIM(barcode)) > 0
        )
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
ON public.product_variants(product_id);

-- Barcode unik tanpa membedakan huruf besar/kecil
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_barcode
ON public.product_variants(UPPER(TRIM(barcode)))
WHERE barcode IS NOT NULL;


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.product_variants
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 19
-- =====================================================
