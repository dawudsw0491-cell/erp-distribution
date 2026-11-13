
CREATE OR REPLACE FUNCTION public.create_inventory_movement(
    p_product_variant_id uuid,
    p_warehouse_id uuid,
    p_movement_type varchar,
    p_quantity_delta numeric,
    p_inventory_status varchar DEFAULT 'available',
    p_product_unit_id uuid DEFAULT NULL,
    p_status_from varchar DEFAULT NULL,
    p_status_to varchar DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_movement_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    IF p_product_variant_id IS NULL
       OR p_warehouse_id IS NULL
       OR p_movement_type IS NULL
       OR p_quantity_delta IS NULL THEN
        RAISE EXCEPTION 'Data wajib belum lengkap';
    END IF;

    IF p_movement_type NOT IN (
        'purchase', 'sale', 'adjustment',
        'customer_return', 'supplier_return',
        'opening_balance', 'status_change'
    ) THEN
        RAISE EXCEPTION 'Jenis mutasi tidak valid';
    END IF;

    IF p_movement_type IN ('purchase', 'customer_return', 'opening_balance')
       AND p_quantity_delta <= 0 THEN
        RAISE EXCEPTION 'Mutasi masuk harus positif';
    END IF;

    IF p_movement_type IN ('sale', 'supplier_return')
       AND p_quantity_delta >= 0 THEN
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

    INSERT INTO public.inventory_movements (
        product_variant_id,
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
        p_product_variant_id,
        p_warehouse_id,
        p_product_unit_id,
        p_movement_type,
        'draft',
        p_quantity_delta,
        CASE
            WHEN p_movement_type = 'status_change'
            THEN NULL
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
$$;

REVOKE ALL ON FUNCTION public.create_inventory_movement(
    uuid, uuid, varchar, numeric, varchar,
    uuid, varchar, varchar, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_inventory_movement(
    uuid, uuid, varchar, numeric, varchar,
    uuid, varchar, varchar, text
) TO authenticated;
