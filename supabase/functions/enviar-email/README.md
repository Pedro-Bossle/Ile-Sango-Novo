# enviar-email

Envia e-mails a partir do No-reply (`EMAIL_FROM` / Resend), com layout e assinatura gráfica.
O **nome de exibição** do remetente vem de `configuracoes_terreiro.nome_ile` (nome completo do Ilê).

## Secrets

```bash
supabase secrets set RESEND_API_KEY="re_..."
# Pode ser só o e-mail, ou "Nome <email>". O nome é sobrescrito por nome_ile.
supabase secrets set EMAIL_FROM="noreply@casadease.com.br"
# Opcional — base pública da assinatura (default: https://casadease.com.br)
# supabase secrets set EMAIL_PUBLIC_BASE_URL="https://casadease.com.br"
```

A imagem da assinatura deve estar publicada em:

`{EMAIL_PUBLIC_BASE_URL}/images/email/assinatura_email.png?v=2`
(atualize `?v=` ao trocar a arte, para furar cache do Gmail/Outlook)

## Deploy

```bash
supabase functions deploy enviar-email
```

## Body (JSON)

```json
{
  "to": "cliente@email.com",
  "subject": "Assunto",
  "text": "Corpo em texto",
  "html": "<p>Opcional</p>"
}
```

Requer utilizador autenticado com perfil ativo. Se `html` já vier envelopado pelo front, a function só garante a assinatura.
