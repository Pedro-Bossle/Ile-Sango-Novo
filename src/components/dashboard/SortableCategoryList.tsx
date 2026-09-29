import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';

export type SortableItem = { id: string | number };

type Props<T extends SortableItem> = {
  items: T[];
  /** Chamado após soltar, com ids na nova ordem (já refletida no estado local se onItemsChange for usado). */
  onReorder: (orderedIds: Array<string | number>) => void | Promise<void>;
  /** Atualização otimista da lista (recomendado). */
  onItemsChange?: (next: T[]) => void;
  disabled?: boolean;
  className?: string;
  itemClassName?: string | ((item: T, index: number) => string);
  /** Conteúdo da linha (sem o handle — o handle é injetado à esquerda). */
  renderItem: (item: T, index: number) => ReactNode;
};

function reorderList<T extends SortableItem>(list: T[], fromId: string, toId: string): T[] {
  if (fromId === toId) return list;
  const from = list.findIndex((x) => String(x.id) === fromId);
  const to = list.findIndex((x) => String(x.id) === toId);
  if (from < 0 || to < 0) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Lista reordenável por drag-and-drop (HTML5).
 * Usado nas editoras de categoria (caixa, agenda, catálogo).
 */
export function SortableCategoryList<T extends SortableItem>({
  items,
  onReorder,
  onItemsChange,
  disabled = false,
  className,
  itemClassName,
  renderItem,
}: Props<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const onDragStart = useCallback(
    (e: DragEvent, id: string) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      dragIdRef.current = id;
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: DragEvent, id: string) => {
      if (disabled || !dragIdRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overId !== id) setOverId(id);
    },
    [disabled, overId],
  );

  const onDrop = useCallback(
    (e: DragEvent, targetId: string) => {
      e.preventDefault();
      if (disabled) return;
      const fromId = dragIdRef.current || e.dataTransfer.getData('text/plain');
      dragIdRef.current = null;
      setDraggingId(null);
      setOverId(null);
      if (!fromId || fromId === targetId) return;
      const next = reorderList(items, fromId, targetId);
      if (next === items) return;
      onItemsChange?.(next);
      void Promise.resolve(onReorder(next.map((x) => x.id))).catch(() => undefined);
    },
    [disabled, items, onItemsChange, onReorder],
  );

  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, []);

  return (
    <ul className={`dash-sortable-cats${className ? ` ${className}` : ''}`}>
      {items.map((item, index) => {
        const idStr = String(item.id);
        const extra =
          typeof itemClassName === 'function' ? itemClassName(item, index) : itemClassName || '';
        const isDragging = draggingId === idStr;
        const isOver = overId === idStr && draggingId !== idStr;
        return (
          <li
            key={idStr}
            className={[
              'dash-sortable-cats__row',
              extra,
              isDragging ? 'is-dragging' : '',
              isOver ? 'is-drag-over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(e) => onDragOver(e, idStr)}
            onDrop={(e) => onDrop(e, idStr)}
            onDragEnd={onDragEnd}
          >
            <span
              className="dash-sortable-cats__handle"
              title="Arrastar para reordenar"
              aria-label="Arrastar para reordenar"
              draggable={!disabled}
              onDragStart={(e) => onDragStart(e, idStr)}
              onDragEnd={onDragEnd}
              aria-hidden={disabled}
            >
              ⋮⋮
            </span>
            <div className="dash-sortable-cats__body">{renderItem(item, index)}</div>
          </li>
        );
      })}
    </ul>
  );
}
