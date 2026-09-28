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
    .select('id, pessoa_id, ano, mes, status, valor, data_pagamento, forma_pagamento, obs')
    .eq('ano', ano);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MensalidadeRow[]).map((r) => ({
    ...r,
    valor: Number(r.valor),
  }));
}

/**
 * Garante células "aberto" para meses do ano até o mês corrente (ou dez se ano passado),
 * respeitando inativação. Não sobrescreve status já existentes.
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

export function montarGradeMembro(
  m: MembroMensalidade,
  ano: number,
  rows: MensalidadeRow[],
  valorPadrao: number,
): CelulaMensalidade[] {
  const byMes = new Map(rows.filter((r) => r.pessoa_id === m.id).map((r) => [r.mes, r]));
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
}): Promise<string> {
  const payload = {
    pessoa_id: input.pessoa_id,
    ano: input.ano,
    mes: input.mes,
    status: input.status,
    valor: input.valor,
    data_pagamento: input.status === 'pago' ? input.data_pagamento || new Date().toISOString().slice(0, 10) : null,
    forma_pagamento: input.status === 'pago' ? input.forma_pagamento || 'PIX' : null,
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

/** Totais da grade (ignora desligado/isento/vazio). */
export function resumirGrade(
  membros: MembroMensalidade[],
  ano: number,
  rows: MensalidadeRow[],
  valorPadrao: number,
  diaAtraso = 15,
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
        const limite = new Date(ano, c.mes - 1, diaAtraso);
        if (hoje > limite) atrasado += c.valor;
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
