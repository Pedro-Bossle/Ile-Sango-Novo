-- =============================================================================
-- Eventos: tipo + ícone customizado para cards compactos
-- =============================================================================

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'umbanda';

ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS icone_customizado TEXT;
