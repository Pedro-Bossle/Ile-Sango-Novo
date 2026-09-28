-- Tipo da chave Pix em Dados do Ilê (máscara / validação no front).
ALTER TABLE public.configuracoes_terreiro
  ADD COLUMN IF NOT EXISTS chave_pix_tipo TEXT;

COMMENT ON COLUMN public.configuracoes_terreiro.chave_pix_tipo IS
  'Tipo da chave Pix: cpf | cnpj | email | telefone | aleatoria';
