-- Compromissos: atribuição a usuário (ou todos) + metadados de recorrência

ALTER TABLE public.agenda_compromissos
  ADD COLUMN IF NOT EXISTS atribuido_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agenda_compromissos
  ADD COLUMN IF NOT EXISTS series_id UUID;

ALTER TABLE public.agenda_compromissos
  ADD COLUMN IF NOT EXISTS recorrencia_freq TEXT;

ALTER TABLE public.agenda_compromissos
  ADD COLUMN IF NOT EXISTS recorrencia_ate DATE;

CREATE INDEX IF NOT EXISTS idx_agenda_compromissos_atribuido
  ON public.agenda_compromissos(atribuido_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_compromissos_series
  ON public.agenda_compromissos(series_id)
  WHERE series_id IS NOT NULL AND deleted_at IS NULL;
