-- Categorias da Agenda (nome + cor das barras no calendário)

CREATE TABLE IF NOT EXISTS public.agenda_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#2e5a44',
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agenda_categorias_nome_unique UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS idx_agenda_categorias_ativo
  ON public.agenda_categorias(ativo)
  WHERE deleted_at IS NULL;

INSERT INTO public.agenda_categorias (nome, cor, ordem) VALUES
  ('Atendimento', '#2e5a44', 1),
  ('Compromisso', '#1f4a7a', 2),
  ('Outro', '#6b7280', 3)
ON CONFLICT (nome) DO NOTHING;

-- Tipo livre (categorias configuráveis)
ALTER TABLE public.agenda_compromissos
  DROP CONSTRAINT IF EXISTS agenda_compromissos_tipo_check;

-- Compat: valores legados em minúsculo no campo tipo
UPDATE public.agenda_compromissos SET tipo = 'Atendimento' WHERE tipo = 'atendimento' AND deleted_at IS NULL;
UPDATE public.agenda_compromissos SET tipo = 'Compromisso' WHERE tipo = 'compromisso' AND deleted_at IS NULL;
UPDATE public.agenda_compromissos SET tipo = 'Outro' WHERE tipo = 'outro' AND deleted_at IS NULL;

ALTER TABLE public.agenda_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_categorias_all_authenticated ON public.agenda_categorias;
CREATE POLICY agenda_categorias_all_authenticated
  ON public.agenda_categorias FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
