
-- =====================================================
-- FILE 22: CREATE PRODUCT ATTRIBUTES
-- PROJECT: ERP Distribution
-- PURPOSE: Kamus atribut spesifikasi produk
-- MODULE: PRODUCT MASTER DATA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identitas atribut
    attribute_code VARCHAR(100) NOT NULL,
    attribute_name VARCHAR(150) NOT NULL,

    -- Tipe nilai atribut
    data_type VARCHAR(20) NOT NULL DEFAULT 'text',

    -- Satuan opsional, contoh GB, inch, kg
    unit VARCHAR(30),

    -- NULL berarti berlaku secara umum
    applies_to_category_id UUID
        REFERENCES public.product_categories(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    sort_order INTEGER NOT NULL DEFAULT 0,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_product_attributes_code
        UNIQUE (attribute_code),

    CONSTRAINT chk_product_attribute_code_not_empty
        CHECK (LENGTH(TRIM(attribute_code)) > 0),

    CONSTRAINT chk_product_attribute_name_not_empty
        CHECK (LENGTH(TRIM(attribute_name)) > 0),

    CONSTRAINT chk_product_attribute_data_type
        CHECK (
            data_type IN (
                'text',
                'number',
                'boolean',
                'date'
            )
        ),

    CONSTRAINT chk_product_attribute_unit_not_empty
        CHECK (
            unit IS NULL
            OR LENGTH(TRIM(unit)) > 0
        ),

    CONSTRAINT chk_product_attribute_sort_order
        CHECK (sort_order >= 0)
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_product_attributes_category
ON public.product_attributes(applies_to_category_id);

CREATE INDEX IF NOT EXISTS idx_product_attributes_active
ON public.product_attributes(is_active);

CREATE INDEX IF NOT EXISTS idx_product_attributes_category_active
ON public.product_attributes(
    applies_to_category_id,
    is_active,
    sort_order
);


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.product_attributes
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 22
-- =====================================================
