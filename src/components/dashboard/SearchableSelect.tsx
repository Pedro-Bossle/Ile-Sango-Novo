import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

export type SearchableSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  allowClear?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  dropUp?: boolean;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar…',
  searchPlaceholder = 'Buscar…',
  noResultsText = 'Nenhum resultado',
  allowClear = false,
  disabled = false,
  required = false,
  id,
  className = '',
  'aria-label': ariaLabel,
  dropUp = false,
}: Props) {
  const autoId = useId();
  const rootId = id || autoId;
  const listId = `${rootId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHighlight(0);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [disabled, options, value]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    setHighlight((h) => (filtered.length ? Math.min(h, filtered.length - 1) : 0));
  }, [filtered.length]);

  const pick = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    close();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openMenu();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`dash-ss${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${dropUp ? ' is-drop-up' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      {required && (
        <input
          type="text"
          tabIndex={-1}
          required
          value={value}
          onChange={() => undefined}
          className="dash-ss__native"
          aria-hidden
        />
      )}

      <div className="dash-ss__control">
        <button
          type="button"
          id={rootId}
          className={`dash-ss__trigger${open ? ' is-open' : ''}${!selected ? ' is-placeholder' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={onTriggerKey}
        >
          <span className="dash-ss__value">{selected ? selected.label : placeholder}</span>
          <span className="dash-ss__chevron" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        </button>
        {allowClear && value && !disabled && (
          <button
            type="button"
            className="dash-ss__clear"
            aria-label="Limpar seleção"
            onClick={() => {
              onChange('');
              close();
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="dash-ss__panel" role="presentation">
          <div className="dash-ss__search">
            <span className="dash-ss__search-icon" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={searchRef}
              type="search"
              className="dash-ss__search-input"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKey}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
          <ul id={listId} className="dash-ss__list" role="listbox" aria-labelledby={rootId}>
            {filtered.length === 0 && (
              <li className="dash-ss__empty" role="presentation">
                {noResultsText}
              </li>
            )}
            {filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHi = i === highlight;
              return (
                <li key={`${opt.value}::${opt.label}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    className={`dash-ss__opt${isSelected ? ' is-selected' : ''}${isHi ? ' is-highlight' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(opt)}
                  >
                    <span className="dash-ss__check" aria-hidden>
                      {isSelected ? '✓' : ''}
                    </span>
                    <span className="dash-ss__opt-label">{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
