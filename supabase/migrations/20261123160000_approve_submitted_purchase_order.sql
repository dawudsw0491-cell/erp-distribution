-- Make the Purchase Order approval RPC accept both direct-draft and submitted workflow states.
-- The current UI approves drafts directly; submit_purchase_order remains a supported RPC path.
CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_purchase_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_order public.purchase_orders%ROWTYPE;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.has_permission('purchasing.approve') THEN
        RAISE EXCEPTION 'Permission denied: purchasing.approve';
    END IF;

    SELECT *
    INTO v_order
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order not found';
    END IF;

    IF v_order.status NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'Only draft or submitted Purchase Orders can be approved';
    END IF;

    IF v_order.created_by = v_user_id
       AND NOT public.is_owner() THEN
        RAISE EXCEPTION 'You cannot approve your own Purchase Order';
    END IF;

    UPDATE public.purchase_orders
    SET
        status = 'approved',
        approved_by = v_user_id,
        approved_at = now(),
        updated_at = now()
    WHERE id = p_purchase_order_id;

    RETURN p_purchase_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(uuid) TO authenticated, service_role;
