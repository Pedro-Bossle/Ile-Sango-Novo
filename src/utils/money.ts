/** Aceita só dígitos e no máximo um separador decimal (, ou .), com até 2 casas. */
export function sanitizeValorInput(raw: string): string {
  const cleaned = String(raw ?? '').replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const sepMatch = cleaned.match(/[.,]/);
  if (!sepMatch || sepMatch.index == null) return cleaned;

  const sep = sepMatch[0];
  const idx = sepMatch.index;
  const intPart = cleaned.slice(0, idx).replace(/[.,]/g, '');
  const fracPart = cleaned
    .slice(idx + 1)
    .replace(/[.,]/g, '')
    .slice(0, 2);
  return fracPart.length ? `${intPart}${sep}${fracPart}` : `${intPart}${sep}`;
}

/** Converte string de valor (BR ou US) para número. */
export function parseValorInput(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatMoneyBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
