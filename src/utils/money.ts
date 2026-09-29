/**
 * Máscara monetária: digita centavos primeiro, depois reais.
 * Progressão: 00,0x → 00,xx → 0x,xx → xx,xx → x.xxx,xx
 */
function formatDigitsAsMoney(digits: string): string {
  const capped = digits.replace(/\D/g, '').slice(0, 15);
  if (!capped) return '';

  const padded = capped.length < 4 ? capped.padStart(4, '0') : capped;
  const centPart = padded.slice(-2);
  const intRaw = padded.slice(0, -2);
  const intPart = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${intPart},${centPart}`;
}

/** Extrai só dígitos e formata (centavos à direita). */
export function sanitizeValorInput(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // Remove zeros à esquerda só para não travar em 000…; o padStart cuida da exibição.
  const meaningful = digits.replace(/^0+(?=\d)/, '') || '0';
  return formatDigitsAsMoney(meaningful);
}

/** Número → máscara R$ 00,00 (para preencher inputs). */
export function valorToMaskedInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  const cents = Math.round(Number(n) * 100);
  return formatDigitsAsMoney(String(Math.max(0, cents)));
}

/** Converte string mascarada (R$ 1.234,56 / 00,05) para número. */
export function parseValorInput(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const cleaned = s
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!cleaned || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatMoneyBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
