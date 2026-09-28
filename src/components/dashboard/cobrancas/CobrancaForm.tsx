import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchPessoasOptions, type PessoaOption } from '../../../services/pessoasLookup';
import type { CobrancaComMembro } from '../../../services/cobrancas';
import { resolvePessoaIdCobranca, type CobrancaTipo, type UUID } from '../../../types/database';
import { sanitizeValorInput } from '../../../utils/money';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';

export type CobrancaFormValues = {
  pessoa_id: UUID;
  data: string;
  valor: string;
  descricao: string;
  tipo: CobrancaTipo;
};

const emptyValues = (): CobrancaFormValues => ({
  pessoa_id: '',
  data: '',
  valor: '',
  descricao: '',
  tipo: 'obrigacao',
});

const TIPO_OPTIONS: SearchableSelectOption[] = [
  { value: 'obrigacao', label: 'Obrigação' },
  { value: 'outros', label: 'Outros' },
];

type Props = {
  open: boolean;
  initial: CobrancaComMembro | null;
  onClose: () => void;
  onSave: (values: CobrancaFormValues) => Promise<void>;
};

export function CobrancaForm({ open, initial, onClose, onSave }: Props) {
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [values, setValues] = useState<CobrancaFormValues>(emptyValues);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchPessoasOptions()
      .then((p) => {
        if (!cancelled) setPessoas(p);
      })
      .catch(() => {
        if (!cancelled) setPessoas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const pid = (resolvePessoaIdCobranca(initial) ?? '') as UUID;
      const tipoRaw = initial.tipo;
      const tiposValidos: CobrancaTipo[] = ['obrigacao', 'outros'];
      const tipo: CobrancaTipo = tiposValidos.includes(tipoRaw as CobrancaTipo)
        ? (tipoRaw as CobrancaTipo)
        : 'obrigacao';
      setValues({
        pessoa_id: pid,
        data: initial.vencimento ?? '',
        valor: String(initial.valor_total ?? initial.valor ?? ''),
        descricao: initial.descricao ?? '',
        tipo,
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, initial]);

  const pessoaOptions = useMemo(
    (): SearchableSelectOption[] => pessoas.map((p) => ({ value: p.id, label: p.nome })),
    [pessoas],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.pessoa_id || !values.data) return;
    setSaving(true);
    try {
      await onSave(values);
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
          <h2 id="cobranca-form-title">{initial ? 'Editar obrigação' : 'Nova obrigação'}</h2>
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
              <span>Tipo</span>
              <SearchableSelect
                options={TIPO_OPTIONS}
                value={values.tipo}
                onChange={(v) => setValues((prev) => ({ ...prev, tipo: v as CobrancaTipo }))}
                aria-label="Tipo de cobrança"
              />
            </label>

            <label className="dash-field">
              <span>Data vencimento</span>
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
                placeholder="0,00"
              />
            </label>

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
