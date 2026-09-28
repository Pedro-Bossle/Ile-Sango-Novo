-- QR Code Pix (PNG em base64) para recibos de atendimento
ALTER TABLE public.configuracoes_terreiro
  ADD COLUMN IF NOT EXISTS pix_qr_base64 TEXT;

COMMENT ON COLUMN public.configuracoes_terreiro.pix_qr_base64 IS
  'Imagem PNG do QR Code Pix (data URL base64), usada no recibo de atendimento';
