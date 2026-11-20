-- HEXA CORE security hardening.
-- Remove inherited PUBLIC/anon EXECUTE from SECURITY DEFINER routines.
-- Authenticated access is retained only for functions used by the app/RLS.
REVOKE EXECUTE ON FUNCTION public.create_goods_receipt_by_product(uuid, date, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_inventory_transfer_by_product(uuid, uuid, uuid, numeric, character varying, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_purchase_order_by_product(uuid, uuid, date, date, text, jsonb, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_customer_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_warehouse_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_goods_receipt_by_product(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_stock_opname_counts_bulk(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_goods_receipt_by_product(uuid, date, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_inventory_transfer_by_product(uuid, uuid, uuid, numeric, character varying, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_by_product(uuid, uuid, date, date, text, jsonb, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_warehouse_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_goods_receipt_by_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_stock_opname_counts_bulk(uuid, jsonb) TO authenticated, service_role;

-- generate_customer_code() is a trigger function; triggers do not require
-- the invoking application role to have direct EXECUTE permission.
