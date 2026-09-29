-- Mensalidades (grade anual por membro) + valor padrão nos dados do Ilê.
-- Rode sozinha (não em paralelo com ALTER em pessoas).

SET lock_timeout = '15s';

ALTER TABLE public.configuracoes_terreiro
  ADD COLUMN IF NOT EXISTS mensalidade_valor NUMERIC(10, 2) DEFAULT 20.00;

COMMENT ON COLUMN public.configuracoes_terreiro.mensalidade_valor IS
  'Valor padrão da mensalidade (grade anual)';

CREATE TABLE IF NOT EXISTS public.mensalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL,
  ano INT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'pago', 'isento', 'desligado')),
  valor NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  data_pagamento DATE,
  forma_pagamento TEXT,
  obs TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pessoa_id, ano, mes)
);

-- FK em passo separado (menos chance de deadlock com ALTER em pessoas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mensalidades_pessoa_id_fkey'
  ) THEN
    ALTER TABLE public.mensalidades
      ADD CONSTRAINT mensalidades_pessoa_id_fkey
      FOREIGN KEY (pessoa_id) REFERENCES public.pessoas(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mensalidades_ano ON public.mensalidades(ano);
CREATE INDEX IF NOT EXISTS idx_mensalidades_pessoa_ano ON public.mensalidades(pessoa_id, ano);

COMMENT ON TABLE public.mensalidades IS
  'Célula mensal: aberto | pago | isento | desligado';

ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mensalidades_all_authenticated ON public.mensalidades;
CREATE POLICY mensalidades_all_authenticated ON public.mensalidades
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
