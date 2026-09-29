const SIGNOS: { nome: string; start: [number, number]; end: [number, number] }[] = [
  { nome: 'Capricórnio', start: [12, 22], end: [1, 19] },
  { nome: 'Aquário', start: [1, 20], end: [2, 18] },
  { nome: 'Peixes', start: [2, 19], end: [3, 20] },
  { nome: 'Áries', start: [3, 21], end: [4, 19] },
  { nome: 'Touro', start: [4, 20], end: [5, 20] },
  { nome: 'Gêmeos', start: [5, 21], end: [6, 20] },
  { nome: 'Câncer', start: [6, 21], end: [7, 22] },
  { nome: 'Leão', start: [7, 23], end: [8, 22] },
  { nome: 'Virgem', start: [8, 23], end: [9, 22] },
  { nome: 'Libra', start: [9, 23], end: [10, 22] },
  { nome: 'Escorpião', start: [10, 23], end: [11, 21] },
  { nome: 'Sagitário', start: [11, 22], end: [12, 21] },
];

function inRange(m: number, d: number, start: [number, number], end: [number, number]): boolean {
  const v = m * 100 + d;
  const s = start[0] * 100 + start[1];
  const e = end[0] * 100 + end[1];
  if (s <= e) return v >= s && v <= e;
  return v >= s || v <= e;
}

/** Calcula signo a partir de YYYY-MM-DD. */
export function signoFromDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return '';
  const [, mm, dd] = isoDate.slice(0, 10).split('-').map(Number);
  for (const s of SIGNOS) {
    if (inRange(mm, dd, s.start, s.end)) return s.nome;
  }
  return '';
}

export const SIGNOS_LISTA = [
  'Áries',
  'Touro',
  'Gêmeos',
  'Câncer',
  'Leão',
  'Virgem',
  'Libra',
  'Escorpião',
  'Sagitário',
  'Capricórnio',
  'Aquário',
  'Peixes',
];
