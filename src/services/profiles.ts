import { supabase } from '../lib/supabaseClient';
import { fullPermissions, type PermissionsMap } from '../lib/permissions';

export type Profile = {
  user_id: string;
  email: string;
  nome_exibicao: string | null;
  is_admin: boolean;
  ativo: boolean;
  permissions: PermissionsMap;
};

/**
 * Contas internas de debug (ex.: "Pedro Bossle (Debugs)") —
 * ficam ocultas em seleções, agenda e menu de Acessos.
 * O próprio utilizador continua a poder autenticar via fetchCurrentProfile.
 */
export function isPerfilOcultoNasListas(
  p: Pick<Profile, 'email' | 'nome_exibicao'> | { email?: string | null; nome_exibicao?: string | null },
): boolean {
  const nome = String(p.nome_exibicao ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const email = String(p.email ?? '')
    .trim()
    .toLowerCase();

  if (/\(debugs?\)/.test(nome)) return true;
  if (nome.includes('pedro bossle') && nome.includes('debug')) return true;
  if (email.includes('+debug') || email.startsWith('debug@')) return true;
  return false;
}

function mapProfile(d: {
  user_id: string;
  email: string;
  nome_exibicao: string | null;
  is_admin: boolean;
  ativo: boolean;
  permissions: PermissionsMap | null;
}): Profile {
  return {
    user_id: d.user_id,
    email: d.email,
    nome_exibicao: d.nome_exibicao,
    is_admin: Boolean(d.is_admin),
    ativo: Boolean(d.ativo),
    permissions: (d.permissions as PermissionsMap) ?? {},
  };
}

export async function fetchCurrentProfile(): Promise<Profile | null> {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao?.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, nome_exibicao, is_admin, ativo, permissions')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!data.ativo) return null;

  return mapProfile(data);
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, nome_exibicao, is_admin, ativo, permissions')
    .order('email');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map(mapProfile)
    .filter((p) => !isPerfilOcultoNasListas(p));
}

export async function upsertProfile(input: {
  user_id: string;
  email: string;
  nome_exibicao?: string;
  is_admin?: boolean;
  ativo?: boolean;
  permissions?: PermissionsMap;
}): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    user_id: input.user_id,
    email: input.email,
    nome_exibicao: input.nome_exibicao ?? null,
    is_admin: input.is_admin ?? false,
    ativo: input.ativo ?? true,
    permissions: input.permissions ?? fullPermissions(),
  });
  if (error) throw new Error(error.message);
}

export async function updateProfilePermissions(
  userId: string,
  patch: Partial<Pick<Profile, 'nome_exibicao' | 'is_admin' | 'ativo' | 'permissions'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
