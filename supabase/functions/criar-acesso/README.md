# Edge Function: criar-acesso
#
# Cria utilizador Auth + profile e envia senha temporária por e-mail (Resend).
#
# Deploy:
#   supabase functions deploy criar-acesso
#
# Secrets (Dashboard → Edge Functions → Secrets, ou CLI):
#   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
#   supabase secrets set RESEND_API_KEY=re_...          # opcional mas recomendado
#   supabase secrets set EMAIL_FROM="noreply@seudominio.com"
#   (nome de exibição = configuracoes_terreiro.nome_ile)
#
# SUPABASE_URL e SUPABASE_ANON_KEY costumam já existir no ambiente das functions.
#
# Sem RESEND_API_KEY: a conta é criada na mesma; o admin vê a senha e pode
# "Abrir e-mail" (mailto) para enviar manualmente.
