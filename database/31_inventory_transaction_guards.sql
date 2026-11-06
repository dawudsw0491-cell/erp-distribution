
-- ============================================================
-- FILE 31: INVENTORY TRANSACTION GUARDS
-- PROJECT: ERP Distribution
-- PURPOSE: Protect inventory movement and valuation ledgers
-- DEPENDENCIES: FILE 26, FILE 30
-- ============================================================


-- ============================================================
-- 1. MOVEMENT UPDATE GUARD
-- ============================================================

CREATE OR REPLACE FUNCTION
public.guard_inventory_movement_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Movement posted tidak boleh diubah.
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION
            'Posted inventory movement bersifat immutable. '
            'Gunakan reversal untuk koreksi.';
    END IF;

    -- Movement cancelled tidak boleh diaktifkan kembali.
    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION
            'Cancelled inventory movement tidak dapat diubah.';
    END IF;

    -- Draft hanya boleh tetap draft atau berubah menjadi
    -- posted/cancelled.
    IF OLD.status = 'draft'
       AND NEW.status NOT IN ('draft', 'posted', 'cancelled') THEN
        RAISE EXCEPTION
            'Transisi status inventory movement tidak valid.';
    END IF;

    -- Posting harus memiliki metadata posting.
    IF NEW.status = 'posted'
       AND (
           NEW.posted_by IS NULL
           OR NEW.posted_at IS NULL
       ) THEN
        RAISE EXCEPTION
            'Posted movement wajib memiliki metadata posting.';
    END IF;

    -- Pembatalan hanya berlaku untuk draft.
    IF NEW.status = 'cancelled'
       AND (
           NEW.posted_by IS NOT NULL
           OR NEW.posted_at IS NOT NULL
       ) THEN
        RAISE EXCEPTION
            'Draft yang dibatalkan tidak boleh memiliki metadata posting.';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
trg_guard_inventory_movement_update
ON public.inventory_movements;

CREATE TRIGGER trg_guard_inventory_movement_update
BEFORE UPDATE
ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.guard_inventory_movement_update();


-- ============================================================
-- 2. MOVEMENT DELETE GUARD
-- ============================================================

CREATE OR REPLACE FUNCTION
public.guard_inventory_movement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Inventory movement tidak boleh dihapus. '
        'Gunakan pembatalan untuk draft atau reversal untuk posted.';
END;
$$;


DROP TRIGGER IF EXISTS
trg_guard_inventory_movement_delete
ON public.inventory_movements;

CREATE TRIGGER trg_guard_inventory_movement_delete
BEFORE DELETE
ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.guard_inventory_movement_delete();


-- ============================================================
-- 3. VALUATION LOG INSERT GUARD
-- ============================================================

CREATE OR REPLACE FUNCTION
public.guard_inventory_valuation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status
    INTO v_status
    FROM public.inventory_movements
    WHERE id = NEW.inventory_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Inventory movement tidak ditemukan.';
    END IF;

    IF v_status <> 'posted' THEN
        RAISE EXCEPTION
            'Valuation log hanya dapat dibuat untuk movement posted.';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
trg_guard_inventory_valuation_insert
ON public.inventory_valuation_logs;

CREATE TRIGGER trg_guard_inventory_valuation_insert
BEFORE INSERT
ON public.inventory_valuation_logs
FOR EACH ROW
EXECUTE FUNCTION public.guard_inventory_valuation_insert();


-- ============================================================
-- 4. VALUATION LOG UPDATE / DELETE GUARD
-- ============================================================

CREATE OR REPLACE FUNCTION
public.guard_inventory_valuation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Inventory valuation log bersifat append-only. '
        'Koreksi harus melalui movement kompensasi.';
END;
$$;


DROP TRIGGER IF EXISTS
trg_guard_inventory_valuation_update_delete
ON public.inventory_valuation_logs;

CREATE TRIGGER trg_guard_inventory_valuation_update_delete
BEFORE UPDATE OR DELETE
ON public.inventory_valuation_logs
FOR EACH ROW
EXECUTE FUNCTION public.guard_inventory_valuation_change();


-- ============================================================
-- 5. RESTRICT DIRECT APPLICATION ACCESS
-- ============================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.inventory_movements
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.inventory_valuation_logs
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 6. RESTRICT DIRECT EXECUTION OF GUARD FUNCTIONS
-- ============================================================

REVOKE EXECUTE
ON FUNCTION public.guard_inventory_movement_update()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.guard_inventory_movement_delete()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.guard_inventory_valuation_insert()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
ON FUNCTION public.guard_inventory_valuation_change()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- END OF FILE 31
-- ============================================================
