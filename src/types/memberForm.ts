/**
 * Estado do formulário de cadastro de Orisás (espelha colunas de `cadastro_orixas` após migração).
 * Mantido num ficheiro à parte para evitar dependência circular entre hook e componentes.
 */
export type CadastroFormState = {
  orixa_cabeca_id: string;
  qualidade_cabeca_id: string;
  orixa_corpo_id: string;
  qualidade_corpo_id: string;
  orixa_passagem_id: string;
  qualidade_passagem_id: string;
  orixa_saida_id: string;
  qualidade_saida_id: string;
  orixa_cabeca_reza: string;
  orixa_corpo_reza: string;
  orixa_passagem_reza: string;
  orixa_saida_reza: string;
  digina_cabeca: string;
  data_feitura_bori: string;
  digina_corpo: string;
  digina_passagem: string;
  digina_saida: string;
  sobrenome_orisa_cabeca_id: string;
  sobrenome_orisa_corpo_id: string;
  sobrenome_orisa_passagem_id: string;
  sobrenome_orisa_saida_id: string;
};

export const emptyCadastro = (): CadastroFormState => ({
  orixa_cabeca_id: '',
  qualidade_cabeca_id: '',
  orixa_corpo_id: '',
  qualidade_corpo_id: '',
  orixa_passagem_id: '',
  qualidade_passagem_id: '',
  orixa_saida_id: '',
  qualidade_saida_id: '',
  orixa_cabeca_reza: '',
  orixa_corpo_reza: '',
  orixa_passagem_reza: '',
  orixa_saida_reza: '',
  digina_cabeca: '',
  data_feitura_bori: '',
  digina_corpo: '',
  digina_passagem: '',
  digina_saida: '',
  sobrenome_orisa_cabeca_id: '',
  sobrenome_orisa_corpo_id: '',
  sobrenome_orisa_passagem_id: '',
  sobrenome_orisa_saida_id: '',
});
