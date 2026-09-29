-- Todo membro (pessoas) passa a ter um cliente vinculado por padrão.
-- Trigger mantém sync em insert/update (incl. soft-delete); backfill cobre o histórico.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_cliente_from_pessoa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
  v_wa TEXT;
  v_email TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.clientes
    SET deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = NOW()
    WHERE pessoa_id = OLD.id AND deleted_at IS NULL;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE public.clientes
    SET deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = NOW()
    WHERE pessoa_id = NEW.id AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  v_wa := NULLIF(regexp_replace(COALESCE(NEW.contato, ''), '\D', '', 'g'), '');
  v_email := NULLIF(lower(trim(COALESCE(NEW.email, ''))), '');

  SELECT c.id INTO v_cliente_id
  FROM public.clientes c
  WHERE c.pessoa_id = NEW.id
  ORDER BY c.deleted_at NULLS FIRST
  LIMIT 1;

  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET nome = NEW.nome,
        data_nascimento = NEW.data_nascimento,
        whatsapp = COALESCE(v_wa, whatsapp),
        email = COALESCE(NEW.email, email),
        deleted_at = NULL,
        updated_at = NOW()
    WHERE id = v_cliente_id;
    RETURN NEW;
  END IF;

  -- Vincular cliente órfão com mesmo e-mail
  IF v_email IS NOT NULL THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE c.deleted_at IS NULL
      AND c.pessoa_id IS NULL
      AND lower(trim(COALESCE(c.email, ''))) = v_email
    LIMIT 1;
  END IF;

  -- Ou mesmo WhatsApp (últimos 9 dígitos)
  IF v_cliente_id IS NULL AND v_wa IS NOT NULL AND length(v_wa) >= 10 THEN
    SELECT c.id INTO v_cliente_id
    FROM public.clientes c
    WHERE c.deleted_at IS NULL
      AND c.pessoa_id IS NULL
      AND length(regexp_replace(COALESCE(c.whatsapp, ''), '\D', '', 'g')) >= 10
      AND (
        regexp_replace(COALESCE(c.whatsapp, ''), '\D', '', 'g') = v_wa
        OR right(regexp_replace(COALESCE(c.whatsapp, ''), '\D', '', 'g'), 9) = right(v_wa, 9)
      )
    LIMIT 1;
  END IF;

  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET pessoa_id = NEW.id,
        nome = NEW.nome,
        data_nascimento = COALESCE(NEW.data_nascimento, data_nascimento),
        whatsapp = COALESCE(v_wa, whatsapp),
        email = COALESCE(NEW.email, email),
        updated_at = NOW()
    WHERE id = v_cliente_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.clientes (nome, data_nascimento, whatsapp, email, obs, pessoa_id)
  VALUES (
    NEW.nome,
    NEW.data_nascimento,
    v_wa,
    NEW.email,
    NULLIF(trim(COALESCE(NEW.obs, '')), ''),
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pessoas_sync_cliente ON public.pessoas;
CREATE TRIGGER trg_pessoas_sync_cliente
  AFTER INSERT OR UPDATE OF nome, data_nascimento, contato, email, obs, deleted_at
  ON public.pessoas
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_cliente_from_pessoa();

-- Vincular órfãos por e-mail antes de criar novos
UPDATE public.clientes c
SET pessoa_id = p.id,
    nome = COALESCE(NULLIF(trim(c.nome), ''), p.nome),
    updated_at = NOW()
FROM public.pessoas p
WHERE c.deleted_at IS NULL
  AND c.pessoa_id IS NULL
  AND p.deleted_at IS NULL
  AND p.email IS NOT NULL
  AND lower(trim(c.email)) = lower(trim(p.email))
  AND NOT EXISTS (
    SELECT 1 FROM public.clientes c2
    WHERE c2.pessoa_id = p.id AND c2.deleted_at IS NULL
  );

-- Backfill: membros ativos ainda sem cliente vinculado
INSERT INTO public.clientes (nome, data_nascimento, whatsapp, email, obs, pessoa_id)
SELECT
  p.nome,
  p.data_nascimento,
  NULLIF(regexp_replace(COALESCE(p.contato, ''), '\D', '', 'g'), ''),
  p.email,
  NULLIF(trim(COALESCE(p.obs, '')), ''),
  p.id
FROM public.pessoas p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.pessoa_id = p.id AND c.deleted_at IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_pessoa_id_unique
  ON public.clientes(pessoa_id)
  WHERE pessoa_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON FUNCTION public.sync_cliente_from_pessoa() IS
  'Mantém um cliente por membro (pessoa_id); cria no insert e sincroniza dados.';
