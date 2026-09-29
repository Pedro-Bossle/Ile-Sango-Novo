import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchPessoasOptions, type PessoaOption } from '../../../services/pessoasLookup';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { fetchCaixaCategorias } from '../../../services/caixa';
import { labelCobrancaTipo, resolvePessoaIdCobranca, type UUID } from '../../../types/database';
import { sanitizeValorInput, valorToMaskedInput, parseValorInput, formatMoneyBRL } from '../../../utils/money';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';

export type CobrancaFormValues = {
  pessoa_id: UUID;
  data: string;
  valor: string;
  descricao: string;
  /** Nome da categoria do fluxo de caixa. */
  tipo: string;
  /** Só na criação: divide o valor em N cobranças mensais. */
  parcelas: string;
};

const TIPO_PADRAO = 'Cobrança';

const emptyValues = (): CobrancaFormValues => ({
  pessoa_id: '',
  data: '',
  valor: '',
  descricao: '',
  tipo: TIPO_PADRAO,
  parcelas: '1',
});

type Props = {
  open: boolean;
  initial: CobrancaComMembro | null;
  onClose: () => void;
  onSave: (values: CobrancaFormValues) => Promise<void>;
};

export function CobrancaForm({ open, initial, onClose, onSave }: Props) {
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [categorias, setCategorias] = useState<SearchableSelectOption[]>([]);
  const [values, setValues] = useState<CobrancaFormValues>(emptyValues);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchPessoasOptions(), fetchCaixaCategorias()])
      .then(([p, cats]) => {
        if (cancelled) return;
        setPessoas(p);
        const entrada = cats.filter(
          (c) => (c.tipo === 'entrada' || c.tipo === 'ambos') && c.nome.toLowerCase() !== 'mensalidade',
        );
        const opts = entrada.map((c) => ({ value: c.nome, label: c.nome }));
        setCategorias(opts);
        if (!initial) {
          const prefer =
            opts.find((o) => o.value === 'Obrigação')?.value ||
            opts.find((o) => o.value === 'Cobrança')?.value ||
            opts.find((o) => o.value === 'Outro')?.value ||
            opts[0]?.value ||
            TIPO_PADRAO;
          setValues((v) => ({ ...v, tipo: prefer }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPessoas([]);
          setCategorias([{ value: TIPO_PADRAO, label: TIPO_PADRAO }]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const pid = (resolvePessoaIdCobranca(initial) ?? '') as UUID;
      setValues({
        pessoa_id: pid,
        data: initial.vencimento ?? '',
        valor: valorToMaskedInput(Number(initial.valor_total ?? initial.valor ?? 0)),
        descricao: initial.descricao ?? '',
        tipo: labelCobrancaTipo(initial.tipo) === '—' ? TIPO_PADRAO : labelCobrancaTipo(initial.tipo),
        parcelas: '1',
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, initial]);

  const pessoaOptions = useMemo(
    (): SearchableSelectOption[] => pessoas.map((p) => ({ value: p.id, label: p.nome })),
    [pessoas],
  );

  const tipoOptions = useMemo((): SearchableSelectOption[] => {
    if (!values.tipo) return categorias;
    if (categorias.some((o) => o.value === values.tipo)) return categorias;
    return [{ value: values.tipo, label: values.tipo }, ...categorias];
  }, [categorias, values.tipo]);

  const parcelasNum = Math.max(1, Math.min(48, Number.parseInt(values.parcelas, 10) || 1));
  const valorNum = parseValorInput(values.valor) ?? 0;
  const valorParcelaHint =
    !initial && parcelasNum > 1 && valorNum > 0
      ? `≈ ${formatMoneyBRL(valorNum / parcelasNum)} por parcela`
      : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.pessoa_id || !values.data) return;
    setSaving(true);
    try {
      await onSave({
        ...values,
        parcelas: String(parcelasNum),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="dash-panel-backdrop" onClick={onClose} aria-hidden />
      <aside className="dash-panel-slide" role="dialog" aria-labelledby="cobranca-form-title">
        <div className="dash-panel-slide__inner">
          <h2 id="cobranca-form-title">{initial ? 'Editar cobrança' : 'Nova cobrança'}</h2>
          <form className="dash-member-form" onSubmit={(e) => void submit(e)}>
            <label className="dash-field">
              <span>Membro</span>
              <SearchableSelect
                options={pessoaOptions}
                value={values.pessoa_id}
                onChange={(v) => setValues((prev) => ({ ...prev, pessoa_id: v as UUID }))}
                searchPlaceholder="Buscar membro…"
                placeholder="Selecionar membro…"
                required
                aria-label="Membro"
              />
              {!values.pessoa_id && <span className="dash-hint">Selecione um membro na lista.</span>}
            </label>

            <label className="dash-field">
              <span>Categoria do fluxo</span>
              <SearchableSelect
                options={tipoOptions}
                value={values.tipo}
                onChange={(v) => setValues((prev) => ({ ...prev, tipo: v }))}
                searchPlaceholder="Buscar categoria…"
                aria-label="Categoria do fluxo de caixa"
              />
            </label>

            <label className="dash-field">
              <span>Data vencimento{!initial && parcelasNum > 1 ? ' (1ª parcela)' : ''}</span>
              <input
                type="date"
                required
                value={values.data}
                onChange={(e) => setValues((v) => ({ ...v, data: e.target.value }))}
              />
            </label>

            <label className="dash-field">
              <span>Valor total</span>
              <input
                inputMode="decimal"
                required
                value={values.valor}
                onChange={(e) => setValues((v) => ({ ...v, valor: sanitizeValorInput(e.target.value) }))}
                placeholder="R$ 0,00"
              />
            </label>

            {!initial && (
              <label className="dash-field">
                <span>Parcelas</span>
                <input
                  type="number"
                  min={1}
                  max={48}
                  step={1}
                  value={values.parcelas}
                  onChange={(e) => setValues((v) => ({ ...v, parcelas: e.target.value.replace(/\D/g, '') || '1' }))}
                  aria-label="Número de parcelas"
                />
                <span className="dash-hint">
                  {parcelasNum > 1
                    ? `Cria ${parcelasNum} cobranças mensais.${valorParcelaHint ? ` ${valorParcelaHint}` : ''}`
                    : '1 = cobrança única. Acima de 1 divide o valor em vencimentos mensais.'}
                </span>
              </label>
            )}

            <label className="dash-field dash-field--full">
              <span>Descrição</span>
              <textarea
                rows={4}
                value={values.descricao}
                onChange={(e) => setValues((v) => ({ ...v, descricao: e.target.value }))}
              />
            </label>

            <div className="dash-form-actions">
              <button type="button" className="dash-btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="dash-btn-primary" disabled={saving || !values.pessoa_id}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
