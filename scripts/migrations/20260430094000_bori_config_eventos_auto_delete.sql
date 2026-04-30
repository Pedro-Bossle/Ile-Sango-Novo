BEGIN;

-- Campo opcional: Data de Feitura de Bori no bloco do Orisá de cabeça.
ALTER TABLE public.cadastro_orixas
  ADD COLUMN IF NOT EXISTS data_feitura_bori DATE;

-- Configurações do terreiro (endereços e preferências globais).
CREATE TABLE IF NOT EXISTS public.configuracoes_terreiro (
  id INTEGER PRIMARY KEY,
  endereco_padrao_evento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.configuracoes_terreiro (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_updated_at_configuracoes_terreiro()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_configuracoes_terreiro ON public.configuracoes_terreiro;
CREATE TRIGGER trg_touch_updated_at_configuracoes_terreiro
BEFORE UPDATE ON public.configuracoes_terreiro
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_configuracoes_terreiro();

ALTER TABLE public.configuracoes_terreiro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS configuracoes_terreiro_select_authenticated ON public.configuracoes_terreiro;
DROP POLICY IF EXISTS configuracoes_terreiro_insert_authenticated ON public.configuracoes_terreiro;
DROP POLICY IF EXISTS configuracoes_terreiro_update_authenticated ON public.configuracoes_terreiro;
DROP POLICY IF EXISTS configuracoes_terreiro_delete_authenticated ON public.configuracoes_terreiro;

CREATE POLICY configuracoes_terreiro_select_authenticated
  ON public.configuracoes_terreiro FOR SELECT TO authenticated
  USING (true);

CREATE POLICY configuracoes_terreiro_insert_authenticated
  ON public.configuracoes_terreiro FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY configuracoes_terreiro_update_authenticated
  ON public.configuracoes_terreiro FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY configuracoes_terreiro_delete_authenticated
  ON public.configuracoes_terreiro FOR DELETE TO authenticated
  USING (true);

-- Função opcional para execução agendada no banco (pg_cron):
-- remove eventos passados (data < hoje), regra de exclusão no dia seguinte.
CREATE OR REPLACE FUNCTION public.excluir_eventos_passados()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.eventos
  WHERE data < CURRENT_DATE;
$$;

COMMIT;

-- Se usar pg_cron no seu projeto Supabase:
-- SELECT cron.schedule('excluir-eventos-passados-diario', '0 3 * * *', $$SELECT public.excluir_eventos_passados();$$);
