/** Base pública para assets de e-mail (assinatura precisa de URL absoluta HTTPS). */
export const EMAIL_PUBLIC_ORIGIN = 'https://casadease.com.br';

/** Query string força clientes de e-mail a buscar a imagem nova (mesma URL sem v= fica em cache). */
const ASSINATURA_PATH = '/images/email/assinatura_email.png?v=2';

export function escapeHtmlEmail(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function assinaturaEmailUrl(baseUrl: string = EMAIL_PUBLIC_ORIGIN): string {
  return `${baseUrl.replace(/\/$/, '')}${ASSINATURA_PATH}`;
}

export function emailSignatureHtml(baseUrl: string = EMAIL_PUBLIC_ORIGIN): string {
  const src = assinaturaEmailUrl(baseUrl);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-collapse:collapse;">
  <tr>
    <td style="padding-top:18px;border-top:1px solid #e8e0d8;">
      <img src="${src}" alt="Ilê Asè Sàngó Aganjú e Osun Pandá" width="400" style="max-width:100%;width:400px;height:auto;display:block;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
</table>`;
}

export function emailSignatureText(baseUrl: string = EMAIL_PUBLIC_ORIGIN): string {
  return `\n\n—\nIlê Asè Sàngó Aganjú e Osun Pandá\n${baseUrl.replace(/\/$/, '')}\n`;
}

/** Converte texto plano (com quebras de linha) em parágrafos HTML seguros. */
export function plainTextToEmailBodyHtml(text: string): string {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const inner = escapeHtmlEmail(block).replace(/\n/g, '<br />');
      return `<p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#2c241c;">${inner}</p>`;
    })
    .join('');
}

function hasAssinatura(html: string): boolean {
  return html.includes('assinatura_email.png') || html.includes('data-email-signature');
}

/**
 * Envelope HTML dos e-mails transacionais + assinatura gráfica.
 * Idempotente: não duplica a assinatura se o HTML já a trouxer.
 */
export function buildTransactionalEmail(input: {
  text: string;
  html?: string;
  title?: string;
  baseUrl?: string;
}): { html: string; text: string } {
  const baseUrl = input.baseUrl ?? EMAIL_PUBLIC_ORIGIN;
  const textBody = String(input.text ?? '').trim();
  const rawHtml = String(input.html ?? '').trim();
  const bodyHtml = rawHtml || plainTextToEmailBodyHtml(textBody);
  const titleHtml = input.title
    ? `<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;color:#530526;font-weight:700;">${escapeHtmlEmail(input.title)}</h1>`
    : '';

  const sigHtml = hasAssinatura(bodyHtml) ? '' : emailSignatureHtml(baseUrl);
  const sigText = textBody.includes('Ilê Asè Sàngó') ? '' : emailSignatureText(baseUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlEmail(input.title || 'Ilê')}</title>
</head>
<body style="margin:0;padding:0;background:#f7f5f3;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5f3;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e8e0d8;border-radius:12px;border-collapse:collapse;">
          <tr>
            <td style="height:6px;background:#530526;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px;" data-email-signature="pending">
              ${titleHtml}
              ${bodyHtml}
              ${sigHtml}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:system-ui,sans-serif;font-size:11px;line-height:1.4;color:#9a8f84;text-align:center;">
          Mensagem automática · Não responda a este e-mail
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    html,
    text: `${textBody}${sigText}`.trim(),
  };
}
