import type { CalendarioItem } from '../components/dashboard/eventos/EventosCalendar';

/** Chave especial para incluir eventos públicos do site na cópia rápida. */
export const COPIA_RAPIDA_EVENTOS_KEY = '__eventos_site__';

function mesAnoLabel(viewMonth: Date): string {
  const mes = viewMonth.toLocaleDateString('pt-BR', { month: 'long' });
  const ano = viewMonth.getFullYear();
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${mesCap}-${ano}`;
}

function ddMm(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).slice(0, 10));
  if (!m) return String(iso).slice(0, 10);
  return `${m[3]}/${m[2]}`;
}

function itemNoMes(it: CalendarioItem, viewMonth: Date): boolean {
  const iso = String(it.data).slice(0, 10);
  const [y, m] = iso.split('-').map(Number);
  return y === viewMonth.getFullYear() && m === viewMonth.getMonth() + 1;
}

function categoriaDaLinha(it: CalendarioItem): string {
  if (it.kind === 'evento') return COPIA_RAPIDA_EVENTOS_KEY;
  return String(it.tipo || 'Outro').trim() || 'Outro';
}

/** Monta texto para área de transferência a partir das atividades do mês. */
export function buildCopiaRapidaAgenda(
  items: CalendarioItem[],
  viewMonth: Date,
  categoriasSelecionadas: Set<string>,
): string {
  const seen = new Set<string>();
  const linhas: CalendarioItem[] = [];

  for (const it of items) {
    if (!itemNoMes(it, viewMonth)) continue;
    const cat = categoriaDaLinha(it);
    if (!categoriasSelecionadas.has(cat)) continue;
    const key = `${it.kind}:${it.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    linhas.push(it);
  }

  linhas.sort((a, b) => {
    const d = String(a.data).localeCompare(String(b.data));
    if (d !== 0) return d;
    return String(a.hora ?? '').localeCompare(String(b.hora ?? ''));
  });

  const body = linhas.map((it) => {
    const partes = [`${ddMm(it.data)} - ${it.nome}`];
    const hora = it.hora ? String(it.hora).slice(0, 5) : '';
    if (hora) {
      const hh = hora.slice(0, 2);
      partes.push(`A partir das ${hh}hs`);
    }
    const local = String(it.local ?? '').trim();
    if (local) partes.push(local);
    return partes.join(' - ');
  });

  const blocosAtividades = body.length
    ? body.join('\n\n')
    : '(Nenhuma atividade neste mês com as categorias selecionadas.)';

  return [
    `Atividades de ${mesAnoLabel(viewMonth)}`,
    '',
    blocosAtividades,
    '',
    'Contamos com a presença de todos os filhos da casa!',
    'Axé!',
  ].join('\n');
}
