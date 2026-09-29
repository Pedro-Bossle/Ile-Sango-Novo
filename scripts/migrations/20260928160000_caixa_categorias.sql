-- Categorias personalizadas do caixa + remover CHECK fixo em caixa_lancamentos.categoria

CREATE TABLE IF NOT EXISTS public.caixa_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ambos'
    CHECK (tipo IN ('entrada', 'saida', 'ambos')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT caixa_categorias_nome_unique UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS idx_caixa_categorias_ativo ON public.caixa_categorias(ativo) WHERE deleted_at IS NULL;

INSERT INTO public.caixa_categorias (nome, tipo) VALUES
  ('Mensalidade', 'entrada'),
  ('Obrigação', 'entrada'),
  ('Doação', 'entrada'),
  ('Despesa', 'saida'),
  ('Outro', 'ambos')
ON CONFLICT (nome) DO NOTHING;

-- Drop CHECK constraint on categoria (name may vary); recreate column as free TEXT
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'caixa_lancamentos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%categoria%'
  LOOP
    EXECUTE format('ALTER TABLE public.caixa_lancamentos DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.caixa_lancamentos
  ALTER COLUMN categoria SET DEFAULT 'Outro';

-- Map legacy lowercase keys to display names (best-effort)
UPDATE public.caixa_lancamentos SET categoria = 'Mensalidade' WHERE categoria = 'mensalidade';
UPDATE public.caixa_lancamentos SET categoria = 'Obrigação' WHERE categoria = 'obrigacao';
UPDATE public.caixa_lancamentos SET categoria = 'Doação' WHERE categoria = 'doacao';
UPDATE public.caixa_lancamentos SET categoria = 'Despesa' WHERE categoria = 'despesa';
UPDATE public.caixa_lancamentos SET categoria = 'Outro' WHERE categoria = 'outro';

ALTER TABLE public.caixa_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixa_categorias_all_authenticated ON public.caixa_categorias;
CREATE POLICY caixa_categorias_all_authenticated
  ON public.caixa_categorias FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Sync de pagamentos usa categoria legível
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
  v_desc := 'Pagamento — ' || COALESCE(v_nome, 'Membro');

  INSERT INTO public.caixa_lancamentos (
    data, tipo, categoria, descricao, valor, forma_pagamento,
    pessoa_id, membro_nome, origem, pagamento_id, created_by
  )
  VALUES (
    COALESCE(NEW.data_pagamento::date, CURRENT_DATE),
    'entrada',
    'Mensalidade',
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
      categoria = EXCLUDED.categoria,
      updated_at = NOW(),
      deleted_at = NULL;

  RETURN NEW;
END;
$$;
