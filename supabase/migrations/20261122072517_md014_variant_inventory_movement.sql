-- MD-014 / Phase 1: Variant-keyed inventory movement and valuation.
-- Source of behavior: database/33_inventory_posting_functions.sql (canonical variant path).
-- This migration intentionally fails closed while Product-only historical rows remain.
-- It is NOT to be applied to Development until the approved reset/reconciliation gate is complete.

BEGIN;

DO $preflight$
DECLARE
  v_detail text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_balances WHERE product_variant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.inventory_movements WHERE product_variant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.inventory_valuation_logs WHERE product_variant_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.product_units WHERE product_variant_id IS NULL) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'MD-014 blocked: Product-only inventory identities remain.',
      DETAIL = 'Resolve/reset legacy Product-only balances, movements, valuation logs, and product units through the separately approved disposition. No automatic Variant inference is allowed.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_balances b
    JOIN public.product_variants pv ON pv.id = b.product_variant_id
    WHERE b.product_id IS NOT NULL AND b.product_id IS DISTINCT FROM pv.product_id
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_movements m
    JOIN public.product_variants pv ON pv.id = m.product_variant_id
    WHERE m.product_id IS NOT NULL AND m.product_id IS DISTINCT FROM pv.product_id
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_valuation_logs l
    JOIN public.product_variants pv ON pv.id = l.product_variant_id
    WHERE l.product_id IS NOT NULL AND l.product_id IS DISTINCT FROM pv.product_id
  ) OR EXISTS (
    SELECT 1 FROM public.product_units u
    JOIN public.product_variants pv ON pv.id = u.product_variant_id
    WHERE u.product_id IS NOT NULL AND u.product_id IS DISTINCT FROM pv.product_id
  ) THEN
    RAISE EXCEPTION 'MD-014 blocked: denormalized Product ID conflicts with its Product Variant parent.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_balances
    GROUP BY product_variant_id, warehouse_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'MD-014 blocked: duplicate Variant + Warehouse balance keys exist.';
  END IF;
END;
$preflight$;

-- Product ID is retained only as a validated denormalized parent reference.
UPDATE public.inventory_balances b
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = b.product_variant_id
  AND b.product_id IS DISTINCT FROM pv.product_id;

UPDATE public.inventory_movements m
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = m.product_variant_id
  AND m.product_id IS DISTINCT FROM pv.product_id;

UPDATE public.inventory_valuation_logs l
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = l.product_variant_id
  AND l.product_id IS DISTINCT FROM pv.product_id;

UPDATE public.product_units u
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE pv.id = u.product_variant_id
  AND u.product_id IS DISTINCT FROM pv.product_id;

ALTER TABLE public.inventory_balances
  ALTER COLUMN product_variant_id SET NOT NULL;
ALTER TABLE public.inventory_movements
  ALTER COLUMN product_variant_id SET NOT NULL;
ALTER TABLE public.inventory_valuation_logs
  ALTER COLUMN product_variant_id SET NOT NULL;
ALTER TABLE public.product_units
  ALTER COLUMN product_variant_id SET NOT NULL;

-- Replace Product + Warehouse uniqueness with canonical Variant + Warehouse uniqueness.
ALTER TABLE public.inventory_balances
  DROP CONSTRAINT IF EXISTS uq_inventory_balance_product_warehouse;
ALTER TABLE public.inventory_balances
  DROP CONSTRAINT IF EXISTS uq_inventory_balance_variant_warehouse;
ALTER TABLE public.inventory_balances
  ADD CONSTRAINT uq_inventory_balance_variant_warehouse
  UNIQUE (product_variant_id, warehouse_id);

-- Enforce denormalized Product/Variant parent agreement whenever Product ID is supplied.
ALTER TABLE public.product_variants
  ADD CONSTRAINT uq_product_variants_id_product UNIQUE (id, product_id);

