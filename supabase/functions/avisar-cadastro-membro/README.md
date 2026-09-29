# avisar-cadastro-membro

Envia e-mail aos profiles com `is_admin = true` e `ativo = true` quando um cadastro público de membro fica pendente.

```bash
supabase functions deploy avisar-cadastro-membro
```

Secrets: `RESEND_API_KEY`, `EMAIL_FROM`, `SUPABASE_SERVICE_ROLE_KEY` (já costumam existir no projeto).

Body: `{ "pendente_id": "<uuid>" }`
