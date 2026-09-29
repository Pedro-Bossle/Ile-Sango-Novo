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
  origem: 'manual' | 'pagamento' | 'mensalidade' | 'visita';
  pagamento_id: string | null;
  mensalidade_id?: string | null;
  visita_id?: string | null;
  deleted_at: string | null;
};

export type CaixaCategoria = {
  id: string;
  nome: string;
  tipo: 'entrada' | 'saida' | 'ambos';
  ativo: boolean;
  deleted_at: string | null;
  ordem?: number;
};

export async function fetchCaixaPeriodo(from: string, to: string, includeDeleted = false) {
  let q = supabase
    .from('caixa_lancamentos')
    .select(
      'id, data, tipo, categoria, descricao, valor, forma_pagamento, pessoa_id, membro_nome, origem, pagamento_id, mensalidade_id, visita_id, deleted_at',
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
  const { data: row, error: fetchErr } = await supabase
    .from('caixa_lancamentos')
    .select('id, pagamento_id, mensalidade_id, pessoa_id, membro_nome, descricao')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error('Lançamento não encontrado.');

  // Pagamento de cobrança: apaga o histórico → trigger recalcula valor_pago e CASCADE remove o caixa.
  if (row.pagamento_id) {
    const { error } = await supabase.from('cobranca_pagamentos').delete().eq('id', row.pagamento_id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('caixa_lancamentos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  // Garante reabertura do mês (trigger no banco + fallback no cliente).
  await reopenMensalidadeAposExcluirCaixa({
    mensalidade_id: row.mensalidade_id ?? null,
    pessoa_id: row.pessoa_id ?? null,
    membro_nome: row.membro_nome ?? null,
    descricao: row.descricao ?? null,
  });
}

const MESES_ABBR_CAIXA = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function parseMensalidadeRefFromDesc(descricao: string | null | undefined): {
  mes: number;
  ano: number;
  nome?: string;
} | null {
  const raw = String(descricao ?? '').trim();
  const full = raw.match(/^(.*?)\s*-\s*Mensalidade\s+([A-Za-zÇç]{3})\/(\d{4})\s*$/i);
  const short = full ? null : raw.match(/Mensalidade\s+([A-Za-zÇç]{3})\/(\d{4})/i);
  const mesTxt = full?.[2] ?? short?.[1] ?? '';
  const ano = Number(full?.[3] ?? short?.[2] ?? '');
  const nome = full?.[1]?.trim() || undefined;
  const mes = MESES_ABBR_CAIXA.findIndex((x) => x.toLowerCase() === mesTxt.toLowerCase()) + 1;
  if (!mes || !ano) return null;
  return { mes, ano, nome };
}

async function reopenMensalidadeAposExcluirCaixa(row: {
  mensalidade_id: string | null;
  pessoa_id: string | null;
  membro_nome: string | null;
  descricao: string | null;
}): Promise<void> {
  let mid = row.mensalidade_id;
  if (!mid) {
    const ref = parseMensalidadeRefFromDesc(row.descricao);
    if (ref) {
      let pessoaId = row.pessoa_id;
      const nomeBusca = row.membro_nome?.trim() || ref.nome;
      if (!pessoaId && nomeBusca) {
        const { data: pessoas } = await supabase
          .from('pessoas')
          .select('id')
          .ilike('nome', nomeBusca)
          .limit(1);
        pessoaId = pessoas?.[0]?.id ?? null;
      }
      if (!pessoaId) return;

      const { data } = await supabase
        .from('mensalidades')
        .select('id')
        .eq('pessoa_id', pessoaId)
        .eq('ano', ref.ano)
        .eq('mes', ref.mes)
        .eq('status', 'pago')
        .limit(1)
        .maybeSingle();
      mid = data?.id ?? null;
    }
  }
  if (!mid) return;

  const { error } = await supabase
    .from('mensalidades')
    .update({
      status: 'aberto',
      data_pagamento: null,
      forma_pagamento: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mid)
    .eq('status', 'pago');
  if (error) throw new Error(error.message);
}

export async function fetchCaixaCategorias(includeInactive = false) {
  let q = supabase
    .from('caixa_categorias')
    .select('id, nome, tipo, ativo, deleted_at, ordem')
    .is('deleted_at', null)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (!includeInactive) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) {
    // Coluna ordem ainda não migrada — fallback por nome
    if (/ordem|schema cache|column/i.test(error.message)) {
      let q2 = supabase
        .from('caixa_categorias')
        .select('id, nome, tipo, ativo, deleted_at')
        .is('deleted_at', null)
        .order('nome');
      if (!includeInactive) q2 = q2.eq('ativo', true);
      const retry = await q2;
      if (retry.error) throw new Error(retry.error.message);
      return (retry.data ?? []) as CaixaCategoria[];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as CaixaCategoria[];
}

export async function createCaixaCategoria(nome: string, tipo: CaixaCategoria['tipo'] = 'ambos') {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error('Informe o nome da categoria.');
  const existing = await fetchCaixaCategorias(true);
  const nextOrdem = existing.reduce((m, c) => Math.max(m, Number(c.ordem) || 0), 0) + 1;
  const { data, error } = await supabase
    .from('caixa_categorias')
    .insert({ nome: trimmed, tipo, ativo: true, ordem: nextOrdem })
    .select('id, nome, tipo, ativo, deleted_at, ordem')
    .single();
  if (error) {
    if (/ordem|schema cache|column/i.test(error.message)) {
      const retry = await supabase
        .from('caixa_categorias')
        .insert({ nome: trimmed, tipo, ativo: true })
        .select('id, nome, tipo, ativo, deleted_at')
        .single();
      if (retry.error) throw new Error(retry.error.message);
      return retry.data as CaixaCategoria;
    }
    throw new Error(error.message);
  }
  return data as CaixaCategoria;
}

export async function softDeleteCaixaCategoria(id: string) {
  const { error } = await supabase
    .from('caixa_categorias')
    .update({ deleted_at: new Date().toISOString(), ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Persiste a ordem das categorias após drag-and-drop. */
export async function reorderCaixaCategorias(orderedIds: Array<string | number>): Promise<void> {
  const now = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('caixa_categorias').update({ ordem: i + 1, updated_at: now }).eq('id', String(id)),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}
