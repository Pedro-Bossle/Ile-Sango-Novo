BEGIN;

-- Lifespan da auditoria: remove registros com mais de N dias (padrão 90).
-- Só admin pode executar. Retorna quantas linhas foram apagadas.
CREATE OR REPLACE FUNCTION public.purge_audit_log_expirado(dias integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF dias IS NULL OR dias < 1 THEN
    RAISE EXCEPTION 'dias deve ser >= 1';
  END IF;

  IF NOT public.is_profile_admin() THEN
    RAISE EXCEPTION 'somente administrador';
  END IF;

  DELETE FROM public.audit_log
  WHERE created_at < (NOW() - make_interval(days => dias));

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_log_expirado(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_audit_log_expirado(integer) TO authenticated;

COMMIT;

-- Opcional com pg_cron (diário às 03:15):
-- SELECT cron.schedule(
--   'purge-audit-log-90d',
--   '15 3 * * *',
--   $$SELECT public.purge_audit_log_expirado(90);$$
-- );
