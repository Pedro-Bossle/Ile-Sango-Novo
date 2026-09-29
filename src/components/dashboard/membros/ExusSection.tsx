import { useState } from 'react';
import type { ExuFormRow } from '../../../hooks/useMemberForm';
import { useConfirmAction } from '../ConfirmActionModal';

type Props = {
  rows: ExuFormRow[];
  addRow: () => void;
  removeRow: (key: string) => void;
  updateRow: (key: string, patch: Partial<ExuFormRow>) => void;
  reorderRows: (from: number, to: number) => void;
};

export function ExusSection({ rows, addRow, removeRow, updateRow, reorderRows }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();

  const pedirRemover = (key: string, nome: string) => {
    void (async () => {
      const ok = await askConfirm({
        title: 'Remover linha',
        message: (
          <>
            Remover{nome.trim() ? (
              <>
                {' '}
                <strong>{nome.trim()}</strong>
              </>
            ) : (
              ' esta linha'
            )}{' '}
            de Exus do formulário?
          </>
        ),
        confirmLabel: 'Remover',
        confirmingLabel: 'Removendo…',
      });
      if (!ok) return;
      removeRow(key);
    })();
  };

  return (
    <section className="dash-form-section">
      {confirmModal}
      <div className="dash-form-section__head">
        <h2 className="dash-form-section__title">Exus</h2>
        <button type="button" className="dash-btn-secondary dash-btn-min" onClick={addRow}>
          Adicionar Exu
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
              value={row.exu_nome}
              onChange={(e) => updateRow(row.key, { exu_nome: e.target.value })}
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
            onClick={() => pedirRemover(row.key, row.exu_nome)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
