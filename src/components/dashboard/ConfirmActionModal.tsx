import { useCallback, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { onModalOverlayClick } from '../../utils/modalOverlay';

export type ConfirmActionOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
};

type Props = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Modal padrão de confirmação para exclusão / inativação. */
export function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  confirmingLabel = 'Excluindo…',
  cancelLabel = 'Cancelar',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  if (!open) return null;

  return createPortal(
    <div
      className="dash-modal-overlay dash-modal-overlay--confirm"
      role="presentation"
      onClick={onModalOverlayClick(() => !busy && onCancel())}
    >
      <div
        className="dash-modal dash-modal--narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dash-modal__head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="dash-modal__close"
            aria-label="Fechar"
            disabled={busy}
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <div className="dash-confirm-action__body">{message}</div>
        <div className="dash-form-actions dash-form-actions--modal-end">
          <button type="button" className="dash-btn-secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="dash-btn-danger" disabled={busy} onClick={onConfirm}>
            {busy ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Pending = ConfirmActionOptions & { resolve: (ok: boolean) => void };

/**
 * Substitui `window.confirm` por modal.
 * Uso: `if (!(await ask({ title, message }))) return;`
 * Renderize `{modal}` no JSX da tela.
 */
export function useConfirmAction() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback((opts: ConfirmActionOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  const modal = (
    <ConfirmActionModal
      open={Boolean(pending)}
      title={pending?.title ?? ''}
      message={pending?.message ?? null}
      confirmLabel={pending?.confirmLabel}
      confirmingLabel={pending?.confirmingLabel}
      cancelLabel={pending?.cancelLabel}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );

  return { ask, modal };
}
