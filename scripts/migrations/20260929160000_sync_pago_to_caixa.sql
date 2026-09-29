-- Todo pagamento (mensalidade / visita) entra automaticamente no fluxo de caixa.

INSERT INTO public.caixa_categorias (nome, tipo) VALUES
  ('Atendimento', 'entrada')
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.caixa_lancamentos
  ADD COLUMN IF NOT EXISTS mensalidade_id UUID,
  ADD COLUMN IF NOT EXISTS visita_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caixa_lancamentos_mensalidade_id_fkey'
  ) THEN
    ALTER TABLE public.caixa_lancamentos
      ADD CONSTRAINT caixa_lancamentos_mensalidade_id_fkey
      FOREIGN KEY (mensalidade_id) REFERENCES public.mensalidades(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caixa_lancamentos_visita_id_fkey'
  ) THEN
    ALTER TABLE public.caixa_lancamentos
      ADD CONSTRAINT caixa_lancamentos_visita_id_fkey
      FOREIGN KEY (visita_id) REFERENCES public.cliente_visitas(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caixa_lancamentos_mensalidade_id_key'
  ) THEN
    ALTER TABLE public.caixa_lancamentos
      ADD CONSTRAINT caixa_lancamentos_mensalidade_id_key UNIQUE (mensalidade_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caixa_lancamentos_visita_id_key'
  ) THEN
    ALTER TABLE public.caixa_lancamentos
      ADD CONSTRAINT caixa_lancamentos_visita_id_key UNIQUE (visita_id);
  END IF;
END $$;

ALTER TABLE public.caixa_lancamentos DROP CONSTRAINT IF EXISTS caixa_lancamentos_origem_check;
ALTER TABLE public.caixa_lancamentos
  ADD CONSTRAINT caixa_lancamentos_origem_check
  CHECK (origem = ANY (ARRAY['manual'::text, 'pagamento'::text, 'mensalidade'::text, 'visita'::text]));

CREATE OR REPLACE FUNCTION public.sync_mensalidade_to_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_mes TEXT;
  v_modalidade TEXT;
  v_desc TEXT;
  v_meses TEXT[] := ARRAY[
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE mensalidade_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pago' THEN
    DELETE FROM public.caixa_lancamentos WHERE mensalidade_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT p.nome INTO v_nome FROM public.pessoas p WHERE p.id = NEW.pessoa_id;
  v_mes := v_meses[NEW.mes];
  v_modalidade := COALESCE(NULLIF(TRIM(NEW.forma_pagamento), ''), 'Pix');
  v_desc := 'Pagamento ' || v_modalidade
    || ' - ' || COALESCE(NULLIF(TRIM(v_nome), ''), 'Membro')
    || ' - Mensalidade ' || v_mes || '/' || NEW.ano;

  INSERT INTO public.caixa_lancamentos (
    data, tipo, categoria, descricao, valor, forma_pagamento,
    pessoa_id, membro_nome, origem, mensalidade_id, created_by
  )
  VALUES (
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    'entrada',
    'Mensalidade',
    v_desc,
    NEW.valor,
    v_modalidade,
    NEW.pessoa_id,
    v_nome,
    'mensalidade',
    NEW.id,
    auth.uid()
  )
  ON CONFLICT (mensalidade_id) DO UPDATE
  SET data = EXCLUDED.data,
      valor = EXCLUDED.valor,
      forma_pagamento = EXCLUDED.forma_pagamento,
      membro_nome = EXCLUDED.membro_nome,
      pessoa_id = EXCLUDED.pessoa_id,
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_visita_to_caixa()
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
    DELETE FROM public.caixa_lancamentos WHERE visita_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.pago IS NOT TRUE OR NEW.valor IS NULL OR NEW.valor <= 0 THEN
    DELETE FROM public.caixa_lancamentos WHERE visita_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT c.nome INTO v_nome FROM public.clientes c WHERE c.id = NEW.cliente_id;
  v_desc := 'Pagamento Pix - '
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
    'Pix',
    v_nome,
    'visita',
    NEW.id,
    COALESCE(NEW.created_by, auth.uid())
  )
  ON CONFLICT (visita_id) DO UPDATE
  SET data = EXCLUDED.data,
      valor = EXCLUDED.valor,
      membro_nome = EXCLUDED.membro_nome,
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mensalidade_to_caixa ON public.mensalidades;
CREATE TRIGGER trg_sync_mensalidade_to_caixa
  AFTER INSERT OR UPDATE OF status, valor, data_pagamento, forma_pagamento, pessoa_id, ano, mes
  ON public.mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.sync_mensalidade_to_caixa();