ALTER TABLE public.inventory_balances
  ADD CONSTRAINT fk_inventory_balances_variant_product
  FOREIGN KEY (product_variant_id, product_id)
  REFERENCES public.product_variants(id, product_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT fk_inventory_movements_variant_product
  FOREIGN KEY (product_variant_id, product_id)
  REFERENCES public.product_variants(id, product_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public.inventory_valuation_logs
  ADD CONSTRAINT fk_inventory_valuation_logs_variant_product
  FOREIGN KEY (product_variant_id, product_id)
  REFERENCES public.product_variants(id, product_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public.product_units
  ADD CONSTRAINT fk_product_units_variant_product
  FOREIGN KEY (product_variant_id, product_id)
  REFERENCES public.product_variants(id, product_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.post_inventory_movement_unlocked(
    p_movement_id uuid,
    p_unit_cost numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$

DECLARE
    v_user_id UUID;
    v_product_id UUID;
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
    v_bucket_before NUMERIC(18,3);

    v_has_imei1 BOOLEAN;
    v_has_serial BOOLEAN;

BEGIN

    -- ========================================================
    -- 1. AUTHENTICATION AND AUTHORIZATION
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
    -- 4. PRODUCT TRACKING TYPE
    -- ========================================================

    SELECT pv.product_id, p.tracking_type
    INTO v_product_id, v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_movement.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Product variant atau produk tidak ditemukan.';
    END IF;

    IF v_movement.product_id IS NOT NULL
       AND v_movement.product_id IS DISTINCT FROM v_product_id THEN
        RAISE EXCEPTION
            'Product ID tidak sesuai dengan parent Product Variant.';
    END IF;


    -- ========================================================
    -- 5. MOVEMENT TYPE AND TRACKING VALIDATION
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
            RAISE EXCEPTION 'Status unit tidak valid.';
        END IF;

        IF v_movement.status_from = v_movement.status_to THEN
            RAISE EXCEPTION
                'Status awal dan status tujuan tidak boleh sama.';
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
    -- 7. PREPARE AND LOCK INVENTORY BALANCE
    -- ========================================================

    INSERT INTO public.inventory_balances (
        product_variant_id,
        product_id,
        warehouse_id
    )
    VALUES (
        v_movement.product_variant_id,
        v_product_id,
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
            product_id = v_product_id,
            status = 'posted',
            posted_by = v_user_id,
            posted_at = NOW()
        WHERE id = p_movement_id;

        RETURN p_movement_id;

    END IF;


    -- ========================================================
    -- 9. INVENTORY STATUS AND MOVEMENT DIRECTION
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

    IF v_movement.movement_type = 'customer_return' THEN

        IF v_movement.quantity_delta <= 0 THEN
            RAISE EXCEPTION
                'Customer return harus menambah persediaan.';
        END IF;

        IF v_movement.inventory_status <> 'quarantine' THEN
            RAISE EXCEPTION
                'Customer return wajib masuk quarantine.';
        END IF;

        IF v_movement.source_reference_id IS NULL
           OR v_movement.source_reference_type IS NULL THEN
            RAISE EXCEPTION
                'Customer return wajib memiliki referensi transaksi penjualan asal.';
        END IF;

    END IF;

    IF v_movement.movement_type = 'supplier_return'
       AND v_movement.quantity_delta >= 0 THEN
        RAISE EXCEPTION
            'Supplier return harus mengurangi persediaan.';
    END IF;


    -- ========================================================
    -- 10. SERIALIZED UNIT VALIDATION
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial') THEN

        IF v_movement.movement_type = 'customer_return' THEN

            -- Sold unit has no warehouse.
            -- It must be returned to quarantine at destination warehouse.

            SELECT unit_status
            INTO v_unit_status
            FROM public.product_units
            WHERE id = v_movement.product_unit_id
              AND product_variant_id = v_movement.product_variant_id
              AND warehouse_id IS NULL
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Customer return hanya dapat menerima unit sold yang belum berada di gudang.';
            END IF;

            IF v_unit_status <> 'sold' THEN
                RAISE EXCEPTION
                    'Customer return hanya dapat menerima unit berstatus sold.';
            END IF;

        ELSE

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
               AND v_unit_status IN ('sold', 'in_transit', 'returned_to_supplier') THEN
                RAISE EXCEPTION
                    'Unit tidak dapat diterima dengan status saat ini.';
            END IF;

            IF v_movement.quantity_delta < 0
               AND v_unit_status <> v_movement.inventory_status THEN
                RAISE EXCEPTION
                    'Status unit tidak sesuai dengan inventory_status movement.';
            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- 11. VALIDATE OUTBOUND STOCK BUCKET
    -- ========================================================

    v_quantity := ABS(v_movement.quantity_delta);

    IF v_movement.quantity_delta < 0 THEN

        v_bucket_before :=
            CASE v_movement.inventory_status
                WHEN 'available' THEN v_balance.available_quantity
                WHEN 'reserved' THEN v_balance.reserved_quantity
                WHEN 'quarantine' THEN v_balance.quarantine_quantity
                WHEN 'damaged' THEN v_balance.damaged_quantity
                WHEN 'repair' THEN v_balance.repair_quantity
                ELSE 0
            END;

        IF v_bucket_before < v_quantity THEN
            RAISE EXCEPTION
                'Stok pada bucket % tidak mencukupi. Tersedia: %, diperlukan: %.',
                v_movement.inventory_status,
                v_bucket_before,
                v_quantity;
        END IF;

    END IF;


    -- ========================================================
    -- 12. DETERMINE INVENTORY VALUE
    -- ========================================================

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
                'Total stok tidak mencukupi untuk transaksi keluar.';
        END IF;

        IF v_average_before IS NULL OR v_average_before < 0 THEN
            RAISE EXCEPTION
                'Average unit cost tidak valid.';
        END IF;

        v_value_delta := -ROUND(
            v_quantity * v_average_before,
            4
        );

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
    -- 15. UPDATE SERIALIZED UNIT STATUS AND LOCATION
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial') THEN

        IF v_movement.movement_type = 'customer_return' THEN

            UPDATE public.product_units
            SET
                unit_status = 'quarantine',
                warehouse_id = v_movement.warehouse_id,
                unit_cost = p_unit_cost,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSIF v_movement.movement_type = 'supplier_return' THEN

            UPDATE public.product_units
            SET
                unit_status = 'returned_to_supplier',
                warehouse_id = NULL,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSIF v_movement.quantity_delta > 0 THEN

            UPDATE public.product_units
            SET
                unit_status = v_movement.inventory_status,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        ELSE

            UPDATE public.product_units
            SET
                unit_status = 'sold',
                warehouse_id = NULL,
                updated_at = NOW()
            WHERE id = v_movement.product_unit_id;

        END IF;

    END IF;


    -- ========================================================
    -- 16. MARK MOVEMENT AS POSTED
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        product_id = v_product_id,
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW()
    WHERE id = p_movement_id;


    -- ========================================================
    -- 17. CREATE INVENTORY VALUATION LOG
    -- ========================================================

    INSERT INTO public.inventory_valuation_logs (
        inventory_movement_id,
        product_variant_id,
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
        v_movement.product_variant_id,
        v_product_id,
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
$function$;

-- Public posting entry point retains warehouse lock + internal delegation.
CREATE OR REPLACE FUNCTION public.post_inventory_movement(
  p_movement_id uuid,
  p_unit_cost numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_warehouse_id uuid;
BEGIN
  SELECT warehouse_id
  INTO v_warehouse_id
  FROM public.inventory_movements
  WHERE id = p_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory movement tidak ditemukan.';
  END IF;

  PERFORM public.lock_inventory_warehouse(v_warehouse_id);

  RETURN public.post_inventory_movement_unlocked(p_movement_id, p_unit_cost);
END;
$function$;

-- Internal function is never directly executable by authenticated/anon/PUBLIC.
REVOKE ALL ON FUNCTION public.post_inventory_movement_unlocked(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement_unlocked(uuid, numeric) TO service_role;

-- Authenticated callers may only enter through the permission-checking public wrapper.
REVOKE ALL ON FUNCTION public.post_inventory_movement(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement(uuid, numeric) TO authenticated, service_role;

COMMIT;
