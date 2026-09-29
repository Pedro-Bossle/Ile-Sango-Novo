-- Mensalidade: 1 por integrante ativo no 1º dia do mês; vencida 10 dias após a criação.
SET lock_timeout = '15s';

COMMENT ON TABLE public.mensalidades IS
  'Célula mensal (1 por pessoa/mês): criada no dia 1 para integrantes ativos; vencida 10 dias após a criação. Status: aberto | pago | isento | desligado';

CREATE OR REPLACE FUNCTION public.gerar_mensalidades_competencia(
  p_ano INT DEFAULT NULL,
  p_mes INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano INT;
  v_mes INT;
  v_valor NUMERIC(10, 2);
  v_inseridos INT := 0;
BEGIN
  v_ano := COALESCE(p_ano, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_mes := COALESCE(p_mes, EXTRACT(MONTH FROM CURRENT_DATE)::INT);

  IF v_mes < 1 OR v_mes > 12 THEN
    RAISE EXCEPTION 'Mês inválido: %', v_mes;
  END IF;

  SELECT COALESCE(mensalidade_valor, 20)
    INTO v_valor
  FROM public.configuracoes_terreiro
  WHERE id = 1;

  IF v_valor IS NULL OR v_valor <= 0 THEN
    v_valor := 20;
  END IF;

  -- Integrantes ativos: deleted_at IS NULL; respeita data_entrada (mês/ano de iniciação).
  WITH candidatos AS (
    SELECT p.id AS pessoa_id
    FROM public.pessoas p
    WHERE p.deleted_at IS NULL
      AND (
        p.data_entrada IS NULL
        OR (
          EXTRACT(YEAR FROM p.data_entrada)::INT < v_ano
          OR (
            EXTRACT(YEAR FROM p.data_entrada)::INT = v_ano
            AND EXTRACT(MONTH FROM p.data_entrada)::INT <= v_mes
          )
        )
      )
  ),
  inserted AS (
    INSERT INTO public.mensalidades (pessoa_id, ano, mes, status, valor)
    SELECT c.pessoa_id, v_ano, v_mes, 'aberto', v_valor
    FROM candidatos c
    ON CONFLICT (pessoa_id, ano, mes) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_inseridos FROM inserted;

  RETURN v_inseridos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_mensalidades_competencia(INT, INT) TO authenticated;

COMMENT ON FUNCTION public.gerar_mensalidades_competencia(INT, INT) IS
  'Cria mensalidade do mês para cada integrante ativo (idempotente). Preferencial no 1º dia; pode rodar em qualquer dia para catch-up.';
