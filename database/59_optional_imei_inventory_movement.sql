-- MD-013: permit NULL product_unit_id for aggregate untagged IMEI SKU stock.
CREATE OR REPLACE FUNCTION public.create_inventory_movement_by_product(p_product_id uuid, p_warehouse_id uuid, p_movement_type character varying, p_quantity_delta numeric, p_inventory_status character varying DEFAULT 'available'::character varying, p_product_unit_id uuid DEFAULT NULL::uuid, p_status_from character varying DEFAULT NULL::character varying, p_status_to character varying DEFAULT NULL::character varying, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_movement_id uuid;
    v_tracking_type varchar(30);
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF p_product_id IS NULL
       OR p_warehouse_id IS NULL
       OR p_movement_type IS NULL
       OR p_quantity_delta IS NULL THEN
        RAISE EXCEPTION 'Data wajib belum lengkap';
    END IF;

    SELECT tracking_type
    INTO v_tracking_type
    FROM public.products
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
    END IF;

    IF p_movement_type NOT IN (
        'purchase', 'sale', 'adjustment',
        'customer_return', 'supplier_return',
        'opening_balance', 'status_change'
    ) THEN
        RAISE EXCEPTION 'Jenis mutasi tidak valid';
    END IF;

    IF p_movement_type IN (
        'purchase', 'customer_return', 'opening_balance'
    ) AND p_quantity_delta <= 0 THEN
        RAISE EXCEPTION 'Mutasi masuk harus positif';
    END IF;

    IF p_movement_type IN (
        'sale', 'supplier_return'
    ) AND p_quantity_delta >= 0 THEN
        RAISE EXCEPTION 'Mutasi keluar harus negatif';
    END IF;

    IF p_movement_type = 'status_change' THEN
        IF p_quantity_delta <> 0
           OR p_product_unit_id IS NULL
           OR p_status_from IS NULL
           OR p_status_to IS NULL
           OR p_status_from = p_status_to
           OR p_status_from NOT IN (
               'available', 'reserved', 'quarantine',
               'damaged', 'repair'
           )
           OR p_status_to NOT IN (
               'available', 'reserved', 'quarantine',
               'damaged', 'repair'
           ) THEN
            RAISE EXCEPTION 'Data status change tidak valid';
        END IF;
    ELSE
        IF p_quantity_delta = 0
           OR p_inventory_status IS NULL
           OR p_inventory_status NOT IN (
               'available', 'reserved', 'quarantine',
               'damaged', 'repair'
           )
           OR p_status_from IS NOT NULL
           OR p_status_to IS NOT NULL THEN
            RAISE EXCEPTION 'Data quantity movement tidak valid';
        END IF;
    END IF;

    IF v_tracking_type = 'quantity' THEN
        IF p_product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id';
        END IF;
    ELSIF v_tracking_type = 'imei' THEN
        IF p_product_unit_id IS NOT NULL THEN
            IF p_movement_type <> 'status_change'
               AND ABS(p_quantity_delta) <> 1 THEN
                RAISE EXCEPTION 'Unit IMEI individual hanya boleh diproses dengan quantity 1';
            END IF;
            PERFORM 1
            FROM public.product_units
            WHERE id = p_product_unit_id
              AND product_id = p_product_id
              AND warehouse_id = p_warehouse_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Unit tidak ditemukan untuk produk dan gudang tersebut';
            END IF;
        ELSIF p_quantity_delta <> TRUNC(p_quantity_delta) THEN
            RAISE EXCEPTION
                'Aggregate IMEI movement quantity must be a whole unit quantity.';
        END IF;
    ELSIF v_tracking_type = 'serial' THEN
        IF p_product_unit_id IS NULL THEN
            RAISE EXCEPTION 'Produk serial wajib memilih unit';
        END IF;
        IF p_movement_type <> 'status_change'
           AND ABS(p_quantity_delta) <> 1 THEN
            RAISE EXCEPTION 'Serialized unit hanya boleh diproses dengan quantity 1';
        END IF;
        PERFORM 1
        FROM public.product_units
        WHERE id = p_product_unit_id
          AND product_id = p_product_id
          AND warehouse_id = p_warehouse_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Unit tidak ditemukan untuk produk dan gudang tersebut';
        END IF;
    ELSE
        RAISE EXCEPTION 'Tracking type produk tidak valid';
    END IF;

    INSERT INTO public.inventory_movements (
        product_id,
        warehouse_id,
        product_unit_id,
        movement_type,
        status,
        quantity_delta,
        inventory_status,
        status_from,
        status_to,
        notes,
        created_by
    )
    VALUES (
        p_product_id,
        p_warehouse_id,
        p_product_unit_id,
        p_movement_type,
        'draft',
        p_quantity_delta,
        CASE
            WHEN p_movement_type = 'status_change' THEN NULL
            ELSE p_inventory_status
        END,
        p_status_from,
        p_status_to,
        p_notes,
        v_user_id
    )
    RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_inventory_movement_unlocked(p_movement_id uuid, p_unit_cost numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_has_imei1 BOOLEAN;
    v_has_serial BOOLEAN;
BEGIN
    -- 1. Authentication and authorization
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.update.';
    END IF;

    -- 2. Lock and read movement
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

    IF v_movement.movement_type IN ('transfer_in', 'transfer_out') THEN
        RAISE EXCEPTION
            'Transfer harus diproses melalui fungsi transfer khusus.';
    END IF;

    IF v_movement.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Reversal harus diproses melalui fungsi reversal khusus.';
    END IF;

    -- 3. Validate product identity
    IF v_movement.product_id IS NULL THEN
        RAISE EXCEPTION
            'Movement wajib memiliki product_id.';
    END IF;

    SELECT tracking_type
    INTO v_tracking_type
    FROM public.products
    WHERE id = v_movement.product_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produk tidak ditemukan.';
    END IF;

    -- 4. Approval validation
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

    -- 5. Validate movement type and tracking
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
            'available', 'reserved', 'quarantine', 'damaged', 'repair'
        ) OR v_movement.status_to NOT IN (
            'available', 'reserved', 'quarantine', 'damaged', 'repair'
        ) THEN
            RAISE EXCEPTION 'Status unit tidak valid.';
        END IF;
    ELSE
        IF v_tracking_type = 'quantity'
           AND v_movement.product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id.';
        END IF;

        IF v_tracking_type = 'imei' THEN
            IF v_movement.product_unit_id IS NOT NULL
               AND ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION 'Satu unit IMEI hanya boleh diproses dengan quantity 1.';
            ELSIF v_movement.product_unit_id IS NULL
               AND v_movement.quantity_delta <> TRUNC(v_movement.quantity_delta) THEN
                RAISE EXCEPTION
                    'Aggregate IMEI movement quantity must be a whole unit quantity.';
            END IF;
        END IF;

        IF v_tracking_type = 'serial' THEN
            IF v_movement.product_unit_id IS NULL THEN
                RAISE EXCEPTION 'Produk serial wajib memiliki product_unit_id.';
            END IF;
            IF ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION 'Satu unit serial hanya boleh diproses dengan quantity 1.';
            END IF;
        END IF;
    END IF;

    -- 6. Validate identifiers only for individually identified units.
    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL
       AND v_movement.movement_type <> 'status_change' THEN

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'IMEI_1'
        ) INTO v_has_imei1;

        SELECT EXISTS (
            SELECT 1
            FROM public.product_unit_identifiers
            WHERE product_unit_id = v_movement.product_unit_id
              AND identifier_type = 'SERIAL_NUMBER'
        ) INTO v_has_serial;

        IF v_tracking_type = 'imei' AND NOT v_has_imei1 THEN
            RAISE EXCEPTION 'IMEI_1 wajib tersedia sebelum posting.';
        END IF;

        IF v_tracking_type = 'serial' AND NOT v_has_serial THEN
            RAISE EXCEPTION 'SERIAL_NUMBER wajib tersedia sebelum posting.';
        END IF;
    END IF;

    -- 7. Prepare and lock product balance
    INSERT INTO public.inventory_balances (
        product_id,
        warehouse_id
    )
    VALUES (
        v_movement.product_id,
        v_movement.warehouse_id
    )
    ON CONFLICT (product_id, warehouse_id)
    DO NOTHING;

    SELECT *
    INTO v_balance
    FROM public.inventory_balances
    WHERE product_id = v_movement.product_id
      AND warehouse_id = v_movement.warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Saldo inventory produk tidak dapat dikunci.';
    END IF;

    v_quantity_before := v_balance.on_hand_quantity;
    v_value_before := v_balance.inventory_value;
    v_average_before := v_balance.average_unit_cost;

    -- 8. Serialized unit status change
    IF v_movement.movement_type = 'status_change' THEN
        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_movement.product_unit_id
          AND product_id = v_movement.product_id
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

    -- 9. Validate inventory status
    IF v_movement.inventory_status NOT IN (
        'available', 'reserved', 'quarantine', 'damaged', 'repair'
    ) THEN
        RAISE EXCEPTION 'Inventory status tidak valid.';
    END IF;

    IF v_movement.movement_type = 'customer_return'
       AND v_movement.inventory_status <> 'quarantine' THEN
        RAISE EXCEPTION
            'Customer return wajib masuk quarantine.';
    END IF;

    -- 10. Serialized unit validation
    IF v_tracking_type = 'serial'
       OR (v_tracking_type = 'imei' AND v_movement.product_unit_id IS NOT NULL) THEN
        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_movement.product_unit_id
          AND product_id = v_movement.product_id
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

    -- 11. Determine quantity and value
    v_quantity := ABS(v_movement.quantity_delta);

    IF v_movement.quantity_delta > 0 THEN
        IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
            RAISE EXCEPTION
                'Transaksi masuk memerlukan p_unit_cost yang valid.';
        END IF;

        v_value_delta := ROUND(v_quantity * p_unit_cost, 4);
    ELSE
        IF v_quantity_before < v_quantity THEN
            RAISE EXCEPTION
                'Stok tidak mencukupi untuk transaksi keluar.';
        END IF;

        v_value_delta := -ROUND(v_quantity * v_average_before, 4);
    END IF;

    -- 12. Return validation
    IF v_movement.movement_type = 'supplier_return'
       AND v_movement.quantity_delta >= 0 THEN
        RAISE EXCEPTION 'Supplier return harus mengurangi persediaan.';
    END IF;

    IF v_movement.movement_type = 'customer_return'
       AND v_movement.quantity_delta <= 0 THEN
        RAISE EXCEPTION 'Customer return harus menambah persediaan.';
    END IF;

    -- 13. Calculate new balance
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

    -- 14. Update inventory balance buckets
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

    -- 15. Update serialized unit status
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

    -- 16. Mark movement posted
    UPDATE public.inventory_movements
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id = p_movement_id;

    -- 17. Create valuation log
    INSERT INTO public.inventory_valuation_logs (
        inventory_movement_id,
        product_id,
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
        v_movement.product_id,
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
$function$
;
