import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrixas } from '../services/orixasQualidades';
import {
  submeterCadastroPublico,
  validarLinkCadastro,
} from '../services/membroCadastro';
import { emptyCadastro } from '../types/memberForm';
import { somenteDigitosTelefone } from '../utils/telefone';
import { PessoaisSection } from '../components/dashboard/membros/PessoaisSection';
import { OrixasSection } from '../components/dashboard/membros/OrixasSection';
import { OrumaleSection } from '../components/dashboard/membros/OrumaleSection';
import { ExusSection } from '../components/dashboard/membros/ExusSection';
import { UmbandaSection } from '../components/dashboard/membros/UmbandaSection';
import './Dashboard.css';
import './CadastroMembroPublico.css';

function newKey() {
  const base =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  return `new-${base}`;
}

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

export default function CadastroMembroPublico() {
  const [linkOk, setLinkOk] = useState(null);
  const [orixas, setOrixas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);

  const [nome, setNome] = useState('');
  const [dataEntrada, setDataEntrada] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [contato, setContato] = useState('');
  const [email, setEmail] = useState('');
  const [signo, setSigno] = useState('');
  const [obs, setObs] = useState('');
  const [cadastro, setCadastro] = useState(emptyCadastro);
  const [orumale, setOrumale] = useState([]);
  const [exus, setExus] = useState([]);
  const [umbanda, setUmbanda] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ok, o] = await Promise.all([validarLinkCadastro(), fetchOrixas()]);
        if (cancelled) return;
        setLinkOk(ok);
        setOrixas(o);
      } catch (e) {
        if (!cancelled) {
          setLinkOk(false);
          setError(e instanceof Error ? e.message : 'Não foi possível validar o link.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePessoaisChange = useCallback((field, value) => {
    if (field === 'nome') setNome(value);
    if (field === 'dataEntrada') setDataEntrada(value);
    if (field === 'dataNascimento') setDataNascimento(value);
    if (field === 'contato') setContato(somenteDigitosTelefone(value));
    if (field === 'email') setEmail(value);
    if (field === 'signo') setSigno(value);
    if (field === 'obs') setObs(value);
  }, []);

  const setCadastroField = useCallback((field, value) => {
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

  const addOrumale = useCallback(() => {
    setOrumale((prev) => [
      ...prev,
      { key: newKey(), orixa_id: '', qualidade_id: '', sobrenome_orisa_id: '', digina: '', data_feitura: '' },
    ]);
  }, []);
  const removeOrumale = useCallback((key) => setOrumale((prev) => prev.filter((r) => r.key !== key)), []);
  const updateOrumale = useCallback(
    (key, patch) => setOrumale((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    [],
  );

  const addExu = useCallback(() => {
    setExus((prev) => {
      const nextOrdem = prev.length ? Math.max(...prev.map((x) => x.exu_ordem)) + 1 : 1;
      return [...prev, { key: newKey(), exu_nome: '', exu_ordem: nextOrdem, data_feitura: '' }];
    });
  }, []);
  const removeExu = useCallback((key) => setExus((prev) => prev.filter((r) => r.key !== key)), []);
  const updateExu = useCallback(
    (key, patch) => setExus((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    [],
  );
  const reorderExus = useCallback((from, to) => {
    setExus((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((r, i) => ({ ...r, exu_ordem: i + 1 }));
    });
  }, []);

  const addUmbanda = useCallback(() => {
    setUmbanda((prev) => {
      const nextOrdem = prev.length ? Math.max(...prev.map((x) => x.umbanda_ordem)) + 1 : 1;
      return [...prev, { key: newKey(), umbanda_nome: '', umbanda_ordem: nextOrdem, data_feitura: '' }];
    });
  }, []);
  const removeUmbanda = useCallback((key) => setUmbanda((prev) => prev.filter((r) => r.key !== key)), []);
  const updateUmbanda = useCallback(
    (key, patch) => setUmbanda((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    [],
  );
  const reorderUmbanda = useCallback((from, to) => {
    setUmbanda((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next.map((r, i) => ({ ...r, umbanda_ordem: i + 1 }));
    });
  }, []);

  const validate = useMemo(() => {
    if (!str(nome)) return 'O nome é obrigatório.';
    const pairs = [
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

  const onSubmit = async (e) => {
    e.preventDefault();
    if (validate) {
      setError(validate);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submeterCadastroPublico({
        pessoa: {
          nome,
          data_nascimento: dataNascimento || null,
          data_entrada: dataEntrada || null,
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
        exus: exus.map((r, i) => ({
          exu_nome: r.exu_nome,
          exu_ordem: i + 1,
          data_feitura: r.data_feitura,
        })),
        umbanda: umbanda.map((r, i) => ({
          umbanda_nome: r.umbanda_nome,
          umbanda_ordem: i + 1,
          data_feitura: r.data_feitura,
        })),
      });
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar cadastro.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="cadastro-publico">
        <p className="cadastro-publico__msg">Validando link…</p>
      </section>
    );
  }

  if (!linkOk) {
    return (
      <section className="cadastro-publico">
        <h1>Link inválido</h1>
        <p className="cadastro-publico__msg">
          Este link de cadastro não é válido ou foi desativado. Peça um novo link ao Ilê.
        </p>
        {error && <p className="dash-error">{error}</p>}
      </section>
    );
  }

  if (enviado) {
    return (
      <section className="cadastro-publico">
        <h1>Cadastro enviado</h1>
        <p className="cadastro-publico__msg">
          Sua ficha foi recebida e aguarda confirmação do Ilê. Você será contatado quando o cadastro for aprovado.
        </p>
      </section>
    );
  }

  return (
    <section className="cadastro-publico">
      <header className="cadastro-publico__head">
        <h1>Cadastro de membro</h1>
        <p>
          Preencha seus dados. Orisás, Orumalé, Exus e Umbanda são opcionais — se ainda não souber, deixe em branco
          que o sacerdote confirma depois.
        </p>
      </header>

      <form className="dash-member-form cadastro-publico__form" onSubmit={onSubmit}>
        <PessoaisSection
          nome={nome}
          dataEntrada={dataEntrada}
          dataNascimento={dataNascimento}
          contato={contato}
          email={email}
          signo={signo}
          obs={obs}
          onChange={handlePessoaisChange}
        />

        <p className="cadastro-publico__hint dash-muted">
          Seções abaixo são opcionais. Pode enviar a ficha só com os dados pessoais.
        </p>

        <OrixasSection orixas={orixas} cadastro={cadastro} setCadastroField={setCadastroField} />
        <OrumaleSection
          orixas={orixas}
          rows={orumale}
          addRow={addOrumale}
          removeRow={removeOrumale}
          updateRow={updateOrumale}
        />
        <ExusSection
          rows={exus}
          addRow={addExu}
          removeRow={removeExu}
          updateRow={updateExu}
          reorderRows={reorderExus}
        />
        <UmbandaSection
          rows={umbanda}
          addRow={addUmbanda}
          removeRow={removeUmbanda}
          updateRow={updateUmbanda}
          reorderRows={reorderUmbanda}
        />

        {error && <p className="dash-error">{error}</p>}

        <div className="cadastro-publico__actions">
          <button type="submit" className="dash-btn-primary" disabled={saving}>
            {saving ? 'Enviando…' : 'Enviar ficha'}
          </button>
        </div>
      </form>
    </section>
  );
}
