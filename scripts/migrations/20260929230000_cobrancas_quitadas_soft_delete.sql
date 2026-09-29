-- Cobranças quitadas (saldo zero) saem da lista via soft-delete.
-- Relatório de valores pagos continua enxergando pelo histórico de pagamentos.

UPDATE public.cobrancas c
SET deleted_at = COALESCE(c.deleted_at, NOW())
WHERE c.deleted_at IS NULL
  AND lower(trim(COALESCE(c.tipo::text, ''))) IS DISTINCT FROM 'mensalidade'
  AND COALESCE(
    c.valor_saldo,
    GREATEST(COALESCE(c.valor_total, c.valor, 0) - COALESCE(c.valor_pago, 0), 0)
  ) <= 0.01;
