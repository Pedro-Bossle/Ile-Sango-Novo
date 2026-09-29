-- Data de entrada (iniciação) do membro no terreiro.
-- Rode sozinha (não junto com outras migrations) e com a app em idle se houver deadlock.

SET lock_timeout = '10s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pessoas'
      AND column_name = 'data_entrada'
  ) THEN
    ALTER TABLE public.pessoas ADD COLUMN data_entrada DATE;
  END IF;
END $$;

COMMENT ON COLUMN public.pessoas.data_entrada IS
  'Data de entrada / iniciação do membro no Ilê';
