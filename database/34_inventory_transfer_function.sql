
-- ============================================================
-- FILE 34: INVENTORY TRANSFER FUNCTION
-- PROJECT: ERP Distribution
-- PURPOSE: Atomic transfer between warehouses
-- VALUATION: SOURCE MOVING AVERAGE CARRIED TO DESTINATION
-- DEPENDENCIES: FILE 24, 26, 29, 30, 31, 32
-- ============================================================

CREATE OR REPLACE FUNCTION public.post_inventory_transfer(
    p_movement_group_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_out RECORD;
    v_in RECORD;

    v_tracking_type VARCHAR(30);
    v_unit_status VARCHAR(30);

    v_source RECORD;
    v_destination RECORD;

    v_quantity NUMERIC(18,3);

    v_source_qty_after NUMERIC(18,3);
    v_source_value_after NUMERIC(20,4);
    v_source_avg_after NUMERIC(20,6);
    v_source_value_delta NUMERIC(20,4);

    v_destination_qty_after NUMERIC(18,3);
    v_destination_value_after NUMERIC(20,4);
    v_destination_avg_after NUMERIC(20,6);
    v_destination_value_delta NUMERIC(20,4);

    v_unit_cost NUMERIC(20,6);
    v_transfer_value NUMERIC(20,4);

    v_count INTEGER;
    v_source_status_quantity NUMERIC(18,2);
BEGIN

    -- ========================================================
    -- 1. AUTHENTICATION AND PERMISSION
    -- ========================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('inventory.transfer') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.transfer.';
    END IF;


    -- ========================================================
    -- 2. LOCK MOVEMENTS IN DETERMINISTIC ORDER
    -- ========================================================

    PERFORM id
    FROM public.inventory_movements
    WHERE movement_group_id = p_movement_group_id
    ORDER BY id
    FOR UPDATE;

    SELECT COUNT(*)
    INTO v_count
    FROM public.inventory_movements
    WHERE movement_group_id = p_movement_group_id;

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Transfer group harus memiliki tepat dua movement.';
    END IF;

    SELECT *
    INTO v_out
    FROM public.inventory_movements
    WHERE movement_group_id = p_movement_group_id
      AND movement_type = 'transfer_out';

    SELECT *
    INTO v_in
    FROM public.inventory_movements
    WHERE movement_group_id = p_movement_group_id
      AND movement_type = 'transfer_in';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Pasangan transfer_in tidak ditemukan.';
    END IF;

    IF v_out.id IS NULL OR v_in.id IS NULL THEN
        RAISE EXCEPTION
            'Pasangan transfer_out dan transfer_in tidak lengkap.';
    END IF;

    IF v_out.status <> 'draft' OR v_in.status <> 'draft' THEN
        RAISE EXCEPTION
            'Kedua movement harus berstatus draft.';
    END IF;

    IF v_out.reversal_of_id IS NOT NULL
       OR v_in.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Reversal tidak boleh diproses melalui fungsi transfer normal.';
    END IF;


    -- ========================================================
    -- 3. VALIDATE TRANSFER PAIR
    -- ========================================================

    IF v_out.product_variant_id <> v_in.product_variant_id THEN
        RAISE EXCEPTION
            'Product variant transfer tidak konsisten.';
    END IF;

    IF v_out.warehouse_id = v_in.warehouse_id THEN
        RAISE EXCEPTION
            'Gudang sumber dan tujuan tidak boleh sama.';
    END IF;

    IF v_out.quantity_delta >= 0 OR v_in.quantity_delta <= 0 THEN
        RAISE EXCEPTION
            'Arah quantity transfer tidak valid.';
    END IF;

    IF ABS(v_out.quantity_delta) <> v_in.quantity_delta THEN
        RAISE EXCEPTION
            'Quantity transfer_out dan transfer_in harus sama.';
    END IF;

    IF v_out.inventory_status <> v_in.inventory_status THEN
        RAISE EXCEPTION
            'Inventory status transfer harus sama.';
    END IF;

    IF v_out.product_unit_id IS DISTINCT FROM v_in.product_unit_id THEN
        RAISE EXCEPTION
            'Product unit transfer tidak konsisten.';
    END IF;

    IF v_out.inventory_status NOT IN (
        'available',
        'reserved',
        'quarantine',
        'damaged',
        'repair'
    ) THEN
        RAISE EXCEPTION
            'Inventory status transfer tidak valid.';
    END IF;


    -- ========================================================
    -- 4. VALIDATE PRODUCT TRACKING
    -- ========================================================

    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_out.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product variant tidak ditemukan.';
    END IF;

    IF v_tracking_type = 'quantity'
       AND v_out.product_unit_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Produk quantity tidak boleh memiliki product_unit_id.';
    END IF;

    IF v_tracking_type IN ('imei', 'serial') THEN

        IF v_out.product_unit_id IS NULL THEN
            RAISE EXCEPTION
                'Serialized transfer wajib memiliki product_unit_id.';
        END IF;

        IF v_out.quantity_delta <> -1
           OR v_in.quantity_delta <> 1 THEN
            RAISE EXCEPTION
                'Serialized transfer harus memiliki quantity satu unit.';
        END IF;

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_out.product_unit_id
          AND product_variant_id = v_out.product_variant_id
          AND warehouse_id = v_out.warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Serialized unit tidak ditemukan di gudang sumber.';
        END IF;

        IF v_unit_status <> v_out.inventory_status THEN
            RAISE EXCEPTION
                'Status serialized unit tidak sesuai movement.';
        END IF;

    END IF;


    -- ========================================================
    -- 5. ENSURE BALANCE ROWS EXIST
    -- ========================================================

    INSERT INTO public.inventory_balances (
        product_variant_id,
        warehouse_id
    )
    VALUES
        (v_out.product_variant_id, v_out.warehouse_id),
        (v_in.product_variant_id, v_in.warehouse_id)
    ON CONFLICT (product_variant_id, warehouse_id)
    DO NOTHING;


    -- ========================================================
    -- 6. LOCK BALANCES IN DETERMINISTIC ORDER
    -- ========================================================

    PERFORM id
    FROM public.inventory_balances
    WHERE product_variant_id = v_out.product_variant_id
      AND warehouse_id IN (
          v_out.warehouse_id,
          v_in.warehouse_id
      )
    ORDER BY warehouse_id, id
    FOR UPDATE;

    SELECT *
    INTO v_source
    FROM public.inventory_balances
    WHERE product_variant_id = v_out.product_variant_id
      AND warehouse_id = v_out.warehouse_id;

    SELECT *
    INTO v_destination
    FROM public.inventory_balances
    WHERE product_variant_id = v_in.product_variant_id
      AND warehouse_id = v_in.warehouse_id;


    -- ========================================================
    -- 7. VALIDATE SOURCE STOCK
    -- ========================================================

    v_quantity := ABS(v_out.quantity_delta);

    IF v_source.on_hand_quantity < v_quantity THEN
        RAISE EXCEPTION
            'Stok gudang sumber tidak mencukupi.';
    END IF;

    IF
        CASE v_out.inventory_status
            WHEN 'available' THEN v_source.available_quantity
            WHEN 'reserved' THEN v_source.reserved_quantity
            WHEN 'quarantine' THEN v_source.quarantine_quantity
            WHEN 'damaged' THEN v_source.damaged_quantity
            WHEN 'repair' THEN v_source.repair_quantity
        END < v_quantity
    THEN
        RAISE EXCEPTION
            'Saldo status stok gudang sumber tidak mencukupi.';
    END IF;CASE v_out.inventory_status
    WHEN 'available' THEN
        v_source_status_quantity := v_source.available_quantity;

    WHEN 'reserved' THEN
        v_source_status_quantity := v_source.reserved_quantity;

    WHEN 'quarantine' THEN
        v_source_status_quantity := v_source.quarantine_quantity;

    WHEN 'damaged' THEN
        v_source_status_quantity := v_source.damaged_quantity;

    WHEN 'repair' THEN
        v_source_status_quantity := v_source.repair_quantity;

    ELSE
        RAISE EXCEPTION
            'Status inventory tidak valid: %',
            v_out.inventory_status;
END CASE;

IF v_source_status_quantity < v_quantity THEN
    RAISE EXCEPTION
        'Saldo status stok gudang sumber tidak mencukupi.';
END IF;


    -- ========================================================
    -- 8. CALCULATE SOURCE VALUATION
    -- ========================================================

    v_unit_cost := v_source.average_unit_cost;

    v_transfer_value := ROUND(
        v_quantity * v_unit_cost,
        4
    );

    v_source_qty_after :=
        v_source.on_hand_quantity - v_quantity;

    v_source_value_delta := -v_transfer_value;

    v_source_value_after :=
        v_source.inventory_value + v_source_value_delta;

    IF v_source_qty_after = 0 THEN

        IF ABS(v_source_value_after) > 0.0001 THEN
            RAISE EXCEPTION
                'Nilai sumber tidak nol ketika kuantitas menjadi nol.';
        END IF;

        v_source_value_after := 0;
        v_source_avg_after := 0;

    ELSE

        IF v_source_value_after < 0 THEN
            RAISE EXCEPTION
                'Nilai persediaan sumber menjadi negatif.';
        END IF;

        v_source_avg_after := ROUND(
            v_source_value_after / v_source_qty_after,
            6
        );

    END IF;


    -- ========================================================
    -- 9. CALCULATE DESTINATION VALUATION
    -- ========================================================

    v_destination_qty_after :=
        v_destination.on_hand_quantity + v_quantity;

    v_destination_value_delta := v_transfer_value;

    v_destination_value_after :=
        v_destination.inventory_value + v_transfer_value;

    v_destination_avg_after := ROUND(
        v_destination_value_after / v_destination_qty_after,
        6
    );


    -- ========================================================
    -- 10. UPDATE SOURCE BALANCE
    -- ========================================================

    UPDATE public.inventory_balances
    SET
        available_quantity =
            available_quantity
            + CASE WHEN v_out.inventory_status = 'available'
                   THEN -v_quantity ELSE 0 END,

        reserved_quantity =
            reserved_quantity
            + CASE WHEN v_out.inventory_status = 'reserved'
                   THEN -v_quantity ELSE 0 END,

        quarantine_quantity =
            quarantine_quantity
            + CASE WHEN v_out.inventory_status = 'quarantine'
                   THEN -v_quantity ELSE 0 END,

        damaged_quantity =
            damaged_quantity
            + CASE WHEN v_out.inventory_status = 'damaged'
                   THEN -v_quantity ELSE 0 END,

        repair_quantity =
            repair_quantity
            + CASE WHEN v_out.inventory_status = 'repair'
                   THEN -v_quantity ELSE 0 END,

        on_hand_quantity = v_source_qty_after,
        inventory_value = v_source_value_after,
        average_unit_cost = v_source_avg_after,
        updated_at = NOW()

    WHERE id = v_source.id;


    -- ========================================================
    -- 11. UPDATE DESTINATION BALANCE
    -- ========================================================

    UPDATE public.inventory_balances
    SET
        available_quantity =
            available_quantity
            + CASE WHEN v_in.inventory_status = 'available'
                   THEN v_quantity ELSE 0 END,

        reserved_quantity =
            reserved_quantity
            + CASE WHEN v_in.inventory_status = 'reserved'
                   THEN v_quantity ELSE 0 END,

        quarantine_quantity =
            quarantine_quantity
            + CASE WHEN v_in.inventory_status = 'quarantine'
                   THEN v_quantity ELSE 0 END,

        damaged_quantity =
            damaged_quantity
            + CASE WHEN v_in.inventory_status = 'damaged'
                   THEN v_quantity ELSE 0 END,

        repair_quantity =
            repair_quantity
            + CASE WHEN v_in.inventory_status = 'repair'
                   THEN v_quantity ELSE 0 END,

        on_hand_quantity = v_destination_qty_after,
        inventory_value = v_destination_value_after,
        average_unit_cost = v_destination_avg_after,
        updated_at = NOW()

    WHERE id = v_destination.id;


    -- ========================================================
    -- 12. UPDATE SERIALIZED UNIT WAREHOUSE
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial') THEN

        UPDATE public.product_units
        SET warehouse_id = v_in.warehouse_id
        WHERE id = v_out.product_unit_id;

    END IF;


    -- ========================================================
    -- 13. POST BOTH MOVEMENTS
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id IN (v_out.id, v_in.id);


    -- ========================================================
    -- 14. CREATE SOURCE VALUATION LOG
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
        v_out.id,
        v_out.product_variant_id,
        v_out.warehouse_id,
        'transfer_out',
        v_source.on_hand_quantity,
        v_source_qty_after,
        v_out.quantity_delta,
        v_source.inventory_value,
        v_source_value_after,
        v_source_value_delta,
        v_source.average_unit_cost,
        v_source_avg_after,
        v_user_id
    );


    -- ========================================================
    -- 15. CREATE DESTINATION VALUATION LOG
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
        v_in.id,
        v_in.product_variant_id,
        v_in.warehouse_id,
        'transfer_in',
        v_destination.on_hand_quantity,
        v_destination_qty_after,
        v_in.quantity_delta,
        v_destination.inventory_value,
        v_destination_value_after,
        v_destination_value_delta,
        v_destination.average_unit_cost,
        v_destination_avg_after,
        v_user_id
    );

    RETURN p_movement_group_id;

END;
$$;


-- ============================================================
-- FUNCTION PRIVILEGES
-- ============================================================

REVOKE ALL
ON FUNCTION public.post_inventory_transfer(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.post_inventory_transfer(UUID)
TO authenticated;


-- ============================================================
-- END OF FILE 34
-- ============================================================
