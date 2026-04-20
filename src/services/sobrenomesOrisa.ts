import { supabase } from '../lib/supabaseClient';

export type SobrenomeOrisaRow = {
  id: string;
  nome: string;
};

type FetchSobrenomesParams = {
  qualidadeId: string | null | undefined;
  orixaId: string | null | undefined;
};

/**
 * Sobrenomes em `sobrenomes_orisa`:
 * - Com qualidade: `.eq('qualidade_id', id)`.
 * - Sem qualidade: fallback por `.eq('orixa_id', id)` + `.is('qualidade_id', null)`.
 */
export async function fetchSobrenomesOrisa({
  qualidadeId,
  orixaId,
}: FetchSobrenomesParams): Promise<SobrenomeOrisaRow[]> {
  const o = (orixaId ?? '').trim();
  const qid = (qualidadeId ?? '').trim();

  if (!o) return [];

  if (qid) {
    const { data, error } = await supabase
      .from('sobrenomes_orisa')
      .select('id, nome')
      .eq('qualidade_id', qid)
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SobrenomeOrisaRow[];
  }

  const { data, error } = await supabase
    .from('sobrenomes_orisa')
    .select('id, nome')
    .eq('orixa_id', o)
    .is('qualidade_id', null)
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SobrenomeOrisaRow[];
}
