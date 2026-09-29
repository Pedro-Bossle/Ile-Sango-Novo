-- Quem criou o evento (para filtro e exibição na agenda unificada)
ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_created_by ON public.eventos(created_by);
