-- Soft delete para cobrancas + forma de pagamento para relatorio de valores pagos
-- Idempotente: pode executar mais de uma vez.

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_cobrancas_deleted_at
  ON public.cobrancas(deleted_at);

ALTER TABLE public.cobranca_pagamentos
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50) NULL;

CREATE INDEX IF NOT EXISTS idx_cobranca_pagamentos_data_pagamento
  ON public.cobranca_pagamentos(data_pagamento);
