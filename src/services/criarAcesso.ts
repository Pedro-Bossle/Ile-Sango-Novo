import { supabase } from '../lib/supabaseClient';
import { enviarEmail } from './enviarEmail';

export type CriarAcessoInput = {
  email: string;
  nome_exibicao?: string;
  /** Default true — acesso de administrador. */
  is_admin?: boolean;
};

export type CriarAcessoResult = {
  user_id: string;
  email: string;
  email_enviado: boolean;
  email_erro: string | null;
  /** Só vem preenchida se o e-mail automático não foi enviado. */
  senha_temporaria: string | null;
};

export async function criarAcesso(input: CriarAcessoInput): Promise<CriarAcessoResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido.');
  }

  const { data, error } = await supabase.functions.invoke('criar-acesso', {
    body: {
      email,
      nome_exibicao: input.nome_exibicao?.trim() || undefined,
      is_admin: input.is_admin !== false,
      site_url: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });

  if (error) {
    const detail =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : error.message;
    throw new Error(detail || 'Não foi possível criar o acesso.');
  }

  const payload = data as {
    error?: string;
    user_id?: string;
    email?: string;
    email_enviado?: boolean;
    email_erro?: string | null;
    senha_temporaria?: string | null;
  };

  if (payload?.error) throw new Error(payload.error);
  if (!payload?.user_id || !payload.email) {
    throw new Error('Resposta inválida ao criar acesso.');
  }

  return {
    user_id: payload.user_id,
    email: payload.email,
    email_enviado: Boolean(payload.email_enviado),
    email_erro: payload.email_erro ?? null,
    senha_temporaria: payload.senha_temporaria ?? null,
  };
}

/** Remove acesso (Auth + profile) via Edge Function. */
export async function excluirAcesso(userId: string): Promise<{ user_id: string; email: string }> {
  const id = userId.trim();
  if (!id) throw new Error('Utilizador inválido.');

  const { data, error } = await supabase.functions.invoke('excluir-acesso', {
    body: { user_id: id },
  });

  if (error) {
    const detail =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : error.message;
    throw new Error(detail || 'Não foi possível excluir o acesso.');
  }

  const payload = data as { error?: string; user_id?: string; email?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.user_id) throw new Error('Resposta inválida ao excluir acesso.');

  return { user_id: payload.user_id, email: payload.email || '' };
}

/** Reenvia a senha temporária pelo No-reply (fallback quando o envio inicial falhou). */
export async function reenviarCredenciaisAcesso(opts: {
  to: string;
  nome?: string | null;
  senha: string;
}): Promise<void> {
  const loginUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/login`;
  const subject = 'Acesso à área restrita do Ilê';
  const text = [
    `Olá${opts.nome ? ` ${opts.nome}` : ''},`,
    '',
    'Foi criado um acesso à área restrita da casa.',
    '',
    `E-mail de acesso: ${opts.to}`,
    `Senha temporária: ${opts.senha}`,
    '',
    `Entre em: ${loginUrl}`,
    '',
    'No primeiro acesso será pedido para definir uma nova senha.',
    'Não partilhe esta senha com outras pessoas.',
  ].join('\n');
  await enviarEmail({ to: opts.to, subject, title: 'Seu acesso à área restrita', text });
}
