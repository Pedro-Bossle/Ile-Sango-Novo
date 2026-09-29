import { supabase } from '../lib/supabaseClient';
import { somenteDigitosTelefone } from '../utils/telefone';

export type Cliente = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  whatsapp: string | null;
  email: string | null;
  obs: string | null;
  pessoa_id: string | null;
  deleted_at: string | null;
};

export type ClienteVisita = {
  id: string;
  cliente_id: string;
  data: string;
  resumo: string | null;
  valor: number | null;
  pago: boolean;
  forma_pagamento: string | null;
  obs: string | null;
  deleted_at: string | null;
};

export type MembroMatch = {
  id: string;
  nome: string;
  contato: string | null;
  email: string | null;
  orixa_cabeca_nome?: string | null;
  orixa_cabeca_qualidade_nome?: string | null;
};

const SELECT_COM_PESSOA =
  'id, nome, data_nascimento, whatsapp, email, obs, pessoa_id, deleted_at';
const SELECT_LEGACY = 'id, nome, data_nascimento, whatsapp, email, obs, deleted_at';

function normEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

/** Indica se o cliente corresponde a um membro (link explícito ou e-mail/WhatsApp iguais). */
export function clienteEhFilhoDeSanto(
  cliente: Pick<Cliente, 'pessoa_id' | 'whatsapp' | 'email'>,
  membros: MembroMatch[],
): MembroMatch | null {
  if (cliente.pessoa_id) {
    const byId = membros.find((m) => m.id === cliente.pessoa_id);
    if (byId) return byId;
  }
  const email = normEmail(cliente.email);
  const wa = somenteDigitosTelefone(cliente.whatsapp);
  for (const m of membros) {
    if (email && normEmail(m.email) === email) return m;
    const mc = somenteDigitosTelefone(m.contato);
    if (wa.length >= 10 && mc.length >= 10 && (wa === mc || wa.endsWith(mc.slice(-9)) || mc.endsWith(wa.slice(-9)))) {
      return m;
    }
  }
  return null;
}

export async function fetchMembrosParaMatch(): Promise<MembroMatch[]> {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome, contato, email')
    .is('deleted_at', null)
    .order('nome');
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Array<{ id: string; nome: string; contato: string | null; email: string | null }>;
  const { fetchMapaOrixaCabeca } = await import('./membros');
  const mapa = await fetchMapaOrixaCabeca(list.map((m) => m.id));
  return list.map((m) => {
    const cabeca = mapa.get(m.id);
    return {
      ...m,
      orixa_cabeca_nome: cabeca?.orixa_cabeca_nome ?? null,
      orixa_cabeca_qualidade_nome: cabeca?.orixa_cabeca_qualidade_nome ?? null,
    };
  });
}

export async function fetchClientes(includeDeleted = false) {
  let q = supabase.from('clientes').select(SELECT_COM_PESSOA).order('nome');
  if (!includeDeleted) q = q.is('deleted_at', null);
  let { data, error } = await q;

  if (error && /pessoa_id/i.test(error.message)) {
    let legacy = supabase.from('clientes').select(SELECT_LEGACY).order('nome');
    if (!includeDeleted) legacy = legacy.is('deleted_at', null);
    const retry = await legacy;
    if (retry.error) throw new Error(retry.error.message);
    return ((retry.data ?? []) as Omit<Cliente, 'pessoa_id'>[]).map((c) => ({
      ...c,
      pessoa_id: null,
    }));
  }

  if (error) throw new Error(error.message);
  return (data ?? []) as Cliente[];
}

export async function saveCliente(
  row: Partial<Cliente> & { nome: string },
): Promise<string> {
  const payload = {
    nome: row.nome,
    data_nascimento: row.data_nascimento || null,
    whatsapp: row.whatsapp || null,
    email: row.email || null,
    obs: row.obs || null,
    pessoa_id: row.pessoa_id || null,
  };

  if (row.id) {
    let { error } = await supabase.from('clientes').update(payload).eq('id', row.id);
    if (error && /pessoa_id/i.test(error.message)) {
      const { pessoa_id: _p, ...rest } = payload;
      const retry = await supabase.from('clientes').update(rest).eq('id', row.id);
      if (retry.error) throw new Error(retry.error.message);
      return row.id;
    }
    if (error) throw new Error(error.message);
    return row.id;
  }

  let { data, error } = await supabase.from('clientes').insert(payload).select('id').single();
  if (error && /pessoa_id/i.test(error.message)) {
    const { pessoa_id: _p, ...rest } = payload;
    const retry = await supabase.from('clientes').insert(rest).select('id').single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data.id as string;
  }
  if (error) throw new Error(error.message);
  return data!.id as string;
}

