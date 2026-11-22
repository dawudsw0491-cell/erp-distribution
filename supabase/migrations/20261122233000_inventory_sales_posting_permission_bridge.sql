-- Narrow authorization bridge for Sales Delivery Order stock posting.
-- Preserve the canonical inventory posting function body and all valuation /
-- stock algorithms. Only move and specialize its initial permission gate.
do $migration$
declare
  v_definition text;
  v_old_gate text := $old$
    IF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.update.';
    END IF;
$old$;
  v_new_gate text := $new$
    IF v_movement.movement_type = 'sale' THEN
        IF v_movement.source_reference_type <> 'delivery_order'
           OR v_movement.source_reference_id IS NULL
           OR v_movement.quantity_delta >= 0
           OR v_movement.inventory_status <> 'available'
           OR NOT public.has_permission('sales.create')
           OR NOT EXISTS (
               SELECT 1
               FROM public.delivery_order_items doi
               JOIN public.delivery_orders d
                 ON d.id = doi.delivery_order_id
               JOIN public.sales_order_items soi
                 ON soi.id = doi.sales_order_item_id
               WHERE doi.id = v_movement.source_reference_id
                 AND doi.inventory_movement_id = v_movement.id
                 AND d.status = 'draft'
                 AND d.warehouse_id = v_movement.warehouse_id
                 AND doi.product_id = v_movement.product_id
                 AND doi.product_variant_id = v_movement.product_variant_id
                 AND soi.product_id = doi.product_id
                 AND soi.product_variant_id = doi.product_variant_id
           ) THEN
            RAISE EXCEPTION
                'Movement sale hanya dapat diposting melalui Delivery Order yang valid.';
        END IF;
    ELSIF NOT public.has_permission('inventory.update') THEN
        RAISE EXCEPTION
            'User tidak memiliki permission inventory.update.';
    END IF;
$new$;
  v_read_block text := $read$
    SELECT *
    INTO v_movement
    FROM public.inventory_movements
    WHERE id = p_movement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory movement tidak ditemukan.';
    END IF;
$read$;
begin
  v_definition := pg_get_functiondef(
    'public.post_inventory_movement_unlocked(uuid,numeric)'::regprocedure
  );

  if length(v_definition) = 0
     or position(v_old_gate in v_definition) = 0
     or position(v_read_block in v_definition) = 0 then
    raise exception 'Inventory posting function differs from reviewed baseline; bridge aborted.';
  end if;

  v_definition := replace(v_definition, v_old_gate, '');
  v_definition := replace(
    v_definition,
    v_read_block,
    v_read_block || E'\n' || v_new_gate
  );

  if position(v_old_gate in v_definition) > 0
     or position(v_new_gate in v_definition) = 0 then
    raise exception 'Could not safely construct narrow inventory permission bridge.';
  end if;

  execute v_definition;
end;
$migration$;

comment on function public.post_inventory_movement_unlocked(uuid,numeric) is
  'Canonical inventory posting algorithm. Sale movements require a source-linked draft Delivery Order and sales.create; all other movement types retain inventory.update.';
