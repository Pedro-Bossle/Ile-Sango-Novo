import { useState } from 'react';
import type { UmbandaFormRow } from '../../../hooks/useMemberForm';

type Props = {
  rows: UmbandaFormRow[];
  addRow: () => void;
  removeRow: (key: string) => void;
  updateRow: (key: string, patch: Partial<UmbandaFormRow>) => void;
  reorderRows: (from: number, to: number) => void;
};

export function UmbandaSection({ rows, addRow, removeRow, updateRow, reorderRows }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="dash-form-section">
      <div className="dash-form-section__head">
        <h2 className="dash-form-section__title">Umbanda</h2>
        <button type="button" className="dash-btn-secondary dash-btn-min" onClick={addRow}>
          Adicionar
        </button>
      </div>
      {rows.length === 0 && <p className="dash-muted">Nenhum registro. Use o botão acima para adicionar.</p>}
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="dash-dynamic-block dash-dynamic-block--compact"
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex != null && dragIndex !== index) reorderRows(dragIndex, index);
            setDragIndex(null);
          }}
        >
          <span className="dash-drag-handle" title="Arrastar">
            ⋮⋮
          </span>
          <label className="dash-field dash-field--inline-grow">
            <span>Nome</span>
            <input
              type="text"
              placeholder="Nome"
              value={row.umbanda_nome}
              onChange={(e) => updateRow(row.key, { umbanda_nome: e.target.value })}
            />
          </label>
          <label className="dash-field dash-field--date-compact">
            <span>Data de feitura</span>
            <input
              type="date"
              value={row.data_feitura}
              onChange={(e) => updateRow(row.key, { data_feitura: e.target.value })}
            />
          </label>
          <div className="dash-dynamic-block__move">
            <button
              type="button"
              className="dash-dynamic-block__move-btn"
              aria-label="Subir"
              onClick={() => index > 0 && reorderRows(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="dash-dynamic-block__move-btn"
              aria-label="Descer"
              onClick={() => index < rows.length - 1 && reorderRows(index, index + 1)}
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            className="dash-icon-remove dash-dynamic-block__remove"
            aria-label="Remover linha"
            onClick={() => removeRow(row.key)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
