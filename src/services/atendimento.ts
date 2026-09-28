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
  obs: string | null;
  deleted_at: string | null;
};

export type MembroMatch = {
  id: string;
  nome: string;
  contato: string | null;
  email: string | null;
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
  return (data ?? []) as MembroMatch[];
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
    .select('id, cliente_id, data, resumo, valor, pago, obs, deleted_at')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteVisita[];
}

export async function saveVisita(
  row: Partial<ClienteVisita> & { cliente_id: string; data: string },
) {
  const { data: sessao } = await supabase.auth.getSession();
  if (row.id) {
    const { error } = await supabase
      .from('cliente_visitas')
      .update({
        data: row.data,
        resumo: row.resumo ?? null,
        valor: row.valor ?? null,
        pago: row.pago ?? false,
        obs: row.obs ?? null,
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from('cliente_visitas').insert({
    cliente_id: row.cliente_id,
    data: row.data,
    resumo: row.resumo ?? null,
    valor: row.valor ?? null,
    pago: row.pago ?? false,
    obs: row.obs ?? null,
    created_by: sessao?.session?.user?.id ?? null,
  });
  if (error) throw new Error(error.message);
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
