import { supabase } from '../lib/supabaseClient';
import { somenteDigitosTelefone } from '../utils/telefone';

export type MensalidadeStatus = 'aberto' | 'pago' | 'isento' | 'desligado';

export type MensalidadeRow = {
  id: string;
  pessoa_id: string;
  ano: number;
  mes: number;
  status: MensalidadeStatus;
  valor: number;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  obs: string | null;
  /** Se true, pagamento não gera lançamento no fluxo de caixa. */
  sem_caixa?: boolean;
};

export type MembroMensalidade = {
  id: string;
  nome: string;
  contato: string | null;
  email: string | null;
  deleted_at: string | null;
  data_entrada: string | null;
};

export type CelulaMensalidade = {
  mes: number;
  status: MensalidadeStatus | 'vazio';
  valor: number;
  rowId: string | null;
  /** Status virtual (desligado por inativação / pré-entrada) — não persistido */
  virtual?: boolean;
  /** Célula bloqueada (antes da data de entrada) — não editável */
  bloqueado?: boolean;
};

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Mensalidade nasce no dia 1 da competência e vence 10 dias depois. */
export const MENSALIDADE_DIAS_APOS_CRIACAO = 10;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Data de criação da competência (sempre dia 1 do mês). */
export function dataCriacaoMensalidade(ano: number, mes: number): Date {
  return new Date(ano, mes - 1, 1);
}

/** Data em que a mensalidade passa a ser considerada vencida (criação + 10 dias). */
export function dataVencimentoMensalidade(ano: number, mes: number): Date {
  const d = dataCriacaoMensalidade(ano, mes);
  d.setDate(d.getDate() + MENSALIDADE_DIAS_APOS_CRIACAO);
  return d;
}

/** Aberto e já passou (ou chegou) a data de vencimento (10 dias após o dia 1). */
export function mensalidadeEstaAtrasada(ano: number, mes: number, hoje: Date = new Date()): boolean {
  const h = startOfLocalDay(hoje);
  const v = startOfLocalDay(dataVencimentoMensalidade(ano, mes));
  return h >= v;
}

