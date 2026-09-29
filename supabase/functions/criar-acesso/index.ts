// Edge Function: cria utilizador Auth + profile admin e envia senha temporária por e-mail.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Opcional: RESEND_API_KEY, EMAIL_FROM (ex.: "noreply@seudominio.com")
// O nome de exibição vem de configuracoes_terreiro.nome_ile.
// Deploy: supabase functions deploy criar-acesso

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

function gerarSenha(tamanho = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < tamanho; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicBaseUrl(): string {
  return (Deno.env.get('EMAIL_PUBLIC_BASE_URL') || 'https://casadease.com.br').replace(/\/$/, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signatureHtml(): string {
  const src = `${publicBaseUrl()}/images/email/assinatura_email.png`;
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-collapse:collapse;">
  <tr>
    <td style="padding-top:18px;border-top:1px solid #e8e0d8;">
      <img src="${src}" alt="Ilê Asè Sàngó Aganjú e Osun Pandá" width="400" style="max-width:100%;width:400px;height:auto;display:block;border:0;" />
    </td>
  </tr>
</table>`;
}

async function resolveFromDisplay(
  // deno-lint-ignore no-explicit-any
  client: any,
): Promise<string> {
  const NOME = 'Ilê Sàngó Aganjù e Ossun Pandá';
  const envFrom = Deno.env.get('EMAIL_FROM') || `${NOME} <noreply@casadease.com.br>`;
  const m = envFrom.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  const email = (m?.[1] || (envFrom.includes('@') ? envFrom.trim() : 'noreply@casadease.com.br')).toLowerCase();
  const { data } = await client.from('configuracoes_terreiro').select('nome_ile').eq('id', 1).maybeSingle();
  const nome = String(data?.nome_ile ?? '').trim().replace(/"/g, '') || NOME;
  return `"${nome}" <${email}>`;
}

async function enviarEmailResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY não configurada' };

  const from = input.from || Deno.env.get('EMAIL_FROM') || 'Ilê Sàngó Aganjù e Ossun Pandá <noreply@casadease.com.br>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, error: detail || `HTTP ${res.status}` };
  }
  return { ok: true };
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
      return json(403, { error: 'Apenas administradores podem criar acessos.' });
    }

    const body = (await req.json()) as {
      email?: string;
      nome_exibicao?: string;
      is_admin?: boolean;
      site_url?: string;
    };

    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const nome = String(body.nome_exibicao ?? '').trim() || null;
    const isAdmin = body.is_admin !== false;
    const siteUrl = String(body.site_url ?? '').replace(/\/$/, '') || 'https://localhost';

    if (!validarEmail(email)) {
      return json(400, { error: 'Informe um e-mail válido.' });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile) {
      return json(409, { error: 'Já existe um acesso com este e-mail.' });
    }

    const password = gerarSenha(12);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_exibicao: nome },
    });
    if (createErr || !created.user) {
      return json(400, { error: createErr?.message || 'Não foi possível criar o utilizador.' });
    }

    const userId = created.user.id;
    const permissions = isAdmin
      ? {
          visao_geral: { r: true },
          eventos: { c: true, r: true, u: true, d: true },
          catalogo: { c: true, r: true, u: true, d: true },
          membros: { c: true, r: true, u: true, d: true, excel: true },
          cobrancas: { c: true, r: true, u: true, d: true, s: true, pagar: true },
          caixa: { c: true, r: true, u: true, d: true },
          clientes: { c: true, r: true, u: true, d: true, s: true },
          orcamentos: { c: true, r: true, u: true, d: true, s: true },
          agenda: { c: true, r: true, u: true, d: true, s: true },
          dados_ile: { r: true, u: true },
          orixas: { c: true, r: true, u: true, d: true },
          acessos: { c: true, r: true, u: true, d: true },
          restaurar: { r: true, u: true },
        }
      : {};

    const { error: upsertErr } = await admin.from('profiles').upsert({
      user_id: userId,
      email,
      nome_exibicao: nome,
      is_admin: isAdmin,
      ativo: true,
      permissions,
    });
    if (upsertErr) {
      await admin.auth.admin.deleteUser(userId);
      return json(500, { error: upsertErr.message });
    }

    await admin.from('password_change_required').upsert({
      user_id: userId,
      required_at: new Date().toISOString(),
      completed_at: null,
    });

    const loginUrl = `${siteUrl}/login`;
    const subject = 'Acesso à área restrita do Ilê';
    const text = [
      `Olá${nome ? ` ${nome}` : ''},`,
      '',
      'Foi criado um acesso à área restrita da casa.',
      '',
      `E-mail de acesso: ${email}`,
      `Senha temporária: ${password}`,
      '',
      `Entre em: ${loginUrl}`,
      '',
      'No primeiro acesso será pedido para definir uma nova senha.',
      'Não partilhe esta senha com outras pessoas.',
      '',
      '—',
      'Ilê Asè Sàngó Aganjú e Osun Pandá',
      publicBaseUrl(),
    ].join('\n');

    const nomeSafe = nome ? escapeHtml(nome) : '';
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f7f5f3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5f3;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e0d8;border-radius:12px;border-collapse:collapse;">
          <tr><td style="height:6px;background:#530526;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 28px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;">
              <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#530526;font-weight:700;">Seu acesso à área restrita</h1>
              <p style="margin:0 0 14px;">Olá${nomeSafe ? ` <strong>${nomeSafe}</strong>` : ''},</p>
              <p style="margin:0 0 14px;">Foi criado um acesso à área restrita da casa.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;background:#faf7f4;border:1px solid #e8e0d8;border-radius:8px;border-collapse:collapse;">
                <tr><td style="padding:14px 16px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#2c241c;">
                  <div style="margin:0 0 8px;"><strong>E-mail:</strong> ${escapeHtml(email)}</div>
                  <div><strong>Senha temporária:</strong> <code style="font-size:14px;">${escapeHtml(password)}</code></div>
                </td></tr>
              </table>
              <p style="margin:0 0 18px;">
                <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 18px;background:#530526;color:#ffffff;text-decoration:none;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;">Entrar na área restrita</a>
              </p>
              <p style="margin:0 0 8px;">No primeiro acesso será pedido para definir uma nova senha.</p>
              <p style="margin:0;color:#666;font-size:13px;font-family:system-ui,sans-serif;">Não partilhe esta senha com outras pessoas.</p>
              ${signatureHtml()}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;line-height:1.4;color:#9a8f84;text-align:center;">Mensagem automática · Não responda a este e-mail</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const from = await resolveFromDisplay(admin);
    const mail = await enviarEmailResend({ to: email, subject, html, text, from });

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      email_enviado: mail.ok,
      email_erro: mail.ok ? null : mail.error ?? null,
      // Devolve senha só se o e-mail automático falhou — o admin pode reenviar.
      senha_temporaria: mail.ok ? null : password,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    return json(500, { error: msg });
  }
});
