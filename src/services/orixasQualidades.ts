import { supabase } from '../lib/supabaseClient';
import type { Orixa, Qualidade, UUID } from '../types/database';

export async function fetchOrixas(): Promise<Orixa[]> {
  const { data, error } = await supabase.from('orixas').select('id, nome').order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Orixa[];
}

export async function fetchQualidadesPorOrixa(orixaId: UUID | ''): Promise<Qualidade[]> {
  if (!orixaId) return [];
  const { data, error } = await supabase
    .from('qualidades')
    .select('id, nome, orixa_id')
    .eq('orixa_id', orixaId)
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Qualidade[];
}

export async function fetchTodasQualidades(): Promise<Qualidade[]> {
  const { data, error } = await supabase
    .from('qualidades')
    .select('id, nome, orixa_id')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Qualidade[];
}

export async function createOrixa(nome: string): Promise<Orixa> {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error('Informe o nome do orixá.');
  const { data, error } = await supabase.from('orixas').insert({ nome: trimmed }).select('id, nome').single();
  if (error) throw new Error(error.message);
  return data as Orixa;
}

export async function updateOrixa(id: UUID, nome: string): Promise<Orixa> {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error('Informe o nome do orixá.');
  const { data, error } = await supabase.from('orixas').update({ nome: trimmed }).eq('id', id).select('id, nome').single();
  if (error) throw new Error(error.message);
  return data as Orixa;
}

export async function deleteOrixa(id: UUID): Promise<void> {
  const { error } = await supabase.from('orixas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createQualidade(orixaId: UUID, nome: string): Promise<Qualidade> {
  const trimmed = nome.trim();
  if (!orixaId) throw new Error('Selecione o orixá.');
  if (!trimmed) throw new Error('Informe o nome da qualidade.');
  const { data, error } = await supabase
    .from('qualidades')
    .insert({ orixa_id: orixaId, nome: trimmed })
    .select('id, nome, orixa_id')
    .single();
  if (error) throw new Error(error.message);
  return data as Qualidade;
}

export async function updateQualidade(id: Qualidade['id'], nome: string): Promise<Qualidade> {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error('Informe o nome da qualidade.');
  const { data, error } = await supabase
    .from('qualidades')
    .update({ nome: trimmed })
    .eq('id', id)
    .select('id, nome, orixa_id')
    .single();
  if (error) throw new Error(error.message);
  return data as Qualidade;
}

export async function deleteQualidade(id: Qualidade['id']): Promise<void> {
  const { error } = await supabase.from('qualidades').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
