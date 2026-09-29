import { supabase } from '../lib/supabaseClient';
import { emptyCadastro, type CadastroFormState } from '../types/memberForm';
import { savePessoaCompleta, type MemberFormPayload } from './membros';
import { somenteDigitosTelefone } from '../utils/telefone';
import type { UUID } from '../types/database';

export type CadastroLink = {
  id: string;
  token: string;
  label: string | null;
  ativo: boolean;
  created_at: string;
};

export type CadastroPendentePayload = {
  cadastro: CadastroFormState;
  orumale: Array<{
    orixa_id: string;
    qualidade_id: string;
    sobrenome_orisa_id: string;
    digina: string;
    data_feitura: string;
  }>;
  exus: Array<{ exu_nome: string; exu_ordem: number; data_feitura: string }>;
  umbanda: Array<{ umbanda_nome: string; umbanda_ordem: number; data_feitura: string }>;
};

export type CadastroPendente = {
  id: string;
  link_id: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  nome: string;
  data_nascimento: string | null;
  data_entrada: string | null;
  contato: string | null;
  email: string | null;
  signo: string | null;
  obs: string | null;
  payload: CadastroPendentePayload;
  pessoa_id: string | null;
  reviewed_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DashboardNotificacao = {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  entity_id: string | null;
  lida: boolean;
  created_at: string;
};

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePayload(raw: unknown): CadastroPendentePayload {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cad = (p.cadastro && typeof p.cadastro === 'object' ? p.cadastro : {}) as Partial<CadastroFormState>;
  return {
    cadastro: { ...emptyCadastro(), ...cad },
    orumale: Array.isArray(p.orumale) ? (p.orumale as CadastroPendentePayload['orumale']) : [],
    exus: Array.isArray(p.exus) ? (p.exus as CadastroPendentePayload['exus']) : [],
    umbanda: Array.isArray(p.umbanda) ? (p.umbanda as CadastroPendentePayload['umbanda']) : [],
  };
}

/** URL pública fixa (token fica só no servidor). */
export const CADASTRO_MEMBRO_PUBLIC_PATH = '/cadastrar_membro';
export const CADASTRO_MEMBRO_PUBLIC_ORIGIN = 'https://casadease.com.br';

export function cadastroPublicUrl(_token?: string): string {
  return `${CADASTRO_MEMBRO_PUBLIC_ORIGIN}${CADASTRO_MEMBRO_PUBLIC_PATH}`;
}

/** Exibe só o final do token interno (nunca vai na URL pública). */
export function maskCadastroToken(token: string): string {
  if (!token || token.length < 8) return '••••••••';
  return `••••••••${token.slice(-4)}`;
}

export async function fetchActiveCadastroLink(): Promise<CadastroLink | null> {
  const { data, error } = await supabase
    .from('membro_cadastro_links')
    .select('id, token, label, ativo, created_at')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CadastroLink | null) ?? null;
}

