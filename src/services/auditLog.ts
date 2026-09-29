import { supabase } from '../lib/supabaseClient';

export type AuditChange = {
  campo: string;
  antigo: string | null;
  novo: string | null;
};

export type AuditDiff = {
  /** Nome amigável da tela (ex.: "Fluxo de caixa"). */
  tela: string;
  changes: AuditChange[];
};

export async function writeAuditLog(input: {
  action: 'create' | 'update' | 'delete' | 'restore';
  entity: string;
  entity_id?: string | number | null;
  resumo?: string;
  diff?: AuditDiff | null;
}): Promise<void> {
  try {
    const { data: sessao } = await supabase.auth.getSession();
    const user = sessao?.session?.user;
    await supabase.from('audit_log').insert({
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id != null ? String(input.entity_id) : null,
      resumo: input.resumo ?? null,
      diff: input.diff ?? null,
    });
  } catch {
    /* best-effort */
  }
}

export type AuditRow = {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  resumo: string | null;
  diff: AuditDiff | null;
  created_at: string;
};

const ENTITY_LABELS: Record<string, string> = {
  pessoas: 'membro',
  profiles: 'permissões de acesso',
  cobrancas: 'cobrança',
  mensalidades: 'mensalidade',
  clientes: 'cliente',
  caixa_lancamentos: 'lançamento do caixa',
  configuracoes_terreiro: 'dados do Ilê',
  orcamentos: 'venda',
  agenda: 'compromisso',
  eventos: 'evento',
  cliente_visitas: 'visita',
};

const ENTITY_TELA: Record<string, string> = {
  pessoas: 'Membros',
  profiles: 'Acessos de Admin',
  cobrancas: 'Cobranças',
  mensalidades: 'Mensalidades',
  clientes: 'Clientes',
  caixa_lancamentos: 'Fluxo de caixa',
  configuracoes_terreiro: 'Dados do Ilê',
  orcamentos: 'Vendas (ficha do cliente)',
  agenda: 'Agenda (compromissos)',
  eventos: 'Agenda (eventos)',
  cliente_visitas: 'Visitas de atendimento',
};

export function auditTela(entity: string, diff?: AuditDiff | null): string {
  return diff?.tela || ENTITY_TELA[entity] || entity.replace(/_/g, ' ');
}

export function formatAuditValor(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : null;
  }
  if (typeof v === 'string') {
    if (v.startsWith('data:image')) return '(imagem)';
    return v;
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Compara before/after e monta lista campo a campo (só o que mudou). */
export function buildAuditDiff(
  tela: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fieldLabels: Record<string, string>,
): AuditDiff {
  const keys = Object.keys(fieldLabels);
  const changes: AuditChange[] = [];
  for (const key of keys) {
    const antigo = formatAuditValor(before?.[key]);
    const novo = formatAuditValor(after?.[key]);
    if (antigo === novo) continue;
    changes.push({ campo: fieldLabels[key], antigo, novo });
  }
  return { tela, changes };
}

/** Frase curta em português para leigos (ex.: "Alterou cobrança: Maria"). */
export function formatAuditOQueAconteceu(row: Pick<AuditRow, 'action' | 'entity' | 'resumo'>): string {
  const entity = ENTITY_LABELS[row.entity] ?? row.entity.replace(/_/g, ' ');
  const detalhe = row.resumo?.trim();

  if (row.entity === 'pessoas' && row.action === 'delete') {
    return detalhe ? `Inativou o membro ${detalhe}` : 'Inativou um membro';
  }
  if (row.entity === 'pessoas' && row.action === 'restore') {
    return detalhe ? `Restaurou o membro ${detalhe}` : 'Restaurou um membro';
  }
  if (row.entity === 'profiles' && row.action === 'update') {
    return detalhe ? `Alterou as permissões de ${detalhe}` : 'Alterou permissões de acesso';
  }
  if (row.entity === 'configuracoes_terreiro') {
    return 'Alterou os dados do Ilê';
  }

  const verbo =
    row.action === 'create'
      ? 'Criou'
      : row.action === 'update'
        ? 'Alterou'
        : row.action === 'delete'
          ? 'Excluiu'
          : row.action === 'restore'
            ? 'Restaurou'
            : row.action;

  if (detalhe) return `${verbo} ${entity}: ${detalhe}`;
  return `${verbo} ${entity}`;
}

export function formatAuditAcao(action: string): string {
  switch (action) {
    case 'create':
      return 'Criação';
    case 'update':
      return 'Alteração';
    case 'delete':
      return 'Exclusão / inativação';
    case 'restore':
      return 'Restauração';
    default:
      return action;
  }
}

export function formatAuditQuando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAuditPreview(diff: AuditDiff | null | undefined): string | null {
  const changes = diff?.changes;
  if (!changes?.length) return null;
  if (changes.length === 1) {
    const c = changes[0];
    return `${c.antigo ?? '—'} → ${c.novo ?? '—'}`;
  }
  const first = changes[0];
  return `${first.antigo ?? '—'} → ${first.novo ?? '—'} (+${changes.length - 1})`;
}

export function parseAuditDiff(raw: unknown): AuditDiff | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as { tela?: unknown; changes?: unknown };
  if (!Array.isArray(d.changes)) return null;
  return {
    tela: typeof d.tela === 'string' ? d.tela : '',
    changes: d.changes
      .filter((c): c is AuditChange => Boolean(c) && typeof c === 'object')
      .map((c) => ({
        campo: String((c as AuditChange).campo ?? ''),
        antigo: (c as AuditChange).antigo ?? null,
        novo: (c as AuditChange).novo ?? null,
      })),
  };
}

/** Retenção da auditoria: registros mais antigos são ocultados e podem ser purgados. */
export const AUDIT_RETENTION_DAYS = 90;

function auditRetentionIso(days = AUDIT_RETENTION_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Remove registros fora do lifespan (RPC no banco). Falhas são ignoradas. */
export async function purgeExpiredAuditLog(days = AUDIT_RETENTION_DAYS): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('purge_audit_log_expirado', { dias: days });
    if (error) return 0;
    return typeof data === 'number' ? data : Number(data) || 0;
  } catch {
    return 0;
  }
}

export async function fetchAuditLog(limit = 5000): Promise<AuditRow[]> {
  const since = auditRetentionIso();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_email, action, entity, entity_id, resumo, diff, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as Omit<AuditRow, 'diff'>),
    diff: parseAuditDiff((row as { diff?: unknown }).diff),
  }));
}
