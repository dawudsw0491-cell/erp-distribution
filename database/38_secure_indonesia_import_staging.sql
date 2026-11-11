
BEGIN;

-- Prevent concurrent access changes during remediation.
LOCK TABLE
    public.import_indonesia_provinces,
    public.import_indonesia_regencies
IN ACCESS EXCLUSIVE MODE;

-- Enable Row Level Security.
ALTER TABLE public.import_indonesia_provinces
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_indonesia_regencies
    ENABLE ROW LEVEL SECURITY;

-- Remove all direct and inherited PUBLIC access
-- and all direct access from client-facing roles.
REVOKE ALL PRIVILEGES
ON TABLE
    public.import_indonesia_provinces,
    public.import_indonesia_regencies
FROM PUBLIC, anon, authenticated;

-- Preserve backend import capability.
GRANT ALL PRIVILEGES
ON TABLE
    public.import_indonesia_provinces,
    public.import_indonesia_regencies
TO service_role;

-- Verify the resulting security configuration.
DO $$
DECLARE
    v_table TEXT;
    v_role TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'import_indonesia_provinces',
        'import_indonesia_regencies'
    ]
    LOOP
        IF NOT (
            SELECT c.relrowsecurity
            FROM pg_catalog.pg_class c
            WHERE c.oid = format('public.%I', v_table)::regclass
        ) THEN
            RAISE EXCEPTION 'RLS is not enabled on %', v_table;
        END IF;

        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
            IF has_table_privilege(
                v_role,
                format('public.%I', v_table),
                'SELECT'
            ) OR has_table_privilege(
                v_role,
                format('public.%I', v_table),
                'INSERT'
            ) OR has_table_privilege(
                v_role,
                format('public.%I', v_table),
                'UPDATE'
            ) OR has_table_privilege(
                v_role,
                format('public.%I', v_table),
                'DELETE'
            ) OR has_table_privilege(
                v_role,
                format('public.%I', v_table),
                'TRUNCATE'
            ) THEN
                RAISE EXCEPTION
                    'Unexpected client privilege: table %, role %',
                    v_table, v_role;
            END IF;
        END LOOP;

        IF NOT has_table_privilege(
            'service_role',
            format('public.%I', v_table),
            'SELECT'
        ) OR NOT has_table_privilege(
            'service_role',
            format('public.%I', v_table),
            'INSERT'
        ) OR NOT has_table_privilege(
            'service_role',
            format('public.%I', v_table),
            'UPDATE'
        ) OR NOT has_table_privilege(
            'service_role',
            format('public.%I', v_table),
            'DELETE'
        ) THEN
            RAISE EXCEPTION
                'Backend privileges are incomplete on %',
                v_table;
        END IF;
    END LOOP;
END;
$$;

COMMIT;
