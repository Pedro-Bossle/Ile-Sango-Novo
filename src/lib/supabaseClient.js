import { createClient } from '@supabase/supabase-js';

/**
 * Apenas URL + anon/publishable key (públicas por desenho do Supabase).
 * Nunca use service_role com prefixo REACT_APP_ — CRA embute REACT_APP_* no bundle do browser.
 */
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Faltam as variáveis de ambiente do cliente. Copie .env.example para .env.local, preencha e reinicie o servidor.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
