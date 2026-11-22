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

-- Reuse existing uq_product_variants_id_product (verified in Development).

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

        IF v_tracking_type = 'serial' THEN

            IF v_movement.product_unit_id IS NULL
               OR ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION
                    'Produk serial wajib diproses satu unit dengan product_unit_id.';
            END IF;

        ELSIF v_tracking_type = 'imei' THEN

            IF v_movement.product_unit_id IS NULL
               AND v_movement.quantity_delta <> TRUNC(v_movement.quantity_delta) THEN
                RAISE EXCEPTION
                    'Aggregate IMEI movement harus menggunakan kuantitas bilangan bulat.';
            END IF;

            IF v_movement.product_unit_id IS NOT NULL
               AND ABS(v_movement.quantity_delta) <> 1 THEN
                RAISE EXCEPTION
                    'Unit IMEI individual hanya boleh diproses satu unit.';
            END IF;

        END IF;

    END IF;


    -- ========================================================
    -- 6. VALIDATE SERIALIZED IDENTIFIERS
    -- ========================================================

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL
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

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL THEN

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

    IF v_tracking_type IN ('imei', 'serial')
       AND v_movement.product_unit_id IS NOT NULL THEN

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


-- Goods Receipt resolves stock identity exclusively from the PO item's Variant.
CREATE OR REPLACE FUNCTION public.create_goods_receipt(p_purchase_order_id uuid, p_receipt_date date, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_po record;

    v_item jsonb;
    v_unit jsonb;
    v_identifier jsonb;

    v_receipt_id uuid;
    v_receipt_number varchar;

    v_po_item record;
    v_receipt_item_id uuid;
    v_receipt_unit_id uuid;

    v_quantity numeric;
    v_unit_cost numeric;
    v_discount numeric;
    v_tax numeric;
    v_inventory_status varchar;
    v_tracking_type varchar;

    v_units jsonb;
    v_identifiers jsonb;

    v_unit_code varchar;
    v_identifier_type varchar;
    v_identifier_value varchar;
    v_normalized_value varchar;

    v_item_index integer := 0;
    v_unit_index integer;
    v_expected_units integer;

    v_imei1_count integer;
    v_serial_count integer;
    v_imei2_count integer;
    v_item_draft_quantity numeric;
    v_duplicate_count integer;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.has_permission('purchasing.create') THEN
        RAISE EXCEPTION 'Permission denied: purchasing.create';
    END IF;

    IF p_purchase_order_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Order wajib dipilih';
    END IF;

    IF p_receipt_date IS NULL THEN
        RAISE EXCEPTION 'Tanggal penerimaan wajib diisi';
    END IF;

    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Minimal satu item penerimaan harus diisi';
    END IF;

    -- Lock Purchase Order.
    SELECT
        po.id,
        po.po_number,
        po.supplier_id,
        po.warehouse_id,
        po.status
    INTO v_po
    FROM public.purchase_orders po
    WHERE po.id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order tidak ditemukan';
    END IF;

    IF v_po.status NOT IN ('approved', 'partially_received') THEN
        RAISE EXCEPTION
            'Goods Receipt hanya dapat dibuat untuk PO approved atau partially_received';
    END IF;

    -- Generate nomor Goods Receipt.
    v_receipt_number :=
        'GR-' ||
        to_char(clock_timestamp(), 'YYYYMMDD') ||
        '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    INSERT INTO public.goods_receipts (
        receipt_number,
        purchase_order_id,
        supplier_id,
        warehouse_id,
        receipt_date,
        status,
        notes,
        created_by
    )
    VALUES (
        v_receipt_number,
        p_purchase_order_id,
        v_po.supplier_id,
        v_po.warehouse_id,
        p_receipt_date,
        'draft',
        p_notes,
        v_user_id
    )
    RETURNING id INTO v_receipt_id;

    -- Process setiap item penerimaan.
    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP
        v_item_index := v_item_index + 1;

        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Format item penerimaan tidak valid';
        END IF;

        IF nullif(v_item->>'purchase_order_item_id', '') IS NULL THEN
            RAISE EXCEPTION 'purchase_order_item_id wajib diisi';
        END IF;

        IF COALESCE(v_item->>'quantity_received', '') !~ '^[0-9]+(\.[0-9]+)?$'
           OR COALESCE(v_item->>'unit_cost', '0') !~ '^[0-9]+(\.[0-9]+)?$'
           OR COALESCE(v_item->>'discount_amount', '0') !~ '^[0-9]+(\.[0-9]+)?$'
           OR COALESCE(v_item->>'tax_amount', '0') !~ '^[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION 'Format angka item penerimaan tidak valid';
        END IF;

        v_quantity := (v_item->>'quantity_received')::numeric;
        v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
        v_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
        v_tax := COALESCE((v_item->>'tax_amount')::numeric, 0);

        v_inventory_status := COALESCE(
            nullif(v_item->>'inventory_status', ''),
            'available'
        );

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Kuantitas penerimaan harus lebih dari nol';
        END IF;

        IF v_unit_cost < 0 OR v_discount < 0 OR v_tax < 0 THEN
            RAISE EXCEPTION 'Nilai biaya dan pajak tidak boleh negatif';
        END IF;

        IF v_discount > (v_quantity * v_unit_cost) + v_tax THEN
            RAISE EXCEPTION
                'Discount tidak boleh melebihi nilai bruto ditambah pajak';
        END IF;

        IF v_inventory_status NOT IN (
            'available',
            'reserved',
            'quarantine',
            'damaged',
            'repair'
        ) THEN
            RAISE EXCEPTION 'Inventory status tidak valid: %',
                v_inventory_status;
        END IF;

        -- Pastikan item berasal dari PO yang sedang diproses.
        SELECT
            poi.id,
            poi.quantity,
            poi.received_quantity,
            poi.product_id,
            pv.id AS product_variant_id,
            pv.product_id AS variant_parent_product_id,
            p.tracking_type
        INTO v_po_item
        FROM public.purchase_order_items poi
        JOIN public.product_variants pv
            ON pv.id = poi.product_variant_id
        JOIN public.products p
            ON p.id = pv.product_id
        WHERE poi.id = (v_item->>'purchase_order_item_id')::uuid
          AND poi.purchase_order_id = p_purchase_order_id
        FOR UPDATE OF poi;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Item tidak ditemukan dalam Purchase Order';
        END IF;

        IF v_po_item.product_id IS DISTINCT FROM v_po_item.variant_parent_product_id THEN
            RAISE EXCEPTION
                'Product pada PO item tidak sesuai dengan parent Product Variant.';
        END IF;

        v_tracking_type := v_po_item.tracking_type;

        IF v_tracking_type NOT IN ('quantity', 'imei', 'serial') THEN
            RAISE EXCEPTION 'Tracking type tidak didukung: %',
                v_tracking_type;
        END IF;

        -- Cegah kuantitas melebihi PO, termasuk draft penerimaan lain.
        SELECT COALESCE(SUM(gri.quantity_received), 0)
        INTO v_item_draft_quantity
        FROM public.goods_receipt_items gri
        JOIN public.goods_receipts gr
            ON gr.id = gri.goods_receipt_id
        WHERE gri.purchase_order_item_id = v_po_item.id
          AND gr.status = 'draft';

        IF v_po_item.received_quantity
           + v_item_draft_quantity
           + v_quantity > v_po_item.quantity THEN
            RAISE EXCEPTION
                'Kuantitas penerimaan melebihi sisa PO untuk item %',
                v_po_item.id;
        END IF;

        v_units := COALESCE(v_item->'units', '[]'::jsonb);

        IF jsonb_typeof(v_units) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Format units harus berupa array';
        END IF;

        IF v_tracking_type IN ('imei', 'serial') THEN
            IF v_quantity <> trunc(v_quantity)
               OR v_quantity > 2147483647 THEN
                RAISE EXCEPTION
                    'Produk IMEI/Serial harus menggunakan kuantitas bilangan bulat';
            END IF;

            v_expected_units := v_quantity::integer;

            IF v_tracking_type = 'serial'
               AND jsonb_array_length(v_units) <> v_expected_units THEN
                RAISE EXCEPTION 'Jumlah unit Serial harus sama dengan quantity_received';
            END IF;
            IF v_tracking_type = 'imei'
               AND jsonb_array_length(v_units) > v_expected_units THEN
                RAISE EXCEPTION 'Jumlah unit ber-IMEI tidak boleh melebihi quantity_received';
            END IF;
        ELSE
            IF jsonb_array_length(v_units) > 0 THEN
                RAISE EXCEPTION
                    'Produk quantity tidak boleh memiliki data unit individual';
            END IF;
        END IF;

        -- Simpan item Goods Receipt.
        INSERT INTO public.goods_receipt_items (
            goods_receipt_id,
            purchase_order_item_id,
            quantity_received,
            unit_cost,
            discount_amount,
            tax_amount,
            line_total,
            inventory_status,
            notes
        )
        VALUES (
            v_receipt_id,
            v_po_item.id,
            v_quantity,
            v_unit_cost,
            v_discount,
            v_tax,
            (v_quantity * v_unit_cost) - v_discount + v_tax,
            v_inventory_status,
            v_item->>'notes'
        )
        RETURNING id INTO v_receipt_item_id;

        -- Produk IMEI dan Serial: simpan setiap unit secara individual.
        IF v_tracking_type IN ('imei', 'serial') THEN
            v_unit_index := 0;

            FOR v_unit IN
                SELECT value
                FROM jsonb_array_elements(v_units)
            LOOP
                v_unit_index := v_unit_index + 1;

                IF jsonb_typeof(v_unit) IS DISTINCT FROM 'object' THEN
                    RAISE EXCEPTION 'Format unit tidak valid';
                END IF;

                v_unit_code := COALESCE(
                    nullif(trim(v_unit->>'unit_code'), ''),
                    v_receipt_number || '-' ||
                    v_item_index::text || '-' ||
                    v_unit_index::text
                );

                IF length(v_unit_code) > 100 THEN
                    RAISE EXCEPTION 'Unit code melebihi 100 karakter';
                END IF;

                INSERT INTO public.goods_receipt_units (
                    goods_receipt_item_id,
                    unit_code
                )
                VALUES (
                    v_receipt_item_id,
                    v_unit_code
                )
                RETURNING id INTO v_receipt_unit_id;

                v_identifiers := COALESCE(
                    v_unit->'identifiers',
                    '[]'::jsonb
                );

                IF jsonb_typeof(v_identifiers) IS DISTINCT FROM 'array' THEN
                    RAISE EXCEPTION 'Format identifiers harus berupa array';
                END IF;

                -- Validasi identifier wajib dan jumlahnya.
                SELECT
                    COUNT(*) FILTER (
                        WHERE value->>'identifier_type' = 'IMEI_1'
                    ),
                    COUNT(*) FILTER (
                        WHERE value->>'identifier_type' = 'IMEI_2'
                    ),
                    COUNT(*) FILTER (
                        WHERE value->>'identifier_type' = 'SERIAL_NUMBER'
                    )
                INTO
                    v_imei1_count,
                    v_imei2_count,
                    v_serial_count
                FROM jsonb_array_elements(v_identifiers);

                IF v_tracking_type = 'imei' THEN
                    IF v_imei1_count <> 1 THEN
                        RAISE EXCEPTION
                            'Setiap unit IMEI wajib memiliki tepat satu IMEI_1';
                    END IF;

                    IF v_imei2_count > 1 OR v_serial_count > 0 THEN
                        RAISE EXCEPTION
                            'Identifier tambahan untuk produk IMEI tidak valid';
                    END IF;
                END IF;

                IF v_tracking_type = 'serial' THEN
                    IF v_serial_count <> 1 THEN
                        RAISE EXCEPTION
                            'Setiap unit Serial wajib memiliki tepat satu SERIAL_NUMBER';
                    END IF;

                    IF v_imei1_count > 0 OR v_imei2_count > 0 THEN
                        RAISE EXCEPTION
                            'Identifier IMEI tidak boleh digunakan pada produk Serial';
                    END IF;
                END IF;

                -- Simpan seluruh identifier.
                FOR v_identifier IN
                    SELECT value
                    FROM jsonb_array_elements(v_identifiers)
                LOOP
                    IF jsonb_typeof(v_identifier) IS DISTINCT FROM 'object' THEN
                        RAISE EXCEPTION 'Format identifier tidak valid';
                    END IF;

                    v_identifier_type :=
                        v_identifier->>'identifier_type';

                    v_identifier_value :=
                        trim(COALESCE(
                            v_identifier->>'identifier_value',
                            ''
                        ));

                    IF v_identifier_type NOT IN (
                        'IMEI_1',
                        'IMEI_2',
                        'SERIAL_NUMBER'
                    ) THEN
                        RAISE EXCEPTION 'Jenis identifier tidak valid';
                    END IF;

                    IF v_identifier_value = '' THEN
                        RAISE EXCEPTION 'Nilai identifier wajib diisi';
                    END IF;

                    IF v_identifier_type IN ('IMEI_1', 'IMEI_2') THEN
                        IF v_identifier_value !~ '^[0-9]{15}$'
                           OR NOT public.is_valid_imei(v_identifier_value) THEN
                            RAISE EXCEPTION 'Format IMEI tidak valid';
                        END IF;

                        v_normalized_value := v_identifier_value;
                    ELSE
                        v_normalized_value := upper(v_identifier_value);
                    END IF;

                    INSERT INTO public.goods_receipt_unit_identifiers (
                        goods_receipt_unit_id,
                        identifier_type,
                        identifier_value,
                        normalized_value
                    )
                    VALUES (
                        v_receipt_unit_id,
                        v_identifier_type,
                        v_identifier_value,
                        v_normalized_value
                    );
                END LOOP;
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_receipt_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_goods_receipt(p_goods_receipt_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_gr RECORD;
    v_po RECORD;
    v_item RECORD;
    v_unit RECORD;

    v_movement_id UUID;
    v_product_unit_id UUID;
    v_tracking_type VARCHAR(30);

    v_po_net NUMERIC(20,4);
    v_item_net NUMERIC(20,4);
    v_shipping_allocated NUMERIC(20,4);
    v_unit_cost NUMERIC(20,6);

    v_total_received NUMERIC(18,3);
    v_total_ordered NUMERIC(18,3);
BEGIN
    -- Authentication and authorization
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.has_permission('purchasing.approve') THEN
        RAISE EXCEPTION
            'Permission denied: purchasing.approve';
    END IF;

    -- Lock Goods Receipt
    SELECT *
    INTO v_gr
    FROM public.goods_receipts
    WHERE id = p_goods_receipt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Goods Receipt tidak ditemukan.';
    END IF;

    IF v_gr.status <> 'draft' THEN
        RAISE EXCEPTION
            'Hanya Goods Receipt draft yang dapat diposting.';
    END IF;

    -- Lock Purchase Order
    SELECT *
    INTO v_po
    FROM public.purchase_orders
    WHERE id = v_gr.purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order tidak ditemukan.';
    END IF;

    IF v_po.status NOT IN ('approved', 'partially_received') THEN
        RAISE EXCEPTION
            'Purchase Order belum disetujui atau tidak dapat menerima barang.';
    END IF;

    IF v_po.warehouse_id <> v_gr.warehouse_id
       OR v_po.supplier_id <> v_gr.supplier_id THEN
        RAISE EXCEPTION
            'Warehouse atau supplier Goods Receipt tidak sesuai Purchase Order.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.goods_receipt_items
        WHERE goods_receipt_id = p_goods_receipt_id
    ) THEN
        RAISE EXCEPTION 'Goods Receipt tidak memiliki item.';
    END IF;

    -- Fail closed when any receipt line lacks a valid, parent-consistent Variant.
    IF EXISTS (
        SELECT 1
        FROM public.goods_receipt_items gri
        JOIN public.purchase_order_items poi
          ON poi.id = gri.purchase_order_item_id
        LEFT JOIN public.product_variants pv
          ON pv.id = poi.product_variant_id
        WHERE gri.goods_receipt_id = p_goods_receipt_id
          AND (
              pv.id IS NULL
              OR poi.product_id IS DISTINCT FROM pv.product_id
          )
    ) THEN
        RAISE EXCEPTION
            'Goods Receipt contains a PO item without a valid matching Product Variant.';
    END IF;

    -- Shipping allocation denominator excludes recoverable tax.
    v_po_net := v_po.subtotal - v_po.discount_amount;

    IF v_po.shipping_cost > 0 AND v_po_net <= 0 THEN
        RAISE EXCEPTION
            'Tidak dapat mengalokasikan ongkos kirim karena nilai bersih PO tidak valid.';
    END IF;

    -- Process every Goods Receipt item.
    FOR v_item IN
        SELECT
            gri.id AS gr_item_id,
            gri.purchase_order_item_id,
            gri.quantity_received,
            gri.unit_cost,
            gri.discount_amount,
            gri.tax_amount,
            gri.inventory_status,
            poi.product_id AS po_product_id,
            poi.product_variant_id,
            pv.product_id AS product_id,
            poi.quantity AS ordered_quantity,
            poi.received_quantity AS previously_received,
            p.tracking_type,
            p.product_name,
            (
                gri.quantity_received * gri.unit_cost
                - gri.discount_amount
            ) AS net_goods_value
        FROM public.goods_receipt_items gri
        JOIN public.purchase_order_items poi
            ON poi.id = gri.purchase_order_item_id
        JOIN public.product_variants pv
            ON pv.id = poi.product_variant_id
        JOIN public.products p
            ON p.id = pv.product_id
        WHERE gri.goods_receipt_id = p_goods_receipt_id
        ORDER BY gri.id
        FOR UPDATE OF gri, poi
    LOOP
        IF v_item.product_variant_id IS NULL
           OR v_item.product_id IS NULL THEN
            RAISE EXCEPTION
                'PO item belum memiliki Product Variant yang valid.';
        END IF;

        IF v_item.po_product_id IS DISTINCT FROM v_item.product_id THEN
            RAISE EXCEPTION
                'Product pada PO item tidak sesuai dengan parent Product Variant.';
        END IF;

        IF v_item.tracking_type NOT IN ('quantity', 'imei', 'serial') THEN
            RAISE EXCEPTION
                'Tracking type produk tidak valid: %',
                v_item.product_name;
        END IF;

        IF v_item.quantity_received <= 0 THEN
            RAISE EXCEPTION 'Quantity penerimaan harus lebih dari nol.';
        END IF;

        IF v_item.previously_received + v_item.quantity_received
           > v_item.ordered_quantity THEN
            RAISE EXCEPTION
                'Penerimaan melebihi quantity PO untuk produk %.',
                v_item.product_name;
        END IF;

        IF v_item.net_goods_value < 0 THEN
            RAISE EXCEPTION
                'Nilai barang setelah diskon tidak boleh negatif.';
        END IF;

        -- Allocate shipping proportionally.
        v_shipping_allocated := 0;

        IF v_po_net > 0 THEN
            v_shipping_allocated :=
                ROUND(
                    v_po.shipping_cost
                    * v_item.net_goods_value
                    / v_po_net,
                    4
                );
        END IF;

        -- Recoverable tax is excluded from inventory cost.
        v_unit_cost := ROUND(
            (
                v_item.net_goods_value
                + v_shipping_allocated
            ) / v_item.quantity_received,
            6
        );

        -- Quantity-tracked product.
        IF v_item.tracking_type = 'quantity' THEN

            IF EXISTS (
                SELECT 1
                FROM public.goods_receipt_units
                WHERE goods_receipt_item_id = v_item.gr_item_id
            ) THEN
                RAISE EXCEPTION
                    'Produk quantity tidak boleh memiliki serialized units.';
            END IF;

            v_movement_id :=
                public.create_inventory_movement(
                    v_item.product_variant_id,
                    v_gr.warehouse_id,
                    'purchase',
                    v_item.quantity_received,
                    v_item.inventory_status,
                    NULL,
                    NULL,
                    NULL,
                    'Goods Receipt ' || v_gr.receipt_number
                );

            UPDATE public.inventory_movements
            SET
                source_reference_type = 'goods_receipt',
                source_reference_id = p_goods_receipt_id,
                source_reference_number = v_gr.receipt_number
            WHERE id = v_movement_id;

            PERFORM public.post_inventory_movement(
                v_movement_id,
                v_unit_cost
            );

        -- IMEI / Serial products.
        ELSE

            IF v_item.quantity_received
               <> TRUNC(v_item.quantity_received) THEN
                RAISE EXCEPTION
                    'Quantity IMEI/serial harus berupa bilangan bulat.';
            END IF;

            IF v_item.tracking_type = 'serial'
               AND (SELECT COUNT(*) FROM public.goods_receipt_units
                    WHERE goods_receipt_item_id = v_item.gr_item_id)
                   <> v_item.quantity_received THEN
                RAISE EXCEPTION 'Jumlah unit serial tidak sesuai quantity penerimaan.';
            END IF;
            IF v_item.tracking_type = 'imei'
               AND (SELECT COUNT(*) FROM public.goods_receipt_units
                    WHERE goods_receipt_item_id = v_item.gr_item_id)
                   > v_item.quantity_received THEN
                RAISE EXCEPTION 'Jumlah unit ber-IMEI melebihi quantity penerimaan.';
            END IF;

            FOR v_unit IN
                SELECT *
                FROM public.goods_receipt_units
                WHERE goods_receipt_item_id = v_item.gr_item_id
                ORDER BY id
            LOOP
                -- Create Product Unit directly from Product Master.
                INSERT INTO public.product_units (
                    product_variant_id,
                    product_id,
                    warehouse_id,
                    unit_code,
                    unit_status,
                    received_at,
                    unit_cost,
                    notes
                )
                VALUES (
                    v_item.product_variant_id,
                    v_item.product_id,
                    v_gr.warehouse_id,
                    v_unit.unit_code,
                    v_item.inventory_status,
                    NOW(),
                    v_unit_cost,
                    'Goods Receipt ' || v_gr.receipt_number
                )
                RETURNING id INTO v_product_unit_id;

                -- Copy identifiers to permanent product unit.
                INSERT INTO public.product_unit_identifiers (
                    product_unit_id,
                    identifier_type,
                    identifier_value
                )
                SELECT
                    v_product_unit_id,
                    gri.identifier_type,
                    gri.identifier_value
                FROM public.goods_receipt_unit_identifiers gri
                WHERE gri.goods_receipt_unit_id = v_unit.id;

                -- Validate required identifier.
                IF v_item.tracking_type = 'imei'
                   AND NOT EXISTS (
                       SELECT 1
                       FROM public.product_unit_identifiers
                       WHERE product_unit_id = v_product_unit_id
                         AND identifier_type = 'IMEI_1'
                   ) THEN
                    RAISE EXCEPTION
                        'IMEI_1 wajib tersedia untuk unit %.',
                        v_unit.unit_code;
                END IF;

                IF v_item.tracking_type = 'serial'
                   AND NOT EXISTS (
                       SELECT 1
                       FROM public.product_unit_identifiers
                       WHERE product_unit_id = v_product_unit_id
                         AND identifier_type = 'SERIAL_NUMBER'
                   ) THEN
                    RAISE EXCEPTION
                        'Serial number wajib tersedia untuk unit %.',
                        v_unit.unit_code;
                END IF;

                -- Create and post movement for each serialized unit.
                v_movement_id :=
                    public.create_inventory_movement(
                        v_item.product_variant_id,
                        v_gr.warehouse_id,
                        'purchase',
                        1,
                        v_item.inventory_status,
                        v_product_unit_id,
                        NULL,
                        NULL,
                        'Goods Receipt ' || v_gr.receipt_number
                    );

                UPDATE public.inventory_movements
                SET
                    source_reference_type = 'goods_receipt',
                    source_reference_id = p_goods_receipt_id,
                    source_reference_number = v_gr.receipt_number
                WHERE id = v_movement_id;

                PERFORM public.post_inventory_movement(
                    v_movement_id,
                    v_unit_cost
                );
            END LOOP;

            -- IMEI is optional: untagged units remain aggregate SKU stock.
            IF v_item.tracking_type = 'imei' THEN
                DECLARE
                    v_untracked_quantity NUMERIC(18,3);
                BEGIN
                    SELECT v_item.quantity_received - COUNT(*)::numeric
                    INTO v_untracked_quantity
                    FROM public.goods_receipt_units
                    WHERE goods_receipt_item_id = v_item.gr_item_id;

                    IF v_untracked_quantity > 0 THEN
                        v_movement_id := public.create_inventory_movement(
                            v_item.product_variant_id, v_gr.warehouse_id, 'purchase',
                            v_untracked_quantity, v_item.inventory_status,
                            NULL, NULL, NULL,
                            'Goods Receipt ' || v_gr.receipt_number || ' (SKU aggregate)'
                        );
                        UPDATE public.inventory_movements
                        SET source_reference_type = 'goods_receipt',
                            source_reference_id = p_goods_receipt_id,
                            source_reference_number = v_gr.receipt_number
                        WHERE id = v_movement_id;
                        PERFORM public.post_inventory_movement(v_movement_id, v_unit_cost);
                    END IF;
                END;
            END IF;
        END IF;

        -- Update PO received quantity.
        UPDATE public.purchase_order_items
        SET
            received_quantity =
                received_quantity + v_item.quantity_received,
            updated_at = NOW()
        WHERE id = v_item.purchase_order_item_id;

    END LOOP;

    -- Determine final PO status.
    SELECT
        COALESCE(SUM(received_quantity), 0),
        COALESCE(SUM(quantity), 0)
    INTO
        v_total_received,
        v_total_ordered
    FROM public.purchase_order_items
    WHERE purchase_order_id = v_po.id;

    UPDATE public.purchase_orders
    SET
        status = CASE
            WHEN v_total_received >= v_total_ordered
                THEN 'received'
            ELSE 'partially_received'
        END,
        updated_at = NOW()
    WHERE id = v_po.id;

    -- Mark Goods Receipt posted.
    UPDATE public.goods_receipts
    SET
        status = 'posted',
        posted_by = v_user_id,
        posted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_goods_receipt_id;

    RETURN p_goods_receipt_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.create_goods_receipt_by_product(uuid, date, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_goods_receipt_by_product(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_goods_receipt(uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goods_receipt(uuid, date, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_goods_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_goods_receipt(uuid) TO authenticated, service_role;


-- Transfer draft and atomic posting are keyed by the same Product Variant.
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

    -- 6. Validate tracked units; untagged IMEI quantity remains aggregate Variant stock.
    IF v_tracking_type = 'quantity' THEN
        IF p_product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh menggunakan product_unit_id.';
        END IF;

    ELSIF v_tracking_type = 'imei' THEN
        IF p_product_unit_id IS NULL THEN
            IF p_quantity <> TRUNC(p_quantity) THEN
                RAISE EXCEPTION
                    'Aggregate IMEI transfer harus menggunakan kuantitas bilangan bulat.';
            END IF;
        ELSE
            IF p_quantity <> 1 THEN
                RAISE EXCEPTION 'Unit IMEI individual harus ditransfer satu unit.';
            END IF;

            SELECT unit_status
            INTO v_unit_status
            FROM public.product_units
            WHERE id = p_product_unit_id
              AND product_variant_id = p_product_variant_id
              AND warehouse_id = p_source_warehouse_id
            FOR UPDATE;

            IF NOT FOUND OR v_unit_status IS DISTINCT FROM p_inventory_status THEN
                RAISE EXCEPTION 'IMEI unit tidak ditemukan atau statusnya tidak sesuai.';
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.product_unit_identifiers
                WHERE product_unit_id = p_product_unit_id
                  AND identifier_type = 'IMEI_1'
            ) THEN
                RAISE EXCEPTION 'IMEI_1 wajib tersedia.';
            END IF;
        END IF;

    ELSIF v_tracking_type = 'serial' THEN
        IF p_product_unit_id IS NULL OR p_quantity <> 1 THEN
            RAISE EXCEPTION 'Produk serial harus ditransfer satu unit.';
        END IF;

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = p_product_unit_id
          AND product_variant_id = p_product_variant_id
          AND warehouse_id = p_source_warehouse_id
        FOR UPDATE;

        IF NOT FOUND OR v_unit_status IS DISTINCT FROM p_inventory_status THEN
            RAISE EXCEPTION 'Serial unit tidak ditemukan atau statusnya tidak sesuai.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.product_unit_identifiers
            WHERE product_unit_id = p_product_unit_id
              AND identifier_type = 'SERIAL_NUMBER'
        ) THEN
            RAISE EXCEPTION 'SERIAL_NUMBER wajib tersedia.';
        END IF;

    ELSE
        RAISE EXCEPTION 'Tracking type produk tidak dikenal.';
    END IF;

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

CREATE OR REPLACE FUNCTION public.post_inventory_transfer_unlocked(
    p_movement_group_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID;
    v_out RECORD;
    v_in RECORD;

    v_tracking_type VARCHAR(30);
    v_product_id UUID;
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
    v_source_status_quantity NUMERIC(18,3);
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

    IF v_out.product_variant_id IS DISTINCT FROM v_in.product_variant_id THEN
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

    SELECT pv.product_id, p.tracking_type
    INTO v_product_id, v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_out.product_variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product variant tidak ditemukan.';
    END IF;

    IF (v_out.product_id IS NOT NULL AND v_out.product_id IS DISTINCT FROM v_product_id)
       OR (v_in.product_id IS NOT NULL AND v_in.product_id IS DISTINCT FROM v_product_id) THEN
        RAISE EXCEPTION 'Product ID transfer tidak sesuai dengan parent Product Variant.';
    END IF;

    IF v_tracking_type = 'quantity' THEN
        IF v_out.product_unit_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Produk quantity tidak boleh memiliki product_unit_id.';
        END IF;

    ELSIF v_tracking_type = 'imei' THEN
        IF v_out.product_unit_id IS NULL THEN
            IF v_out.quantity_delta <> TRUNC(v_out.quantity_delta) THEN
                RAISE EXCEPTION
                    'Aggregate IMEI transfer harus menggunakan kuantitas bilangan bulat.';
            END IF;
        ELSE
            IF v_out.quantity_delta <> -1 OR v_in.quantity_delta <> 1 THEN
                RAISE EXCEPTION
                    'Unit IMEI individual harus ditransfer satu unit.';
            END IF;

            SELECT unit_status
            INTO v_unit_status
            FROM public.product_units
            WHERE id = v_out.product_unit_id
              AND product_variant_id = v_out.product_variant_id
              AND warehouse_id = v_out.warehouse_id
            FOR UPDATE;

            IF NOT FOUND OR v_unit_status IS DISTINCT FROM v_out.inventory_status THEN
                RAISE EXCEPTION
                    'IMEI unit tidak ditemukan di gudang sumber atau statusnya tidak sesuai.';
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.product_unit_identifiers
                WHERE product_unit_id = v_out.product_unit_id
                  AND identifier_type = 'IMEI_1'
            ) THEN
                RAISE EXCEPTION 'IMEI_1 wajib tersedia untuk unit individual.';
            END IF;
        END IF;

    ELSIF v_tracking_type = 'serial' THEN
        IF v_out.product_unit_id IS NULL
           OR v_out.quantity_delta <> -1
           OR v_in.quantity_delta <> 1 THEN
            RAISE EXCEPTION
                'Produk serial harus ditransfer satu unit individual.';
        END IF;

        SELECT unit_status
        INTO v_unit_status
        FROM public.product_units
        WHERE id = v_out.product_unit_id
          AND product_variant_id = v_out.product_variant_id
          AND warehouse_id = v_out.warehouse_id
        FOR UPDATE;

        IF NOT FOUND OR v_unit_status IS DISTINCT FROM v_out.inventory_status THEN
            RAISE EXCEPTION
                'Serial unit tidak ditemukan di gudang sumber atau statusnya tidak sesuai.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.product_unit_identifiers
            WHERE product_unit_id = v_out.product_unit_id
              AND identifier_type = 'SERIAL_NUMBER'
        ) THEN
            RAISE EXCEPTION 'SERIAL_NUMBER wajib tersedia.';
        END IF;

    ELSE
        RAISE EXCEPTION 'Tracking type produk tidak dikenal.';
    END IF;


    -- ========================================================
    -- 5. ENSURE BALANCE ROWS EXIST
    -- ========================================================

    INSERT INTO public.inventory_balances (
        product_variant_id,
        product_id,
        warehouse_id
    )
    VALUES
        (v_out.product_variant_id, v_product_id, v_out.warehouse_id),
        (v_in.product_variant_id, v_product_id, v_in.warehouse_id)
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

    IF v_tracking_type IN ('imei', 'serial')
       AND v_out.product_unit_id IS NOT NULL THEN

        UPDATE public.product_units
        SET warehouse_id = v_in.warehouse_id
        WHERE id = v_out.product_unit_id;

    END IF;


    -- ========================================================
    -- 13. POST BOTH MOVEMENTS
    -- ========================================================

    UPDATE public.inventory_movements
    SET
        product_id = v_product_id,
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
        v_out.id,
        v_out.product_variant_id,
        v_product_id,
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
        v_in.id,
        v_in.product_variant_id,
        v_product_id,
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
$function$;

-- Full/partial reversal uses original historical valuation at Variant + Warehouse.
CREATE OR REPLACE FUNCTION public.post_inventory_reversal_unlocked(
    p_original_movement_id UUID,
    p_reversal_movement_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID;

    v_original RECORD;
    v_reversal RECORD;
    v_original_log RECORD;

    v_tracking_type VARCHAR(30);
    v_product_id UUID;

    v_balance RECORD;
    v_balance_status_quantity NUMERIC(18,3);

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

    SELECT pv.product_id, p.tracking_type
    INTO v_product_id, v_tracking_type
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
    WHERE pv.id = v_original.product_variant_id;

    IF NOT FOUND OR v_tracking_type <> 'quantity' THEN
        RAISE EXCEPTION
            'Fungsi reversal ini hanya untuk produk quantity-tracked.';
    END IF;

    IF (v_original.product_id IS NOT NULL AND v_original.product_id IS DISTINCT FROM v_product_id)
       OR (v_reversal.product_id IS NOT NULL AND v_reversal.product_id IS DISTINCT FROM v_product_id) THEN
        RAISE EXCEPTION
            'Product ID reversal tidak sesuai dengan parent Product Variant.';
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

v_balance_status_quantity := CASE v_original.inventory_status
    WHEN 'available' THEN v_balance.available_quantity
    WHEN 'reserved' THEN v_balance.reserved_quantity
    WHEN 'quarantine' THEN v_balance.quarantine_quantity
    WHEN 'damaged' THEN v_balance.damaged_quantity
    WHEN 'repair' THEN v_balance.repair_quantity
    ELSE NULL
END;

IF v_balance_status_quantity IS NULL THEN
    RAISE EXCEPTION
        'Status inventory tidak valid: %',
        v_original.inventory_status;
END IF;

IF v_reversal.quantity_delta < 0
   AND v_balance_status_quantity < v_reversal_quantity
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
        product_id = v_product_id,
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
        v_reversal.id,
        v_reversal.product_variant_id,
        v_product_id,
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
$function$;

REVOKE ALL ON FUNCTION public.create_inventory_transfer_by_product(uuid, uuid, uuid, numeric, character varying, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_inventory_transfer(uuid, uuid, uuid, numeric, character varying, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_transfer(uuid, uuid, uuid, numeric, character varying, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_inventory_transfer_unlocked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_transfer_unlocked(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.post_inventory_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_inventory_transfer(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_inventory_reversal_unlocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_reversal_unlocked(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.post_inventory_reversal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_inventory_reversal(uuid, uuid) TO authenticated, service_role;

-- Internal function is never directly executable by authenticated/anon/PUBLIC.
REVOKE ALL ON FUNCTION public.post_inventory_movement_unlocked(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement_unlocked(uuid, numeric) TO service_role;

-- Authenticated callers may only enter through the permission-checking public wrapper.
REVOKE ALL ON FUNCTION public.post_inventory_movement(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_inventory_movement(uuid, numeric) TO authenticated, service_role;

COMMIT;
