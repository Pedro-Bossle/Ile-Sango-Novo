import { supabase } from '../lib/supabaseClient';
import { buildTransactionalEmail } from '../utils/emailLayout';

export type EnviarEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Título opcional no topo do HTML (ex.: "Cobrança"). */
  title?: string;
};

export type EnviarEmailResult = {
  ok: true;
  id: string | null;
  from: string | null;
};

/** Envia e-mail pelo No-reply (Resend / EMAIL_FROM) via Edge Function, com layout e assinatura. */
export async function enviarEmail(input: EnviarEmailInput): Promise<EnviarEmailResult> {
  const to = String(input.to ?? '')
    .trim()
    .toLowerCase();
  const subject = String(input.subject ?? '').trim();
  const textIn = String(input.text ?? '').trim();

  if (!to || !to.includes('@')) {
    throw new Error('Informe um e-mail de destino válido.');
  }
  if (!subject) throw new Error('Informe o assunto do e-mail.');
  if (!textIn && !input.html?.trim()) {
    throw new Error('Informe o conteúdo do e-mail.');
  }

  const { html, text } = buildTransactionalEmail({
    text: textIn || subject,
    html: input.html?.trim() || undefined,
    title: input.title?.trim() || undefined,
  });

  const { data, error } = await supabase.functions.invoke('enviar-email', {
    body: {
      to,
      subject,
      text,
      html,
    },
  });

  if (error) {
    const detail =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : error.message;
    throw new Error(detail || 'Não foi possível enviar o e-mail.');
  }

  const payload = data as { error?: string; ok?: boolean; id?: string | null; from?: string | null };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('Resposta inválida ao enviar e-mail.');

  return {
    ok: true,
    id: payload.id ?? null,
    from: payload.from ?? null,
  };
}
