import { supabase } from '../lib/supabaseClient';
import { insertCobranca } from './cobrancas';

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
  /** null = todos os usuários */
  atribuido_user_id: string | null;
  series_id: string | null;
  recorrencia_freq: string | null;
  recorrencia_ate: string | null;
  deleted_at: string | null;
};

export type RecorrenciaFreq = 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';

function addRecurrence(base: Date, freq: RecorrenciaFreq, step: number): Date {
  const d = new Date(base.getTime());
  switch (freq) {
    case 'diaria':
      d.setDate(d.getDate() + step);
      break;
    case 'semanal':
      d.setDate(d.getDate() + 7 * step);
      break;
    case 'quinzenal':
      d.setDate(d.getDate() + 14 * step);
      break;
    case 'mensal':
      d.setMonth(d.getMonth() + step);
      break;
    case 'anual':
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      break;
  }
  return d;
}

/** Gera ocorrências a partir do início até a data limite (inclusive), máx. 52. */
export function expandRecorrencia(
  inicioIso: string,
  fimIso: string | null | undefined,
  freq: RecorrenciaFreq,
  ateIso: string,
): Array<{ inicio: string; fim: string | null }> {
  const start = new Date(inicioIso);
  const end = fimIso ? new Date(fimIso) : null;
  const ate = new Date(`${ateIso}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(ate.getTime())) return [{ inicio: inicioIso, fim: fimIso ?? null }];
  const duration = end && !Number.isNaN(end.getTime()) ? end.getTime() - start.getTime() : 0;
  const out: Array<{ inicio: string; fim: string | null }> = [];
  for (let i = 0; i < 52; i += 1) {
    const occStart = i === 0 ? start : addRecurrence(start, freq, i);
    if (occStart.getTime() > ate.getTime()) break;
    const occEnd = duration > 0 ? new Date(occStart.getTime() + duration) : null;
    out.push({ inicio: occStart.toISOString(), fim: occEnd ? occEnd.toISOString() : null });
  }
  return out.length ? out : [{ inicio: inicioIso, fim: fimIso ?? null }];
}

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
  const now = new Date().toISOString();
  const { error } = await supabase.from('orcamentos').update({ deleted_at: now }).eq('id', id);
  if (error) throw new Error(error.message);
  // Remove cobranças em aberto geradas por esta venda (já pagas ficam no histórico).
  const { data: cobrancas } = await supabase
    .from('cobrancas')
    .select('id, valor, valor_total, valor_pago, valor_saldo')
    .eq('orcamento_id', id)
    .is('deleted_at', null);
  for (const c of cobrancas ?? []) {
    const total = Number(c.valor_total ?? c.valor ?? 0);
    const pago = Number(c.valor_pago ?? 0);
    const saldo =
      c.valor_saldo != null && c.valor_saldo !== ''
        ? Number(c.valor_saldo)
        : Math.max(0, total - pago);
    if (saldo > 0.0001) {
      await supabase.from('cobrancas').update({ deleted_at: now }).eq('id', c.id);
    }
  }
}

/** Data de hoje em YYYY-MM-DD (fuso local). */
function hojeIsoLocal(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Venda a filho de santo: cria cobrança no nome do membro (categoria Venda).
 * Ao pagar a cobrança, o fluxo existente remove a cobrança e lança entrada padronizada no caixa.
 */
export async function ensureCobrancaFromVenda(input: {
  orcamentoId: string;
  pessoaId: string;
  membroNome: string;
  total: number;
  titulo?: string | null;
  itens?: { nome: string; quantidade: number }[];
}): Promise<{ created: boolean }> {
  if (!input.pessoaId || !(Number(input.total) > 0)) return { created: false };

  const { data: existing } = await supabase
    .from('cobrancas')
    .select('id')
    .eq('orcamento_id', input.orcamentoId)
    .is('deleted_at', null)
    .limit(1);
  if (existing?.length) return { created: false };

  const titulo = String(input.titulo ?? '').trim();
  const itensLabel = (input.itens ?? [])
    .map((i) => (Number(i.quantidade) > 1 ? `${i.nome} (${i.quantidade}x)` : i.nome))
    .filter(Boolean)
    .join(', ');
  const descricao = titulo || itensLabel || 'Venda';

  await insertCobranca({
    pessoa_id: input.pessoaId,
    membro_nome: input.membroNome,
    valor: input.total,
    data: hojeIsoLocal(),
    descricao,
    tipo: 'Venda',
    parcelas: 1,
    orcamento_id: input.orcamentoId,
  });
  return { created: true };
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
    `Olá! Segue a venda de ${ileNome || 'nossa casa'}:`,
    '',
    ...linhas,
    '',
    `Total: R$ ${total.toFixed(2).replace('.', ',')}`,
    '',
    'Qualquer dúvida, estamos à disposição.',
  ].join('\n');
}

export async function fetchAgenda(fromIso: string, toIso: string, includeDeleted = false) {
  // Inclui compromissos cujo início cai no intervalo OU que atravessam o intervalo (fim >= from).
  let q = supabase
    .from('agenda_compromissos')
    .select(
      'id, titulo, inicio, fim, cliente_id, local, notas, tipo, created_by, atribuido_user_id, series_id, recorrencia_freq, recorrencia_ate, deleted_at',
    )
    .lte('inicio', toIso)
    .or(`fim.gte.${fromIso},and(fim.is.null,inicio.gte.${fromIso})`)
    .order('inicio');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AgendaCompromisso[];
}

export async function saveCompromisso(
  row: Partial<AgendaCompromisso> & {
    titulo: string;
    inicio: string;
    /** Se true e há freq+ate, cria série de ocorrências (só em insert). */
    repetir?: boolean;
    recorrencia_freq?: RecorrenciaFreq | null;
    recorrencia_ate?: string | null;
  },
) {
  const { data: sessao } = await supabase.auth.getSession();
  const payloadBase = {
    titulo: row.titulo,
    inicio: row.inicio,
    fim: row.fim ?? null,
    cliente_id: row.cliente_id ?? null,
    local: row.local ?? null,
    notas: row.notas ?? null,
    tipo: row.tipo ?? 'Atendimento',
    atribuido_user_id: row.atribuido_user_id ?? null,
  };

  if (row.id) {
    const { error } = await supabase
      .from('agenda_compromissos')
      .update({
        ...payloadBase,
        recorrencia_freq: row.recorrencia_freq ?? null,
        recorrencia_ate: row.recorrencia_ate ?? null,
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    return row.id;
  }

  const deveRepetir =
    Boolean(row.repetir) && Boolean(row.recorrencia_freq) && Boolean(row.recorrencia_ate);

  if (deveRepetir && row.recorrencia_freq && row.recorrencia_ate) {
    const seriesId = crypto.randomUUID();
    const ocorrencias = expandRecorrencia(
      row.inicio,
      row.fim,
      row.recorrencia_freq,
      row.recorrencia_ate,
    );
    const rows = ocorrencias.map((o) => ({
      ...payloadBase,
      inicio: o.inicio,
      fim: o.fim,
      series_id: seriesId,
      recorrencia_freq: row.recorrencia_freq,
      recorrencia_ate: row.recorrencia_ate,
      created_by: sessao?.session?.user?.id ?? null,
    }));
    const { data, error } = await supabase.from('agenda_compromissos').insert(rows).select('id').limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0]?.id as string) ?? seriesId;
  }

  const { data, error } = await supabase
    .from('agenda_compromissos')
    .insert({
      ...payloadBase,
      series_id: null,
      recorrencia_freq: null,
      recorrencia_ate: null,
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
