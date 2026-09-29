/** Primeiro nome civil (antes do 1º espaço). */
export function primeiroNome(nomeCompleto: string | null | undefined): string {
  const t = String(nomeCompleto ?? '').trim();
  if (!t) return '';
  return t.split(/\s+/)[0] ?? '';
}

/** Orixá de cabeça + qualidade (ex.: "Xangô Aganju"). */
export function orixaCabecaLabel(
  orixaNome: string | null | undefined,
  qualidadeNome: string | null | undefined,
): string {
  const o = String(orixaNome ?? '').trim();
  const q = String(qualidadeNome ?? '').trim();
  if (o && q) return `${o} ${q}`;
  return o || q;
}

export type SaudacaoFilhoSantoOpts = {
  nome: string | null | undefined;
  orixaCabeca?: string | null;
  qualidadeCabeca?: string | null;
  /** Pontuação final. Default: `!` */
  fim?: '!' | ',' | '';
};

/**
 * Saudação padrão para filhos de santo:
 * `Olá {1º nome} d'{Orixá de cabeça} {qualidade}!`
 * Sem orixá cadastrado, cai para `Olá {1º nome}!`.
 */
export function saudacaoFilhoSanto(opts: SaudacaoFilhoSantoOpts): string {
  const first = primeiroNome(opts.nome);
  const orixa = orixaCabecaLabel(opts.orixaCabeca, opts.qualidadeCabeca);
  const fim = opts.fim ?? '!';
  if (first && orixa) return `Olá ${first} d'${orixa}${fim}`;
  if (first) return `Olá ${first}${fim}`;
  return `Olá${fim || '!'}`;
}
