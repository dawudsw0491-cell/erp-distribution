# Indonesia Postal Code Seed

Source dataset: [cahyadsn/wilayah_kodepos](https://github.com/cahyadsn/wilayah_kodepos)
- Source file: `db/wilayah_kodepos.sql`
- Source commit/data basis: Kepmendagri No. 300.2.2-2138 Tahun 2025
- Dataset states 83,762 village/kelurahan records.
- Source license: MIT. Preserve attribution and license notice.
- Source snapshot referenced in repository changelog: 2026-07-17.

## ERP mapping
The source administrative code format `XX.XX.XX.XXXX` is normalized by removing dots and mapped exactly to `public.indonesia_villages.id`. It is not joined by village name.

Validated against the current Supabase region master:
- Source records: 83,762
- Unique source village codes: 83,762
- Matched existing village IDs: 83,762
- Unmatched source codes: 0
- Existing villages without a source record: 0

## Files
Three CSV chunks, each with `village_id,postal_code`, are split only to keep repository/API operations manageable. Import them into the existing `public.indonesia_villages.postal_code` column after applying migration `20261124030000_add_indonesia_village_postal_codes.sql`.

The data is a point-in-time snapshot. The source repository notes that completeness/accuracy still requires verification against official postal-service records. Do not infer a postal code when the source value is absent.
