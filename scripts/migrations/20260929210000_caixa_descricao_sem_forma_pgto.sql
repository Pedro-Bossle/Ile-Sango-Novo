-- Descrição do caixa sem forma de pagamento (fica só na coluna forma_pagamento):
-- "{Membro/Cliente} - {detalhe}"

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
  v_desc := COALESCE(NULLIF(TRIM(v_nome), ''), 'Membro')
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
  v_desc := COALESCE(NULLIF(TRIM(v_nome), ''), 'Membro')
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
  v_desc := COALESCE(NULLIF(TRIM(v_nome), ''), 'Cliente')
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

-- Limpa prefixo legado "Pagamento [Modalidade] - " nas descrições existentes
UPDATE public.caixa_lancamentos
SET descricao = regexp_replace(
  descricao,
  '^Pagamento[[:space:]]+(Pix|Dinheiro|Cartão|Cartao)[[:space:]]*-[[:space:]]*',
  '',
  'i'
),
updated_at = NOW()
WHERE descricao ~* '^Pagamento[[:space:]]+(Pix|Dinheiro|Cartão|Cartao)[[:space:]]*-';
