-- Espelho inverso: excluir lançamento do caixa (soft/hard) → mensalidade volta a "aberto".

CREATE OR REPLACE FUNCTION public.sync_caixa_delete_to_mensalidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Soft-delete: só na transição deleted_at NULL → preenchido
    IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    v_mid := NEW.mensalidade_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_mid := OLD.mensalidade_id;
  ELSE
    RETURN NULL;
  END IF;

  IF v_mid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  UPDATE public.mensalidades
  SET status = 'aberto',
      data_pagamento = NULL,
      forma_pagamento = NULL,
      updated_at = NOW()
  WHERE id = v_mid
    AND status = 'pago';

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_caixa_delete_to_mensalidade ON public.caixa_lancamentos;
CREATE TRIGGER trg_sync_caixa_delete_to_mensalidade
  AFTER UPDATE OF deleted_at OR DELETE
  ON public.caixa_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_caixa_delete_to_mensalidade();