DROP TRIGGER IF EXISTS trg_sync_visita_to_caixa ON public.cliente_visitas;
CREATE TRIGGER trg_sync_visita_to_caixa
  AFTER INSERT OR UPDATE OF pago, valor, data, resumo, deleted_at, cliente_id
  ON public.cliente_visitas
  FOR EACH ROW EXECUTE FUNCTION public.sync_visita_to_caixa();

UPDATE public.caixa_lancamentos cl
SET mensalidade_id = m.id,
    origem = 'mensalidade',
    updated_at = NOW()
FROM public.mensalidades m
LEFT JOIN public.pessoas p ON p.id = m.pessoa_id
WHERE cl.mensalidade_id IS NULL
  AND cl.deleted_at IS NULL
  AND cl.categoria = 'Mensalidade'
  AND m.status = 'pago'
  AND cl.data IS NOT DISTINCT FROM m.data_pagamento
  AND cl.valor = m.valor
  AND (
    cl.pessoa_id = m.pessoa_id
    OR (cl.membro_nome IS NOT NULL AND p.nome IS NOT NULL AND cl.membro_nome = p.nome)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.caixa_lancamentos x
    WHERE x.mensalidade_id = m.id
  );

INSERT INTO public.caixa_lancamentos (
  data, tipo, categoria, descricao, valor, forma_pagamento,
  pessoa_id, membro_nome, origem, mensalidade_id, created_by
)
SELECT
  COALESCE(m.data_pagamento, CURRENT_DATE),
  'entrada',
  'Mensalidade',
  'Pagamento ' || COALESCE(NULLIF(TRIM(m.forma_pagamento), ''), 'Pix')
    || ' - ' || COALESCE(NULLIF(TRIM(p.nome), ''), 'Membro')
    || ' - Mensalidade '
    || (ARRAY['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[m.mes]
    || '/' || m.ano,
  m.valor,
  COALESCE(NULLIF(TRIM(m.forma_pagamento), ''), 'Pix'),
  m.pessoa_id,
  p.nome,
  'mensalidade',
  m.id,
  auth.uid()
FROM public.mensalidades m
LEFT JOIN public.pessoas p ON p.id = m.pessoa_id
WHERE m.status = 'pago'
  AND NOT EXISTS (
    SELECT 1 FROM public.caixa_lancamentos c
    WHERE c.mensalidade_id = m.id
  );

INSERT INTO public.caixa_lancamentos (
  data, tipo, categoria, descricao, valor, forma_pagamento,
  membro_nome, origem, visita_id, created_by
)
SELECT
  COALESCE(v.data, CURRENT_DATE),
  'entrada',
  'Atendimento',
  'Pagamento Pix - '
    || COALESCE(NULLIF(TRIM(c.nome), ''), 'Cliente')
    || ' - '
    || COALESCE(NULLIF(TRIM(v.resumo), ''), 'Atendimento'),
  v.valor,
  'Pix',
  c.nome,
  'visita',
  v.id,
  COALESCE(v.created_by, auth.uid())
FROM public.cliente_visitas v
LEFT JOIN public.clientes c ON c.id = v.cliente_id
WHERE v.deleted_at IS NULL
  AND v.pago IS TRUE
  AND v.valor IS NOT NULL
  AND v.valor > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.caixa_lancamentos x
    WHERE x.visita_id = v.id
  );
