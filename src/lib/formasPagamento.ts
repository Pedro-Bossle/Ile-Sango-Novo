/** Formas de pagamento usadas em cobranças, mensalidades e caixa. */
export const FORMAS_PAGAMENTO = [
  { value: 'Pix', label: 'Pix' },
  { value: 'Dinheiro', label: 'Dinheiro' },
  { value: 'Cartão', label: 'Cartão' },
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]['value'];

export const FORMA_PAGAMENTO_PADRAO: FormaPagamento = 'Pix';

/** Descrição padrão no fluxo de caixa: Membro - Descrição (forma fica em forma_pagamento). */
export function descricaoPagamentoCaixa(
  _forma: string | null | undefined,
  membro: string | null | undefined,
  descricao: string | null | undefined,
): string {
  const nome = (membro ?? '').trim() || 'Membro';
  const detalhe = (descricao ?? '').trim() || '—';
  return `${nome} - ${detalhe}`;
}
