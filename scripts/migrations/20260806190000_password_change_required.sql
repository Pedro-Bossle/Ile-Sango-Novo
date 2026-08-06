-- =============================================================================
-- Força troca de senha no próximo login (por utilizador)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.password_change_required (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  required_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.password_change_required ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_change_required_select_own ON public.password_change_required;
DROP POLICY IF EXISTS password_change_required_update_own ON public.password_change_required;
DROP POLICY IF EXISTS password_change_required_delete_own ON public.password_change_required;

-- Utilizador só vê e conclui o próprio registo (inserção via SQL/admin).
CREATE POLICY password_change_required_select_own
  ON public.password_change_required FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY password_change_required_update_own
  ON public.password_change_required FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY password_change_required_delete_own
  ON public.password_change_required FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Próximo login deste utilizador deve solicitar troca de senha.
INSERT INTO public.password_change_required (user_id, required_at, completed_at)
VALUES ('fd74d483-f27a-499f-9e2a-d1226922f5eb', NOW(), NULL)
ON CONFLICT (user_id) DO UPDATE
SET required_at = EXCLUDED.required_at,
    completed_at = NULL;
