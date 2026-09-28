import { supabase } from '../lib/supabaseClient';

export type CaixaLancamento = {
  id: string;
  data: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  descricao: string | null;
  valor: number;
  forma_pagamento: string | null;
  pessoa_id: string | null;
  membro_nome: string | null;
  origem: 'manual' | 'pagamento';
  pagamento_id: string | null;
  deleted_at: string | null;
};

export type CaixaCategoria = {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida' | 'ambos';
  ativo: boolean;
  deleted_at: string | null;
};

export async function fetchCaixaPeriodo(from: string, to: string, includeDeleted = false) {
  let q = supabase
    .from('caixa_lancamentos')
    .select(
      'id, data, tipo, categoria, descricao, valor, forma_pagamento, pessoa_id, membro_nome, origem, pagamento_id, deleted_at',
    )
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: false });
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CaixaLancamento[];
}

/** Saldo acumulado até (exclusive) a data `before` (YYYY-MM-DD). */
export async function fetchCaixaSaldoAntes(before: string) {
  const { data, error } = await supabase
    .from('caixa_lancamentos')
    .select('tipo, valor')
    .lt('data', before)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((acc, r) => {
    const v = Number(r.valor) || 0;
    return acc + (r.tipo === 'entrada' ? v : -v);
  }, 0);
}

export async function createCaixaManual(input: {
  data: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  descricao: string;
  valor: number;
  forma_pagamento?: string;
}) {
  const { data: sessao } = await supabase.auth.getSession();
  const { error } = await supabase.from('caixa_lancamentos').insert({
    ...input,
    origem: 'manual',
    created_by: sessao?.session?.user?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateCaixaManual(
  id: string,
  input: {
    data: string;
    tipo: 'entrada' | 'saida';
    categoria: string;
    descricao: string;
    valor: number;
    forma_pagamento?: string;
  },
) {
  const { error } = await supabase
    .from('caixa_lancamentos')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
}

export async function softDeleteCaixa(id: string) {
  const { error } = await supabase
    .from('caixa_lancamentos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
}

export async function fetchCaixaCategorias(includeInactive = false) {
  let q = supabase
    .from('caixa_categorias')
    .select('id, nome, tipo, ativo, deleted_at')
    .is('deleted_at', null)
    .order('nome');
  if (!includeInactive) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CaixaCategoria[];
}

export async function createCaixaCategoria(nome: string, tipo: CaixaCategoria['tipo'] = 'ambos') {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error('Informe o nome da categoria.');
  const { data, error } = await supabase
    .from('caixa_categorias')
    .insert({ nome: trimmed, tipo, ativo: true })
    .select('id, nome, tipo, ativo, deleted_at')
    .single();
  if (error) throw new Error(error.message);
  return data as CaixaCategoria;
}

export async function softDeleteCaixaCategoria(id: string) {
  const { error } = await supabase
    .from('caixa_categorias')
    .update({ deleted_at: new Date().toISOString(), ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
