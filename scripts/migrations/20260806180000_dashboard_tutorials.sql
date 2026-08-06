-- =============================================================================
-- Progresso do tutorial da dashboard (por utilizador + tela)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dashboard_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screen TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_tutorials_user_screen_unique UNIQUE (user_id, screen)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_tutorials_user
  ON public.dashboard_tutorials(user_id);

ALTER TABLE public.dashboard_tutorials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_tutorials_select_own ON public.dashboard_tutorials;
DROP POLICY IF EXISTS dashboard_tutorials_insert_own ON public.dashboard_tutorials;
DROP POLICY IF EXISTS dashboard_tutorials_update_own ON public.dashboard_tutorials;
DROP POLICY IF EXISTS dashboard_tutorials_delete_own ON public.dashboard_tutorials;

CREATE POLICY dashboard_tutorials_select_own
  ON public.dashboard_tutorials FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY dashboard_tutorials_insert_own
  ON public.dashboard_tutorials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY dashboard_tutorials_update_own
  ON public.dashboard_tutorials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY dashboard_tutorials_delete_own
  ON public.dashboard_tutorials FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
