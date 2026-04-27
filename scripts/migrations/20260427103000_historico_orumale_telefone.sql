-- =============================================
-- MIGRAÇÃO: histórico do Orumalé por linha + telefone apenas dígitos
-- =============================================
BEGIN;

-- Garante coluna para vínculo de sobrenome no Orumalé (caso ambiente ainda não tenha).
ALTER TABLE public.orumale
  ADD COLUMN IF NOT EXISTS sobrenome_orisa_id UUID;

ALTER TABLE public.orumale
  DROP CONSTRAINT IF EXISTS orumale_sobrenome_orisa_id_fkey;

ALTER TABLE public.orumale
  ADD CONSTRAINT orumale_sobrenome_orisa_id_fkey
  FOREIGN KEY (sobrenome_orisa_id) REFERENCES public.sobrenomes_orisa(id);

-- Histórico por linha de Orumalé.
CREATE TABLE IF NOT EXISTS public.historico_orunmila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orumale_id UUID NOT NULL REFERENCES public.orumale(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_orunmila_orumale_id
  ON public.historico_orunmila(orumale_id);

CREATE INDEX IF NOT EXISTS idx_historico_orunmila_data_desc
  ON public.historico_orunmila(data DESC);

CREATE INDEX IF NOT EXISTS idx_historico_orunmila_created_at
  ON public.historico_orunmila(created_at DESC);

-- Trigger de atualização automática do updated_at.
CREATE OR REPLACE FUNCTION public.touch_updated_at_historico_orunmila()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_historico_orunmila ON public.historico_orunmila;
CREATE TRIGGER trg_touch_updated_at_historico_orunmila
BEFORE UPDATE ON public.historico_orunmila
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_historico_orunmila();

ALTER TABLE public.historico_orunmila ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historico_orunmila_select_authenticated ON public.historico_orunmila;
DROP POLICY IF EXISTS historico_orunmila_insert_authenticated ON public.historico_orunmila;
DROP POLICY IF EXISTS historico_orunmila_update_authenticated ON public.historico_orunmila;
DROP POLICY IF EXISTS historico_orunmila_delete_authenticated ON public.historico_orunmila;

CREATE POLICY historico_orunmila_select_authenticated
  ON public.historico_orunmila FOR SELECT TO authenticated
  USING (true);

CREATE POLICY historico_orunmila_insert_authenticated
  ON public.historico_orunmila FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY historico_orunmila_update_authenticated
  ON public.historico_orunmila FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY historico_orunmila_delete_authenticated
  ON public.historico_orunmila FOR DELETE TO authenticated
  USING (true);

-- Telefone legado -> apenas dígitos.
UPDATE public.pessoas
SET contato = NULLIF(regexp_replace(COALESCE(contato, ''), '\D', '', 'g'), '');

COMMIT;

-- =============================================
-- Verificações sugeridas após executar
-- =============================================
-- SELECT COUNT(*) FROM public.historico_orunmila;
-- SELECT contato FROM public.pessoas WHERE contato IS NOT NULL LIMIT 20;
