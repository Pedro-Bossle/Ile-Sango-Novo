/**
 * Normaliza texto para busca: minúsculas + sem diacríticos.
 * Ex.: "Sàngó" → "sango", "José" → "jose"
 */
export function foldSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** True se `haystack` contém `needle` ignorando acentos e maiúsculas. */
export function matchesSearch(
  haystack: string | null | undefined,
  needle: string | null | undefined,
): boolean {
  const q = foldSearchText(needle).trim();
  if (!q) return true;
  return foldSearchText(haystack).includes(q);
}

/** Junta campos e testa se a busca casa (útil em filtros de lista). */
export function matchesSearchFields(
  needle: string | null | undefined,
  ...fields: Array<string | null | undefined>
): boolean {
  const q = foldSearchText(needle).trim();
  if (!q) return true;
  const blob = fields.map((f) => foldSearchText(f)).join(' ');
  return blob.includes(q);
}
