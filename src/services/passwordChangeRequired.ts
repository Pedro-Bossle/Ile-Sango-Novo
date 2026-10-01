import { supabase } from '../lib/supabaseClient';

/** Utilizador marcado na migration para trocar senha no próximo login. */
export const PASSWORD_CHANGE_USER_ID = 'fd74d483-f27a-499f-9e2a-d1226922f5eb';

function doneKey(userId: string) {
  return `pwd_change_done_${userId}`;
}

/** Marca localmente que a senha já foi atualizada nesta sessão do browser. */
export function rememberPasswordChangedLocally(userId: string): void {
  try {
    sessionStorage.setItem(doneKey(userId), '1');
  } catch {
    /* ignore */
  }
}

function wasPasswordChangedLocally(userId: string): boolean {
  try {
    return sessionStorage.getItem(doneKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function clearPasswordChangedLocally(userId: string): void {
  try {
    sessionStorage.removeItem(doneKey(userId));
  } catch {
    /* ignore */
  }
}

export async function isPasswordChangeRequired(userId?: string | null): Promise<boolean> {
  let uid = userId ?? null;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? null;
  }
  if (!uid) return false;

  // Se a senha já foi trocada nesta sessão mas o flag na BD falhou, não bloquear.
  if (wasPasswordChangedLocally(uid)) {
    markPasswordChangeCompleted(uid).catch(() => {});
    return false;
  }

  const { data, error } = await supabase
    .from('password_change_required')
    .select('user_id')
    .eq('user_id', uid)
    .is('completed_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.user_id);
}

export async function markPasswordChangeCompleted(userId: string): Promise<void> {
  // Preferir RPC SECURITY DEFINER (evita falhas de GRANT/RLS no update directo).
  const { error: rpcError } = await supabase.rpc('complete_password_change_required');

  if (!rpcError) {
    clearPasswordChangedLocally(userId);
    return;
  }

  // Fallback para bases onde a migration da RPC ainda não correu.
  const rpcMissing =
    /could not find the function|function .* does not exist|pgrst202|404/i.test(
      `${rpcError.message} ${rpcError.code ?? ''} ${rpcError.details ?? ''}`,
    );

  if (!rpcMissing) {
    throw new Error(rpcError.message);
  }

  const { error } = await supabase
    .from('password_change_required')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('completed_at', null);

  if (error) throw new Error(error.message);
  clearPasswordChangedLocally(userId);
}
