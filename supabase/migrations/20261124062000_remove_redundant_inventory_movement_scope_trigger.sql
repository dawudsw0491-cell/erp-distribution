-- The existing private.enforce_warehouse_scope() trigger already validates
-- OLD and NEW warehouse scope for inventory_movements, including INSERT,
-- UPDATE and DELETE, while preserving the trusted service_role path.
-- Remove the redundant public-schema trigger/function added in the prior
-- remediation attempt; retain the established canonical scope enforcement.

DROP TRIGGER IF EXISTS trg_inventory_movement_warehouse_scope
ON public.inventory_movements;

DROP FUNCTION IF EXISTS public.enforce_inventory_movement_warehouse_scope();
