import { useMemo } from 'react';

type Props = {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PAGE_SIZES = [10, 20, 30, 50, 100];

export function PaginationControls({ totalItems, currentPage, pageSize, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  const pages = useMemo(() => {
    const out: Array<number | '...'> = [];
    const add = (v: number | '...') => out.push(v);
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) add(i);
      return out;
    }
    add(1);
    if (safePage > 3) add('...');
    for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p += 1) add(p);
    if (safePage < totalPages - 2) add('...');
    add(totalPages);
    return out;
  }, [safePage, totalPages]);

  return (
    <div className="dash-pagination">
      <p className="dash-pagination__summary">
        Mostrando {start}-{end} de {totalItems} registros
      </p>
      <div className="dash-pagination__controls">
        <label className="dash-pagination__page-size">
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="dash-btn-secondary" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>
          Anterior
        </button>

        <div className="dash-pagination__pages" aria-label="Páginas">
          {pages.map((p, idx) =>
            p === '...' ? (
              <span key={`ellipsis-${idx}`} className="dash-pagination__ellipsis">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`dash-pagination__page ${p === safePage ? 'is-active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="dash-btn-secondary"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
