-- Recheck warehouse scope on every movement update, including posting.
-- This prevents a draft from being posted after the user's warehouse access is revoked.

DROP TRIGGER IF EXISTS trg_inventory_movement_warehouse_scope
ON public.inventory_movements;

CREATE TRIGGER trg_inventory_movement_warehouse_scope
BEFORE INSERT OR UPDATE
ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_inventory_movement_warehouse_scope();
