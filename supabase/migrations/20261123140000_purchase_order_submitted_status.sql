-- Allow the submitted state used by the canonical Purchase Order lifecycle.
-- submit_purchase_order() transitions draft -> submitted; approve_purchase_order() consumes it.
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS chk_purchase_order_status;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT chk_purchase_order_status
  CHECK (status IN (
    'draft',
    'submitted',
    'approved',
    'rejected',
    'partially_received',
    'received',
    'cancelled'
  ));
