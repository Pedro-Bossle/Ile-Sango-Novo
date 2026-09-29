// Edge Function: envia e-mail via Resend a partir do No-reply (EMAIL_FROM).
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY, EMAIL_FROM
// Opcional: EMAIL_PUBLIC_BASE_URL (default https://casadease.com.br) — URL da assinatura.
// O nome de exibição usa configuracoes_terreiro.nome_ile (nome completo do Ilê).
// Deploy: supabase functions deploy enviar-email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOME_ILE_PADRAO = 'Ilê Sàngó Aganjù e Ossun Pandá';
const EMAIL_NOREPLY_PADRAO = 'noreply@casadease.com.br';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function publicBaseUrl(): string {
  return (Deno.env.get('EMAIL_PUBLIC_BASE_URL') || 'https://casadease.com.br').replace(/\/$/, '');
}

function extractNoreplyEmail(raw: string): string {
  const m = raw.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  if (m?.[1]) return m[1].trim().toLowerCase();
  const bare = raw.trim();
  if (bare.includes('@') && !bare.includes(' ')) return bare.toLowerCase();
  return EMAIL_NOREPLY_PADRAO;
}

function formatFromHeader(displayName: string, email: string): string {
  const name = displayName.replace(/"/g, '').trim() || NOME_ILE_PADRAO;
  return `"${name}" <${email}>`;
}

async function resolveFrom(
  // deno-lint-ignore no-explicit-any
  client: any,
): Promise<string> {
  const envFrom = Deno.env.get('EMAIL_FROM') || `${NOME_ILE_PADRAO} <${EMAIL_NOREPLY_PADRAO}>`;
  const email = extractNoreplyEmail(envFrom);
  const { data } = await client
    .from('configuracoes_terreiro')
    .select('nome_ile')
    .eq('id', 1)
    .maybeSingle();
  const nome = String(data?.nome_ile ?? '').trim() || NOME_ILE_PADRAO;
  return formatFromHeader(nome, email);
}

function signatureHtml(): string {
  const src = `${publicBaseUrl()}/images/email/assinatura_email.png`;
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-collapse:collapse;">
  <tr>
    <td style="padding-top:18px;border-top:1px solid #e8e0d8;">
      <img src="${src}" alt="${NOME_ILE_PADRAO}" width="400" style="max-width:100%;width:400px;height:auto;display:block;border:0;" />
    </td>
  </tr>
</table>`;
}

function signatureText(): string {
  return `\n\n—\n${NOME_ILE_PADRAO}\n${publicBaseUrl()}\n`;
}

function textToBodyHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;">${inner}</p>`;
    })
    .join('');
}

function wrapEmail(htmlBody: string): string {
  const withSig = htmlBody.includes('assinatura_email.png') ? htmlBody : `${htmlBody}${signatureHtml()}`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f7f5f3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5f3;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e0d8;border-radius:12px;border-collapse:collapse;">
          <tr><td style="height:6px;background:#530526;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:28px 28px 24px;">${withSig}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;line-height:1.4;color:#9a8f84;text-align:center;">Mensagem automática · Não responda a este e-mail</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    if (!supabaseUrl || !anonKey) {
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
      .select('ativo')
      .eq('user_id', actor.id)
      .maybeSingle();
    if (profileErr) return json(500, { error: profileErr.message });
    if (!actorProfile?.ativo) {
      return json(403, { error: 'Perfil inativo.' });
    }

    const body = (await req.json()) as {
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
    };

    const to = String(body.to ?? '')
      .trim()
      .toLowerCase();
    const subject = String(body.subject ?? '').trim();
    const textIn = String(body.text ?? '').trim();
    const htmlIn = String(body.html ?? '').trim();

    if (!validarEmail(to)) {
      return json(400, { error: 'Informe um e-mail de destino válido.' });
    }
    if (!subject) {
      return json(400, { error: 'Informe o assunto do e-mail.' });
    }
    if (!textIn && !htmlIn) {
      return json(400, { error: 'Informe o conteúdo do e-mail.' });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return json(503, { error: 'Envio de e-mail não configurado (RESEND_API_KEY).' });
    }

    const from = await resolveFrom(caller);
    const inner = htmlIn || textToBodyHtml(textIn);
    const html = /<!DOCTYPE html|<html[\s>]/i.test(inner)
      ? (inner.includes('assinatura_email.png') ? inner : inner.replace(/<\/body>/i, `${signatureHtml()}</body>`))
      : wrapEmail(inner);
    const text = textIn.includes('Ilê Sàngó') || textIn.includes('Ilê Asè')
      ? textIn
      : `${textIn}${signatureText()}`.trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: text || subject,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json(502, { error: detail || `Falha no envio (HTTP ${res.status})` });
    }

    const payload = (await res.json().catch(() => ({}))) as { id?: string };
    return json(200, { ok: true, id: payload.id ?? null, from });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    return json(500, { error: msg });
  }
});
