-- Fallback: extrai nome da descrição "Nome - Mensalidade Mon/AAAA" quando pessoa_id/membro_nome estão nulos.

CREATE OR REPLACE FUNCTION public.sync_caixa_delete_to_mensalidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid UUID;
  v_pessoa UUID;
  v_nome TEXT;
  v_desc TEXT;
  v_parts TEXT[];
  v_mes_txt TEXT;
  v_ano INT;
  v_mes INT;
  v_meses TEXT[] := ARRAY[
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
  i INT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    v_mid := NEW.mensalidade_id;
    v_pessoa := NEW.pessoa_id;
    v_nome := NEW.membro_nome;
    v_desc := NEW.descricao;
  ELSIF TG_OP = 'DELETE' THEN
    v_mid := OLD.mensalidade_id;
    v_pessoa := OLD.pessoa_id;
    v_nome := OLD.membro_nome;
    v_desc := OLD.descricao;
  ELSE
    RETURN NULL;
  END IF;

  IF v_mid IS NULL AND v_desc IS NOT NULL THEN
    v_parts := regexp_match(
      v_desc,
      '^(.*?)[[:space:]]*-[[:space:]]*Mensalidade[[:space:]]+([A-Za-zÇç]{3})/([0-9]{4})[[:space:]]*$',
      'i'
    );
    IF v_parts IS NULL THEN
      v_parts := regexp_match(v_desc, 'Mensalidade[[:space:]]+([A-Za-zÇç]{3})/([0-9]{4})', 'i');
      IF v_parts IS NOT NULL THEN
        v_mes_txt := v_parts[1];
        v_ano := v_parts[2]::INT;
      END IF;
    ELSE
      IF NULLIF(TRIM(COALESCE(v_nome, '')), '') IS NULL THEN
        v_nome := NULLIF(TRIM(v_parts[1]), '');
      END IF;
      v_mes_txt := v_parts[2];
      v_ano := v_parts[3]::INT;
    END IF;

    IF v_mes_txt IS NOT NULL AND v_ano IS NOT NULL THEN
      v_mes := NULL;
      FOR i IN 1..12 LOOP
        IF lower(v_meses[i]) = lower(v_mes_txt) THEN
          v_mes := i;
          EXIT;
        END IF;
      END LOOP;

      IF v_mes IS NOT NULL THEN
        IF v_pessoa IS NOT NULL THEN
          SELECT m.id INTO v_mid
          FROM public.mensalidades m
          WHERE m.pessoa_id = v_pessoa AND m.ano = v_ano AND m.mes = v_mes
          LIMIT 1;
        ELSIF NULLIF(TRIM(COALESCE(v_nome, '')), '') IS NOT NULL THEN
          SELECT m.id INTO v_mid
          FROM public.mensalidades m
          JOIN public.pessoas p ON p.id = m.pessoa_id
          WHERE lower(trim(p.nome)) = lower(trim(v_nome))
            AND m.ano = v_ano AND m.mes = v_mes
          LIMIT 1;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_mid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  UPDATE public.mensalidades
  SET status = 'aberto',
      data_pagamento = NULL,
      forma_pagamento = NULL,
      updated_at = NOW()
  WHERE id = v_mid AND status = 'pago';

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
