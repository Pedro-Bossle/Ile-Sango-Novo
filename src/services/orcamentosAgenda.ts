import { supabase } from '../lib/supabaseClient';

export type Orcamento = {
  id: string;
  cliente_id: string | null;
  titulo: string | null;
  mensagem: string | null;
  total: number;
  status: 'rascunho' | 'enviado';
  deleted_at: string | null;
};

export type OrcamentoItem = {
  id?: string;
  orcamento_id?: string;
  catalogo_id: number | null;
  nome: string;
  valor: number;
  quantidade: number;
};

export type AgendaCompromisso = {
  id: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  cliente_id: string | null;
  local: string | null;
  notas: string | null;
  tipo: string;
  created_by: string | null;
  deleted_at: string | null;
};

export async function fetchOrcamentos(includeDeleted = false) {
  let q = supabase
    .from('orcamentos')
    .select('id, cliente_id, titulo, mensagem, total, status, deleted_at')
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Orcamento[];
}

export async function fetchOrcamentoItens(orcamentoId: string) {
  const { data, error } = await supabase
    .from('orcamento_itens')
    .select('id, orcamento_id, catalogo_id, nome, valor, quantidade')
    .eq('orcamento_id', orcamentoId);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrcamentoItem[];
}

export async function saveOrcamento(input: {
  id?: string;
  cliente_id?: string | null;
  titulo: string;
  mensagem: string;
  total: number;
  status: 'rascunho' | 'enviado';
  itens: OrcamentoItem[];
}): Promise<string> {
  const { data: sessao } = await supabase.auth.getSession();
  let id = input.id;
  if (id) {
    const { error } = await supabase
      .from('orcamentos')
      .update({
        cliente_id: input.cliente_id ?? null,
        titulo: input.titulo,
        mensagem: input.mensagem,
        total: input.total,
        status: input.status,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await supabase.from('orcamento_itens').delete().eq('orcamento_id', id);
  } else {
    const { data, error } = await supabase
      .from('orcamentos')
      .insert({
        cliente_id: input.cliente_id ?? null,
        titulo: input.titulo,
        mensagem: input.mensagem,
        total: input.total,
        status: input.status,
        created_by: sessao?.session?.user?.id ?? null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  if (input.itens.length) {
    const { error } = await supabase.from('orcamento_itens').insert(
      input.itens.map((i) => ({
        orcamento_id: id,
        catalogo_id: i.catalogo_id,
        nome: i.nome,
        valor: i.valor,
        quantidade: i.quantidade,
      })),
    );
    if (error) throw new Error(error.message);
  }
  return id!;
}

export async function softDeleteOrcamento(id: string) {
  const { error } = await supabase
    .from('orcamentos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export function buildOrcamentoMensagem(
  ileNome: string,
  itens: { nome: string; valor: number; quantidade: number }[],
  total: number,
) {
  const linhas = itens.map(
    (i) => `• ${i.nome} (${i.quantidade}x) — R$ ${(i.valor * i.quantidade).toFixed(2).replace('.', ',')}`,
  );
  return [
    `Olá! Segue o orçamento de ${ileNome || 'nossa casa'}:`,
    '',
    ...linhas,
    '',
    `Total: R$ ${total.toFixed(2).replace('.', ',')}`,
    '',
    'Qualquer dúvida, estamos à disposição.',
  ].join('\n');
}

export async function fetchAgenda(fromIso: string, toIso: string, includeDeleted = false) {
  let q = supabase
    .from('agenda_compromissos')
    .select('id, titulo, inicio, fim, cliente_id, local, notas, tipo, created_by, deleted_at')
    .gte('inicio', fromIso)
    .lte('inicio', toIso)
    .order('inicio');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaCompromisso[];
}

export async function saveCompromisso(row: Partial<AgendaCompromisso> & { titulo: string; inicio: string }) {
  const { data: sessao } = await supabase.auth.getSession();
  if (row.id) {
    const { error } = await supabase
      .from('agenda_compromissos')
      .update({
        titulo: row.titulo,
        inicio: row.inicio,
        fim: row.fim ?? null,
        cliente_id: row.cliente_id ?? null,
        local: row.local ?? null,
        notas: row.notas ?? null,
        tipo: row.tipo ?? 'atendimento',
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    return row.id;
  }
  const { data, error } = await supabase
    .from('agenda_compromissos')
    .insert({
      titulo: row.titulo,
      inicio: row.inicio,
      fim: row.fim ?? null,
      cliente_id: row.cliente_id ?? null,
      local: row.local ?? null,
      notas: row.notas ?? null,
      tipo: row.tipo ?? 'atendimento',
      created_by: sessao?.session?.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function softDeleteCompromisso(id: string) {
  const { error } = await supabase
    .from('agenda_compromissos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
