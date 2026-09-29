import { supabase } from '../lib/supabaseClient';
import { saveVisita } from './atendimento';
import type { FormaPagamento } from '../lib/formasPagamento';
import { expandCatalogoOpcoes } from '../utils/catalogoVariacoes';

export type AtendimentoStatus = 'em_andamento' | 'pago' | 'cancelado';

export type AtendimentoItem = {
  id?: string;
  catalogo_id: number | null;
  nome: string;
  valor: number;
  quantidade: number;
};

export type Atendimento = {
  id: string;
  cliente_id: string;
  compromisso_id: string | null;
  inicio: string;
  status: AtendimentoStatus;
  total: number;
  forma_pagamento: string | null;
  visita_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  cliente_nome?: string | null;
  itens?: AtendimentoItem[];
};

export type CatalogoAtivoItem = {
  id: number;
  nome: string;
  valor: number;
  categoria?: string | null;
  /** Identifica subcategoria quando expandida. */
  opcaoKey?: string;
};

export async function fetchCatalogoAtivo(): Promise<CatalogoAtivoItem[]> {
  const { data, error } = await supabase
    .from('catalogo')
    .select('id, nome, valor, categoria, variacoes')
    .is('deleted_at', null)
    .order('nome');
  if (error) throw new Error(error.message);
  return expandCatalogoOpcoes(data ?? []).map((o) => ({
    id: o.id,
    nome: o.nome,
    valor: o.valor,
    categoria: o.categoria,
    opcaoKey: o.opcaoKey,
  }));
}

function totalItens(itens: AtendimentoItem[]): number {
  return itens.reduce((acc, it) => acc + Number(it.valor) * Number(it.quantidade), 0);
}

export async function criarAtendimento(input: {
  cliente_id: string;
  compromisso_id?: string | null;
}): Promise<string> {
  const { data: sessao } = await supabase.auth.getSession();

  if (input.compromisso_id) {
    const { data: existing } = await supabase
      .from('atendimentos')
      .select('id')
      .eq('compromisso_id', input.compromisso_id)
      .eq('status', 'em_andamento')
      .is('deleted_at', null)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
  }

  const { data, error } = await supabase
    .from('atendimentos')
    .insert({
      cliente_id: input.cliente_id,
      compromisso_id: input.compromisso_id ?? null,
      status: 'em_andamento',
      total: 0,
      created_by: sessao?.session?.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function fetchAtendimento(id: string): Promise<Atendimento> {
  const { data, error } = await supabase
    .from('atendimentos')
    .select(
      'id, cliente_id, compromisso_id, inicio, status, total, forma_pagamento, visita_id, deleted_at, created_at, updated_at',
    )
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);

  const [{ data: itens, error: itErr }, { data: cli }] = await Promise.all([
    supabase
      .from('atendimento_itens')
      .select('id, catalogo_id, nome, valor, quantidade')
      .eq('atendimento_id', id)
      .order('nome'),
    supabase.from('clientes').select('nome').eq('id', data.cliente_id).maybeSingle(),
  ]);
  if (itErr) throw new Error(itErr.message);

  return {
    id: data.id,
    cliente_id: data.cliente_id,
    compromisso_id: data.compromisso_id,
    inicio: data.inicio,
    status: data.status as AtendimentoStatus,
    total: Number(data.total) || 0,
    forma_pagamento: data.forma_pagamento,
    visita_id: data.visita_id,
    deleted_at: data.deleted_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
    cliente_nome: cli?.nome ?? null,
    itens: (itens ?? []).map((it) => ({
      id: it.id,
      catalogo_id: it.catalogo_id != null ? Number(it.catalogo_id) : null,
      nome: it.nome,
      valor: Number(it.valor) || 0,
      quantidade: Number(it.quantidade) || 1,
    })),
  };
}

export async function salvarItensAtendimento(
  atendimentoId: string,
  itens: AtendimentoItem[],
): Promise<number> {
  const total = Math.round(totalItens(itens) * 100) / 100;

  const { error: delErr } = await supabase
    .from('atendimento_itens')
    .delete()
    .eq('atendimento_id', atendimentoId);
  if (delErr) throw new Error(delErr.message);

  if (itens.length) {
    const { error: insErr } = await supabase.from('atendimento_itens').insert(
      itens.map((it) => ({
        atendimento_id: atendimentoId,
        catalogo_id: it.catalogo_id,
        nome: it.nome,
        valor: it.valor,
        quantidade: it.quantidade,
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

  const { error: updErr } = await supabase
    .from('atendimentos')
    .update({ total, updated_at: new Date().toISOString() })
    .eq('id', atendimentoId);
  if (updErr) throw new Error(updErr.message);

  return total;
}

export async function fecharAtendimentoPago(
  atendimentoId: string,
  formaPagamento: FormaPagamento,
): Promise<{ visitaId: string }> {
  const atend = await fetchAtendimento(atendimentoId);
  if (atend.status === 'pago') {
    return { visitaId: atend.visita_id || '' };
  }
  if (atend.status === 'cancelado') {
    throw new Error('Atendimento cancelado.');
  }
  const itens = atend.itens ?? [];
  if (!itens.length) throw new Error('Adicione ao menos um item antes de receber.');

  const total = Math.round(totalItens(itens) * 100) / 100;
  const resumo = itens
    .map((it) => `${it.quantidade}× ${it.nome}`)
    .join(', ')
    .slice(0, 240);
  const dataVisita = (atend.inicio || new Date().toISOString()).slice(0, 10);

  const visitaId = await saveVisita({
    cliente_id: atend.cliente_id,
    data: dataVisita,
    resumo: resumo || 'Atendimento',
    valor: total,
    pago: true,
    forma_pagamento: formaPagamento,
  });

  const { error } = await supabase
    .from('atendimentos')
    .update({
      status: 'pago',
      total,
      forma_pagamento: formaPagamento,
      visita_id: visitaId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', atendimentoId);
  if (error) throw new Error(error.message);

  return { visitaId };
}

export async function cancelarAtendimento(atendimentoId: string): Promise<void> {
  const { error } = await supabase
    .from('atendimentos')
    .update({
      status: 'cancelado',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', atendimentoId)
    .eq('status', 'em_andamento');
  if (error) throw new Error(error.message);
}
