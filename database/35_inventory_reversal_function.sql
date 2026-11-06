
-- ============================================================
-- FILE 35: INVENTORY REVERSAL FUNCTION
-- PROJECT: ERP Distribution
-- PURPOSE: Full and partial inventory reversal
-- VALUATION: ORIGINAL TRANSACTION HISTORICAL VALUE
-- SCOPE: QUANTITY-TRACKED PRODUCTS ONLY
-- DEPENDENCIES: FILE 26, 29, 30, 31, 32
-- ============================================================

CREATE OR REPLACE FUNCTION public.post_inventory_reversal(
    p_original_movement_id UUID,
    p_reversal_movement_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;

    v_original RECORD;
    v_reversal RECORD;
    v_original_log RECORD;

    v_tracking_type VARCHAR(30);

    v_balance RECORD;

    v_original_quantity NUMERIC(18,3);
    v_reversal_quantity NUMERIC(18,3);
    v_previous_reversed_quantity NUMERIC(18,3);
    v_remaining_quantity NUMERIC(18,3);

    v_original_value NUMERIC(20,4);
    v_previous_reversed_value NUMERIC(20,4);
    v_reversal_value NUMERIC(20,4);
    v_value_delta NUMERIC(20,4);

    v_quantity_before NUMERIC(18,3);
    v_quantity_after NUMERIC(18,3);

    v_value_before NUMERIC(20,4);
    v_value_after NUMERIC(20,4);

    v_average_before NUMERIC(20,6);
    v_average_after NUMERIC(20,6);
BEGIN

    -- ========================================================
    -- 1. AUTHENTICATION AND PERMISSION
    -- ========================================================

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'Permission inventory.update diperlukan.';
    END IF;


    -- ========================================================
    -- 2. LOCK ORIGINAL MOVEMENT
    -- ========================================================

    SELECT *
    INTO v_original
    FROM public.inventory_movements
    WHERE id = p_original_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original movement tidak ditemukan.';
    END IF;

    IF v_original.status <> 'posted' THEN
        RAISE EXCEPTION
            'Original movement harus berstatus posted.';
    END IF;

    IF v_original.reversal_of_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Reversal tidak boleh menjadi sumber reversal berikutnya.';
    END IF;

    IF v_original.movement_type NOT IN (
        'purchase',
        'adjustment',
        'opening_balance'
    ) THEN
        RAISE EXCEPTION
            'Jenis transaksi ini tidak didukung oleh fungsi reversal ini. '
            'Gunakan proses retur atau fungsi transfer reversal yang sesuai.';
    END IF;

    IF v_original.movement_type = 'status_change' THEN
        RAISE EXCEPTION
            'Status change tidak dapat diproses melalui fungsi ini.';
    END IF;


    -- ========================================================
    -- 3. LOCK REVERSAL DRAFT
    -- ========================================================

    SELECT *
    INTO v_reversal
    FROM public.inventory_movements
    WHERE id = p_reversal_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reversal draft tidak ditemukan.';
    END IF;

    IF v_reversal.status <> 'draft' THEN
        RAISE EXCEPTION
            'Reversal movement harus berstatus draft.';
    END IF;

    IF v_reversal.id = v_original.id THEN
        RAISE EXCEPTION
            'Movement tidak dapat membalik dirinya sendiri.';
    END IF;

    IF v_reversal.reversal_of_id <> v_original.id THEN
        RAISE EXCEPTION
            'reversal_of_id tidak sesuai original movement.';
    END IF;

    IF v_reversal.movement_type <> v_original.movement_type THEN
        RAISE EXCEPTION
            'Movement type reversal harus sama dengan original.';
    END IF;

    IF v_reversal.product_variant_id <>
       v_original.product_variant_id
       OR v_reversal.warehouse_id <>
       v_original.warehouse_id THEN
        RAISE EXCEPTION
            'Product variant atau warehouse reversal tidak sesuai original.';
    END IF;

    IF v_reversal.inventory_status IS DISTINCT FROM
       v_original.inventory_status THEN
        RAISE EXCEPTION
            'Inventory status reversal harus sama dengan original.';
    END IF;

    IF v_reversal.product_unit_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Fungsi ini hanya mendukung produk quantity-tracked.';
    END IF;

    IF v_original.product_unit_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Serialized unit harus menggunakan proses reversal khusus.';
    END IF;

    IF v_reversal.quantity_delta * v_original.quantity_delta >= 0 THEN
        RAISE EXCEPTION
            'Quantity reversal harus berlawanan arah dengan original.';
    END IF;


    -- ========================================================
    -- 4. VALIDATE TRACKING TYPE
    -- ========================================================

    SELECT p.tracking_type
    INTO v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_original.product_variant_id;

    IF NOT FOUND OR v_tracking_type <> 'quantity' THEN
        RAISE EXCEPTION
            'Fungsi reversal ini hanya untuk produk quantity-tracked.';
    END IF;


    -- ========================================================
    -- 5. VALIDATE APPROVAL
    -- ========================================================

    IF v_original.approved_by IS NOT NULL THEN

        IF v_reversal.approved_by IS NULL
           OR v_reversal.approved_at IS NULL THEN
            RAISE EXCEPTION
                'Reversal wajib mendapatkan approval.';
        END IF;

        IF v_reversal.created_by = v_reversal.approved_by THEN
            RAISE EXCEPTION
                'Pembuat reversal tidak boleh menyetujui reversal sendiri.';
        END IF;

        IF v_user_id = v_reversal.approved_by THEN
            RAISE EXCEPTION
                'Approver tidak boleh melakukan posting reversal sendiri.';
        END IF;

        IF NOT public.has_permission('finance.approve') THEN
            RAISE EXCEPTION
                'Permission finance.approve diperlukan.';
        END IF;

    END IF;


    -- ========================================================
    -- 6. VALIDATE ORIGINAL VALUATION LOG
    -- ========================================================

    SELECT *
    INTO v_original_log
    FROM public.inventory_valuation_logs
    WHERE inventory_movement_id = v_original.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Original valuation log tidak ditemukan.';
    END IF;


    -- ========================================================
    -- 7. CALCULATE ORIGINAL AND PREVIOUS REVERSALS
    -- ========================================================

    v_original_quantity :=
        ABS(v_original.quantity_delta);

    v_reversal_quantity :=
        ABS(v_reversal.quantity_delta);

    SELECT
        COALESCE(SUM(ABS(m.quantity_delta)), 0),
        COALESCE(SUM(ABS(l.inventory_value_delta)), 0)
    INTO
        v_previous_reversed_quantity,
        v_previous_reversed_value
    FROM public.inventory_movements m
    JOIN public.inventory_valuation_logs l
      ON l.inventory_movement_id = m.id
    WHERE m.reversal_of_id = v_original.id
      AND m.status = 'posted';

    v_remaining_quantity :=
        v_original_quantity - v_previous_reversed_quantity;

    IF v_remaining_quantity <= 0 THEN
        RAISE EXCEPTION
            'Original movement sudah direversal seluruhnya.';
    END IF;

    IF v_reversal_quantity > v_remaining_quantity THEN
        RAISE EXCEPTION
            'Total reversal melebihi quantity original yang tersisa.';
    END IF;


    -- ========================================================
    -- 8. CALCULATE HISTORICAL REVERSAL VALUE
    -- ========================================================

    v_original_value :=
        ABS(v_original_log.inventory_value_delta);

    IF v_reversal_quantity = v_remaining_quantity THEN

        -- Reversal terakhir menggunakan sisa nilai historis
        -- untuk menghindari akumulasi selisih pembulatan.

        v_reversal_value :=
            v_original_value - v_previous_reversed_value;

    ELSE

        v_reversal_value := ROUND(
            v_original_value
            * v_reversal_quantity
            / v_original_quantity,
            4
        );

    END IF;

    IF v_reversal_value < 0 THEN
        RAISE EXCEPTION
            'Perhitungan historical reversal value tidak valid.';
    END IF;

    -- Reversal harus berlawanan dengan nilai transaksi asal.
    IF v_original_log.inventory_value_delta > 0 THEN
        v_value_delta := -v_reversal_value;
    ELSIF v_original_log.inventory_value_delta < 0 THEN
        v_value_delta := v_reversal_value;
    ELSE
        v_value_delta := 0;
    END IF;


    -- ========================================================
    -- 9. LOCK INVENTORY BALANCE
    -- ========================================================

    SELECT *
    INTO v_balance
    FROM public.inventory_balances
    WHERE product_variant_id = v_original.product_variant_id
      AND warehouse_id = v_original.warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Inventory balance tidak ditemukan.';
    END IF;

    v_quantity_before := v_balance.on_hand_quantity;
    v_value_before := v_balance.inventory_value;
    v_average_before := v_balance.average_unit_cost;


    -- ========================================================
    -- 10. VALIDATE AVAILABLE STATUS BUCKET
    -- ========================================================

    IF CASE v_original.inventory_status
        WHEN 'available' THEN v_balance.available_quantity
        WHEN 'reserved' THEN v_balance.reserved_quantity
        WHEN 'quarantine' THEN v_balance.quarantine_quantity
        WHEN 'damaged' THEN v_balance.damaged_quantity
        WHEN 'repair' THEN v_balance.repair_quantity
        ELSE 0
    END < v_reversal_quantity
    AND v_reversal.quantity_delta < 0
    THEN
        RAISE EXCEPTION
            'Saldo status inventory tidak mencukupi untuk reversal.';
    END IF;


    -- ========================================================
    -- 11. CALCULATE NEW BALANCE
    -- ========================================================

    v_quantity_after :=
        v_quantity_before + v_reversal.quantity_delta;

    v_value_after :=
        v_value_before + v_value_delta;

    IF v_quantity_after < 0 THEN
        RAISE EXCEPTION
            'Reversal menyebabkan kuantitas persediaan negatif.';
    END IF;

    IF v_value_after < 0 THEN
        RAISE EXCEPTION
            'Reversal menyebabkan nilai persediaan negatif.';
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
    -- 12. UPDATE INVENTORY BALANCES
    -- ========================================================

    UPDATE public.inventory_balances
    SET
        available_quantity =
            available_quantity
            + CASE WHEN v_original.inventory_status = 'available'
                   THEN v_reversal.quantity_delta ELSE 0 END,

        reserved_quantity =
            reserved_quantity
            + CASE WHEN v_original.inventory_status = 'reserved'
                   THEN v_reversal.quantity_delta ELSE 0 END,

        quarantine_quantity =
            quarantine_quantity
            + CASE WHEN v_original.inventory_status = 'quarantine'
                   THEN v_reversal.quantity_delta ELSE 0 END,

        damaged_quantity =
            damaged_quantity
            + CASE WHEN v_original.inventory_status = 'damaged'
                   THEN v_reversal.quantity_delta ELSE 0 END,

        repair_quantity =
            repair_quantity
            + CASE WHEN v_original.inventory_status = 'repair'
                   THEN v_reversal.quantity_delta ELSE 0 END,

        on_hand_quantity = v_quantity_after,
        inventory_value = v_value_after,
        average_unit_cost = v_average_after,
        updated_at = NOW()

    WHERE id = v_balance.id;


    -- ========================================================
    -- 13. POST REVERSAL MOVEMENT
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id = v_reversal.id;


    -- ========================================================
    -- 14. CREATE REVERSAL VALUATION LOG
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
        v_reversal.id,
        v_reversal.product_variant_id,
        v_reversal.warehouse_id,
        v_reversal.movement_type,
        v_quantity_before,
        v_quantity_after,
        v_reversal.quantity_delta,
        v_value_before,
        v_value_after,
        v_value_delta,
        v_average_before,
        v_average_after,
        v_user_id
    );


    RETURN v_reversal.id;

END;
$$;


-- ============================================================
-- FUNCTION PRIVILEGES
-- ============================================================

REVOKE ALL
ON FUNCTION public.post_inventory_reversal(UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.post_inventory_reversal(UUID, UUID)
TO authenticated;


-- ============================================================
-- END OF FILE 35
-- ============================================================
