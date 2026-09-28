-- Cliente pode ser o mesmo cadastro de um membro (filho de santo)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_pessoa_id ON public.clientes(pessoa_id)
  WHERE pessoa_id IS NOT NULL;

COMMENT ON COLUMN public.clientes.pessoa_id IS
  'Se preenchido, o cliente também é membro do terreiro (filho de santo)';
