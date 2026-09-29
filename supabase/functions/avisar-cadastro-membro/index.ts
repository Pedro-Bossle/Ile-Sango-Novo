// Edge Function: avisa admins por e-mail quando há cadastro de membro pendente.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM
// O nome de exibição usa configuracoes_terreiro.nome_ile.
// Opcional: EMAIL_PUBLIC_BASE_URL (default https://casadease.com.br)
// Deploy: supabase functions deploy avisar-cadastro-membro

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
  const src = `${publicBaseUrl()}/images/email/assinatura_email.png?v=2`;
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-collapse:collapse;">
  <tr>
    <td style="padding-top:18px;border-top:1px solid #e8e0d8;">
      <img src="${src}" alt="Ilê Asè Sàngó Aganjú e Osun Pandá" width="400" style="max-width:100%;width:400px;height:auto;display:block;border:0;" />
    </td>
  </tr>
</table>`;
}

function wrapEmail(inner: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f7f5f3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5f3;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e0d8;border-radius:12px;border-collapse:collapse;">
          <tr><td style="height:6px;background:#530526;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:28px 28px 24px;">${inner}${signatureHtml()}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;line-height:1.4;color:#9a8f84;text-align:center;">Mensagem automática · Não responda a este e-mail</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const NOME_ILE_PADRAO = 'Ilê Sàngó Aganjù e Ossun Pandá';
const EMAIL_NOREPLY_PADRAO = 'noreply@casadease.com.br';

async function resolveFrom(
  // deno-lint-ignore no-explicit-any
  client: any,
): Promise<string> {
  const envFrom = Deno.env.get('EMAIL_FROM') || `${NOME_ILE_PADRAO} <${EMAIL_NOREPLY_PADRAO}>`;
  const m = envFrom.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
  const email = (m?.[1] || (envFrom.includes('@') && !envFrom.includes(' ') ? envFrom.trim() : EMAIL_NOREPLY_PADRAO)).toLowerCase();
  const { data } = await client.from('configuracoes_terreiro').select('nome_ile').eq('id', 1).maybeSingle();
  const nome = String(data?.nome_ile ?? '').trim().replace(/"/g, '') || NOME_ILE_PADRAO;
  return `"${nome}" <${email}>`;
}

async function enviarEmailResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY não configurada' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: 'Função sem variáveis de ambiente Supabase.' });
    }

    const body = (await req.json().catch(() => ({}))) as { pendente_id?: string };
    const pendenteId = String(body.pendente_id ?? '').trim();
    if (!pendenteId || !/^[0-9a-f-]{36}$/i.test(pendenteId)) {
      return json(400, { error: 'Informe o id do cadastro pendente.' });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: pendente, error: pendErr } = await admin
      .from('membro_cadastro_pendentes')
      .select('id, nome, contato, email, data_nascimento, created_at, status, deleted_at, aviso_email_em')
      .eq('id', pendenteId)
      .maybeSingle();

    if (pendErr) return json(500, { error: pendErr.message });
    if (!pendente || pendente.deleted_at || pendente.status !== 'pendente') {
      return json(404, { error: 'Cadastro pendente não encontrado.' });
    }

    if (pendente.aviso_email_em) {
      return json(200, { ok: true, skipped: true, reason: 'aviso_ja_enviado' });
    }

    // Só avisa se o cadastro for recente (evita spam com ids antigos).
    const criado = new Date(String(pendente.created_at)).getTime();
    if (!Number.isFinite(criado) || Date.now() - criado > 30 * 60 * 1000) {
      return json(400, { error: 'Cadastro fora da janela de aviso.' });
    }

    const { data: admins, error: admErr } = await admin
      .from('profiles')
      .select('email, nome_exibicao')
      .eq('is_admin', true)
      .eq('ativo', true);

    if (admErr) return json(500, { error: admErr.message });

    const destinos = Array.from(
      new Set(
        (admins ?? [])
          .map((a) => String(a.email ?? '').trim().toLowerCase())
          .filter((e) => validarEmail(e)),
      ),
    );

    if (!destinos.length) {
      return json(200, { ok: true, skipped: true, reason: 'sem_admins' });
    }

    const nome = String(pendente.nome || 'Sem nome').trim();
    const contato = pendente.contato ? String(pendente.contato) : '—';
    const emailPessoa = pendente.email ? String(pendente.email) : '—';
    const nasc = pendente.data_nascimento
      ? String(pendente.data_nascimento).slice(0, 10).split('-').reverse().join('/')
      : '—';
    const dashUrl = `${publicBaseUrl()}/dashboard`;
    const subject = `Novo cadastro de membro pendente — ${nome}`;
    const text =
      `Há um novo cadastro de membro aguardando aprovação.\n\n` +
      `Nome: ${nome}\n` +
      `Contato: ${contato}\n` +
      `E-mail: ${emailPessoa}\n` +
      `Nascimento: ${nasc}\n\n` +
      `Abra a dashboard para revisar: ${dashUrl}\n`;

    const html = wrapEmail(`
      <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;color:#530526;font-weight:700;">Cadastro pendente</h1>
      <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;">
        Há um novo cadastro de membro aguardando aprovação.
      </p>
      <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;"><strong>Nome:</strong> ${escapeHtml(nome)}</p>
      <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;"><strong>Contato:</strong> ${escapeHtml(contato)}</p>
      <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;"><strong>E-mail:</strong> ${escapeHtml(emailPessoa)}</p>
      <p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;"><strong>Nascimento:</strong> ${escapeHtml(nasc)}</p>
      <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;">
        <a href="${escapeHtml(dashUrl)}" style="color:#530526;font-weight:600;">Abrir dashboard</a> para revisar na inbox.
      </p>
    `);

    const from = await resolveFrom(admin);
    const resultados: Array<{ to: string; ok: boolean; error?: string }> = [];
    for (const to of destinos) {
      const r = await enviarEmailResend({ to, subject, html, text, from });
      resultados.push({ to, ok: r.ok, error: r.error });
    }

    const enviados = resultados.filter((r) => r.ok).length;
    if (enviados > 0) {
      await admin
        .from('membro_cadastro_pendentes')
        .update({ aviso_email_em: new Date().toISOString() })
        .eq('id', pendenteId)
        .is('aviso_email_em', null);
    }

    return json(200, {
      ok: true,
      enviados,
      total: destinos.length,
      resultados,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    return json(500, { error: msg });
  }
});
