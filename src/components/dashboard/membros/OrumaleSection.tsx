import { useEffect, useState } from 'react';
import { fetchQualidadesPorOrixa } from '../../../services/orixasQualidades';
import { fetchSobrenomesOrisa, type SobrenomeOrisaRow } from '../../../services/sobrenomesOrisa';
import type { Orixa, Qualidade } from '../../../types/database';
import type { OrumaleFormRow } from '../../../hooks/useMemberForm';

type Props = {
  orixas: Orixa[];
  rows: OrumaleFormRow[];
  addRow: () => void;
  removeRow: (key: string) => void;
  updateRow: (key: string, patch: Partial<OrumaleFormRow>) => void;
};

type RowEditorProps = {
  row: OrumaleFormRow;
  orixas: Orixa[];
  removeRow: (key: string) => void;
  updateRow: (key: string, patch: Partial<OrumaleFormRow>) => void;
};

function OrumaleRowEditor({ row, orixas, removeRow, updateRow }: RowEditorProps) {
  const [qualidades, setQualidades] = useState<Qualidade[]>([]);
  const [loadingQual, setLoadingQual] = useState(false);
  const [sobrenomes, setSobrenomes] = useState<SobrenomeOrisaRow[]>([]);
  const [loadingSob, setLoadingSob] = useState(false);

  const orixaId = String(row.orixa_id ?? '');
  const qualidadeId = String(row.qualidade_id ?? '');

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
  }, [orixaId, qualidadeId]);

  const disabledQual = !orixaId || loadingQual;
  const disabledSobrenome = !orixaId || loadingSob || (!orixaSemQualidades && !qualidadeId);

  return (
    <div key={row.key} className="dash-dynamic-block">
      <div className="dash-dynamic-block__toolbar">
        <button
          type="button"
          className="dash-icon-remove"
          aria-label="Remover linha"
          onClick={() => removeRow(row.key)}
        >
          ×
        </button>
      </div>

      <div className="dash-orixa-pair">
        <h3 className="dash-orixa-pair__label">Orisá e qualidade</h3>
        <div className="dash-form-grid">
          <label className="dash-field">
            <span>Orisá</span>
            <select
              value={orixaId}
              onChange={(e) =>
                updateRow(row.key, { orixa_id: e.target.value, qualidade_id: '', sobrenome_orisa_id: '' })
              }
            >
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
              onChange={(e) => updateRow(row.key, { qualidade_id: e.target.value, sobrenome_orisa_id: '' })}
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
            <span>Sobrenome</span>
            <select
              value={row.sobrenome_orisa_id}
              disabled={disabledSobrenome}
              onChange={(e) => updateRow(row.key, { sobrenome_orisa_id: e.target.value })}
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
        </div>
      </div>

      <div className="dash-form-grid dash-form-grid--pair">
        <label className="dash-field">
          <span>Digina</span>
          <input
            type="text"
            value={row.digina}
            onChange={(e) => updateRow(row.key, { digina: e.target.value })}
          />
        </label>
        <label className="dash-field">
          <span>Data feitura</span>
          <input
            type="date"
            value={row.data_feitura}
            onChange={(e) => updateRow(row.key, { data_feitura: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

export function OrumaleSection({ orixas, rows, addRow, removeRow, updateRow }: Props) {
  return (
    <section className="dash-form-section">
      <div className="dash-form-section__head">
        <h2 className="dash-form-section__title">Orumalé</h2>
        <button type="button" className="dash-btn-secondary dash-btn-min" onClick={addRow}>
          Adicionar Orumalé
        </button>
      </div>
      {rows.length === 0 && <p className="dash-muted">Nenhum registro. Use o botão acima para adicionar.</p>}
      {rows.map((row) => (
        <OrumaleRowEditor key={row.key} row={row} orixas={orixas} removeRow={removeRow} updateRow={updateRow} />
      ))}
    </section>
  );
}
