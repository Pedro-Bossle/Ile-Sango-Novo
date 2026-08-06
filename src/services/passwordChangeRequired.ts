import { supabase } from '../lib/supabaseClient';

/** Utilizador marcado na migration para trocar senha no próximo login. */
export const PASSWORD_CHANGE_USER_ID = 'fd74d483-f27a-499f-9e2a-d1226922f5eb';

export async function isPasswordChangeRequired(userId?: string | null): Promise<boolean> {
  let uid = userId ?? null;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? null;
  }
  if (!uid) return false;

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
  const { error } = await supabase
    .from('password_change_required')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('completed_at', null);

  if (error) throw new Error(error.message);
}
