import { useMemo } from 'react';
import { formatarTelefoneMascara } from '../../../utils/telefone';
import { signoFromDate, SIGNOS_LISTA } from '../../../utils/signo';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';

type Props = {
  nome: string;
  dataEntrada: string;
  dataNascimento: string;
  contato: string;
  email: string;
  signo: string;
  obs: string;
  onChange: (
    field: 'nome' | 'dataEntrada' | 'dataNascimento' | 'contato' | 'email' | 'signo' | 'obs',
    value: string,
  ) => void;
};

export function PessoaisSection({
  nome,
  dataEntrada,
  dataNascimento,
  contato,
  email,
  signo,
  obs,
  onChange,
}: Props) {
  const signoNormalizado = (signo ?? '').trim();
  const signoEhDaLista = SIGNOS_LISTA.includes(signoNormalizado);

  const signoOptions = useMemo((): SearchableSelectOption[] => {
    const opts: SearchableSelectOption[] = [{ value: '', label: '—' }];
    if (!signoEhDaLista && signoNormalizado) {
      opts.push({ value: signoNormalizado, label: `${signoNormalizado} (legado)` });
    }
    SIGNOS_LISTA.forEach((s) => opts.push({ value: s, label: s }));
    return opts;
  }, [signoEhDaLista, signoNormalizado]);

  const onNascimento = (iso: string) => {
    onChange('dataNascimento', iso);
    const auto = signoFromDate(iso);
    if (auto) onChange('signo', auto);
  };

  return (
    <section className="dash-form-section">
      <h2 className="dash-form-section__title">Dados pessoais</h2>
      <div className="dash-form-grid dash-pessoais-row--2">
        <label className="dash-field">
          <span>Nome *</span>
          <input type="text" value={nome} onChange={(e) => onChange('nome', e.target.value)} required autoComplete="name" />
        </label>
        <label className="dash-field">
          <span>Data de entrada (iniciação)</span>
          <input type="date" value={dataEntrada} onChange={(e) => onChange('dataEntrada', e.target.value)} />
        </label>
      </div>
      <div className="dash-form-grid dash-pessoais-row--2">
        <label className="dash-field">
          <span>Data de nascimento</span>
          <input type="date" value={dataNascimento} onChange={(e) => onNascimento(e.target.value)} />
        </label>
        <label className="dash-field">
          <span>Signo</span>
          <SearchableSelect
            options={signoOptions}
            value={signoNormalizado}
            onChange={(v) => onChange('signo', v)}
            searchPlaceholder="Buscar signo…"
            aria-label="Signo"
          />
        </label>
      </div>
      <div className="dash-form-grid dash-pessoais-row--2">
        <label className="dash-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => onChange('email', e.target.value)} autoComplete="email" />
        </label>
        <label className="dash-field">
          <span>Contato / Telefone</span>
          <input
            type="text"
            value={formatarTelefoneMascara(contato)}
            onChange={(e) => onChange('contato', e.target.value)}
            autoComplete="tel"
            inputMode="numeric"
            placeholder="(00)0.0000-0000"
          />
        </label>
      </div>
      <label className="dash-field dash-field--full">
        <span>Observações</span>
        <textarea value={obs} onChange={(e) => onChange('obs', e.target.value)} rows={3} />
      </label>
    </section>
  );
}
