// Edge Function: remove acesso (Auth user + profile).
// Deploy: supabase functions deploy excluir-acesso

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: 'Função sem variáveis de ambiente Supabase.' });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Não autenticado.' });

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: actor },
      error: actorErr,
    } = await caller.auth.getUser();
    if (actorErr || !actor) return json(401, { error: 'Sessão inválida.' });

    const { data: actorProfile, error: profileErr } = await caller
      .from('profiles')
      .select('is_admin, ativo')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (profileErr) return json(500, { error: profileErr.message });
    if (!actorProfile?.is_admin || !actorProfile?.ativo) {
      return json(403, { error: 'Apenas administradores podem excluir acessos.' });
    }

    const body = (await req.json()) as { user_id?: string };
    const targetId = String(body.user_id ?? '').trim();
    if (!targetId) return json(400, { error: 'Informe o utilizador a excluir.' });

    if (targetId === actor.id) {
      return json(400, { error: 'Não é possível excluir o próprio acesso.' });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('user_id, email, nome_exibicao, is_admin, ativo')
      .eq('user_id', targetId)
      .maybeSingle();
    if (targetErr) return json(500, { error: targetErr.message });
    if (!target) return json(404, { error: 'Acesso não encontrado.' });

    if (target.is_admin) {
      const { data: admins, error: adminsErr } = await admin
        .from('profiles')
        .select('user_id')
        .eq('is_admin', true)
        .eq('ativo', true);
      if (adminsErr) return json(500, { error: adminsErr.message });
      const outros = (admins ?? []).filter((a) => a.user_id !== targetId);
      if (outros.length === 0) {
        return json(400, { error: 'Não é possível excluir o único administrador ativo.' });
      }
    }

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetId);
    const { error: delProfileErr } = await admin.from('profiles').delete().eq('user_id', targetId);
    if (delAuthErr && delProfileErr) {
      return json(400, { error: delAuthErr.message || delProfileErr.message });
    }

    return json(200, {
      ok: true,
      user_id: targetId,
      email: target.email,
      nome_exibicao: target.nome_exibicao,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    return json(500, { error: msg });
  }
});
