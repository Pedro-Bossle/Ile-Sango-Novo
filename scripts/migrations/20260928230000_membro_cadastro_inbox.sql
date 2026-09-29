-- Auto-cadastro de membros (link público) + inbox de notificações
SET lock_timeout = '15s';

-- 1) Links públicos
CREATE TABLE IF NOT EXISTS public.membro_cadastro_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membro_cadastro_links_ativo
  ON public.membro_cadastro_links(ativo) WHERE ativo = TRUE;

-- 2) Submissões pendentes (ficha completa em payload)
CREATE TABLE IF NOT EXISTS public.membro_cadastro_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.membro_cadastro_links(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  nome TEXT NOT NULL,
  data_nascimento DATE,
  data_entrada DATE,
  contato TEXT,
  email TEXT,
  signo TEXT,
  obs TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membro_cadastro_pendentes_status
  ON public.membro_cadastro_pendentes(status, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3) Inbox
CREATE TABLE IF NOT EXISTS public.dashboard_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'membro_cadastro'
    CHECK (tipo IN ('membro_cadastro')),
  titulo TEXT NOT NULL,
  corpo TEXT,
  entity_id UUID,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_notificacoes_nao_lidas
  ON public.dashboard_notificacoes(lida, created_at DESC)
  WHERE deleted_at IS NULL AND lida = FALSE;

ALTER TABLE public.membro_cadastro_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membro_cadastro_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membro_cadastro_links_all_authenticated ON public.membro_cadastro_links;
CREATE POLICY membro_cadastro_links_all_authenticated ON public.membro_cadastro_links
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS membro_cadastro_pendentes_all_authenticated ON public.membro_cadastro_pendentes;
CREATE POLICY membro_cadastro_pendentes_all_authenticated ON public.membro_cadastro_pendentes
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS dashboard_notificacoes_all_authenticated ON public.dashboard_notificacoes;
CREATE POLICY dashboard_notificacoes_all_authenticated ON public.dashboard_notificacoes
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Lookups públicos para o formulário anônimo (somente leitura)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orixas') THEN
    ALTER TABLE public.orixas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS orixas_select_anon ON public.orixas;
    CREATE POLICY orixas_select_anon ON public.orixas FOR SELECT TO anon USING (TRUE);
    DROP POLICY IF EXISTS orixas_all_authenticated ON public.orixas;
    CREATE POLICY orixas_all_authenticated ON public.orixas FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'qualidades') THEN
    ALTER TABLE public.qualidades ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS qualidades_select_anon ON public.qualidades;
    CREATE POLICY qualidades_select_anon ON public.qualidades FOR SELECT TO anon USING (TRUE);
    DROP POLICY IF EXISTS qualidades_all_authenticated ON public.qualidades;
    CREATE POLICY qualidades_all_authenticated ON public.qualidades FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sobrenomes_orisa') THEN
    ALTER TABLE public.sobrenomes_orisa ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS sobrenomes_orisa_select_anon ON public.sobrenomes_orisa;
    CREATE POLICY sobrenomes_orisa_select_anon ON public.sobrenomes_orisa FOR SELECT TO anon USING (TRUE);
    DROP POLICY IF EXISTS sobrenomes_orisa_all_authenticated ON public.sobrenomes_orisa;
    CREATE POLICY sobrenomes_orisa_all_authenticated ON public.sobrenomes_orisa FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END $$;

-- RPC: validar link
CREATE OR REPLACE FUNCTION public.validar_link_cadastro_membro(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.membro_cadastro_links
    WHERE token = p_token AND ativo = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_link_cadastro_membro(TEXT) TO anon, authenticated;

-- RPC: submeter ficha completa
CREATE OR REPLACE FUNCTION public.submeter_cadastro_membro(p_token TEXT, p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_id UUID;
  v_pendente_id UUID;
  v_nome TEXT;
  v_pessoa JSONB;
  v_resto JSONB;
BEGIN
  SELECT id INTO v_link_id
  FROM public.membro_cadastro_links
  WHERE token = p_token AND ativo = TRUE
  LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'Link de cadastro inválido ou inativo';
  END IF;

  v_pessoa := COALESCE(p_payload->'pessoa', '{}'::jsonb);
  v_nome := NULLIF(TRIM(COALESCE(v_pessoa->>'nome', '')), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  v_resto := jsonb_build_object(
    'cadastro', COALESCE(p_payload->'cadastro', '{}'::jsonb),
    'orumale', COALESCE(p_payload->'orumale', '[]'::jsonb),
    'exus', COALESCE(p_payload->'exus', '[]'::jsonb),
    'umbanda', COALESCE(p_payload->'umbanda', '[]'::jsonb)
  );

  INSERT INTO public.membro_cadastro_pendentes (
    link_id, nome, data_nascimento, data_entrada, contato, email, signo, obs, payload, status
  ) VALUES (
    v_link_id,
    v_nome,
    NULLIF(v_pessoa->>'data_nascimento', '')::DATE,
    NULLIF(v_pessoa->>'data_entrada', '')::DATE,
    NULLIF(TRIM(COALESCE(v_pessoa->>'contato', '')), ''),
    NULLIF(TRIM(COALESCE(v_pessoa->>'email', '')), ''),
    NULLIF(TRIM(COALESCE(v_pessoa->>'signo', '')), ''),
    NULLIF(TRIM(COALESCE(v_pessoa->>'obs', '')), ''),
    v_resto,
    'pendente'
  )
  RETURNING id INTO v_pendente_id;

  INSERT INTO public.dashboard_notificacoes (tipo, titulo, corpo, entity_id, lida)
  VALUES (
    'membro_cadastro',
    'Novo cadastro de membro',
    'Ficha enviada por ' || v_nome || ' — aguardando aprovação.',
    v_pendente_id,
    FALSE
  );

  RETURN v_pendente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submeter_cadastro_membro(TEXT, JSONB) TO anon, authenticated;

COMMENT ON TABLE public.membro_cadastro_links IS 'Links públicos para auto-cadastro de membros';
COMMENT ON TABLE public.membro_cadastro_pendentes IS 'Submissões da ficha completa aguardando aprovação';
COMMENT ON TABLE public.dashboard_notificacoes IS 'Inbox da dashboard (ex.: cadastros pendentes)';
