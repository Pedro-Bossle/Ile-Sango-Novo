import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrixas } from '../services/orixasQualidades';
import { fetchPessoaCompleta, savePessoaCompleta, type MemberFormPayload } from '../services/membros';
import type { Orixa, UUID } from '../types/database';
import { emptyCadastro, type CadastroFormState } from '../types/memberForm';

export type { CadastroFormState };

function newKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

/** Valores do Supabase/form podem não ser string; evita .trim() em null/número */
function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export type OrumaleFormRow = {
  key: string;
  orixa_id: string;
  qualidade_id: string;
  sobrenome_orisa_id: string;
  digina: string;
  data_feitura: string;
};

export type ExuFormRow = {
  key: string;
  exu_nome: string;
  exu_ordem: number;
  data_feitura: string;
};

export type UmbandaFormRow = {
  key: string;
  umbanda_nome: string;
  umbanda_ordem: number;
  data_feitura: string;
};

export function useMemberForm(editId: UUID | null, onSaved: () => Promise<void> | void) {
  const [orixas, setOrixas] = useState<Orixa[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingPessoa, setLoadingPessoa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [contato, setContato] = useState('');
  const [email, setEmail] = useState('');
  const [signo, setSigno] = useState('');
  const [obs, setObs] = useState('');
  const [cadastro, setCadastro] = useState<CadastroFormState>(emptyCadastro);

  const [orumale, setOrumale] = useState<OrumaleFormRow[]>([]);

  const [exus, setExus] = useState<ExuFormRow[]>([]);

  const [umbanda, setUmbanda] = useState<UmbandaFormRow[]>([]);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    let cancelled = false;

    (async () => {

      try {

        const o = await fetchOrixas();

        if (!cancelled) setOrixas(o);

      } catch (e) {

        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar orisás.');

      } finally {

        if (!cancelled) setLoadingMeta(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, []);



  const resetEmpty = useCallback(() => {

    setNome('');

    setDataNascimento('');

    setContato('');

    setEmail('');

    setSigno('');

    setObs('');

    setCadastro(emptyCadastro());

    setOrumale([]);

    setExus([]);

    setUmbanda([]);

    setError(null);

  }, []);



  useEffect(() => {

    if (!editId) {

      resetEmpty();

      return;

    }

    let cancelled = false;

    setLoadingPessoa(true);

    setError(null);

    (async () => {

      try {

        const c = await fetchPessoaCompleta(editId);

        if (cancelled) return;

        const p = c.pessoa;

        setNome(p.nome ?? '');

        setDataNascimento(p.data_nascimento ?? '');

        setContato(p.contato ?? '');

        setEmail(p.email ?? '');

        setSigno(p.signo ?? '');

        setObs(p.obs ?? '');

        const cad = c.cadastro;

        setCadastro({

          orixa_cabeca_id: cad?.orixa_cabeca_id ?? '',

          qualidade_cabeca_id: cad?.qualidade_cabeca_id ?? '',

          orixa_corpo_id: cad?.orixa_corpo_id ?? '',

          qualidade_corpo_id: cad?.qualidade_corpo_id ?? '',

          orixa_passagem_id: cad?.orixa_passagem_id ?? '',

          qualidade_passagem_id: cad?.qualidade_passagem_id ?? '',

          orixa_saida_id: cad?.orixa_saida_id ?? '',

          qualidade_saida_id: cad?.qualidade_saida_id ?? '',

          orixa_cabeca_reza: cad?.orixa_cabeca_reza ?? '',

          orixa_corpo_reza: cad?.orixa_corpo_reza ?? '',

          orixa_passagem_reza: cad?.orixa_passagem_reza ?? '',

          orixa_saida_reza: cad?.orixa_saida_reza ?? '',

          digina_cabeca: cad?.digina_cabeca ?? '',

          digina_corpo: cad?.digina_corpo ?? '',

          digina_passagem: cad?.digina_passagem ?? '',

          digina_saida: cad?.digina_saida ?? '',

          sobrenome_orisa_cabeca_id: cad?.sobrenome_orisa_cabeca ?? '',

          sobrenome_orisa_corpo_id: cad?.sobrenome_orisa_corpo ?? '',

          sobrenome_orisa_passagem_id: cad?.sobrenome_orisa_passagem ?? '',

          sobrenome_orisa_saida_id: cad?.sobrenome_orisa_saida ?? '',

        });

        setOrumale(

          c.orumale.map((r) => ({

            key: r.id,

            orixa_id: r.orixa_id ?? '',

            qualidade_id: r.qualidade_id ?? '',

            sobrenome_orisa_id: r.sobrenome_orisa_id ?? '',

            digina: r.digina ?? '',

            data_feitura: r.data_feitura ?? '',

          })),

        );

        setExus(

          c.exus.map((r) => ({

            key: r.id,

            exu_nome: r.exu_nome ?? '',

            exu_ordem: r.exu_ordem ?? 1,

            data_feitura: r.data_feitura ?? '',

          })),

        );

        setUmbanda(

          c.umbanda.map((r) => ({

            key: r.id,

            umbanda_nome: r.umbanda_nome ?? '',

            umbanda_ordem: r.umbanda_ordem ?? 1,

            data_feitura: r.data_feitura ?? '',

          })),

        );

      } catch (e) {

        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar membro.');

      } finally {

        if (!cancelled) setLoadingPessoa(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [editId, resetEmpty]);



  const validate = useCallback((): string | null => {

    if (!str(nome)) return 'O nome é obrigatório.';

    const pairs: Array<[unknown, unknown]> = [

      [cadastro.orixa_cabeca_id, cadastro.qualidade_cabeca_id],

      [cadastro.orixa_corpo_id, cadastro.qualidade_corpo_id],

      [cadastro.orixa_passagem_id, cadastro.qualidade_passagem_id],

      [cadastro.orixa_saida_id, cadastro.qualidade_saida_id],

    ];

    for (const [o, q] of pairs) {

      if (!str(o) && str(q)) return 'Selecione o orisá antes da qualidade.';

    }

    for (const row of orumale) {

      if (!str(row.orixa_id) && str(row.qualidade_id)) {

        return 'Em Orumalé, selecione o orisá antes da qualidade.';

      }

    }

    return null;

  }, [nome, cadastro, orumale]);



  const addOrumale = useCallback(() => {

    setOrumale((prev) => [

      ...prev,

      { key: newKey(), orixa_id: '', qualidade_id: '', sobrenome_orisa_id: '', digina: '', data_feitura: '' },

    ]);

  }, []);



  const removeOrumale = useCallback((key: string) => {

    setOrumale((prev) => prev.filter((r) => r.key !== key));

  }, []);



  const updateOrumale = useCallback((key: string, patch: Partial<OrumaleFormRow>) => {

    setOrumale((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  }, []);



  const addExu = useCallback(() => {

    setExus((prev) => {

      const nextOrdem = prev.length ? Math.max(...prev.map((x) => x.exu_ordem)) + 1 : 1;

      return [...prev, { key: newKey(), exu_nome: '', exu_ordem: nextOrdem, data_feitura: '' }];

    });

  }, []);



  const removeExu = useCallback((key: string) => {

    setExus((prev) => prev.filter((r) => r.key !== key));

  }, []);



  const updateExu = useCallback((key: string, patch: Partial<ExuFormRow>) => {

    setExus((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  }, []);



  const addUmbanda = useCallback(() => {

    setUmbanda((prev) => {

      const nextOrdem = prev.length ? Math.max(...prev.map((x) => x.umbanda_ordem)) + 1 : 1;

      return [...prev, { key: newKey(), umbanda_nome: '', umbanda_ordem: nextOrdem, data_feitura: '' }];

    });

  }, []);



  const removeUmbanda = useCallback((key: string) => {

    setUmbanda((prev) => prev.filter((r) => r.key !== key));

  }, []);



  const updateUmbanda = useCallback((key: string, patch: Partial<UmbandaFormRow>) => {

    setUmbanda((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  }, []);



  const submit = useCallback(async () => {

    const v = validate();

    if (v) {

      setError(v);

      return;

    }

    setSaving(true);

    setError(null);

    const payload: MemberFormPayload = {

      pessoa: {

        id: editId,

        nome,

        data_nascimento: dataNascimento || null,

        contato: contato || null,

        email: email || null,

        signo: signo || null,

        obs: obs || null,

      },

      cadastro,

      orumale: orumale

        .filter((r) => str(r.orixa_id))

        .map((r) => ({

          orixa_id: r.orixa_id,

          qualidade_id: r.qualidade_id,

          sobrenome_orisa_id: r.sobrenome_orisa_id,

          digina: r.digina,

          data_feitura: r.data_feitura,

        })),

      exus: exus.map((r) => ({

        exu_nome: r.exu_nome,

        exu_ordem: r.exu_ordem,

        data_feitura: r.data_feitura,

      })),

      umbanda: umbanda.map((r) => ({

        umbanda_nome: r.umbanda_nome,

        umbanda_ordem: r.umbanda_ordem,

        data_feitura: r.data_feitura,

      })),

    };

    try {

      await savePessoaCompleta(payload);

      await onSaved();

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Erro ao salvar.');

    } finally {

      setSaving(false);

    }

  }, [validate, editId, nome, dataNascimento, contato, email, signo, obs, cadastro, orumale, exus, umbanda, onSaved]);



  const setCadastroField = useCallback((field: keyof CadastroFormState, value: string) => {

    setCadastro((prev) => {

      const next = { ...prev, [field]: value };

      if (field === 'orixa_cabeca_id') {

        next.qualidade_cabeca_id = '';

        next.sobrenome_orisa_cabeca_id = '';

      }

      if (field === 'orixa_corpo_id') {

        next.qualidade_corpo_id = '';

        next.sobrenome_orisa_corpo_id = '';

      }

      if (field === 'orixa_passagem_id') {

        next.qualidade_passagem_id = '';

        next.sobrenome_orisa_passagem_id = '';

      }

      if (field === 'orixa_saida_id') {

        next.qualidade_saida_id = '';

        next.sobrenome_orisa_saida_id = '';

      }

      if (field === 'qualidade_cabeca_id') next.sobrenome_orisa_cabeca_id = '';

      if (field === 'qualidade_corpo_id') next.sobrenome_orisa_corpo_id = '';

      if (field === 'qualidade_passagem_id') next.sobrenome_orisa_passagem_id = '';

      if (field === 'qualidade_saida_id') next.sobrenome_orisa_saida_id = '';

      return next;

    });

  }, []);



  const state = useMemo(

    () => ({

      orixas,

      loadingMeta,

      loadingPessoa,

      saving,

      nome,

      dataNascimento,

      contato,

      email,

      signo,

      obs,

      cadastro,

      orumale,

      exus,

      umbanda,

      error,

      setNome,

      setDataNascimento,

      setContato,

      setEmail,

      setSigno,

      setObs,

      setCadastro,

      setCadastroField,

      addOrumale,

      removeOrumale,

      updateOrumale,

      addExu,

      removeExu,

      updateExu,

      addUmbanda,

      removeUmbanda,

      updateUmbanda,

    }),

    [

      orixas,

      loadingMeta,

      loadingPessoa,

      saving,

      nome,

      dataNascimento,

      contato,

      email,

      signo,

      obs,

      cadastro,

      orumale,

      exus,

      umbanda,

      error,

      setCadastroField,

      addOrumale,

      removeOrumale,

      updateOrumale,

      addExu,

      removeExu,

      updateExu,

      addUmbanda,

      removeUmbanda,

      updateUmbanda,

    ],

  );



  return {

    ...state,

    submit,

    setError,

  };

}

