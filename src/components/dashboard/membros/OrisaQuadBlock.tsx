import { useEffect, useState } from 'react';
import { fetchQualidadesPorOrixa } from '../../../services/orixasQualidades';
import { fetchSobrenomesOrisa, type SobrenomeOrisaRow } from '../../../services/sobrenomesOrisa';
import type { Orixa, Qualidade } from '../../../types/database';
import type { CadastroFormState } from '../../../types/memberForm';

/** Qual das quatro secções do cadastro (cabeça, corpo, passagem, saída) */
export type OrisaSectionKey = 'cabeca' | 'corpo' | 'passagem' | 'saida';

type FieldMap = {
  orixa: keyof CadastroFormState;
  qualidade: keyof CadastroFormState;
  reza: keyof CadastroFormState;
  digina: keyof CadastroFormState;
  sobrenome: keyof CadastroFormState;
};

const SECTION_FIELDS: Record<OrisaSectionKey, FieldMap> = {
  cabeca: {
    orixa: 'orixa_cabeca_id',
    qualidade: 'qualidade_cabeca_id',
    reza: 'orixa_cabeca_reza',
    digina: 'digina_cabeca',
    sobrenome: 'sobrenome_orisa_cabeca_id',
  },
  corpo: {
    orixa: 'orixa_corpo_id',
    qualidade: 'qualidade_corpo_id',
    reza: 'orixa_corpo_reza',
    digina: 'digina_corpo',
    sobrenome: 'sobrenome_orisa_corpo_id',
  },
  passagem: {
    orixa: 'orixa_passagem_id',
    qualidade: 'qualidade_passagem_id',
    reza: 'orixa_passagem_reza',
    digina: 'digina_passagem',
    sobrenome: 'sobrenome_orisa_passagem_id',
  },
  saida: {
    orixa: 'orixa_saida_id',
    qualidade: 'qualidade_saida_id',
    reza: 'orixa_saida_reza',
    digina: 'digina_saida',
    sobrenome: 'sobrenome_orisa_saida_id',
  },
};

type Props = {
  /** Título da secção (ex.: Orisá cabeça) */
  label: string;
  section: OrisaSectionKey;
  orixas: Orixa[];
  cadastro: CadastroFormState;
  setCadastroField: (field: keyof CadastroFormState, value: string) => void;
};

/**
 * Grelha: Orisá | Qualidade | Digina | Sobrenome do Orisá (1/4 cada).
 * Sobrenomes vêm de `sobrenomes_orisa` por `qualidade_id` e, sem qualidade,
 * usam fallback por `orixa_id` com `qualidade_id` nulo.
 */
export function OrisaQuadBlock({ label, section, orixas, cadastro, setCadastroField }: Props) {
  const f = SECTION_FIELDS[section];
  const orixaId = String(cadastro[f.orixa] ?? '');
  const qualidadeId = String(cadastro[f.qualidade] ?? '');

  const [qualidades, setQualidades] = useState<Qualidade[]>([]);
  const [loadingQual, setLoadingQual] = useState(false);
  const [sobrenomes, setSobrenomes] = useState<SobrenomeOrisaRow[]>([]);
  const [loadingSob, setLoadingSob] = useState(false);
  const nomeOrixa = orixas.find((o) => String(o.id) === String(orixaId))?.nome?.trim() ?? '';

  useEffect(() => {
    let cancelled = false;
    if (!orixaId) {
      setQualidades([]);
      return;
    }
    setLoadingQual(true);
    fetchQualidadesPorOrixa(orixaId)
      .then((q) => {
        if (!cancelled) setQualidades(q);
      })
      .catch(() => {
        if (!cancelled) setQualidades([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQual(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orixaId]);

  const orixaSemQualidades = qualidades.length === 0;

  useEffect(() => {
    let cancelled = false;
    if (!orixaId) {
      setSobrenomes([]);
      return;
    }
    setLoadingSob(true);
    fetchSobrenomesOrisa({
      qualidadeId: qualidadeId || null,
      orixaId: orixaId || null,
    })
      .then((rows) => {
        if (!cancelled) setSobrenomes(rows);
      })
      .catch(() => {
        if (!cancelled) setSobrenomes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSob(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orixaId, qualidadeId, orixaSemQualidades]);

  const disabledQual = !orixaId || loadingQual;
  const disabledSobrenome =
    !orixaId ||
    loadingSob ||
    (!orixaSemQualidades && !qualidadeId);

  const placeholderReza = nomeOrixa ? `Digite a reza de ${nomeOrixa}…` : 'Digite a reza…';

  return (
    <div className="dash-orisa-quad">
      <h3 className="dash-orixa-pair__label">{label}</h3>

      <div className="dash-orisa-quad__row4">
        <label className="dash-field">
          <span>Orisá</span>
          <select value={orixaId} onChange={(e) => setCadastroField(f.orixa, e.target.value)}>
            <option value="">—</option>
            {orixas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Qualidade</span>
          <select
            value={qualidadeId}
            disabled={disabledQual}
            onChange={(e) => setCadastroField(f.qualidade, e.target.value)}
          >
            <option value="">{disabledQual && orixaId ? (loadingQual ? 'Carregando…' : '—') : '—'}</option>
            {qualidades.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Sobrenome do Orisá</span>
          <select
            value={String(cadastro[f.sobrenome] ?? '')}
            disabled={disabledSobrenome}
            onChange={(e) => setCadastroField(f.sobrenome, e.target.value)}
            aria-busy={loadingSob}
          >
            <option value="">—</option>
            {sobrenomes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span>Digina</span>
          <input
            type="text"
            value={String(cadastro[f.digina] ?? '')}
            onChange={(e) => setCadastroField(f.digina, e.target.value)}
            placeholder="Digina"
          />
        </label>
      </div>

      <label className="dash-field dash-field--full dash-orixa-reza">
        <span>Reza</span>
        <textarea
          className="dash-orixa-reza__textarea"
          value={String(cadastro[f.reza] ?? '')}
          onChange={(e) => setCadastroField(f.reza, e.target.value)}
          placeholder={placeholderReza}
          rows={4}
        />
      </label>
    </div>
  );
}
