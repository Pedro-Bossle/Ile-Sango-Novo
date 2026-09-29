-- =============================================================================
-- Fase 1: profiles + ACL, soft deletes, caixa sync, atendimento, config Ilê
-- =============================================================================

BEGIN;

-- ---------- configuracoes_terreiro (Dados do Ilê) ----------
ALTER TABLE public.configuracoes_terreiro
  ADD COLUMN IF NOT EXISTS nome_ile TEXT,
  ADD COLUMN IF NOT EXISTS logo_base64 TEXT,
  ADD COLUMN IF NOT EXISTS chave_pix TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS uf TEXT;

INSERT INTO public.configuracoes_terreiro (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------- soft deletes ----------
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.catalogo ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.cobrancas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pessoas_deleted_at ON public.pessoas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_eventos_deleted_at ON public.eventos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_catalogo_deleted_at ON public.catalogo(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cobrancas_deleted_at ON public.cobrancas(deleted_at);

-- ---------- profiles + permissions ----------
-- A tabela profiles pode já existir (ex.: template Supabase com PK "id").
-- Alinha o schema em vez de depender só de CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome_exibicao TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  has_user_id BOOLEAN;
  has_id BOOLEAN;
  pk_cols TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) INTO has_user_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
  ) INTO has_id;

  -- Template clássico: id UUID = auth.users.id → renomear para user_id
  IF NOT has_user_id AND has_id THEN
    -- Remover policies que citam a coluna antiga (recriadas abaixo)
    DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
    DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
    DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
    DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

    ALTER TABLE public.profiles RENAME COLUMN id TO user_id;
    has_user_id := TRUE;
  END IF;

  IF NOT has_user_id THEN
    RAISE EXCEPTION
      'public.profiles existe sem coluna user_id/id. Inspecione a tabela e alinhe manualmente antes de continuar.';
  END IF;

  -- Garantir FK para auth.users (best-effort)
  BEGIN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  -- PK em user_id se ainda não houver
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
  INTO pk_cols
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
  WHERE i.indrelid = 'public.profiles'::regclass AND i.indisprimary;

  IF pk_cols IS NULL THEN
    ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
  ELSIF pk_cols <> 'user_id' THEN
    -- Se a PK não for user_id, criar UNIQUE para ON CONFLICT (user_id)
    BEGIN
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_exibicao TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Mapear full_name legado → nome_exibicao (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
  ) THEN
    UPDATE public.profiles
    SET nome_exibicao = COALESCE(nome_exibicao, full_name)
    WHERE nome_exibicao IS NULL AND full_name IS NOT NULL;
  END IF;
END $$;

-- Backfill email a partir de auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR btrim(p.email) = '');

UPDATE public.profiles
SET permissions = '{}'::jsonb
WHERE permissions IS NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at_profiles()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_profiles ON public.profiles;
CREATE TRIGGER trg_touch_updated_at_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_profiles();

-- Permissões totais (admin)
CREATE OR REPLACE FUNCTION public.full_permissions_json()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'visao_geral', jsonb_build_object('c', false, 'r', true, 'u', false, 'd', false, 's', false),
    'eventos', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false),
    'catalogo', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false),
    'membros', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false, 'excel', true),
    'cobrancas', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', true, 'pagar', true),
    'caixa', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false),
    'clientes', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', true),
    'orcamentos', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', true),
    'agenda', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', true),
    'dados_ile', jsonb_build_object('c', false, 'r', true, 'u', true, 'd', false, 's', false),
    'orixas', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false),
    'acessos', jsonb_build_object('c', true, 'r', true, 'u', true, 'd', true, 's', false),
    'restaurar', jsonb_build_object('c', false, 'r', true, 'u', true, 'd', false, 's', false)
  );
$$;

-- Seed admins (só se existirem em auth.users)
INSERT INTO public.profiles (user_id, email, nome_exibicao, is_admin, ativo, permissions)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), TRUE, TRUE, public.full_permissions_json()
FROM auth.users u
WHERE lower(u.email) IN ('pedro.bossle.s@gmail.com', 'ile.de.ase@gmail.com')
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email,
    is_admin = TRUE,
    ativo = TRUE,
    permissions = public.full_permissions_json();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;

CREATE OR REPLACE FUNCTION public.is_profile_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin AND ativo FROM public.profiles WHERE user_id = auth.uid()),
    FALSE
  );
$$;

CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_profile_admin());

CREATE POLICY profiles_insert_admin
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_profile_admin());

CREATE POLICY profiles_update_admin
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_profile_admin() OR auth.uid() = user_id)
  WITH CHECK (public.is_profile_admin() OR auth.uid() = user_id);

-- ---------- audit_log ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  entity TEXT NOT NULL,
  entity_id TEXT,
  resumo TEXT,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert_authenticated ON public.audit_log;

CREATE POLICY audit_log_select_admin
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_profile_admin());

