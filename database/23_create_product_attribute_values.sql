
-- =====================================================
-- FILE 23: CREATE PRODUCT ATTRIBUTE VALUES
-- PROJECT: ERP Distribution
-- PURPOSE: Menyimpan nilai atribut setiap variasi produk
-- MODULE: PRODUCT MASTER DATA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_attribute_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_variant_id UUID NOT NULL
        REFERENCES public.product_variants(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    product_attribute_id UUID NOT NULL
        REFERENCES public.product_attributes(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    value_text TEXT,
    value_number NUMERIC,
    value_boolean BOOLEAN,
    value_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_variant_attribute
        UNIQUE (product_variant_id, product_attribute_id),

    CONSTRAINT chk_attribute_single_value
        CHECK (
            num_nonnulls(
                value_text,
                value_number,
                value_boolean,
                value_date
            ) = 1
        )
);


-- =====================================================
-- INDEXES
-- =====================================================

-- Indeks product_variant_id sudah tersedia
-- melalui unique constraint uq_variant_attribute.

CREATE INDEX IF NOT EXISTS idx_attribute_values_attribute
ON public.product_attribute_values(product_attribute_id);


-- =====================================================
-- VALIDASI TIPE DATA ATRIBUT
-- =====================================================

CREATE OR REPLACE FUNCTION
public.validate_product_attribute_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_data_type VARCHAR(20);
BEGIN
    SELECT pa.data_type
    INTO v_data_type
    FROM public.product_attributes pa
    WHERE pa.id = NEW.product_attribute_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product attribute tidak ditemukan.';
    END IF;

    IF v_data_type = 'text'
       AND NEW.value_text IS NULL THEN
        RAISE EXCEPTION
            'Atribut bertipe text harus menggunakan value_text.';

    ELSIF v_data_type = 'number'
       AND NEW.value_number IS NULL THEN
        RAISE EXCEPTION
            'Atribut bertipe number harus menggunakan value_number.';

    ELSIF v_data_type = 'boolean'
       AND NEW.value_boolean IS NULL THEN
        RAISE EXCEPTION
            'Atribut bertipe boolean harus menggunakan value_boolean.';

    ELSIF v_data_type = 'date'
       AND NEW.value_date IS NULL THEN
        RAISE EXCEPTION
            'Atribut bertipe date harus menggunakan value_date.';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_validate_product_attribute_value
ON public.product_attribute_values;

CREATE TRIGGER trg_validate_product_attribute_value
BEFORE INSERT OR UPDATE
ON public.product_attribute_values
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_attribute_value();


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.product_attribute_values
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 23
-- =====================================================
