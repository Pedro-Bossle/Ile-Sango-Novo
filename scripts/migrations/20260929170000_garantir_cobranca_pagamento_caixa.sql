-- Garante: todo pagamento de cobrança gera/restaura lançamento no fluxo de caixa.

CREATE OR REPLACE FUNCTION public.sync_pagamento_to_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_cob_desc TEXT;
  v_tipo TEXT;
  v_categoria TEXT;
  v_modalidade TEXT;
  v_desc TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.caixa_lancamentos WHERE pagamento_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT p.nome INTO v_nome FROM public.pessoas p WHERE p.id = NEW.pessoa_id;
  SELECT c.descricao, c.tipo::text
    INTO v_cob_desc, v_tipo
  FROM public.cobrancas c
  WHERE c.id = NEW.cobranca_id;

  v_modalidade := COALESCE(NULLIF(TRIM(NEW.forma_pagamento), ''), 'Pix');
  v_desc := 'Pagamento ' || v_modalidade
    || ' - ' || COALESCE(NULLIF(TRIM(v_nome), ''), 'Membro')
    || ' - ' || COALESCE(NULLIF(TRIM(v_cob_desc), ''), 'Cobrança');

  v_categoria := CASE lower(trim(COALESCE(v_tipo, '')))
    WHEN 'mensalidade' THEN 'Mensalidade'
    WHEN 'obrigacao' THEN 'Cobrança'
    WHEN 'outros' THEN 'Outro'
    WHEN '' THEN 'Outro'
    ELSE trim(v_tipo)
  END;

  INSERT INTO public.caixa_lancamentos (
    data, tipo, categoria, descricao, valor, forma_pagamento,
    pessoa_id, membro_nome, origem, pagamento_id, created_by
  )
  VALUES (
    COALESCE(NEW.data_pagamento::date, CURRENT_DATE),
    'entrada',
    v_categoria,
    v_desc,
    NEW.valor,
    v_modalidade,
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
      pessoa_id = EXCLUDED.pessoa_id,
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
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
  AFTER UPDATE OF valor, data_pagamento, forma_pagamento, pessoa_id, cobranca_id
  ON public.cobranca_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.sync_pagamento_to_caixa();

CREATE TRIGGER trg_sync_pagamento_to_caixa_del
  AFTER DELETE ON public.cobranca_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.sync_pagamento_to_caixa();

-- Restaura lançamentos apagados que ainda têm pagamento, e cria os que faltam.
INSERT INTO public.caixa_lancamentos (
  data, tipo, categoria, descricao, valor, forma_pagamento,
  pessoa_id, membro_nome, origem, pagamento_id, created_by
)
SELECT
  COALESCE(cp.data_pagamento::date, CURRENT_DATE),
  'entrada',
  CASE lower(trim(COALESCE(c.tipo::text, '')))
    WHEN 'mensalidade' THEN 'Mensalidade'
    WHEN 'obrigacao' THEN 'Cobrança'
    WHEN 'outros' THEN 'Outro'
    WHEN '' THEN 'Outro'
    ELSE trim(c.tipo::text)
  END,
  'Pagamento ' || COALESCE(NULLIF(TRIM(cp.forma_pagamento), ''), 'Pix')
    || ' - ' || COALESCE(NULLIF(TRIM(p.nome), ''), 'Membro')
    || ' - ' || COALESCE(NULLIF(TRIM(c.descricao), ''), 'Cobrança'),
  cp.valor,
  COALESCE(NULLIF(TRIM(cp.forma_pagamento), ''), 'Pix'),
  cp.pessoa_id,
  p.nome,
  'pagamento',
  cp.id,
  auth.uid()
FROM public.cobranca_pagamentos cp
LEFT JOIN public.cobrancas c ON c.id = cp.cobranca_id
LEFT JOIN public.pessoas p ON p.id = cp.pessoa_id
ON CONFLICT (pagamento_id) DO UPDATE
SET data = EXCLUDED.data,
    valor = EXCLUDED.valor,
    forma_pagamento = EXCLUDED.forma_pagamento,
    membro_nome = EXCLUDED.membro_nome,
    pessoa_id = EXCLUDED.pessoa_id,
    descricao = EXCLUDED.descricao,
    categoria = EXCLUDED.categoria,
    updated_at = NOW(),
    deleted_at = NULL;
