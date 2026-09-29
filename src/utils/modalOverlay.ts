import type { MouseEvent } from 'react';

type ClickBucket = { count: number; at: number; tipTimer?: number };

const overlayClicks = new WeakMap<EventTarget, ClickBucket>();
const WINDOW_MS = 700;
const TIP_CLASS = 'dash-modal-overlay__dblclick-tip';
const TIP_TEXT = 'Clique novamente para fechar';

function clearTip(overlay: HTMLElement, bucket?: ClickBucket) {
  if (bucket?.tipTimer != null) {
    window.clearTimeout(bucket.tipTimer);
  }
  overlay.querySelectorAll(`.${TIP_CLASS}`).forEach((el) => el.remove());
}

function showTip(overlay: HTMLElement, bucket: ClickBucket) {
  clearTip(overlay, bucket);

  const tip = document.createElement('div');
  tip.className = TIP_CLASS;
  tip.setAttribute('role', 'status');
  tip.textContent = TIP_TEXT;
  overlay.appendChild(tip);

  // Força reflow para animar entrada
  void tip.offsetWidth;
  tip.classList.add(`${TIP_CLASS}--visible`);

  bucket.tipTimer = window.setTimeout(() => {
    tip.classList.remove(`${TIP_CLASS}--visible`);
    window.setTimeout(() => tip.remove(), 180);
  }, WINDOW_MS);
}

/**
 * Fecha o modal ao clicar 2× no backdrop (fora do painel), em até ~700ms.
 * No 1º clique mostra tip “Clique novamente para fechar”.
 * Use em `.dash-modal-overlay`.
 */
export function onModalOverlayClick(
  onClose: () => void,
  options?: { disabled?: boolean },
): (e: MouseEvent<HTMLElement>) => void {
  return (e) => {
    if (options?.disabled) return;
    if (e.target !== e.currentTarget) return;

    const overlay = e.currentTarget;
    const now = Date.now();
    const prev = overlayClicks.get(overlay);
    const count = prev && now - prev.at < WINDOW_MS ? prev.count + 1 : 1;

    if (count >= 2) {
      clearTip(overlay, prev);
      overlayClicks.delete(overlay);
      onClose();
      return;
    }

    const bucket: ClickBucket = { count, at: now };
    overlayClicks.set(overlay, bucket);
    showTip(overlay, bucket);
  };
}
