import { useEffect, useMemo, useState } from 'react';
import { fetchQualidadesPorOrixa } from '../../../services/orixasQualidades';
import type { Orixa, Qualidade } from '../../../types/database';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';

type Props = {
  label: string;
  orixas: Orixa[];
  orixaId: string;
  qualidadeId: string;
  onOrixaChange: (id: string) => void;
  onQualidadeChange: (id: string) => void;
  /** Secção Orisás: reza por par. Omitir em Orumalé. */
  placeholderOrixaNome?: string;
  rezaValue?: string;
  onRezaChange?: (value: string) => void;
};

export function OrixaQualidadePair({
  label,
  orixas,
  orixaId,
  qualidadeId,
  onOrixaChange,
  onQualidadeChange,
  placeholderOrixaNome = '',
  rezaValue = '',
  onRezaChange,
}: Props) {
  const [qualidades, setQualidades] = useState<Qualidade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!orixaId) {
      setQualidades([]);
      return;
    }
    setLoading(true);
    fetchQualidadesPorOrixa(orixaId)
      .then((q) => {
        if (!cancelled) setQualidades(q);
      })
      .catch(() => {
        if (!cancelled) setQualidades([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orixaId]);

  const disabledQual = !orixaId || loading;

  const orixaOptions = useMemo(
    (): SearchableSelectOption[] => [
      { value: '', label: '—' },
      ...orixas.map((o) => ({ value: String(o.id), label: o.nome })),
    ],
    [orixas],
  );

  const qualidadeOptions = useMemo((): SearchableSelectOption[] => {
    const emptyLabel = disabledQual && orixaId ? (loading ? 'Carregando…' : '—') : '—';
    return [{ value: '', label: emptyLabel, disabled: loading && !!orixaId }, ...qualidades.map((q) => ({ value: String(q.id), label: q.nome }))];
  }, [qualidades, disabledQual, orixaId, loading]);

  return (
    <div className="dash-orixa-pair">
      <h3 className="dash-orixa-pair__label">{label}</h3>
      <div className="dash-form-grid dash-form-grid--pair">
        <label className="dash-field">
          <span>Orisá</span>
          <SearchableSelect
            options={orixaOptions}
            value={orixaId}
            onChange={onOrixaChange}
            searchPlaceholder="Buscar orisá…"
            aria-label="Orisá"
          />
        </label>
        <label className="dash-field">
          <span>Qualidade</span>
          <SearchableSelect
            options={qualidadeOptions}
            value={qualidadeId}
            disabled={disabledQual}
            onChange={onQualidadeChange}
            placeholder={loading && orixaId ? 'Carregando…' : '—'}
            searchPlaceholder="Buscar qualidade…"
            aria-label="Qualidade"
          />
        </label>
      </div>
      {onRezaChange && (
        <label className="dash-field dash-field--full dash-orixa-reza">
          <span>Reza</span>
          <textarea
            className="dash-orixa-reza__textarea"
            value={rezaValue}
            onChange={(e) => onRezaChange(e.target.value)}
            placeholder={`Digite a reza de ${placeholderOrixaNome}...`}
            rows={4}
          />
        </label>
      )}
    </div>
  );
}
