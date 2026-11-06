
-- ============================================================
-- FILE 33: INVENTORY POSTING FUNCTIONS
-- PROJECT: ERP Distribution
-- PURPOSE: Controlled and atomic inventory posting
-- VALUATION: MOVING AVERAGE PER WAREHOUSE / PRODUCT VARIANT
-- DEPENDENCIES: FILE 24, 25, 26, 29, 30, 31, 32
-- ============================================================

CREATE OR REPLACE FUNCTION public.post_inventory_movement(
    p_movement_id UUID,
    p_unit_cost NUMERIC(20,6) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_movement RECORD;
    v_tracking_type VARCHAR(30);

    v_balance RECORD;

    v_quantity NUMERIC(18,3);
    v_quantity_before NUMERIC(18,3);
    v_quantity_after NUMERIC(18,3);

    v_value_before NUMERIC(20,4);
    v_value_after NUMERIC(20,4);
    v_value_delta NUMERIC(20,4);

    v_average_before NUMERIC(20,6);
    v_average_after NUMERIC(20,6);

    v_unit_status VARCHAR(30);
    v_bucket_before VARCHAR(30);
    v_bucket_after VARCHAR(30);

    v_has_imei1 BOOLEAN;
    v_has_serial BOOLEAN;
BEGIN

    -- ========================================================
    -- 1. USER AUTHENTICATION AND AUTHORIZATION
    -- ========================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.update.';
    END IF;


    -- ========================================================
    -- 2. LOCK AND READ MOVEMENT
    -- ========================================================

    SELECT *
    INTO v_movement
    FROM public.inventory_movements
    WHERE id = p_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory movement tidak ditemukan.';
    END IF;

    IF v_movement.status <> 'draft' THEN
        RAISE EXCEPTION
            'Hanya movement draft yang dapat diposting.';
    END IF;

    IF v_movement.movement_type IN (
        'transfer_in',
        'transfer_out'
    ) THEN
        RAISE EXCEPTION
            'Transfer harus diproses melalui fungsi transfer khusus.';
    END IF;

    IF v_movement.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Reversal harus diproses melalui fungsi reversal khusus.';
    END IF;


    -- ========================================================
    -- 3. APPROVAL VALIDATION
    -- ========================================================

    IF v_movement.movement_type IN (
        'customer_return',
        'supplier_return',
        'opening_balance'
    ) THEN

        IF v_movement.approved_by IS NULL
           OR v_movement.approved_at IS NULL THEN
            RAISE EXCEPTION
                'Transaksi ini wajib mendapatkan approval.';
        END IF;

        IF v_movement.approved_by = v_movement.created_by THEN
            RAISE EXCEPTION
                'Pembuat transaksi tidak boleh menyetujui transaksinya sendiri.';
        END IF;

        IF v_movement.approved_by = v_user_id THEN
            RAISE EXCEPTION
                'Approver tidak boleh melakukan posting transaksinya sendiri.';
        END IF;

        IF NOT public.has_permission('finance.approve') THEN
            RAISE EXCEPTION
                'Posting transaksi ini memerlukan permission finance.approve.';
        END IF;

    END IF;


    -- ========================================================
    -- 4. VALIDATE PRODUCT TRACKING TYPE
    -- ========================================================

    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_movement.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product variant atau produk tidak ditemukan.';
    END IF;


    -- ========================================================
    -- 5. VALIDATE MOVEMENT TYPE
    -- ========================================================

    IF v_movement.movement_type = 'status_change' THEN

        IF v_tracking_type NOT IN ('imei', 'serial') THEN
            RAISE EXCEPTION
                'Status change hanya didukung untuk produk IMEI/serial.';
        END IF;

        IF v_movement.product_unit_id IS NULL THEN
            RAISE EXCEPTION
                'Status change wajib memiliki product_unit_id.';
        END IF;

        IF v_movement.status_from NOT IN (
            'available', 'reserved', 'quarantine',
            'damaged', 'repair'
        ) OR v_movement.status_to NOT IN (
            'available', 'reserved', 'quarantine',
            'damaged', 'repair'
        ) THEN
            RAISE EXCEPTION
                'Status unit tidak valid.';
        END IF;

        IF v_movement.status_from = 'sold'
           OR v_movement.status_to = 'sold' THEN
            RAISE EXCEPTION
                'Perubahan status sold harus melalui transaksi penjualan.';
        END IF;

    ELSE

        IF v_tracking_type = 'quantity'
           AND v_movement.product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id.';
        END IF;

        IF v_tracking_type IN ('imei', 'serial') THEN

            IF v_movement.product_unit_id IS NULL THEN
                RAISE EXCEPTION
                    'Produk IMEI/serial wajib memiliki product_unit_id.';
            END IF;

            IF ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION
                    'Satu serialized unit hanya boleh diproses dengan quantity 1.';
            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- 6. VALIDATE SERIALIZED IDENTIFIERS
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.movement_type <> 'status_change' THEN

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'IMEI_1'
        )
        INTO v_has_imei1;

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'SERIAL_NUMBER'
        )
        INTO v_has_serial;

        IF v_tracking_type = 'imei' AND NOT v_has_imei1 THEN
            RAISE EXCEPTION
                'IMEI_1 wajib tersedia sebelum posting.';
        END IF;

        IF v_tracking_type = 'serial' AND NOT v_has_serial THEN
            RAISE EXCEPTION
                'SERIAL_NUMBER wajib tersedia sebelum posting.';
        END IF;

    END IF;


    -- ========================================================
    -- 7. PREPARE BALANCE ROW AND LOCK
    -- ========================================================

    INSERT INTO public.inventory_balances (
        product_variant_id,
        warehouse_id
    )
    VALUES (
        v_movement.product_variant_id,
        v_movement.warehouse_id
    )
    ON CONFLICT (product_variant_id, warehouse_id)
    DO NOTHING;

    SELECT *
    INTO v_balance
    FROM public.inventory_balances
    WHERE product_variant_id = v_movement.product_variant_id
      AND warehouse_id = v_movement.warehouse_id
    FOR UPDATE;

    v_quantity_before := v_balance.on_hand_quantity;
    v_value_before := v_balance.inventory_value;
    v_average_before := v_balance.average_unit_cost;


    -- ========================================================
    -- 8. STATUS CHANGE FOR SERIALIZED UNIT
    -- ========================================================

    IF v_movement.movement_type = 'status_change' THEN

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_movement.product_unit_id
          AND product_variant_id = v_movement.product_variant_id
          AND warehouse_id = v_movement.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Product unit tidak ditemukan di warehouse terkait.';
        END IF;

        IF v_unit_status <> v_movement.status_from THEN
            RAISE EXCEPTION
                'Status unit aktual tidak sesuai status_from.';
        END IF;

        -- Kurangi bucket status lama dan tambah bucket baru.
        UPDATE public.inventory_balances
        SET
            available_quantity =
                available_quantity
                + CASE WHEN v_movement.status_from = 'available' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'available' THEN 1 ELSE 0 END,

            reserved_quantity =
                reserved_quantity
                + CASE WHEN v_movement.status_from = 'reserved' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'reserved' THEN 1 ELSE 0 END,

            quarantine_quantity =
                quarantine_quantity
                + CASE WHEN v_movement.status_from = 'quarantine' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'quarantine' THEN 1 ELSE 0 END,

            damaged_quantity =
                damaged_quantity
                + CASE WHEN v_movement.status_from = 'damaged' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'damaged' THEN 1 ELSE 0 END,

            repair_quantity =
                repair_quantity
                + CASE WHEN v_movement.status_from = 'repair' THEN -1 ELSE 0 END
                + CASE WHEN v_movement.status_to = 'repair' THEN 1 ELSE 0 END,

            updated_at = NOW()
        WHERE id = v_balance.id;

        UPDATE public.product_units
        SET unit_status = v_movement.status_to
        WHERE id = v_movement.product_unit_id;

        UPDATE public.inventory_movements
        SET
            status = 'posted',
            posted_by = v_user_id,
            posted_at = NOW()
        WHERE id = p_movement_id;

        RETURN p_movement_id;

    END IF;


    -- ========================================================
    -- 9. VALIDATE INVENTORY STATUS
    -- ========================================================

    IF v_movement.inventory_status NOT IN (
        'available',
        'reserved',
        'quarantine',
        'damaged',
        'repair'
    ) THEN
        RAISE EXCEPTION 'Inventory status tidak valid.';
    END IF;

    IF v_movement.movement_type = 'customer_return'
       AND v_movement.inventory_status <> 'quarantine' THEN
        RAISE EXCEPTION
            'Customer return wajib masuk quarantine.';
    END IF;


    -- ========================================================
    -- 10. SERIALIZED UNIT VALIDATION
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial') THEN

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_movement.product_unit_id
          AND product_variant_id = v_movement.product_variant_id
          AND warehouse_id = v_movement.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Product unit tidak ditemukan di warehouse terkait.';
        END IF;

        IF v_movement.quantity_delta > 0
           AND v_unit_status IN ('sold', 'in_transit') THEN
            RAISE EXCEPTION
                'Unit tidak dapat diterima dengan status saat ini.';
        END IF;

        IF v_movement.quantity_delta < 0
           AND v_unit_status <> v_movement.inventory_status THEN
            RAISE EXCEPTION
                'Status unit tidak sesuai dengan inventory_status movement.';
        END IF;

    END IF;


    -- ========================================================
    -- 11. DETERMINE QUANTITY AND VALUE
    -- ========================================================

    v_quantity := ABS(v_movement.quantity_delta);

    IF v_movement.quantity_delta > 0 THEN

        IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
            RAISE EXCEPTION
                'Transaksi masuk memerlukan p_unit_cost yang valid.';
        END IF;

        v_value_delta := ROUND(
            v_quantity * p_unit_cost,
            4
        );

    ELSE

        IF v_quantity_before < v_quantity THEN
            RAISE EXCEPTION
                'Stok tidak mencukupi untuk transaksi keluar.';
        END IF;

        v_value_delta := ROUND(
            v_quantity * v_average_before,
            4
        );

        v_value_delta := -v_value_delta;

    END IF;


    -- ========================================================
    -- 12. CUSTOMER / SUPPLIER RETURN VALIDATION
    -- ========================================================

    IF v_movement.movement_type = 'supplier_return'
       AND v_movement.quantity_delta >= 0 THEN
        RAISE EXCEPTION
            'Supplier return harus mengurangi persediaan.';
    END IF;

    IF v_movement.movement_type = 'customer_return'
       AND v_movement.quantity_delta <= 0 THEN
        RAISE EXCEPTION
            'Customer return harus menambah persediaan.';
    END IF;


    -- ========================================================
    -- 13. CALCULATE NEW BALANCE
    -- ========================================================

    v_quantity_after :=
        v_quantity_before + v_movement.quantity_delta;

    v_value_after :=
        v_value_before + v_value_delta;

    IF v_quantity_after < 0 OR v_value_after < 0 THEN
        RAISE EXCEPTION
            'Hasil transaksi menyebabkan saldo negatif.';
    END IF;

    IF v_quantity_after = 0 THEN

        IF ABS(v_value_after) > 0.0001 THEN
            RAISE EXCEPTION
                'Nilai persediaan harus nol ketika kuantitas menjadi nol.';
        END IF;

        v_value_after := 0;
        v_average_after := 0;

    ELSE

        v_average_after := ROUND(
            v_value_after / v_quantity_after,
            6
        );

    END IF;


    -- ========================================================
    -- 14. UPDATE INVENTORY BALANCES
    -- ========================================================

    UPDATE public.inventory_balances
    SET
        available_quantity =
            available_quantity
            + CASE WHEN v_movement.inventory_status = 'available'
                   THEN v_movement.quantity_delta ELSE 0 END,

        reserved_quantity =
            reserved_quantity
            + CASE WHEN v_movement.inventory_status = 'reserved'
                   THEN v_movement.quantity_delta ELSE 0 END,

        quarantine_quantity =
            quarantine_quantity
            + CASE WHEN v_movement.inventory_status = 'quarantine'
                   THEN v_movement.quantity_delta ELSE 0 END,

        damaged_quantity =
            damaged_quantity
            + CASE WHEN v_movement.inventory_status = 'damaged'
                   THEN v_movement.quantity_delta ELSE 0 END,

        repair_quantity =
            repair_quantity
            + CASE WHEN v_movement.inventory_status = 'repair'
                   THEN v_movement.quantity_delta ELSE 0 END,

        on_hand_quantity = v_quantity_after,
        inventory_value = v_value_after,
        average_unit_cost = v_average_after,
        updated_at = NOW()

    WHERE id = v_balance.id;


    -- ========================================================
    -- 15. UPDATE SERIALIZED UNIT STATUS
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial') THEN

        IF v_movement.quantity_delta > 0 THEN

            UPDATE public.product_units
            SET unit_status = v_movement.inventory_status
            WHERE id = v_movement.product_unit_id;

        ELSE

            UPDATE public.product_units
            SET
                unit_status = 'sold',
                warehouse_id = NULL
            WHERE id = v_movement.product_unit_id;

        END IF;

    END IF;


    -- ========================================================
    -- 16. MARK MOVEMENT AS POSTED
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id = p_movement_id;


    -- ========================================================
    -- 17. CREATE VALUATION LOG
    -- ========================================================

    INSERT INTO public.inventory_valuation_logs (
        inventory_movement_id,
        product_variant_id,
        warehouse_id,
        transaction_type,
        quantity_before,
        quantity_after,
        quantity_delta,
        value_before,
        value_after,
        inventory_value_delta,
        average_cost_before,
        average_cost_after,
        created_by
    )
    VALUES (
        p_movement_id,
        v_movement.product_variant_id,
        v_movement.warehouse_id,
        v_movement.movement_type,
        v_quantity_before,
        v_quantity_after,
        v_movement.quantity_delta,
        v_value_before,
        v_value_after,
        v_value_delta,
        v_average_before,
        v_average_after,
        v_user_id
    );

    RETURN p_movement_id;

END;
$$;


-- ============================================================
-- 18. FUNCTION PRIVILEGES
-- ============================================================

REVOKE ALL
ON FUNCTION public.post_inventory_movement(UUID, NUMERIC)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.post_inventory_movement(UUID, NUMERIC)
TO authenticated;


-- ============================================================
-- END OF FILE 33
-- ============================================================
