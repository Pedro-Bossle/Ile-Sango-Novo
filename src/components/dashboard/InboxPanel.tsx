import { useCallback, useEffect, useState } from 'react';
import {
  aprovarPendente,
  fetchNotificacoes,
  fetchPendenteById,
  limparTodasNotificacoes,
  marcarNotificacaoLida,
  reprovarPendente,
  type CadastroPendente,
  type DashboardNotificacao,
} from '../../services/membroCadastro';
import { formatDateBR } from '../../utils/formatDate';
import { Toast } from './Toast';
import { useConfirmAction } from './ConfirmActionModal';
import './InboxPanel.css';

type Props = {
  open: boolean;
  onClose: () => void;
  canReview: boolean;
  onApproved?: (pessoaId: string) => void;
  onCountsChange?: () => void;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function InboxPanel({ open, onClose, canReview, onApproved, onCountsChange }: Props) {
  const [notifs, setNotifs] = useState<DashboardNotificacao[]>([]);
  const [loading, setLoading] = useState(false);
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();
  const [selected, setSelected] = useState<CadastroPendente | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchNotificacoes();
      setNotifs(rows);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar inbox.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const abrirItem = async (n: DashboardNotificacao) => {
    if (!n.lida) {
      try {
        await marcarNotificacaoLida(n.id);
        setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
        onCountsChange?.();
      } catch {
        /* ignore */
      }
    }
    if (!n.entity_id) {
      setSelected(null);
      return;
    }
    try {
      const p = await fetchPendenteById(n.entity_id);
      setSelected(p);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao abrir cadastro.', variant: 'error' });
    }
  };

  const limpar = async () => {
    const ok = await askConfirm({
      title: 'Limpar notificações',
      message: 'Marcar todas as notificações como lidas?',
      confirmLabel: 'Limpar',
      confirmingLabel: 'Limpando…',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await limparTodasNotificacoes();
      await reload();
      onCountsChange?.();
      setToast({ msg: 'Notificações marcadas como lidas.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao limpar.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const aprovar = async () => {
    if (!selected || !canReview) return;
    setBusy(true);
    try {
      const pessoaId = await aprovarPendente(selected.id);
      setToast({ msg: 'Cadastro aprovado. Perfil criado.', variant: 'success' });
      setSelected(null);
      await reload();
      onCountsChange?.();
      onApproved?.(pessoaId);
      onClose();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao aprovar.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reprovar = async () => {
    if (!selected || !canReview) return;
    const ok = await askConfirm({
      title: 'Confirmar reprovação',
      message: 'Reprovar este cadastro? A submissão será removida da fila.',
      confirmLabel: 'Reprovar',
      confirmingLabel: 'Reprovando…',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await reprovarPendente(selected.id);
      setToast({ msg: 'Cadastro reprovado.', variant: 'success' });
      setSelected(null);
      await reload();
      onCountsChange?.();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao reprovar.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const payload = selected?.payload;
  const cad = payload?.cadastro;

  return (
    <>
      {confirmModal}
      <div className="dash-inbox-backdrop" onClick={onClose} aria-hidden />
      <aside className="dash-inbox" role="dialog" aria-label="Inbox">
        <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
        <header className="dash-inbox__head">
          <h2>Inbox</h2>
          <div className="dash-inbox__head-actions">
            <button type="button" className="dash-add-button dash-add-button--secondary" disabled={busy} onClick={() => void limpar()}>
              Limpar notificações
            </button>
            <button type="button" className="dash-inbox__close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </div>
        </header>

        <div className="dash-inbox__body">
          <div className="dash-inbox__list">
            {loading && <p className="dash-muted">Carregando…</p>}
            {!loading && notifs.length === 0 && <p className="dash-muted">Nenhuma notificação.</p>}
            {notifs.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`dash-inbox__item${!n.lida ? ' is-unread' : ''}`}
                onClick={() => void abrirItem(n)}
              >
                <strong>{n.titulo}</strong>
                <span>{n.corpo}</span>
                <time>{formatWhen(n.created_at)}</time>
              </button>
            ))}
          </div>

          <div className="dash-inbox__detail">
            {!selected && <p className="dash-muted">Selecione uma notificação para ver o cadastro.</p>}
            {selected && (
              <>
                <h3>{selected.nome}</h3>
                <p className="dash-muted">
                  Status: {selected.status}
                  {selected.deleted_at ? ' (removido)' : ''} · Enviado em {formatWhen(selected.created_at)}
                </p>
                <dl className="dash-inbox__dl">
                  <div>
                    <dt>Nascimento</dt>
                    <dd>{formatDateBR(selected.data_nascimento)}</dd>
                  </div>
                  <div>
                    <dt>Entrada</dt>
                    <dd>{formatDateBR(selected.data_entrada)}</dd>
                  </div>
                  <div>
                    <dt>Contato</dt>
                    <dd>{selected.contato || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{selected.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Signo</dt>
                    <dd>{selected.signo || '—'}</dd>
                  </div>
                  <div>
                    <dt>Obs.</dt>
                    <dd>{selected.obs || '—'}</dd>
                  </div>
                </dl>

                {cad && (
                  <div className="dash-inbox__block">
                    <h4>Orisás (IDs enviados)</h4>
                    <ul>
                      <li>Cabeça: {cad.orixa_cabeca_id || '—'} / {cad.qualidade_cabeca_id || '—'}</li>
                      <li>Corpo: {cad.orixa_corpo_id || '—'} / {cad.qualidade_corpo_id || '—'}</li>
                      <li>Passagem: {cad.orixa_passagem_id || '—'} / {cad.qualidade_passagem_id || '—'}</li>
                      <li>Saída: {cad.orixa_saida_id || '—'} / {cad.qualidade_saida_id || '—'}</li>
                    </ul>
                  </div>
                )}

                {payload && payload.exus.length > 0 && (
                  <div className="dash-inbox__block">
                    <h4>Exus</h4>
                    <ul>
                      {payload.exus.map((e, i) => (
                        <li key={i}>
                          {e.exu_nome || '—'} {e.data_feitura ? `(${formatDateBR(e.data_feitura)})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {payload && payload.umbanda.length > 0 && (
                  <div className="dash-inbox__block">
                    <h4>Umbanda</h4>
                    <ul>
                      {payload.umbanda.map((u, i) => (
                        <li key={i}>
                          {u.umbanda_nome || '—'} {u.data_feitura ? `(${formatDateBR(u.data_feitura)})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {payload && payload.orumale.length > 0 && (
                  <div className="dash-inbox__block">
                    <h4>Orumalé</h4>
                    <ul>
                      {payload.orumale.map((o, i) => (
                        <li key={i}>
                          Orisá {o.orixa_id || '—'} / {o.qualidade_id || '—'} {o.digina ? `· ${o.digina}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.status === 'pendente' && !selected.deleted_at && canReview && (
                  <div className="dash-inbox__actions">
                    <button type="button" className="dash-btn-primary" disabled={busy} onClick={() => void aprovar()}>
                      Aprovar (criar perfil)
                    </button>
                    <button
                      type="button"
                      className="dash-btn-danger-outline"
                      disabled={busy}
                      onClick={() => void reprovar()}
                    >
                      Reprovar
                    </button>
                  </div>
                )}

                {selected.status === 'aprovado' && selected.pessoa_id && (
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={() => {
                      onApproved?.(selected.pessoa_id!);
                      onClose();
                    }}
                  >
                    Abrir perfil
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
