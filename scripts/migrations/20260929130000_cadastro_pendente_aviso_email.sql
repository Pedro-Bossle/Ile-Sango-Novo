-- Marca envio de e-mail de aviso aos admins (cadastro público pendente)
SET lock_timeout = '10s';

ALTER TABLE public.membro_cadastro_pendentes
  ADD COLUMN IF NOT EXISTS aviso_email_em TIMESTAMPTZ;

COMMENT ON COLUMN public.membro_cadastro_pendentes.aviso_email_em IS
  'Quando o aviso por e-mail aos admins foi disparado';
