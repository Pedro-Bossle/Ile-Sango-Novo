/** Recursos e permissões CRUD (+ send / excel / pagar / restaurar). */

export type PermFlags = {
  c?: boolean;
  r?: boolean;
  u?: boolean;
  d?: boolean;
  s?: boolean;
  excel?: boolean;
  pagar?: boolean;
};

export type ResourceKey =
  | 'visao_geral'
  | 'eventos'
  | 'catalogo'
  | 'membros'
  | 'cobrancas'
  | 'caixa'
  | 'clientes'
  | 'orcamentos'
  | 'agenda'
  | 'dados_ile'
  | 'orixas'
  | 'acessos'
  | 'restaurar';

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  visao_geral: 'Visão geral',
  eventos: 'Agenda — eventos da casa',
  catalogo: 'Catálogo',
  membros: 'Membros',
  cobrancas: 'Obrigações',
  caixa: 'Fluxo de caixa',
  clientes: 'Clientes',
  orcamentos: 'Orçamentos',
  agenda: 'Agenda — compromissos',
  dados_ile: 'Dados do Ilê',
  orixas: 'Orixás',
  acessos: 'Acessos de Admin',
  restaurar: 'Ver / restaurar excluídos',
};

export const ALL_RESOURCES = Object.keys(RESOURCE_LABELS) as ResourceKey[];

/** Ações aplicáveis por tela (evita opções sem sentido, ex.: Enviar em Dados do Ilê). */
export const RESOURCE_ACTIONS: Record<ResourceKey, (keyof PermFlags)[]> = {
  visao_geral: ['r'],
  eventos: ['c', 'r', 'u', 'd'],
  catalogo: ['c', 'r', 'u', 'd'],
  membros: ['c', 'r', 'u', 'd'],
  cobrancas: ['c', 'r', 'u', 'd', 's'],
  caixa: ['c', 'r', 'u', 'd'],
  clientes: ['c', 'r', 'u', 'd', 's'],
  orcamentos: ['c', 'r', 'u', 'd', 's'],
  agenda: ['c', 'r', 'u', 'd', 's'],
  dados_ile: ['r', 'u'],
  orixas: ['c', 'r', 'u', 'd'],
  acessos: ['c', 'r', 'u', 'd'],
  restaurar: ['r', 'u'],
};

export function resourceAllowsAction(resource: ResourceKey, action: keyof PermFlags): boolean {
  return RESOURCE_ACTIONS[resource]?.includes(action) ?? false;
}

export type PermissionsMap = Partial<Record<ResourceKey, PermFlags>>;

export function emptyPermissions(): PermissionsMap {
  const out: PermissionsMap = {};
  for (const key of ALL_RESOURCES) {
    out[key] = { c: false, r: false, u: false, d: false, s: false };
  }
  return out;
}

export function fullPermissions(): PermissionsMap {
  return {
    visao_geral: { c: false, r: true, u: false, d: false, s: false },
    eventos: { c: true, r: true, u: true, d: true, s: false },
    catalogo: { c: true, r: true, u: true, d: true, s: false },
    membros: { c: true, r: true, u: true, d: true, s: false, excel: true },
    cobrancas: { c: true, r: true, u: true, d: true, s: true, pagar: true },
    caixa: { c: true, r: true, u: true, d: true, s: false },
    clientes: { c: true, r: true, u: true, d: true, s: true },
    orcamentos: { c: true, r: true, u: true, d: true, s: true },
    agenda: { c: true, r: true, u: true, d: true, s: true },
    dados_ile: { c: false, r: true, u: true, d: false, s: false },
    orixas: { c: true, r: true, u: true, d: true, s: false },
    acessos: { c: true, r: true, u: true, d: true, s: false },
    restaurar: { c: false, r: true, u: true, d: false, s: false },
  };
}

/** Presets que só preenchem checkboxes. */
export const PERMISSION_PRESETS: Record<string, PermissionsMap> = {
  auxiliar_cobrancas: {
    ...emptyPermissions(),
    visao_geral: { r: true },
    membros: { r: true },
    cobrancas: { c: true, r: true, u: true, d: true, s: true, pagar: true },
    caixa: { c: true, r: true, u: true, d: true },
  },
  auxiliar_eventos: {
    ...emptyPermissions(),
    visao_geral: { r: true },
    eventos: { c: true, r: true, u: true, d: true },
    catalogo: { r: true },
  },
  auxiliar_atendimento: {
    ...emptyPermissions(),
    visao_geral: { r: true },
    clientes: { c: true, r: true, u: true, d: true, s: true },
    orcamentos: { c: true, r: true, u: true, d: true, s: true },
    agenda: { c: true, r: true, u: true, d: true, s: true },
    catalogo: { r: true },
  },
  auxiliar_leitura: {
    ...emptyPermissions(),
    visao_geral: { r: true },
    eventos: { r: true },
    catalogo: { r: true },
    membros: { r: true },
    cobrancas: { r: true },
    caixa: { r: true },
    clientes: { r: true },
    orcamentos: { r: true },
    agenda: { r: true },
  },
};

export type PermAction = 'c' | 'r' | 'u' | 'd' | 's' | 'excel' | 'pagar';

export function can(
  isAdmin: boolean,
  permissions: PermissionsMap | null | undefined,
  resource: ResourceKey,
  action: PermAction,
): boolean {
  if (isAdmin) return true;
  const flags = permissions?.[resource];
  if (!flags) return false;
  return Boolean(flags[action]);
}
