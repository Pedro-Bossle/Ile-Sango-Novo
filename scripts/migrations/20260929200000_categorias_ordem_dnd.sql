-- Ordem arrastável nas categorias do caixa e do catálogo
SET lock_timeout = '15s';

ALTER TABLE public.caixa_categorias
  ADD COLUMN IF NOT EXISTS ordem INT NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome ASC) AS rn
  FROM public.caixa_categorias
  WHERE deleted_at IS NULL
)
UPDATE public.caixa_categorias c
SET ordem = ranked.rn
FROM ranked
WHERE c.id = ranked.id
  AND (c.ordem IS NULL OR c.ordem = 0);

COMMENT ON COLUMN public.caixa_categorias.ordem IS 'Ordem de exibição (drag-and-drop na editora)';

ALTER TABLE public.catalogo
  ADD COLUMN IF NOT EXISTS ordem INT NOT NULL DEFAULT 0;

WITH ranked_cat AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS rn
  FROM public.catalogo
  WHERE deleted_at IS NULL
)
UPDATE public.catalogo c
SET ordem = ranked_cat.rn
FROM ranked_cat
WHERE c.id = ranked_cat.id
  AND (c.ordem IS NULL OR c.ordem = 0);

COMMENT ON COLUMN public.catalogo.ordem IS 'Ordem das categorias no painel (drag-and-drop)';
