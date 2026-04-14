-- =============================================================================
-- Il Sango — SQL único para colar no Supabase (SQL Editor)
-- Ordem: cobranças/schema → remover UNIQUE membro → RLS em todas as tabelas do app
-- Se já aplicaste parte disto, os IF NOT EXISTS / DROP IF EXISTS tornam a maior parte idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Extensão e colunas/tabelas de cobranças (tipo, parcelas, sem auto-geração mensal)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'mensalidade';

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10, 2);

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cobrancas' AND column_name = 'valor_saldo'
  ) THEN
    ALTER TABLE public.cobrancas
      ADD COLUMN valor_saldo NUMERIC(10, 2)
      GENERATED ALWAYS AS (COALESCE(valor_total, 0) - COALESCE(valor_pago, 0)) STORED;
  END IF;
END $$;

UPDATE public.cobrancas
SET valor_total = COALESCE(valor_total, valor::numeric)
WHERE valor_total IS NULL AND valor IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cobranca_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id BIGINT NOT NULL REFERENCES public.cobrancas(id) ON DELETE CASCADE,
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  valor NUMERIC(10, 2) NOT NULL,
  data_pagamento DATE NOT NULL,
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cobranca_pagamentos_cobranca
  ON public.cobranca_pagamentos(cobranca_id);

CREATE INDEX IF NOT EXISTS idx_cobranca_pagamentos_pessoa
  ON public.cobranca_pagamentos(pessoa_id);

CREATE OR REPLACE FUNCTION public.update_valor_pago()
RETURNS TRIGGER AS $$
DECLARE
  target_id BIGINT;
BEGIN
  target_id := COALESCE(NEW.cobranca_id, OLD.cobranca_id);
  UPDATE public.cobrancas
  SET valor_pago = (
    SELECT COALESCE(SUM(valor), 0)
    FROM public.cobranca_pagamentos
    WHERE cobranca_id = target_id
  )
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_valor_pago ON public.cobranca_pagamentos;
CREATE TRIGGER trg_update_valor_pago
  AFTER INSERT OR UPDATE OR DELETE ON public.cobranca_pagamentos
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_valor_pago();

-- Sem geração automática mensal: usamos criação manual/em massa no app.
DROP FUNCTION IF EXISTS public.gerar_mensalidades_mensais();

-- ---------------------------------------------------------------------------
-- B) Remover UNIQUE legado em cobrancas.membro (várias cobranças por pessoa)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cobrancas DROP CONSTRAINT IF EXISTS cobrancas_membro_key;
ALTER TABLE public.cobrancas DROP CONSTRAINT IF EXISTS cobrancaas_membro_key;

-- ---------------------------------------------------------------------------
-- B.1) Eventos: tipo + ícone customizado
-- ---------------------------------------------------------------------------
ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'umbanda';

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS icone_customizado TEXT;

