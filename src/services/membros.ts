import { supabase } from '../lib/supabaseClient';
import { somenteDigitosTelefone } from '../utils/telefone';

import type { CadastroOrixas, Exu, Orumale, Orixa, Pessoa, Umbanda, UUID } from '../types/database';



export type PessoaListaItem = Pessoa & {

  orixa_cabeca_nome: string | null;

};



export type PessoaCompleta = {

  pessoa: Pessoa;

  cadastro: CadastroOrixas | null;

  orumale: Orumale[];

  exus: Exu[];

  umbanda: Umbanda[];

};



export type MemberFormPayload = {

  pessoa: Omit<Pessoa, 'id'> & { id: UUID | null };

  cadastro: {

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

  orumale: Array<{

    id?: string | null;

    orixa_id: string;

    qualidade_id: string;

    sobrenome_orisa_id: string;

    digina: string;

    data_feitura: string;

  }>;

  exus: Array<{

    exu_nome: string;

    exu_ordem: number;

    data_feitura: string;

  }>;

  umbanda: Array<{

    umbanda_nome: string;

    umbanda_ordem: number;

    data_feitura: string;

  }>;

};



async function mapOrixaNomes(ids: (string | null)[]): Promise<Map<string, string>> {

  const clean = [...new Set(ids.filter(Boolean))] as string[];

  if (clean.length === 0) return new Map();

  const { data, error } = await supabase.from('orixas').select('id, nome').in('id', clean);

  if (error) throw new Error(error.message);

  return new Map((data as Orixa[]).map((o) => [o.id, o.nome]));

}



export async function fetchPessoasLista(): Promise<PessoaListaItem[]> {

  const { data: pessoas, error: e1 } = await supabase

    .from('pessoas')

    .select('id, nome, data_nascimento, contato, email, signo, obs')

    .order('nome', { ascending: true });

  if (e1) throw new Error(e1.message);

  const list = (pessoas ?? []) as Pessoa[];

  if (list.length === 0) return [];



  const ids = list.map((p) => p.id);

  const { data: cadastros, error: e2 } = await supabase

    .from('cadastro_orixas')

    .select(

      'pessoa_id, orixa_cabeca_id, qualidade_cabeca_id, orixa_corpo_id, qualidade_corpo_id, orixa_passagem_id, qualidade_passagem_id, orixa_saida_id, qualidade_saida_id',

    )

    .in('pessoa_id', ids);

  if (e2) throw new Error(e2.message);

  const cabecaIds = (cadastros ?? []).map((c: { orixa_cabeca_id?: string | null }) => c.orixa_cabeca_id ?? null);

  const nomeMap = await mapOrixaNomes(cabecaIds);

  const cadByPessoa = new Map<string, { orixa_cabeca_id?: string | null }>();

  for (const c of cadastros ?? []) {

    const row = c as { pessoa_id: string; orixa_cabeca_id?: string | null };

    cadByPessoa.set(row.pessoa_id, row);

  }

  return list.map((p) => {

    const co = cadByPessoa.get(p.id);

    const oid = co?.orixa_cabeca_id ?? null;

    return {

      ...p,

      orixa_cabeca_nome: oid ? nomeMap.get(oid) ?? null : null,

    };

  });

}



export async function fetchPessoaCompleta(id: UUID): Promise<PessoaCompleta> {

  const [

    { data: pessoa, error: e1 },

    { data: cadastro, error: e2 },

    { data: orumale, error: e3 },

    { data: exus, error: e4 },

    { data: umbanda, error: e5 },

  ] = await Promise.all([

    supabase.from('pessoas').select('id, nome, data_nascimento, contato, email, signo, obs').eq('id', id).maybeSingle(),

    supabase.from('cadastro_orixas').select('*').eq('pessoa_id', id).maybeSingle(),

    supabase
      .from('orumale')
      .select('id, pessoa_id, orixa_id, qualidade_id, sobrenome_orisa_id, digina, data_feitura')
      .eq('pessoa_id', id),

    supabase.from('exus').select('id, pessoa_id, exu_nome, exu_ordem, data_feitura').eq('pessoa_id', id).order('exu_ordem', { ascending: true }),

    supabase.from('umbanda').select('id, pessoa_id, umbanda_nome, umbanda_ordem, data_feitura').eq('pessoa_id', id).order('umbanda_ordem', { ascending: true }),

  ]);

  if (e1) throw new Error(e1.message);

  if (e2) throw new Error(e2.message);

  if (e3) throw new Error(e3.message);

  if (e4) throw new Error(e4.message);

  if (e5) throw new Error(e5.message);

  if (!pessoa) throw new Error('Pessoa não encontrada.');

  return {

    pessoa: pessoa as Pessoa,

    cadastro: (cadastro as CadastroOrixas | null) ?? null,

    orumale: (orumale ?? []) as Orumale[],

    exus: (exus ?? []) as Exu[],

    umbanda: (umbanda ?? []) as Umbanda[],

  };

}



/** Aceita valores vindos do formulário ou do Supabase (null, número, etc.) */

function nullIfEmpty(s: unknown): string | null {

  if (s == null) return null;

  const t = String(s).trim();

  return t.length ? t : null;

}



function hasText(v: unknown): boolean {

  return Boolean(nullIfEmpty(v));

}



export async function savePessoaCompleta(payload: MemberFormPayload): Promise<UUID> {

  const { pessoa, cadastro, orumale, exus, umbanda } = payload;

  const pessoaRow = {

    nome: nullIfEmpty(pessoa.nome) ?? '',

    data_nascimento: nullIfEmpty(pessoa.data_nascimento),

    contato: nullIfEmpty(pessoa.contato),

    email: nullIfEmpty(pessoa.email),

    signo: nullIfEmpty(pessoa.signo),

    obs: nullIfEmpty(pessoa.obs),

  };

  // Persistência padronizada: telefone sempre armazenado sem máscara.
  const contatoDigits = somenteDigitosTelefone(pessoaRow.contato as string | null | undefined);
  pessoaRow.contato = contatoDigits || null;



  let pessoaId = pessoa.id;



  if (pessoaId) {

    const { error } = await supabase.from('pessoas').update(pessoaRow).eq('id', pessoaId);

    if (error) throw new Error(error.message);

  } else {

    const { data, error } = await supabase.from('pessoas').insert(pessoaRow).select('id').single();

    if (error) throw new Error(error.message);

    pessoaId = (data as { id: string }).id;

  }



  const temAlgumOrixa =

    hasText(cadastro.orixa_cabeca_id) ||

    hasText(cadastro.orixa_corpo_id) ||

    hasText(cadastro.orixa_passagem_id) ||

    hasText(cadastro.orixa_saida_id);



  const temAlgumaReza =

    hasText(cadastro.orixa_cabeca_reza) ||

    hasText(cadastro.orixa_corpo_reza) ||

    hasText(cadastro.orixa_passagem_reza) ||

    hasText(cadastro.orixa_saida_reza);



  const temDiginaSobrenome =

    hasText(cadastro.digina_cabeca) ||

    hasText(cadastro.data_feitura_bori) ||

    hasText(cadastro.digina_corpo) ||

    hasText(cadastro.digina_passagem) ||

    hasText(cadastro.digina_saida) ||

    hasText(cadastro.sobrenome_orisa_cabeca_id) ||

    hasText(cadastro.sobrenome_orisa_corpo_id) ||

    hasText(cadastro.sobrenome_orisa_passagem_id) ||

    hasText(cadastro.sobrenome_orisa_saida_id);



  const temCadastroOrixas = temAlgumOrixa || temAlgumaReza || temDiginaSobrenome;



  await supabase.from('cadastro_orixas').delete().eq('pessoa_id', pessoaId);



  if (temCadastroOrixas) {

    const cadRow = {

      pessoa_id: pessoaId,

      orixa_cabeca_id: nullIfEmpty(cadastro.orixa_cabeca_id) as UUID | null,

      qualidade_cabeca_id: hasText(cadastro.orixa_cabeca_id)

        ? (nullIfEmpty(cadastro.qualidade_cabeca_id) as UUID | null)

        : null,

      orixa_corpo_id: nullIfEmpty(cadastro.orixa_corpo_id) as UUID | null,

      qualidade_corpo_id: hasText(cadastro.orixa_corpo_id)

        ? (nullIfEmpty(cadastro.qualidade_corpo_id) as UUID | null)

        : null,

      orixa_passagem_id: nullIfEmpty(cadastro.orixa_passagem_id) as UUID | null,

      qualidade_passagem_id: hasText(cadastro.orixa_passagem_id)

        ? (nullIfEmpty(cadastro.qualidade_passagem_id) as UUID | null)

        : null,

      orixa_saida_id: nullIfEmpty(cadastro.orixa_saida_id) as UUID | null,

      qualidade_saida_id: hasText(cadastro.orixa_saida_id)

        ? (nullIfEmpty(cadastro.qualidade_saida_id) as UUID | null)

        : null,

      orixa_cabeca_reza: nullIfEmpty(cadastro.orixa_cabeca_reza),

      orixa_corpo_reza: nullIfEmpty(cadastro.orixa_corpo_reza),

      orixa_passagem_reza: nullIfEmpty(cadastro.orixa_passagem_reza),

      orixa_saida_reza: nullIfEmpty(cadastro.orixa_saida_reza),

      digina_cabeca: nullIfEmpty(cadastro.digina_cabeca),

      data_feitura_bori: nullIfEmpty(cadastro.data_feitura_bori),

      digina_corpo: nullIfEmpty(cadastro.digina_corpo),

      digina_passagem: nullIfEmpty(cadastro.digina_passagem),

      digina_saida: nullIfEmpty(cadastro.digina_saida),

      sobrenome_orisa_cabeca: nullIfEmpty(cadastro.sobrenome_orisa_cabeca_id) as UUID | null,

      sobrenome_orisa_corpo: nullIfEmpty(cadastro.sobrenome_orisa_corpo_id) as UUID | null,

      sobrenome_orisa_passagem: nullIfEmpty(cadastro.sobrenome_orisa_passagem_id) as UUID | null,

      sobrenome_orisa_saida: nullIfEmpty(cadastro.sobrenome_orisa_saida_id) as UUID | null,

    };

    const { error: upCad } = await supabase.from('cadastro_orixas').insert(cadRow);

    if (upCad) throw new Error(upCad.message);

  }



  const { data: orumaleExistente, error: eOrumaleExistente } = await supabase
    .from('orumale')
    .select('id')
    .eq('pessoa_id', pessoaId);

  if (eOrumaleExistente) throw new Error(eOrumaleExistente.message);

  const idsExistentes = new Set(((orumaleExistente ?? []) as Array<{ id: string }>).map((r) => r.id));
  const idsMantidos = new Set<string>();

  for (const row of orumale) {
    if (!nullIfEmpty(row.orixa_id)) continue;

    const baseRow = {
      pessoa_id: pessoaId,
      orixa_id: row.orixa_id,
      qualidade_id: nullIfEmpty(row.qualidade_id) as UUID | null,
      sobrenome_orisa_id: nullIfEmpty(row.sobrenome_orisa_id) as UUID | null,
      digina: nullIfEmpty(row.digina),
      data_feitura: nullIfEmpty(row.data_feitura),
    };

    const rowId = nullIfEmpty(row.id);
    if (rowId) {
      const { error: upOrumale } = await supabase.from('orumale').update(baseRow).eq('id', rowId).eq('pessoa_id', pessoaId);
      if (upOrumale) throw new Error(upOrumale.message);
      idsMantidos.add(rowId);
      continue;
    }

    const { data: novoOrumale, error: insOrumale } = await supabase.from('orumale').insert(baseRow).select('id').single();
    if (insOrumale) throw new Error(insOrumale.message);
    idsMantidos.add((novoOrumale as { id: string }).id);
  }

  const idsParaExcluir = [...idsExistentes].filter((id) => !idsMantidos.has(id));
  if (idsParaExcluir.length > 0) {
    const { error: delOrumale } = await supabase.from('orumale').delete().in('id', idsParaExcluir).eq('pessoa_id', pessoaId);
    if (delOrumale) throw new Error(delOrumale.message);
  }



  const { error: delX } = await supabase.from('exus').delete().eq('pessoa_id', pessoaId);

  if (delX) throw new Error(delX.message);

  for (const row of exus) {

    const ins = {

      pessoa_id: pessoaId,

      exu_nome: nullIfEmpty(row.exu_nome),

      exu_ordem: row.exu_ordem,

      data_feitura: nullIfEmpty(row.data_feitura),

    };

    const { error: insE } = await supabase.from('exus').insert(ins);

    if (insE) throw new Error(insE.message);

  }



  const { error: delU } = await supabase.from('umbanda').delete().eq('pessoa_id', pessoaId);

  if (delU) throw new Error(delU.message);

  for (const row of umbanda) {

    const ins = {

      pessoa_id: pessoaId,

      umbanda_nome: nullIfEmpty(row.umbanda_nome),

      umbanda_ordem: row.umbanda_ordem,

      data_feitura: nullIfEmpty(row.data_feitura),

    };

    const { error: insU } = await supabase.from('umbanda').insert(ins);

    if (insU) throw new Error(insU.message);

  }



  return pessoaId;

}



export async function deletePessoa(id: UUID): Promise<void> {

  const { error } = await supabase.from('pessoas').delete().eq('id', id);

  if (error) throw new Error(error.message);

}

type NomePorId = Record<string, string>;

export type ReferenciasPerfilMembro = {
  qualidades: NomePorId;
  sobrenomes: NomePorId;
};

/**
 * Carrega nomes de qualidade/sobrenome por ID para exibição no perfil/print sem
 * depender de múltiplas consultas por linha.
 */
export async function fetchReferenciasPerfilMembro(
  qualidadeIds: Array<string | number | null | undefined>,
  sobrenomeIds: Array<string | number | null | undefined>,
): Promise<ReferenciasPerfilMembro> {
  // Aceita ids numéricos, string ou null sem lançar erro em tempo de execução.
  const qualidadesClean = [...new Set(qualidadeIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const sobrenomesClean = [...new Set(sobrenomeIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const qualidadesComoNumero = qualidadesClean.map((id) => Number(id)).filter((n) => !Number.isNaN(n));

  const [qualidadesRes, sobrenomesRes] = await Promise.all([
    qualidadesComoNumero.length
      ? supabase.from('qualidades').select('id, nome').in('id', qualidadesComoNumero)
      : Promise.resolve({ data: [], error: null }),
    sobrenomesClean.length
      ? supabase.from('sobrenomes_orisa').select('id, nome').in('id', sobrenomesClean)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (qualidadesRes.error) throw new Error(qualidadesRes.error.message);
  if (sobrenomesRes.error) throw new Error(sobrenomesRes.error.message);

  const qualidades: NomePorId = {};
  for (const row of (qualidadesRes.data ?? []) as Array<{ id: string | number; nome: string }>) {
    qualidades[String(row.id)] = row.nome;
  }

  const sobrenomes: NomePorId = {};
  for (const row of (sobrenomesRes.data ?? []) as Array<{ id: string | number; nome: string }>) {
    sobrenomes[String(row.id)] = row.nome;
  }

  return { qualidades, sobrenomes };
}

