-- Add canonical Indonesian village postal code to the existing region master.
-- Source: cahyadsn/wilayah_kodepos (MIT), based on Kepmendagri No. 300.2.2-2138 Tahun 2025.
ALTER TABLE public.indonesia_villages
  ADD COLUMN IF NOT EXISTS postal_code varchar(5);

ALTER TABLE public.indonesia_villages
  DROP CONSTRAINT IF EXISTS indonesia_villages_postal_code_format_check;

ALTER TABLE public.indonesia_villages
  ADD CONSTRAINT indonesia_villages_postal_code_format_check
  CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$');

COMMENT ON COLUMN public.indonesia_villages.postal_code IS
  'Postal code from cahyadsn/wilayah_kodepos dataset; mapped by canonical village administrative code. MIT; source snapshot 2026-07-17.';
