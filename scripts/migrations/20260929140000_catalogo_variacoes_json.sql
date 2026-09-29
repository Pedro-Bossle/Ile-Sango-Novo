-- Converte variações legadas ("Amor, Dinheiro") em JSON precificado
-- [{"nome":"Amor","valor":170}, ...] usando o valor do item.
UPDATE public.catalogo
SET variacoes = (
  SELECT COALESCE(
    (
      SELECT json_agg(json_build_object('nome', trim(part), 'valor', catalogo.valor))::text
      FROM unnest(string_to_array(catalogo.variacoes, ',')) AS part
      WHERE trim(part) <> ''
    ),
    '[]'
  )
)
WHERE variacoes IS NOT NULL
  AND btrim(variacoes) <> ''
  AND left(btrim(variacoes), 1) NOT IN ('[', '{');
