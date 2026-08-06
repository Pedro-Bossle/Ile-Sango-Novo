const STORAGE_KEY = 'dash_enderecos_padrao';
export const ENDERECO_EVENTO_PADRAO = 'R. Visc. de Pelotas, 2576 - Pio X, Caxias do Sul - RS, 95034385';

function uniqueList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function loadEnderecosPadrao(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [ENDERECO_EVENTO_PADRAO];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [ENDERECO_EVENTO_PADRAO];
    const list = uniqueList(parsed.map(String));
    return list.length > 0 ? list : [ENDERECO_EVENTO_PADRAO];
  } catch {
    return [ENDERECO_EVENTO_PADRAO];
  }
}

export function saveEnderecosPadrao(list: string[]): string[] {
  const cleaned = uniqueList(list);
  const finalList = cleaned.length > 0 ? cleaned : [ENDERECO_EVENTO_PADRAO];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalList));
  } catch {
    /* ignore */
  }
  return finalList;
}

export function filtrarEnderecosPadrao(list: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter((item) => item.toLowerCase().includes(q));
}
