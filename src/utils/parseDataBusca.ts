/** Converte texto de data em Date local (só dia), ou null se não reconhecer. */
const MESES_PT: Record<string, number> = {
  janeiro: 0,
  jan: 0,
  fevereiro: 1,
  fev: 1,
  marco: 2,
  março: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  maio: 4,
  mai: 4,
  junho: 5,
  jun: 5,
  julho: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  setembro: 8,
  set: 8,
  outubro: 9,
  out: 9,
  novembro: 10,
  nov: 10,
  dezembro: 11,
  dez: 11,
};

function asLocalDate(y: number, m: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Aceita: 20/10/2026, 20-10-2026, 2026-10-20,
 * "20 de outubro de 2026", "20 out 2026", "20 outubro 2026".
 */
export function parseDataBusca(raw: string): Date | null {
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return asLocalDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]) - 1;
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    return asLocalDate(y, m, d);
  }

  const longo = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-zç]+)\s*(?:de\s+)?(\d{4})$/i);
  if (longo) {
    const mesKey = longo[2].normalize('NFD').replace(/\p{M}/gu, '');
    const m = MESES_PT[mesKey];
    if (m == null) return null;
    return asLocalDate(Number(longo[3]), m, Number(longo[1]));
  }

  return null;
}

export function toIsoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
