CREATE OR REPLACE FUNCTION public._tmp_check_evt()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'nome', evtname, 'evento', evtevent, 'funcao', p.proname, 'habilitado', evtenabled
    )), '[]'::jsonb)
    FROM pg_event_trigger et JOIN pg_proc p ON p.oid = et.evtfoid;
$$;
GRANT EXECUTE ON FUNCTION public._tmp_check_evt TO service_role;
