-- Link público fixo /cadastrar_membro — token só no servidor (mascarado na UI)
SET lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.validar_link_cadastro_membro_ativo()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.membro_cadastro_links WHERE ativo = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_link_cadastro_membro_ativo() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submeter_cadastro_membro_ativo(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_id UUID;
  v_token TEXT;
BEGIN
  SELECT id, token INTO v_link_id, v_token
  FROM public.membro_cadastro_links
  WHERE ativo = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_link_id IS NULL OR v_token IS NULL THEN
    RAISE EXCEPTION 'Cadastro de membros temporariamente indisponível';
  END IF;

  RETURN public.submeter_cadastro_membro(v_token, p_payload);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submeter_cadastro_membro_ativo(JSONB) TO anon, authenticated;
