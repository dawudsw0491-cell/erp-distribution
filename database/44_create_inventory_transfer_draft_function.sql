
CREATE OR REPLACE FUNCTION public.create_inventory_transfer(
    p_product_variant_id UUID,
    p_source_warehouse_id UUID,
    p_destination_warehouse_id UUID,
    p_quantity NUMERIC,
    p_inventory_status VARCHAR,
    p_product_unit_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_group_id UUID;
    v_tracking_type VARCHAR(30);
    v_source_quantity NUMERIC(18,3);
    v_unit_status VARCHAR(30);
    v_reference_number VARCHAR(50);
BEGIN
    -- 1. Authentication and permission
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('inventory.transfer') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.transfer.';
    END IF;

    -- 2. Validate input
    IF p_product_variant_id IS NULL
       OR p_source_warehouse_id IS NULL
       OR p_destination_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Produk dan kedua gudang wajib diisi.';
    END IF;

    IF p_source_warehouse_id = p_destination_warehouse_id THEN
        RAISE EXCEPTION
            'Gudang asal dan tujuan tidak boleh sama.';
    END IF;

    IF p_quantity IS NULL
       OR p_quantity <= 0
       OR p_quantity <> ROUND(p_quantity, 3) THEN
        RAISE EXCEPTION 'Quantity transfer tidak valid.';
    END IF;

    IF p_inventory_status IS NULL
       OR p_inventory_status NOT IN (
           'available',
           'reserved',
           'quarantine',
           'damaged',
           'repair'
       ) THEN
        RAISE EXCEPTION 'Inventory status tidak valid.';
    END IF;

    -- 3. Validate active warehouses
    IF (
        SELECT COUNT(*)
        FROM public.warehouses
        WHERE id IN (
            p_source_warehouse_id,
            p_destination_warehouse_id
        )
        AND is_active = TRUE
    ) <> 2 THEN
        RAISE EXCEPTION
            'Gudang asal dan tujuan harus aktif.';
    END IF;

    -- 4. Validate product tracking
    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = p_product_variant_id
      AND pv.is_active = TRUE
      AND p.is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Produk atau variant tidak ditemukan atau tidak aktif.';
    END IF;

    -- 5. Validate source balance and lock it
    SELECT
        CASE p_inventory_status
            WHEN 'available' THEN available_quantity
            WHEN 'reserved' THEN reserved_quantity
            WHEN 'quarantine' THEN quarantine_quantity
            WHEN 'damaged' THEN damaged_quantity
            WHEN 'repair' THEN repair_quantity
        END
    INTO v_source_quantity
    FROM public.inventory_balances
    WHERE product_variant_id = p_product_variant_id
      AND warehouse_id = p_source_warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Saldo inventory gudang asal tidak ditemukan.';
    END IF;

    IF v_source_quantity < p_quantity THEN
        RAISE EXCEPTION
            'Stok pada status yang dipilih tidak mencukupi.';
    END IF;

    -- 6. Validate serialized unit
    IF v_tracking_type = 'quantity' THEN

        IF p_product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id.';
        END IF;

    ELSIF v_tracking_type IN ('imei', 'serial') THEN

        IF p_product_unit_id IS NULL OR p_quantity <> 1 THEN
            RAISE EXCEPTION
                'Produk IMEI/serial harus ditransfer satu unit.';
        END IF;

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = p_product_unit_id
          AND product_variant_id = p_product_variant_id
          AND warehouse_id = p_source_warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Unit tidak ditemukan di gudang asal.';
        END IF;

        IF v_unit_status <> p_inventory_status THEN
            RAISE EXCEPTION
                'Status unit tidak sesuai dengan status transfer.';
        END IF;

        IF v_tracking_type = 'imei'
           AND NOT EXISTS (
               SELECT 1
               FROM public.product_unit_identifiers
               WHERE product_unit_id = p_product_unit_id
                 AND identifier_type = 'IMEI_1'
           ) THEN
            RAISE EXCEPTION
                'IMEI_1 wajib tersedia.';
        END IF;

        IF v_tracking_type = 'serial'
           AND NOT EXISTS (
               SELECT 1
               FROM public.product_unit_identifiers
               WHERE product_unit_id = p_product_unit_id
                 AND identifier_type = 'SERIAL_NUMBER'
           ) THEN
            RAISE EXCEPTION
                'SERIAL_NUMBER wajib tersedia.';
        END IF;

    ELSE
        RAISE EXCEPTION 'Tracking type produk tidak dikenal.';
    END IF;

    -- 7. Generate transfer group and reference
    v_group_id := pg_catalog.gen_random_uuid();

    v_reference_number :=
        'TRF-' ||
        UPPER(LEFT(REPLACE(v_group_id::TEXT, '-', ''), 12));

    -- 8. Create transfer OUT draft
    INSERT INTO public.inventory_movements (
        movement_group_id,
        product_variant_id,
        warehouse_id,
        product_unit_id,
        movement_type,
        status,
        quantity_delta,
        inventory_status,
        source_reference_type,
        source_reference_id,
        source_reference_number,
        notes,
        created_by
    )
    VALUES (
        v_group_id,
        p_product_variant_id,
        p_source_warehouse_id,
        p_product_unit_id,
        'transfer_out',
        'draft',
        -p_quantity,
        p_inventory_status,
        'stock_transfer',
        v_group_id,
        v_reference_number,
        p_notes,
        v_user_id
    );

    -- 9. Create transfer IN draft
    INSERT INTO public.inventory_movements (
        movement_group_id,
        product_variant_id,
        warehouse_id,
        product_unit_id,
        movement_type,
        status,
        quantity_delta,
        inventory_status,
        source_reference_type,
        source_reference_id,
        source_reference_number,
        notes,
        created_by
    )
    VALUES (
        v_group_id,
        p_product_variant_id,
        p_destination_warehouse_id,
        p_product_unit_id,
        'transfer_in',
        'draft',
        p_quantity,
        p_inventory_status,
        'stock_transfer',
        v_group_id,
        v_reference_number,
        p_notes,
        v_user_id
    );

    RETURN v_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_transfer(
    UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_inventory_transfer(
    UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_inventory_transfer(
    UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT
) TO authenticated;
