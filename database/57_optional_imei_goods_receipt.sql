-- MD-013: optional IMEI capture; units without IMEI remain aggregate SKU stock.
CREATE OR REPLACE FUNCTION public.create_goods_receipt_by_product(p_purchase_order_id uuid, p_receipt_date date, p_notes text, p_items jsonb)
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
            p.tracking_type
        INTO v_po_item
        FROM public.purchase_order_items poi
        JOIN public.products p
            ON p.id = poi.product_id
        WHERE poi.id = (v_item->>'purchase_order_item_id')::uuid
          AND poi.purchase_order_id = p_purchase_order_id
        FOR UPDATE OF poi;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Item tidak ditemukan dalam Purchase Order';
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

CREATE OR REPLACE FUNCTION public.post_goods_receipt_by_product(p_goods_receipt_id uuid)
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
            poi.product_id,
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
        JOIN public.products p
            ON p.id = poi.product_id
        WHERE gri.goods_receipt_id = p_goods_receipt_id
        ORDER BY gri.id
        FOR UPDATE OF gri, poi
    LOOP
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION
                'PO item belum memiliki Product Master.';
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
                public.create_inventory_movement_by_product(
                    v_item.product_id,
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
                    product_id,
                    warehouse_id,
                    unit_code,
                    unit_status,
                    received_at,
                    unit_cost,
                    notes
                )
                VALUES (
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
                    public.create_inventory_movement_by_product(
                        v_item.product_id,
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
                        v_movement_id := public.create_inventory_movement_by_product(
                            v_item.product_id, v_gr.warehouse_id, 'purchase',
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
