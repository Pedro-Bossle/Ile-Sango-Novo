import { supabase } from '../lib/supabaseClient';

export type SobrenomeOrisaRow = {
  id: string;
  nome: string;
};

export type DiginaOrisaRow = {
  id: string;
  nome: string;
  orixa_id: string | null;
  qualidade_id: number | string | null;
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

/** Diginas/sobrenomes cadastrados para um orixá (todas as qualidades). */
export async function fetchDiginasPorOrixa(orixaId: string): Promise<DiginaOrisaRow[]> {
  const o = orixaId.trim();
  if (!o) return [];

  const { data: quals, error: qualError } = await supabase
    .from('qualidades')
    .select('id')
    .eq('orixa_id', o);
  if (qualError) throw new Error(qualError.message);

  const qualidadeIds = (quals ?? []).map((q: { id: number | string }) => q.id);

  const byOrixa = await supabase
    .from('sobrenomes_orisa')
    .select('id, nome, orixa_id, qualidade_id')
    .eq('orixa_id', o)
    .order('nome', { ascending: true });
  if (byOrixa.error) throw new Error(byOrixa.error.message);

  let byQualidade: DiginaOrisaRow[] = [];
  if (qualidadeIds.length > 0) {
    const res = await supabase
      .from('sobrenomes_orisa')
      .select('id, nome, orixa_id, qualidade_id')
      .in('qualidade_id', qualidadeIds)
      .order('nome', { ascending: true });
    if (res.error) throw new Error(res.error.message);
    byQualidade = (res.data ?? []) as DiginaOrisaRow[];
  }

  const map = new Map<string, DiginaOrisaRow>();
  [...((byOrixa.data ?? []) as DiginaOrisaRow[]), ...byQualidade].forEach((row) => {
    map.set(String(row.id), row);
  });
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function createDigina(params: {
  orixaId: string;
  orixaNome: string;
  qualidadeId: string | number | null;
  qualidadeNome?: string | null;
  nome: string;
}): Promise<DiginaOrisaRow> {
  const trimmed = params.nome.trim();
  if (!params.orixaId) throw new Error('Selecione o orixá.');
  if (!trimmed) throw new Error('Informe o nome da digina.');

  const qualidadeNome = (params.qualidadeNome ?? '').trim() || (params.qualidadeId ? '—' : params.orixaNome.trim());

  const payload: Record<string, unknown> = {
    nome: trimmed,
    orixa_id: params.orixaId,
    qualidade_id: params.qualidadeId === '' || params.qualidadeId == null ? null : params.qualidadeId,
    orisa: params.orixaNome.trim() || '—',
    qualidade: qualidadeNome,
  };

  const { data, error } = await supabase
    .from('sobrenomes_orisa')
    .insert(payload)
    .select('id, nome, orixa_id, qualidade_id')
    .single();
  if (error) throw new Error(error.message);
  return data as DiginaOrisaRow;
}

export async function updateDigina(
  id: string,
  params: {
    nome: string;
    qualidadeId: string | number | null;
    qualidadeNome?: string | null;
    orixaNome?: string | null;
  },
): Promise<DiginaOrisaRow> {
  const trimmed = params.nome.trim();
  if (!trimmed) throw new Error('Informe o nome da digina.');

  const payload: Record<string, unknown> = {
    nome: trimmed,
    qualidade_id: params.qualidadeId === '' || params.qualidadeId == null ? null : params.qualidadeId,
  };
  if (params.qualidadeNome != null) payload.qualidade = params.qualidadeNome.trim() || '—';
  if (params.orixaNome != null) payload.orisa = params.orixaNome.trim() || '—';

  const { data, error } = await supabase
    .from('sobrenomes_orisa')
    .update(payload)
    .eq('id', id)
    .select('id, nome, orixa_id, qualidade_id')
    .single();
  if (error) throw new Error(error.message);
  return data as DiginaOrisaRow;
}

export async function deleteDigina(id: string): Promise<void> {
  const { error } = await supabase.from('sobrenomes_orisa').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
