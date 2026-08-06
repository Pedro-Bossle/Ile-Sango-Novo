import { supabase } from '../lib/supabaseClient';

export async function isTutorialCompleted(userId: string, screen: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('dashboard_tutorials')
    .select('id')
    .eq('user_id', userId)
    .eq('screen', screen)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function markTutorialCompleted(userId: string, screen: string): Promise<void> {
  const { error } = await supabase.from('dashboard_tutorials').upsert(
    {
      user_id: userId,
      screen,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,screen' },
  );
  if (error) throw new Error(error.message);
}

export async function clearTutorialCompleted(userId: string, screen: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_tutorials')
    .delete()
    .eq('user_id', userId)
    .eq('screen', screen);
  if (error) throw new Error(error.message);
}
