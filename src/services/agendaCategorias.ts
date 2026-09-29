import { supabase } from '../lib/supabaseClient';

export type AgendaCategoria = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  deleted_at: string | null;
};

const DEFAULTS: Array<Pick<AgendaCategoria, 'nome' | 'cor' | 'ordem'>> = [
  { nome: 'Atendimento', cor: '#2e5a44', ordem: 1 },
  { nome: 'Compromisso', cor: '#1f4a7a', ordem: 2 },
  { nome: 'Outro', cor: '#6b7280', ordem: 3 },
];

export function defaultAgendaCategorias(): AgendaCategoria[] {
  return DEFAULTS.map((d, i) => ({
    id: `local-${i}`,
    nome: d.nome,
    cor: d.cor,
    ordem: d.ordem,
    ativo: true,
    deleted_at: null,
  }));
}
export async function fetchAgendaCategorias(): Promise<AgendaCategoria[]> {
  const { data, error } = await supabase
    .from('agenda_categorias')
    .select('id, nome, cor, ordem, ativo, deleted_at')
    .is('deleted_at', null)
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (error) {
    // Tabela ainda não migrada — fallback local
    if (/agenda_categorias|schema cache|does not exist/i.test(error.message)) {
      return defaultAgendaCategorias();
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AgendaCategoria[];
  return rows.length ? rows : defaultAgendaCategorias();
}

export async function createAgendaCategoria(input: { nome: string; cor: string }): Promise<void> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('Informe o nome da categoria.');
  const cor = normalizeHex(input.cor);
  const atuais = await fetchAgendaCategorias();
  const nextOrdem = atuais.reduce((m, c) => Math.max(m, Number(c.ordem) || 0), 0) + 1;
  const { error } = await supabase.from('agenda_categorias').insert({
    nome,
    cor,
    ordem: nextOrdem,
    ativo: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateAgendaCategoria(
  id: string,
  patch: { nome?: string; cor?: string },
): Promise<void> {
  if (id.startsWith('local-')) {
    throw new Error('Rode a migration de categorias da Agenda no Supabase para editar.');
  }
  const next: Record<string, string> = { updated_at: new Date().toISOString() };
  if (patch.nome != null) next.nome = patch.nome.trim();
  if (patch.cor != null) next.cor = normalizeHex(patch.cor);
  const { error } = await supabase.from('agenda_categorias').update(next).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function softDeleteAgendaCategoria(id: string): Promise<void> {
  if (id.startsWith('local-')) {
    throw new Error('Rode a migration de categorias da Agenda no Supabase para editar.');
  }
  const { error } = await supabase
    .from('agenda_categorias')
    .update({ deleted_at: new Date().toISOString(), ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Persiste a ordem após drag-and-drop. */
export async function reorderAgendaCategorias(orderedIds: Array<string | number>): Promise<void> {
  const ids = orderedIds.map(String);
  if (ids.some((id) => id.startsWith('local-'))) {
    throw new Error('Rode a migration de categorias da Agenda no Supabase para reordenar.');
  }
  const now = new Date().toISOString();
  const results = await Promise.all(
    ids.map((id, i) =>
      supabase.from('agenda_categorias').update({ ordem: i + 1, updated_at: now }).eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export function normalizeHex(raw: string): string {
  const t = String(raw ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return '#2e5a44';
}

/** Cor de texto legível sobre o fundo da categoria. */
export function contrasteSobreCor(hex: string): string {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55 ? '#1a1512' : '#ffffff';
}

export function corCategoriaPorTipo(
  tipo: string | null | undefined,
  cats: AgendaCategoria[],
  fallback = '#2e5a44',
): string {
  const key = String(tipo ?? '').trim().toLowerCase();
  if (!key) return fallback;
  const hit = cats.find((c) => c.nome.trim().toLowerCase() === key);
  return hit ? normalizeHex(hit.cor) : fallback;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Estilo da barra do calendário a partir da cor da categoria. */
export function estiloBarraCategoria(hex: string): { background: string; color: string; borderLeft: string } {
  const cor = normalizeHex(hex);
  const textOnSolid = contrasteSobreCor(cor);
  return {
    background: hexToRgba(cor, 0.22),
    color: textOnSolid === '#ffffff' ? cor : '#1a1512',
    borderLeft: `3px solid ${cor}`,
  };
}
