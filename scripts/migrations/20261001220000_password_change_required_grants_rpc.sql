-- =============================================================================
-- Corrige privilégios e conclusão da troca de senha obrigatória
-- =============================================================================

-- Garantir privilégios de leitura/atualização para o cliente autenticado
GRANT SELECT, UPDATE ON public.password_change_required TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_change_required TO service_role;

-- RPC idempotente: marca a exigência do utilizador actual como concluída
CREATE OR REPLACE FUNCTION public.complete_password_change_required()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.password_change_required
  SET completed_at = NOW()
  WHERE user_id = auth.uid()
    AND completed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_password_change_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_password_change_required() TO authenticated;