CREATE POLICY audit_log_insert_authenticated
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------- caixa_lancamentos ----------
CREATE TABLE IF NOT EXISTS public.caixa_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria TEXT NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('mensalidade', 'obrigacao', 'doacao', 'despesa', 'outro')),
  descricao TEXT,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
  forma_pagamento TEXT,
  pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
  membro_nome TEXT,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'pagamento')),
  pagamento_id UUID UNIQUE REFERENCES public.cobranca_pagamentos(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_lancamentos_data ON public.caixa_lancamentos(data DESC);
CREATE INDEX IF NOT EXISTS idx_caixa_lancamentos_deleted_at ON public.caixa_lancamentos(deleted_at);

CREATE OR REPLACE FUNCTION public.sync_pagamento_to_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_desc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE pagamento_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT p.nome INTO v_nome FROM public.pessoas p WHERE p.id = NEW.pessoa_id;
  v_desc := 'Pagamento — ' || COALESCE(v_nome, 'Membro') ;

  INSERT INTO public.caixa_lancamentos (
    data, tipo, categoria, descricao, valor, forma_pagamento,
    pessoa_id, membro_nome, origem, pagamento_id, created_by
  )
  VALUES (
    COALESCE(NEW.data_pagamento::date, CURRENT_DATE),
    'entrada',
    'mensalidade',
    v_desc,
    NEW.valor,
    NEW.forma_pagamento,
    NEW.pessoa_id,
    v_nome,
    'pagamento',
    NEW.id,
    auth.uid()
  )
  ON CONFLICT (pagamento_id) DO UPDATE
  SET data = EXCLUDED.data,
      valor = EXCLUDED.valor,
      forma_pagamento = EXCLUDED.forma_pagamento,
      membro_nome = EXCLUDED.membro_nome,
      descricao = EXCLUDED.descricao,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pagamento_to_caixa_ins ON public.cobranca_pagamentos;
DROP TRIGGER IF EXISTS trg_sync_pagamento_to_caixa_upd ON public.cobranca_pagamentos;
DROP TRIGGER IF EXISTS trg_sync_pagamento_to_caixa_del ON public.cobranca_pagamentos;

CREATE TRIGGER trg_sync_pagamento_to_caixa_ins
AFTER INSERT ON public.cobranca_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.sync_pagamento_to_caixa();

CREATE TRIGGER trg_sync_pagamento_to_caixa_upd
AFTER UPDATE OF valor, data_pagamento, forma_pagamento, pessoa_id ON public.cobranca_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.sync_pagamento_to_caixa();

CREATE TRIGGER trg_sync_pagamento_to_caixa_del
AFTER DELETE ON public.cobranca_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.sync_pagamento_to_caixa();

-- Backfill pagamentos existentes
INSERT INTO public.caixa_lancamentos (
  data, tipo, categoria, descricao, valor, forma_pagamento,
  pessoa_id, membro_nome, origem, pagamento_id
)
SELECT
  COALESCE(cp.data_pagamento::date, CURRENT_DATE),
  'entrada',
  'mensalidade',
  'Pagamento — ' || COALESCE(pe.nome, 'Membro'),
  cp.valor,
  cp.forma_pagamento,
  cp.pessoa_id,
  pe.nome,
  'pagamento',
  cp.id
FROM public.cobranca_pagamentos cp
LEFT JOIN public.pessoas pe ON pe.id = cp.pessoa_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.caixa_lancamentos cl WHERE cl.pagamento_id = cp.id
);

ALTER TABLE public.caixa_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixa_lancamentos_all_authenticated ON public.caixa_lancamentos;
CREATE POLICY caixa_lancamentos_all_authenticated
  ON public.caixa_lancamentos FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- ---------- Atendimento ----------
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  data_nascimento DATE,
  whatsapp TEXT,
  email TEXT,
  obs TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cliente_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  resumo TEXT,
  valor NUMERIC(12, 2),
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  obs TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  titulo TEXT,
  mensagem TEXT,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  catalogo_id BIGINT,
  nome TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantidade NUMERIC(10, 2) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.agenda_compromissos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  local TEXT,
  notas TEXT,
  tipo TEXT NOT NULL DEFAULT 'atendimento'
    CHECK (tipo IN ('atendimento', 'compromisso', 'outro')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_deleted_at ON public.clientes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cliente_visitas_cliente ON public.cliente_visitas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agenda_compromissos_inicio ON public.agenda_compromissos(inicio);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_compromissos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_all_authenticated ON public.clientes;
DROP POLICY IF EXISTS cliente_visitas_all_authenticated ON public.cliente_visitas;
DROP POLICY IF EXISTS orcamentos_all_authenticated ON public.orcamentos;
DROP POLICY IF EXISTS orcamento_itens_all_authenticated ON public.orcamento_itens;
DROP POLICY IF EXISTS agenda_compromissos_all_authenticated ON public.agenda_compromissos;

CREATE POLICY clientes_all_authenticated ON public.clientes FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY cliente_visitas_all_authenticated ON public.cliente_visitas FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY orcamentos_all_authenticated ON public.orcamentos FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY orcamento_itens_all_authenticated ON public.orcamento_itens FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY agenda_compromissos_all_authenticated ON public.agenda_compromissos FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

COMMIT;
