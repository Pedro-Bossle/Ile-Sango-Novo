import { supabase } from '../lib/supabaseClient';

export type HistoricoOrumaleItem = {
  id: string;
  orumale_id: string;
  data: string;
  descricao: string;
  created_at?: string | null;
};

export async function fetchHistoricoOrumale(orumaleId: string): Promise<HistoricoOrumaleItem[]> {
  const { data, error } = await supabase
    .from('historico_orunmila')
    .select('id, orumale_id, data, descricao, created_at')
    .eq('orumale_id', orumaleId)
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoricoOrumaleItem[];
}

export async function registrarHistoricoOrumale(
  orumaleId: string,
  data: string,
  descricao: string,
): Promise<HistoricoOrumaleItem> {
  const { data: created, error } = await supabase
    .from('historico_orunmila')
    .insert({
      orumale_id: orumaleId,
      data,
      descricao: descricao.trim(),
    })
    .select('id, orumale_id, data, descricao, created_at')
    .single();
  if (error) throw new Error(error.message);
  return created as HistoricoOrumaleItem;
}

export async function atualizarHistoricoOrumale(
  id: string,
  data: string,
  descricao: string,
): Promise<HistoricoOrumaleItem> {
  const { data: updated, error } = await supabase
    .from('historico_orunmila')
    .update({
      data,
      descricao: descricao.trim(),
    })
    .eq('id', id)
    .select('id, orumale_id, data, descricao, created_at')
    .single();
  if (error) throw new Error(error.message);
  return updated as HistoricoOrumaleItem;
}

export async function excluirHistoricoOrumale(id: string): Promise<void> {
  const { error } = await supabase.from('historico_orunmila').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