function ym(d: Date): { y: number; m: number } {
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function parseYmIso(iso: string | null | undefined): { y: number; m: number } | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

function parseDeletedAt(iso: string | null): { y: number; m: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return ym(d);
}

/** Membro aparece no ano se ativo (ou inativado nesse/após) e se a entrada não for depois do ano. */
export function membroApareceNoAno(m: MembroMensalidade, ano: number): boolean {
  const del = parseDeletedAt(m.deleted_at);
  if (del && del.y < ano) return false;
  const ent = parseYmIso(m.data_entrada);
  if (ent && ent.y > ano) return false;
  return true;
}

/** Mês fica Desligado a partir do mês de inativação (inclusive após). */
export function mesDesligadoPorInativacao(m: MembroMensalidade, ano: number, mes: number): boolean {
  const del = parseDeletedAt(m.deleted_at);
  if (!del) return false;
  if (del.y < ano) return true;
  if (del.y > ano) return false;
  return mes >= del.m;
}

/** Antes do mês de entrada (iniciação) — não gera nem conta mensalidade. */
export function mesAntesDaEntrada(m: MembroMensalidade, ano: number, mes: number): boolean {
  const ent = parseYmIso(m.data_entrada);
  if (!ent) return false;
  if (ano < ent.y) return true;
  if (ano > ent.y) return false;
  return mes < ent.m;
}

/** Competência conta (mensalidade) se não for antes da entrada. */
export function mesContaAposEntrada(m: MembroMensalidade, ano: number, mes: number): boolean {
  return !mesAntesDaEntrada(m, ano, mes);
}

export async function fetchValorMensalidadePadrao(): Promise<number> {
  const { data, error } = await supabase
    .from('configuracoes_terreiro')
    .select('mensalidade_valor')
    .eq('id', 1)
    .maybeSingle();
  if (error || data?.mensalidade_valor == null) return 20;
  const n = Number(data.mensalidade_valor);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export async function fetchMembrosMensalidade(): Promise<MembroMensalidade[]> {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome, contato, email, deleted_at, data_entrada')
    .order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as MembroMensalidade[];
}

export async function fetchMensalidadesAno(ano: number): Promise<MensalidadeRow[]> {
  const { data, error } = await supabase
    .from('mensalidades')
    .select('id, pessoa_id, ano, mes, status, valor, data_pagamento, forma_pagamento, obs, sem_caixa')
    .eq('ano', ano);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MensalidadeRow[]).map((r) => ({
    ...r,
    ano: Number(r.ano),
    mes: Number(r.mes),
    valor: Number(r.valor),
  }));
}

/**
 * Garante células "aberto" para cada integrante ativo (até o mês corrente),
 * como se fossem vinculadas no 1º dia do mês. Não sobrescreve status existentes.
 * Ignora inativos (a partir do mês de inativação) e meses antes da data de entrada.
 */
export async function garantirAbertosAno(ano: number, valorPadrao: number): Promise<void> {
  const [membros, existentes] = await Promise.all([fetchMembrosMensalidade(), fetchMensalidadesAno(ano)]);
  const agora = new Date();
  const { y: yNow, m: mNow } = ym(agora);
  const mesLimite = ano < yNow ? 12 : ano > yNow ? 0 : mNow;

  const chave = new Set(existentes.map((r) => `${r.pessoa_id}:${r.mes}`));
  const inserts: Array<{
    pessoa_id: string;
    ano: number;
    mes: number;
    status: MensalidadeStatus;
    valor: number;
  }> = [];

  for (const m of membros) {
    if (!membroApareceNoAno(m, ano)) continue;
    for (let mes = 1; mes <= mesLimite; mes += 1) {
      if (mesAntesDaEntrada(m, ano, mes)) continue;
      // Inativo: não gera a partir do mês de inativação
      if (mesDesligadoPorInativacao(m, ano, mes)) continue;
      if (chave.has(`${m.id}:${mes}`)) continue;
      inserts.push({ pessoa_id: m.id, ano, mes, status: 'aberto', valor: valorPadrao });
    }
  }

  if (!inserts.length) return;
  const { error } = await supabase.from('mensalidades').upsert(inserts, {
    onConflict: 'pessoa_id,ano,mes',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}

/** Garante mensalidades do mês corrente para todos os integrantes ativos (chamada na dashboard). */
export async function garantirMensalidadesMesCorrente(): Promise<void> {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;

  const rpc = await supabase.rpc('gerar_mensalidades_competencia', {
    p_ano: ano,
    p_mes: mes,
  });
  if (!rpc.error) {
    // Catch-up de meses anteriores do ano (entradas mid-year, etc.)
    const valor = await fetchValorMensalidadePadrao();
    await garantirAbertosAno(ano, valor);
    return;
  }

  // Fallback se a migration ainda não rodou
  const valor = await fetchValorMensalidadePadrao();
  await garantirAbertosAno(ano, valor);
}

export function montarGradeMembro(
  m: MembroMensalidade,
  ano: number,
  rows: MensalidadeRow[],
  valorPadrao: number,
): CelulaMensalidade[] {
  const byMes = new Map(
    rows
      .filter((r) => r.pessoa_id === m.id)
      .map((r) => [Number(r.mes), r] as const),
  );
  const agora = new Date();
  const { y: yNow, m: mNow } = ym(agora);

  return MESES.map((mes) => {
    if (mesAntesDaEntrada(m, ano, mes)) {
      return {
        mes,
        status: 'vazio' as const,
        valor: valorPadrao,
        rowId: null,
        virtual: true,
        bloqueado: true,
      };
    }
    if (mesDesligadoPorInativacao(m, ano, mes)) {
      const stored = byMes.get(mes);
      return {
        mes,
        status: 'desligado' as const,
        valor: stored?.valor ?? valorPadrao,
        rowId: stored?.id ?? null,
        virtual: !stored || stored.status !== 'desligado',
      };
    }
    const stored = byMes.get(mes);
    // Linha persistida (inclui mês futuro pago) tem prioridade sobre o placeholder "vazio".
    if (stored) {
      return {
        mes,
        status: stored.status,
        valor: stored.valor,
        rowId: stored.id,
      };
    }
    const futuro = ano > yNow || (ano === yNow && mes > mNow);
    return {
      mes,
      status: futuro ? ('vazio' as const) : ('aberto' as const),
      valor: valorPadrao,
      rowId: null,
      virtual: true,
    };
  });
}

export async function setMensalidadeStatus(input: {
  pessoa_id: string;
  ano: number;
  mes: number;
  status: MensalidadeStatus;
  valor: number;
  data_pagamento?: string | null;
  forma_pagamento?: string | null;
  /** Pago sem lançar no fluxo de caixa (requer permissão). */
  sem_caixa?: boolean;
}): Promise<string> {
  const payload = {
    pessoa_id: input.pessoa_id,
    ano: input.ano,
    mes: input.mes,
    status: input.status,
    valor: input.valor,
    data_pagamento: input.status === 'pago' ? input.data_pagamento || new Date().toISOString().slice(0, 10) : null,
    forma_pagamento: input.status === 'pago' ? input.forma_pagamento || 'Pix' : null,
    sem_caixa: input.status === 'pago' ? Boolean(input.sem_caixa) : false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('mensalidades')
    .upsert(payload, { onConflict: 'pessoa_id,ano,mes' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function incluirMembroNoAno(
  pessoaId: string,
  ano: number,
  valorPadrao: number,
): Promise<void> {
  const membros = await fetchMembrosMensalidade();
  const m = membros.find((x) => x.id === pessoaId);
  if (!m) throw new Error('Membro não encontrado.');
  if (!membroApareceNoAno(m, ano)) {
    throw new Error('Membro fora deste ano (entrada futura ou inativado antes) — não entra na listagem.');
  }
  await garantirAbertosAno(ano, valorPadrao);
}

/** Totais da grade (ignora desligado/isento/vazio). Vencida = 10 dias após o dia 1. */
export function resumirGrade(
  membros: MembroMensalidade[],
  ano: number,
  rows: MensalidadeRow[],
  valorPadrao: number,
): { recebido: number; emAberto: number; atrasado: number } {
  const hoje = new Date();
  let recebido = 0;
  let emAberto = 0;
  let atrasado = 0;

  for (const m of membros) {
    if (!membroApareceNoAno(m, ano)) continue;
    const cells = montarGradeMembro(m, ano, rows, valorPadrao);
    for (const c of cells) {
      if (c.status === 'pago') recebido += c.valor;
      if (c.status === 'aberto') {
        emAberto += c.valor;
        if (mensalidadeEstaAtrasada(ano, c.mes, hoje)) atrasado += c.valor;
      }
    }
  }
  return { recebido, emAberto, atrasado };
}

export function formatListaWhatsApp(
  membros: MembroMensalidade[],
  ano: number,
  rows: MensalidadeRow[],
  valorPadrao: number,
): string {
  const linhas: string[] = [`Mensalidades ${ano}`, ''];
  for (const m of membros) {
    if (!membroApareceNoAno(m, ano)) continue;
    const cells = montarGradeMembro(m, ano, rows, valorPadrao);
    const abertos = cells.filter((c) => c.status === 'aberto');
    if (!abertos.length) continue;
    const total = abertos.reduce((a, c) => a + c.valor, 0);
    const meses = abertos.map((c) => MESES_LABEL[c.mes - 1]).join(', ');
    const wa = m.contato ? somenteDigitosTelefone(m.contato) : '';
    linhas.push(`${m.nome}${wa ? ` (${wa})` : ''}: ${meses} — R$ ${total.toFixed(2).replace('.', ',')}`);
  }
  return linhas.join('\n');
}
