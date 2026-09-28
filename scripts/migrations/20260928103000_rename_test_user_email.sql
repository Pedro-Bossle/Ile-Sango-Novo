-- =============================================================================
-- Troca o email de acesso: teste@usuario.com → pedro.bossle.s@gmail.com
-- Rode no Supabase SQL Editor (uma vez).
-- =============================================================================

DO $$
DECLARE
  target_user_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower('pedro.bossle.s@gmail.com')
  ) AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower('teste@usuario.com')
  ) THEN
    RAISE NOTICE 'pedro.bossle.s@gmail.com ja existe e teste@usuario.com nao foi encontrado. Nada a fazer.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower('pedro.bossle.s@gmail.com')
  ) AND EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower('teste@usuario.com')
  ) THEN
    RAISE EXCEPTION 'Ja existe um utilizador com pedro.bossle.s@gmail.com. Remova ou una as contas antes de continuar.';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower('teste@usuario.com')
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador teste@usuario.com nao encontrado.';
  END IF;

  UPDATE auth.users
  SET
    email = 'pedro.bossle.s@gmail.com',
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = target_user_id;

  UPDATE auth.identities
  SET
    identity_data = COALESCE(identity_data, '{}'::jsonb)
      || jsonb_build_object(
        'email', 'pedro.bossle.s@gmail.com',
        'email_verified', true,
        'sub', id::text
      ),
    provider_id = CASE
      WHEN provider = 'email' AND provider_id = 'teste@usuario.com'
        THEN 'pedro.bossle.s@gmail.com'
      ELSE provider_id
    END,
    updated_at = NOW()
  WHERE user_id = target_user_id;

  RAISE NOTICE 'Email atualizado para pedro.bossle.s@gmail.com (user_id=%)', target_user_id;
END $$;
