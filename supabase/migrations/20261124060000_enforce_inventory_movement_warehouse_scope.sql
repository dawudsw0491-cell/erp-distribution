-- Enforce warehouse scope for every inventory movement write.
-- RPC permission checks remain authoritative for the operation itself; this
-- trigger adds the missing per-warehouse authorization at the database boundary.

CREATE OR REPLACE FUNCTION public.enforce_inventory_movement_warehouse_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for inventory movement writes.';
  END IF;

  IF NEW.warehouse_id IS NULL
     OR NOT public.has_warehouse_access(NEW.warehouse_id) THEN
    RAISE EXCEPTION 'User does not have access to the selected warehouse.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_inventory_movement_warehouse_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_inventory_movement_warehouse_scope() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_inventory_movement_warehouse_scope() FROM authenticated;

DROP TRIGGER IF EXISTS trg_inventory_movement_warehouse_scope
ON public.inventory_movements;

CREATE TRIGGER trg_inventory_movement_warehouse_scope
BEFORE INSERT OR UPDATE OF warehouse_id
ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inventory_movement_warehouse_scope();
