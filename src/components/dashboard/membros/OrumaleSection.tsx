import { useEffect, useState } from 'react';
import { fetchQualidadesPorOrixa } from '../../../services/orixasQualidades';
import { fetchSobrenomesOrisa, type SobrenomeOrisaRow } from '../../../services/sobrenomesOrisa';
import type { Orixa, Qualidade } from '../../../types/database';
import type { OrumaleFormRow } from '../../../hooks/useMemberForm';
import {
  atualizarHistoricoOrumale,
  excluirHistoricoOrumale,
  fetchHistoricoOrumale,
  registrarHistoricoOrumale,
  type HistoricoOrumaleItem,
} from '../../../services/orumaleHistorico';
import { formatDateBR } from '../../../utils/formatDate';

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoricoOrumaleItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyDate, setHistoryDate] = useState('');
  const [historyDescricao, setHistoryDescricao] = useState('');
  const [historyEditId, setHistoryEditId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySuccess, setHistorySuccess] = useState<string | null>(null);

  const orixaId = String(row.orixa_id ?? '');
  const qualidadeId = String(row.qualidade_id ?? '');
  const podeAbrirHistorico = Boolean(row.id);

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

  const openHistory = () => {
    if (!row.id) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistorySuccess(null);
    void fetchHistoricoOrumale(row.id)
      .then((items) => {
        setHistoryItems(items);
      })
      .catch((e) => {
        setHistoryError(e instanceof Error ? e.message : 'Erro ao carregar histórico.');
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  };

  const handleRegistrarHistorico = () => {
    if (!row.id) return;
    const descricao = historyDescricao.trim();
    if (!historyDate || !descricao) {
      setHistoryError('Informe data e descrição para registrar o histórico.');
      return;
    }
    setHistorySaving(true);
    setHistoryError(null);
    setHistorySuccess(null);
    const op = historyEditId
      ? atualizarHistoricoOrumale(historyEditId, historyDate, descricao)
      : registrarHistoricoOrumale(row.id, historyDate, descricao);

    void op
      .then((created) => {
        // Atualiza a lista local sem recarregar o formulário.
        setHistoryItems((prev) => {
          const semEditado = prev.filter((item) => item.id !== created.id);
          return [created, ...semEditado].sort((a, b) => (a.data < b.data ? 1 : -1));
        });
        setHistoryDate('');
        setHistoryDescricao('');
        setHistoryEditId(null);
        setHistorySuccess(historyEditId ? 'Histórico atualizado com sucesso.' : 'Histórico registrado com sucesso.');
      })
      .catch((e) => {
        setHistoryError(e instanceof Error ? e.message : 'Erro ao registrar histórico.');
      })
      .finally(() => {
        setHistorySaving(false);
      });
  };

  const handleEditarHistorico = (item: HistoricoOrumaleItem) => {
    // Carrega o item no formulário superior para edição rápida.
    setHistoryEditId(item.id);
    setHistoryDate(item.data);
    setHistoryDescricao(item.descricao);
    setHistoryError(null);
    setHistorySuccess(null);
  };

  const handleExcluirHistorico = (id: string) => {
    setHistorySaving(true);
    setHistoryError(null);
    setHistorySuccess(null);
    void excluirHistoricoOrumale(id)
      .then(() => {
        setHistoryItems((prev) => prev.filter((item) => item.id !== id));
        if (historyEditId === id) {
          setHistoryEditId(null);
          setHistoryDate('');
          setHistoryDescricao('');
        }
        setHistorySuccess('Histórico excluído com sucesso.');
      })
      .catch((e) => {
        setHistoryError(e instanceof Error ? e.message : 'Erro ao excluir histórico.');
      })
      .finally(() => {
        setHistorySaving(false);
      });
  };

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

      <div className="dash-form-grid">
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
        <label className="dash-field">
          <span>Histórico</span>
          <button
            type="button"
            className="dash-btn-secondary"
            onClick={openHistory}
            disabled={!podeAbrirHistorico}
            title={podeAbrirHistorico ? 'Abrir histórico do Orumalé' : 'Salve o membro para liberar o histórico'}
          >
            Histórico
          </button>
        </label>
      </div>

      {historyOpen && (
        <div className="dash-modal-overlay" role="dialog" aria-modal="true">
          <div className="dash-modal">
            <h2>Histórico do Orumalé</h2>
            <p className="dash-muted">Registros por data em ordem decrescente.</p>

            <div className="dash-form-grid dash-form-grid--pair">
              <label className="dash-field">
                <span>Data</span>
                <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} />
              </label>
              <label className="dash-field">
                <span>Descrição</span>
                <input
                  type="text"
                  maxLength={200}
                  value={historyDescricao}
                  onChange={(e) => setHistoryDescricao(e.target.value)}
                  placeholder="Descrição curta"
                />
              </label>
            </div>

            <div className="dash-form-actions">
              <button type="button" className="dash-btn-primary" onClick={handleRegistrarHistorico} disabled={historySaving}>
                {historySaving ? 'Salvando…' : historyEditId ? 'Atualizar' : 'Registrar'}
              </button>
              {historyEditId && (
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => {
                    setHistoryEditId(null);
                    setHistoryDate('');
                    setHistoryDescricao('');
                    setHistoryError(null);
                    setHistorySuccess(null);
                  }}
                >
                  Cancelar edição
                </button>
              )}
            </div>

            {historyError && <p className="dash-error">{historyError}</p>}
            {historySuccess && <p className="dash-ok">{historySuccess}</p>}

            {historyLoading ? (
              <p>Carregando histórico…</p>
            ) : historyItems.length === 0 ? (
              <p className="dash-muted">Sem registros ainda.</p>
            ) : (
              <ul className="dash-history-list">
                {historyItems.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{formatDateBR(item.data)}</strong> — {item.descricao}
                    </span>
                    <span className="dash-history-list__actions">
                      <button
                        type="button"
                        className="dash-icon-action dash-icon-action--edit"
                        title="Editar histórico"
                        aria-label="Editar histórico"
                        onClick={() => handleEditarHistorico(item)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="dash-icon-action dash-icon-action--danger"
                        title="Excluir histórico"
                        aria-label="Excluir histórico"
                        onClick={() => handleExcluirHistorico(item.id)}
                      >
                        🗑
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={() => setHistoryOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
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
