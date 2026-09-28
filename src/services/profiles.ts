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

  return {
    user_id: data.user_id,
    email: data.email,
    nome_exibicao: data.nome_exibicao,
    is_admin: Boolean(data.is_admin),
    ativo: Boolean(data.ativo),
    permissions: (data.permissions as PermissionsMap) ?? {},
  };
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, nome_exibicao, is_admin, ativo, permissions')
    .order('email');
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    user_id: d.user_id,
    email: d.email,
    nome_exibicao: d.nome_exibicao,
    is_admin: Boolean(d.is_admin),
    ativo: Boolean(d.ativo),
    permissions: (d.permissions as PermissionsMap) ?? {},
  }));
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
