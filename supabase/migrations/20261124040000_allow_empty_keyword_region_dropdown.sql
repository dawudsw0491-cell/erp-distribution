CREATE OR REPLACE FUNCTION public.search_indonesia_regions(
  p_level text,
  p_keyword text,
  p_parent_id text,
  p_required_permission text
)
RETURNS TABLE(id text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_keyword text := left(btrim(coalesce(p_keyword, '')), 80);
  v_pattern text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_required_permission NOT IN ('suppliers.create', 'master.create') THEN
    RAISE EXCEPTION 'Invalid permission scope' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_required_permission) THEN
    RAISE EXCEPTION 'Insufficient permission' USING ERRCODE = '42501';
  END IF;
  v_pattern := CASE WHEN v_keyword = '' THEN '%' ELSE v_keyword || '%' END;
  IF p_level = 'province' THEN
    RETURN QUERY SELECT p.code::text, p.name::text FROM public.indonesia_provinces p
    WHERE p.is_active = true AND p.name ILIKE v_pattern ORDER BY p.name LIMIT 50;
  ELSIF p_level = 'regency' THEN
    IF coalesce(btrim(p_parent_id), '') = '' THEN RAISE EXCEPTION 'Province is required' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT r.code::text, r.name::text FROM public.indonesia_regencies r
    WHERE r.province_code::text = p_parent_id AND r.is_active = true AND r.name ILIKE v_pattern ORDER BY r.name LIMIT 50;
  ELSIF p_level = 'district' THEN
    IF coalesce(btrim(p_parent_id), '') = '' THEN RAISE EXCEPTION 'Regency is required' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT d.id::text, d.name::text FROM public.indonesia_districts d
    WHERE d.regency_id::text = p_parent_id AND d.is_active = true AND d.name ILIKE v_pattern ORDER BY d.name LIMIT 50;
  ELSIF p_level = 'village' THEN
    IF coalesce(btrim(p_parent_id), '') = '' THEN RAISE EXCEPTION 'District is required' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT v.id::text, v.name::text FROM public.indonesia_villages v
    WHERE v.district_id::text = p_parent_id AND v.is_active = true AND v.name ILIKE v_pattern ORDER BY v.name LIMIT 50;
  ELSE
    RAISE EXCEPTION 'Invalid region level' USING ERRCODE = '22023';
  END IF;
END;
$function$;
