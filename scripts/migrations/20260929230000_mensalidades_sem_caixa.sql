-- Permite marcar mensalidade como paga sem lançar no fluxo de caixa
ALTER TABLE public.mensalidades
  ADD COLUMN IF NOT EXISTS sem_caixa boolean NOT NULL DEFAULT false;

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

  IF NEW.status IS DISTINCT FROM 'pago' OR COALESCE(NEW.sem_caixa, false) THEN
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