export async function softDeleteCliente(id: string) {
  const { error } = await supabase
    .from('clientes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restoreCliente(id: string) {
  const { error } = await supabase.from('clientes').update({ deleted_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchVisitas(clienteId: string) {
  const { data, error } = await supabase
    .from('cliente_visitas')
    .select('id, cliente_id, data, resumo, valor, pago, forma_pagamento, obs, deleted_at')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteVisita[];
}

export async function saveVisita(
  row: Partial<ClienteVisita> & { cliente_id: string; data: string },
): Promise<string> {
  const { data: sessao } = await supabase.auth.getSession();
  if (row.id) {
    const { error } = await supabase
      .from('cliente_visitas')
      .update({
        data: row.data,
        resumo: row.resumo ?? null,
        valor: row.valor ?? null,
        pago: row.pago ?? false,
        forma_pagamento: row.forma_pagamento ?? null,
        obs: row.obs ?? null,
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    return row.id;
  }
  const { data, error } = await supabase
    .from('cliente_visitas')
    .insert({
      cliente_id: row.cliente_id,
      data: row.data,
      resumo: row.resumo ?? null,
      valor: row.valor ?? null,
      pago: row.pago ?? false,
      forma_pagamento: row.forma_pagamento ?? null,
      obs: row.obs ?? null,
      created_by: sessao?.session?.user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function softDeleteVisita(id: string) {
  const { error } = await supabase
    .from('cliente_visitas')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function emAbertoCliente(clienteId: string): Promise<number> {
  const visitas = await fetchVisitas(clienteId);
  return visitas.filter((v) => !v.pago && v.valor != null).reduce((a, v) => a + Number(v.valor), 0);
}

export type PessoaParaCliente = {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  contato?: string | null;
  email?: string | null;
  obs?: string | null;
  deleted_at?: string | null;
};

/**
 * Garante que o membro (pessoa) exista como cliente vinculado via pessoa_id.
 * Sincroniza nome / nascimento / WhatsApp / e-mail; soft-delete acompanha o membro.
 */
export async function ensureClienteParaPessoa(pessoa: PessoaParaCliente): Promise<string | null> {
  if (!pessoa?.id || !pessoa.nome?.trim()) return null;

  const whatsapp = somenteDigitosTelefone(pessoa.contato) || null;
  const email = pessoa.email?.trim() || null;
  const payloadBase = {
    nome: pessoa.nome.trim(),
    data_nascimento: pessoa.data_nascimento || null,
    whatsapp,
    email,
    obs: pessoa.obs ?? null,
    pessoa_id: pessoa.id,
  };

  if (pessoa.deleted_at) {
    const { error } = await supabase
      .from('clientes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('pessoa_id', pessoa.id)
      .is('deleted_at', null);
    if (error && !/pessoa_id/i.test(error.message)) throw new Error(error.message);
    return null;
  }

  const { data: existentes, error: findErr } = await supabase
    .from('clientes')
    .select('id, deleted_at')
    .eq('pessoa_id', pessoa.id)
    .limit(10);

  if (findErr && /pessoa_id/i.test(findErr.message)) {
    return null;
  }
  if (findErr) throw new Error(findErr.message);

  const lista = (existentes ?? []) as { id: string; deleted_at: string | null }[];
  const existente =
    lista.find((c) => !c.deleted_at) ?? lista[0];
  if (existente) {
    const { error } = await supabase
      .from('clientes')
      .update({ ...payloadBase, deleted_at: null })
      .eq('id', existente.id);
    if (error) throw new Error(error.message);
    return existente.id;
  }

  // Tenta vincular cliente órfão com mesmo e-mail ou WhatsApp
  if (email || (whatsapp && whatsapp.length >= 10)) {
    const { data: candidatos } = await supabase
      .from('clientes')
      .select('id, email, whatsapp, pessoa_id')
      .is('deleted_at', null)
      .is('pessoa_id', null)
      .limit(200);
    const match = (candidatos ?? []).find((c) => {
      if (email && normEmail(c.email) === normEmail(email)) return true;
      const cw = somenteDigitosTelefone(c.whatsapp);
      if (
        whatsapp &&
        whatsapp.length >= 10 &&
        cw.length >= 10 &&
        (whatsapp === cw || whatsapp.endsWith(cw.slice(-9)) || cw.endsWith(whatsapp.slice(-9)))
      ) {
        return true;
      }
      return false;
    });
    if (match) {
      const { error } = await supabase
        .from('clientes')
        .update(payloadBase)
        .eq('id', match.id);
      if (error) throw new Error(error.message);
      return match.id as string;
    }
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert(payloadBase)
    .select('id')
    .single();
  if (error) {
    // Corrida com o trigger do banco: reaproveita o cliente já criado
    if (/duplicate|unique|pessoa_id/i.test(error.message)) {
      const { data: again } = await supabase
        .from('clientes')
        .select('id')
        .eq('pessoa_id', pessoa.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (again?.id) return again.id as string;
    }
    throw new Error(error.message);
  }
  return data!.id as string;
}
