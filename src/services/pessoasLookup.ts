import { supabase } from '../lib/supabaseClient';
import type { UUID } from '../types/database';

export type PessoaOption = {
  id: UUID;
  nome: string;
  data_entrada?: string | null;
};

export async function fetchPessoasOptions(): Promise<PessoaOption[]> {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome, data_entrada')
    .is('deleted_at', null)
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PessoaOption[];
}
