-- Atendimento ao vivo (comanda) + forma de pagamento nas visitas.

ALTER TABLE public.cliente_visitas
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;

CREATE TABLE IF NOT EXISTS public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  compromisso_id UUID REFERENCES public.agenda_compromissos(id) ON DELETE SET NULL,
  inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'pago', 'cancelado')),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  forma_pagamento TEXT,
  visita_id UUID REFERENCES public.cliente_visitas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atendimento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  catalogo_id BIGINT,
  nome TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantidade NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantidade > 0)
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON public.atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON public.atendimentos(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_atendimento_itens_atendimento ON public.atendimento_itens(atendimento_id);

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atendimentos_all_authenticated ON public.atendimentos;
CREATE POLICY atendimentos_all_authenticated ON public.atendimentos
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS atendimento_itens_all_authenticated ON public.atendimento_itens;
CREATE POLICY atendimento_itens_all_authenticated ON public.atendimento_itens
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.sync_visita_to_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_desc TEXT;
  v_modalidade TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE visita_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.pago IS NOT TRUE OR NEW.valor IS NULL OR NEW.valor <= 0 THEN
    DELETE FROM public.caixa_lancamentos WHERE visita_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT c.nome INTO v_nome FROM public.clientes c WHERE c.id = NEW.cliente_id;
  v_modalidade := COALESCE(NULLIF(TRIM(NEW.forma_pagamento), ''), 'Pix');
  v_desc := 'Pagamento ' || v_modalidade || ' - '
    || COALESCE(NULLIF(TRIM(v_nome), ''), 'Cliente')
    || ' - '
    || COALESCE(NULLIF(TRIM(NEW.resumo), ''), 'Atendimento');

  INSERT INTO public.caixa_lancamentos (
    data, tipo, categoria, descricao, valor, forma_pagamento,
    membro_nome, origem, visita_id, created_by
  )
  VALUES (
    COALESCE(NEW.data, CURRENT_DATE),
    'entrada',
    'Atendimento',
    v_desc,
    NEW.valor,
    v_modalidade,
    v_nome,
    'visita',
    NEW.id,
    COALESCE(NEW.created_by, auth.uid())
  )
  ON CONFLICT (visita_id) DO UPDATE
  SET data = EXCLUDED.data,
      valor = EXCLUDED.valor,
      forma_pagamento = EXCLUDED.forma_pagamento,
      membro_nome = EXCLUDED.membro_nome,
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_visita_to_caixa ON public.cliente_visitas;
CREATE TRIGGER trg_sync_visita_to_caixa
  AFTER INSERT OR UPDATE OF pago, valor, data, resumo, deleted_at, cliente_id, forma_pagamento
  ON public.cliente_visitas
  FOR EACH ROW EXECUTE FUNCTION public.sync_visita_to_caixa();
