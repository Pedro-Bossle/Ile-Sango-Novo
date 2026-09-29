-- Venda (orçamento) → cobrança vinculada; categoria Venda no caixa

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS orcamento_id uuid REFERENCES public.orcamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cobrancas_orcamento_id_idx
  ON public.cobrancas (orcamento_id)
  WHERE orcamento_id IS NOT NULL AND deleted_at IS NULL;

INSERT INTO public.caixa_categorias (nome, ativo, ordem)
SELECT 'Venda', true, COALESCE((SELECT MAX(ordem) FROM public.caixa_categorias WHERE deleted_at IS NULL), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.caixa_categorias
  WHERE lower(trim(nome)) = 'venda' AND deleted_at IS NULL
);