-- ---------------------------------------------------------------------------
-- C) RLS — authenticated: CRUD em todas as tabelas usadas pelo app
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pessoas',
    'eventos',
    'catalogo',
    'cobrancas',
    'cobranca_pagamentos',
    'orixas',
    'qualidades',
    'cadastro_orixas',
    'orumale',
    'exus'
  ]
  LOOP
    FOR r IN (
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pessoas_select_authenticated ON public.pessoas;
DROP POLICY IF EXISTS pessoas_insert_authenticated ON public.pessoas;
DROP POLICY IF EXISTS pessoas_update_authenticated ON public.pessoas;
DROP POLICY IF EXISTS pessoas_delete_authenticated ON public.pessoas;
CREATE POLICY pessoas_select_authenticated ON public.pessoas FOR SELECT TO authenticated USING (true);
CREATE POLICY pessoas_insert_authenticated ON public.pessoas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pessoas_update_authenticated ON public.pessoas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pessoas_delete_authenticated ON public.pessoas FOR DELETE TO authenticated USING (true);

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eventos_select_authenticated ON public.eventos;
DROP POLICY IF EXISTS eventos_select_anon ON public.eventos;
DROP POLICY IF EXISTS eventos_insert_authenticated ON public.eventos;
DROP POLICY IF EXISTS eventos_update_authenticated ON public.eventos;
DROP POLICY IF EXISTS eventos_delete_authenticated ON public.eventos;
CREATE POLICY eventos_select_authenticated ON public.eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY eventos_select_anon ON public.eventos FOR SELECT TO anon USING (true);
CREATE POLICY eventos_insert_authenticated ON public.eventos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY eventos_update_authenticated ON public.eventos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY eventos_delete_authenticated ON public.eventos FOR DELETE TO authenticated USING (true);

ALTER TABLE public.catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogo_select_authenticated ON public.catalogo;
DROP POLICY IF EXISTS catalogo_select_anon ON public.catalogo;
DROP POLICY IF EXISTS catalogo_insert_authenticated ON public.catalogo;
DROP POLICY IF EXISTS catalogo_update_authenticated ON public.catalogo;
DROP POLICY IF EXISTS catalogo_delete_authenticated ON public.catalogo;
CREATE POLICY catalogo_select_authenticated ON public.catalogo FOR SELECT TO authenticated USING (true);
CREATE POLICY catalogo_select_anon ON public.catalogo FOR SELECT TO anon USING (true);
CREATE POLICY catalogo_insert_authenticated ON public.catalogo FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY catalogo_update_authenticated ON public.catalogo FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY catalogo_delete_authenticated ON public.catalogo FOR DELETE TO authenticated USING (true);

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobrancas_select_authenticated ON public.cobrancas;
DROP POLICY IF EXISTS cobrancas_insert_authenticated ON public.cobrancas;
DROP POLICY IF EXISTS cobrancas_update_authenticated ON public.cobrancas;
DROP POLICY IF EXISTS cobrancas_delete_authenticated ON public.cobrancas;
CREATE POLICY cobrancas_select_authenticated ON public.cobrancas FOR SELECT TO authenticated USING (true);
CREATE POLICY cobrancas_insert_authenticated ON public.cobrancas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cobrancas_update_authenticated ON public.cobrancas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cobrancas_delete_authenticated ON public.cobrancas FOR DELETE TO authenticated USING (true);

ALTER TABLE public.cobranca_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobranca_pagamentos_select_authenticated ON public.cobranca_pagamentos;
DROP POLICY IF EXISTS cobranca_pagamentos_insert_authenticated ON public.cobranca_pagamentos;
DROP POLICY IF EXISTS cobranca_pagamentos_update_authenticated ON public.cobranca_pagamentos;
DROP POLICY IF EXISTS cobranca_pagamentos_delete_authenticated ON public.cobranca_pagamentos;
CREATE POLICY cobranca_pagamentos_select_authenticated ON public.cobranca_pagamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY cobranca_pagamentos_insert_authenticated ON public.cobranca_pagamentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cobranca_pagamentos_update_authenticated ON public.cobranca_pagamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cobranca_pagamentos_delete_authenticated ON public.cobranca_pagamentos FOR DELETE TO authenticated USING (true);

ALTER TABLE public.orixas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orixas_select_authenticated ON public.orixas;
DROP POLICY IF EXISTS orixas_insert_authenticated ON public.orixas;
DROP POLICY IF EXISTS orixas_update_authenticated ON public.orixas;
DROP POLICY IF EXISTS orixas_delete_authenticated ON public.orixas;
CREATE POLICY orixas_select_authenticated ON public.orixas FOR SELECT TO authenticated USING (true);
CREATE POLICY orixas_insert_authenticated ON public.orixas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY orixas_update_authenticated ON public.orixas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY orixas_delete_authenticated ON public.orixas FOR DELETE TO authenticated USING (true);

ALTER TABLE public.qualidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qualidades_select_authenticated ON public.qualidades;
DROP POLICY IF EXISTS qualidades_insert_authenticated ON public.qualidades;
DROP POLICY IF EXISTS qualidades_update_authenticated ON public.qualidades;
DROP POLICY IF EXISTS qualidades_delete_authenticated ON public.qualidades;
CREATE POLICY qualidades_select_authenticated ON public.qualidades FOR SELECT TO authenticated USING (true);
CREATE POLICY qualidades_insert_authenticated ON public.qualidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY qualidades_update_authenticated ON public.qualidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY qualidades_delete_authenticated ON public.qualidades FOR DELETE TO authenticated USING (true);

ALTER TABLE public.cadastro_orixas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cadastro_orixas_select_authenticated ON public.cadastro_orixas;
DROP POLICY IF EXISTS cadastro_orixas_insert_authenticated ON public.cadastro_orixas;
DROP POLICY IF EXISTS cadastro_orixas_update_authenticated ON public.cadastro_orixas;
DROP POLICY IF EXISTS cadastro_orixas_delete_authenticated ON public.cadastro_orixas;
CREATE POLICY cadastro_orixas_select_authenticated ON public.cadastro_orixas FOR SELECT TO authenticated USING (true);
CREATE POLICY cadastro_orixas_insert_authenticated ON public.cadastro_orixas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cadastro_orixas_update_authenticated ON public.cadastro_orixas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY cadastro_orixas_delete_authenticated ON public.cadastro_orixas FOR DELETE TO authenticated USING (true);

ALTER TABLE public.orumale ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orumale_select_authenticated ON public.orumale;
DROP POLICY IF EXISTS orumale_insert_authenticated ON public.orumale;
DROP POLICY IF EXISTS orumale_update_authenticated ON public.orumale;
DROP POLICY IF EXISTS orumale_delete_authenticated ON public.orumale;
CREATE POLICY orumale_select_authenticated ON public.orumale FOR SELECT TO authenticated USING (true);
CREATE POLICY orumale_insert_authenticated ON public.orumale FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY orumale_update_authenticated ON public.orumale FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY orumale_delete_authenticated ON public.orumale FOR DELETE TO authenticated USING (true);

ALTER TABLE public.exus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exus_select_authenticated ON public.exus;
DROP POLICY IF EXISTS exus_insert_authenticated ON public.exus;
DROP POLICY IF EXISTS exus_update_authenticated ON public.exus;
DROP POLICY IF EXISTS exus_delete_authenticated ON public.exus;
CREATE POLICY exus_select_authenticated ON public.exus FOR SELECT TO authenticated USING (true);
CREATE POLICY exus_insert_authenticated ON public.exus FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY exus_update_authenticated ON public.exus FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY exus_delete_authenticated ON public.exus FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pessoas,
  public.eventos,
  public.catalogo,
  public.cobrancas,
  public.cobranca_pagamentos,
  public.orixas,
  public.qualidades,
  public.cadastro_orixas,
  public.orumale,
  public.exus
TO authenticated;

GRANT SELECT ON public.eventos, public.catalogo TO anon;
