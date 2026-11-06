
-- =====================================================
-- FILE 25: CREATE PRODUCT UNIT IDENTIFIERS
-- PROJECT: ERP Distribution
-- PURPOSE: Menyimpan IMEI dan serial number setiap unit
-- MODULE: INVENTORY MANAGEMENT
-- =====================================================


-- =====================================================
-- FUNCTION: IMEI LUHN CHECKSUM
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_valid_imei(
    p_imei TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
    v_sum INTEGER := 0;
    v_digit INTEGER;
    v_doubled INTEGER;
    i INTEGER;
BEGIN
    IF p_imei !~ '^[0-9]{15}$' THEN
        RETURN FALSE;
    END IF;

    FOR i IN 1..14 LOOP
        v_digit := SUBSTRING(p_imei FROM i FOR 1)::INTEGER;

        IF i % 2 = 0 THEN
            v_doubled := v_digit * 2;

            IF v_doubled > 9 THEN
                v_doubled := v_doubled - 9;
            END IF;

            v_sum := v_sum + v_doubled;
        ELSE
            v_sum := v_sum + v_digit;
        END IF;
    END LOOP;

    v_sum := v_sum
        + SUBSTRING(p_imei FROM 15 FOR 1)::INTEGER;

    RETURN v_sum % 10 = 0;
END;
$$;


-- =====================================================
-- TABLE: PRODUCT UNIT IDENTIFIERS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_unit_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_unit_id UUID NOT NULL
        REFERENCES public.product_units(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,

    identifier_type VARCHAR(30) NOT NULL,

    identifier_value VARCHAR(150) NOT NULL,

    normalized_value VARCHAR(150)
        GENERATED ALWAYS AS (
            UPPER(TRIM(identifier_value))
        ) STORED,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_unit_identifier_type
        CHECK (
            identifier_type IN (
                'IMEI_1',
                'IMEI_2',
                'SERIAL_NUMBER'
            )
        ),

    CONSTRAINT chk_identifier_not_empty
        CHECK (
            LENGTH(TRIM(identifier_value)) > 0
        ),

    CONSTRAINT chk_imei_format
        CHECK (
            identifier_type NOT IN ('IMEI_1', 'IMEI_2')
            OR (
                identifier_value ~ '^[0-9]{15}$'
                AND public.is_valid_imei(identifier_value)
            )
        ),

    CONSTRAINT uq_unit_identifier_type
        UNIQUE (product_unit_id, identifier_type),

    CONSTRAINT uq_global_identifier
        UNIQUE (normalized_value)
);


-- =====================================================
-- VALIDASI TRACKING TYPE PRODUK
-- =====================================================

CREATE OR REPLACE FUNCTION
public.validate_unit_identifier_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_tracking_type VARCHAR(30);
BEGIN
    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_units pu
    JOIN public.product_variants pv
        ON pv.id = pu.product_variant_id
    JOIN public.products p
        ON p.id = pv.product_id
    WHERE pu.id = NEW.product_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product unit tidak ditemukan.';
    END IF;

    IF NEW.identifier_type IN ('IMEI_1', 'IMEI_2')
       AND v_tracking_type <> 'imei' THEN
        RAISE EXCEPTION
            'IMEI hanya dapat digunakan untuk produk tracking_type imei.';
    END IF;

    IF NEW.identifier_type = 'SERIAL_NUMBER'
       AND v_tracking_type NOT IN ('imei', 'serial') THEN
        RAISE EXCEPTION
            'Serial number hanya dapat digunakan untuk produk tracking_type imei atau serial.';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_validate_unit_identifier_tracking
ON public.product_unit_identifiers;

CREATE TRIGGER trg_validate_unit_identifier_tracking
BEFORE INSERT OR UPDATE
ON public.product_unit_identifiers
FOR EACH ROW
EXECUTE FUNCTION public.validate_unit_identifier_tracking();


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.product_unit_identifiers
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- END OF FILE 25
-- =====================================================