export async function getOrCreateCadastroLink(label = 'Cadastro de membros'): Promise<CadastroLink> {
  const existing = await fetchActiveCadastroLink();
  if (existing) return existing;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const token = randomToken();
  const { data, error } = await supabase
    .from('membro_cadastro_links')
    .insert({
      token,
      label,
      ativo: true,
      created_by: user?.id ?? null,
    })
    .select('id, token, label, ativo, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as CadastroLink;
}

export async function regenerateCadastroLink(label = 'Cadastro de membros'): Promise<CadastroLink> {
  await supabase.from('membro_cadastro_links').update({ ativo: false, updated_at: new Date().toISOString() }).eq('ativo', true);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const token = randomToken();
  const { data, error } = await supabase
    .from('membro_cadastro_links')
    .insert({
      token,
      label,
      ativo: true,
      created_by: user?.id ?? null,
    })
    .select('id, token, label, ativo, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as CadastroLink;
}

export async function validarLinkCadastro(_token?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('validar_link_cadastro_membro_ativo');
  if (error) {
    // Fallback se a migration nova ainda não rodou: tenta com token vazio / legado
    if (_token) {
      const legacy = await supabase.rpc('validar_link_cadastro_membro', { p_token: _token });
      if (!legacy.error) return Boolean(legacy.data);
    }
    throw new Error(error.message);
  }
  return Boolean(data);
}

export type SubmitCadastroInput = {
  pessoa: {
    nome: string;
    data_nascimento?: string | null;
    data_entrada?: string | null;
    contato?: string | null;
    email?: string | null;
    signo?: string | null;
    obs?: string | null;
  };
  cadastro: CadastroFormState;
  orumale: CadastroPendentePayload['orumale'];
  exus: CadastroPendentePayload['exus'];
  umbanda: CadastroPendentePayload['umbanda'];
};

export async function submeterCadastroPublico(input: SubmitCadastroInput, _token?: string): Promise<string> {
  const contato = somenteDigitosTelefone(input.pessoa.contato) || null;
  const payload = {
    pessoa: {
      nome: input.pessoa.nome.trim(),
      data_nascimento: input.pessoa.data_nascimento || null,
      data_entrada: input.pessoa.data_entrada || null,
      contato,
      email: input.pessoa.email?.trim() || null,
      signo: input.pessoa.signo?.trim() || null,
      obs: input.pessoa.obs?.trim() || null,
    },
    cadastro: input.cadastro,
    orumale: input.orumale,
    exus: input.exus,
    umbanda: input.umbanda,
  };
  const { data, error } = await supabase.rpc('submeter_cadastro_membro_ativo', {
    p_payload: payload,
  });
  let pendenteId: string | null = null;
  if (error) {
    if (_token) {
      const legacy = await supabase.rpc('submeter_cadastro_membro', {
        p_token: _token,
        p_payload: payload,
      });
      if (!legacy.error) pendenteId = String(legacy.data);
      else throw new Error(error.message);
    } else {
      throw new Error(error.message);
    }
  } else {
    pendenteId = String(data);
  }

  // Aviso aos admins (não bloqueia o sucesso do envio se o e-mail falhar).
  if (pendenteId) {
    void avisarAdminsCadastroPendente(pendenteId).catch(() => undefined);
  }
  return pendenteId!;
}

/** Dispara e-mail de aviso aos admins sobre um cadastro pendente. */
export async function avisarAdminsCadastroPendente(pendenteId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('avisar-cadastro-membro', {
    body: { pendente_id: pendenteId },
  });
  if (error) throw new Error(error.message);
}

export async function fetchPendentesCadastro(): Promise<CadastroPendente[]> {
  const { data, error } = await supabase
    .from('membro_cadastro_pendentes')
    .select(
      'id, link_id, status, nome, data_nascimento, data_entrada, contato, email, signo, obs, payload, pessoa_id, reviewed_at, deleted_at, created_at',
    )
    .is('deleted_at', null)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CadastroPendente[]).map((r) => ({
    ...r,
    payload: normalizePayload(r.payload),
  }));
}

export async function fetchPendenteById(id: string): Promise<CadastroPendente | null> {
  const { data, error } = await supabase
    .from('membro_cadastro_pendentes')
    .select(
      'id, link_id, status, nome, data_nascimento, data_entrada, contato, email, signo, obs, payload, pessoa_id, reviewed_at, deleted_at, created_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as CadastroPendente;
  return { ...row, payload: normalizePayload(row.payload) };
}

export async function countPendentesCadastro(): Promise<number> {
  const { count, error } = await supabase
    .from('membro_cadastro_pendentes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('status', 'pendente');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function aprovarPendente(id: string): Promise<UUID> {
  const pendente = await fetchPendenteById(id);
  if (!pendente || pendente.deleted_at || pendente.status !== 'pendente') {
    throw new Error('Cadastro pendente não encontrado.');
  }

  const payload: MemberFormPayload = {
    pessoa: {
      id: null,
      nome: pendente.nome,
      data_nascimento: pendente.data_nascimento,
      data_entrada: pendente.data_entrada,
      contato: pendente.contato,
      email: pendente.email,
      signo: pendente.signo,
      obs: pendente.obs,
    },
    cadastro: pendente.payload.cadastro,
    orumale: pendente.payload.orumale.map((r) => ({
      id: null,
      orixa_id: r.orixa_id,
      qualidade_id: r.qualidade_id,
      sobrenome_orisa_id: r.sobrenome_orisa_id,
      digina: r.digina,
      data_feitura: r.data_feitura,
    })),
    exus: pendente.payload.exus,
    umbanda: pendente.payload.umbanda,
  };

  const pessoaId = await savePessoaCompleta(payload);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('membro_cadastro_pendentes')
    .update({
      status: 'aprovado',
      pessoa_id: pessoaId,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  await marcarNotificacoesPorEntity(id);
  return pessoaId;
}

export async function reprovarPendente(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('membro_cadastro_pendentes')
    .update({
      status: 'rejeitado',
      deleted_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pendente');
  if (error) throw new Error(error.message);
  await marcarNotificacoesPorEntity(id);
}

export async function fetchNotificacoes(limit = 50): Promise<DashboardNotificacao[]> {
  const { data, error } = await supabase
    .from('dashboard_notificacoes')
    .select('id, tipo, titulo, corpo, entity_id, lida, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as DashboardNotificacao[];
}

export async function countNotificacoesNaoLidas(): Promise<number> {
  const { count, error } = await supabase
    .from('dashboard_notificacoes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('lida', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  const { error } = await supabase.from('dashboard_notificacoes').update({ lida: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function marcarNotificacoesPorEntity(entityId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_notificacoes')
    .update({ lida: true })
    .eq('entity_id', entityId)
    .eq('lida', false);
  if (error) throw new Error(error.message);
}

export async function limparTodasNotificacoes(): Promise<void> {
  const { error } = await supabase
    .from('dashboard_notificacoes')
    .update({ lida: true })
    .is('deleted_at', null)
    .eq('lida', false);
  if (error) throw new Error(error.message);
}
