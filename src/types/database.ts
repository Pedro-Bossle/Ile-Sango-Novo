export type UUID = string;



export interface Pessoa {

  id: UUID;

  nome: string;

  data_nascimento: string | null;

  contato: string | null;

  email: string | null;

  signo: string | null;

  obs: string | null;

}



/** Registro na tabela `orixas` (nome interno da tabela mantido) */

export interface Orixa {

  id: UUID;

  nome: string;

}



/** `id` segue o tipo da coluna em `qualidades` (em muitas bases é INTEGER). */
export interface Qualidade {
  id: number | string;
  nome: string;
  orixa_id: UUID;
}



/**

 * Linha em `cadastro_orixas` — após migração, caminho→passagem e passagem→saída.

 * Colunas internas permanecem em snake_case alinhadas ao Supabase.

 */

export interface CadastroOrixas {

  pessoa_id: UUID;

  orixa_cabeca_id: UUID | null;

  qualidade_cabeca_id: UUID | null;

  orixa_corpo_id: UUID | null;

  qualidade_corpo_id: UUID | null;

  orixa_passagem_id: UUID | null;

  qualidade_passagem_id: UUID | null;

  orixa_saida_id: UUID | null;

  qualidade_saida_id: UUID | null;

  orixa_cabeca_reza: string | null;

  orixa_corpo_reza: string | null;

  orixa_passagem_reza: string | null;

  orixa_saida_reza: string | null;

  digina_cabeca?: string | null;

  data_feitura_bori?: string | null;

  digina_corpo?: string | null;

  digina_passagem?: string | null;

  digina_saida?: string | null;

  sobrenome_orisa_cabeca?: UUID | null;

  sobrenome_orisa_corpo?: UUID | null;

  sobrenome_orisa_passagem?: UUID | null;

  sobrenome_orisa_saida?: UUID | null;

}



export interface Orumale {

  id: UUID;

  pessoa_id: UUID;

  orixa_id: UUID | null;

  qualidade_id: UUID | null;

  sobrenome_orisa_id?: UUID | null;

  digina: string | null;

  data_feitura: string | null;

}



export interface Exu {

  id: UUID;

  pessoa_id: UUID;

  exu_nome: string | null;

  exu_ordem: number | null;

  data_feitura: string | null;

}



/** Registros da seção Umbanda (tabela `umbanda`), espelhando o modelo de Exu */

export interface Umbanda {

  id: UUID;

  pessoa_id: UUID;

  umbanda_nome: string | null;

  umbanda_ordem: number | null;

  data_feitura: string | null;

}



export type CobrancaTipo = 'mensalidade' | 'obrigacao' | 'outros';



/** Cobrança — `pessoa_id` ou `membro_id` (legado); `valor` legado vs `valor_total` + parcelas */

export interface Cobranca {

  /** Pode ser bigint na BD (número) ou string */

  id: string | number;

  valor?: string | number | null;

  valor_total?: string | number | null;

  valor_pago?: string | number | null;

  valor_saldo?: string | number | null;

  tipo?: CobrancaTipo | string | null;

  vencimento: string | null;

  descricao: string | null;

  membro: string | null;

  pessoa_id?: UUID | null;

  membro_id?: UUID | null;

  created_at?: string | null;

  deleted_at?: string | null;

}



/** Histórico em `cobranca_pagamentos` (FK cobranca_id = bigint em muitas bases) */

export interface PagamentoHistorico {

  id: UUID;

  cobranca_id: string | number;

  pessoa_id: UUID;

  valor: string | number;

  data_pagamento: string;

  forma_pagamento?: string | null;

  obs: string | null;

  created_at?: string | null;

}



export function resolvePessoaIdCobranca(c: Cobranca): UUID | null {

  return (c.pessoa_id ?? c.membro_id ?? null) as UUID | null;

}


