-- Cobranças: tipo = categoria do caixa; sync usa o tipo como categoria do lançamento.
-- Parcelamento é feito no app (N linhas de cobrança).

INSERT INTO public.caixa_categorias (nome, tipo) VALUES
  ('Cobrança', 'entrada')
ON CONFLICT (nome) DO NOTHING;

-- Normaliza tipos legados para nomes de categoria do caixa
UPDATE public.cobrancas
SET tipo = CASE lower(trim(tipo))
  WHEN 'mensalidade' THEN 'Mensalidade'
  WHEN 'obrigacao' THEN 'Cobrança'
  WHEN 'outros' THEN 'Outro'
  ELSE tipo
END
WHERE tipo IS NOT NULL
  AND lower(trim(tipo)) IN ('mensalidade', 'obrigacao', 'outros');

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

  -- Tipo da cobrança = categoria do caixa (com fallback para valores legados)
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
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;
