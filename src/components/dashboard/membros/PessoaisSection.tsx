import { formatarTelefoneMascara } from '../../../utils/telefone';

type Props = {
  nome: string;
  dataNascimento: string;
  contato: string;
  email: string;
  signo: string;
  obs: string;
  onChange: (field: 'nome' | 'dataNascimento' | 'contato' | 'email' | 'signo' | 'obs', value: string) => void;
};

const SIGNOS = [
  { nome: 'Áries', periodo: '21/03 – 19/04' },
  { nome: 'Touro', periodo: '20/04 – 20/05' },
  { nome: 'Gêmeos', periodo: '21/05 – 20/06' },
  { nome: 'Câncer', periodo: '21/06 – 22/07' },
  { nome: 'Leão', periodo: '23/07 – 22/08' },
  { nome: 'Virgem', periodo: '23/08 – 22/09' },
  { nome: 'Libra', periodo: '23/09 – 22/10' },
  { nome: 'Escorpião', periodo: '23/10 – 21/11' },
  { nome: 'Sagitário', periodo: '22/11 – 21/12' },
  { nome: 'Capricórnio', periodo: '22/12 – 19/01' },
  { nome: 'Aquário', periodo: '20/01 – 18/02' },
  { nome: 'Peixes', periodo: '19/02 – 20/03' },
];

export function PessoaisSection({ nome, dataNascimento, contato, email, signo, obs, onChange }: Props) {
  const signoNormalizado = (signo ?? '').trim();
  const signoEhDaLista = SIGNOS.some((s) => s.nome === signoNormalizado);

  return (
    <section className="dash-form-section">
      <h2 className="dash-form-section__title">Dados pessoais</h2>
      <div className="dash-form-grid">
        <label className="dash-field">
          <span>Nome *</span>
          <input
            type="text"
            value={nome}
            onChange={(e) => onChange('nome', e.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label className="dash-field">
          <span>Data de nascimento</span>
          <input type="date" value={dataNascimento} onChange={(e) => onChange('dataNascimento', e.target.value)} />
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
        <label className="dash-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => onChange('email', e.target.value)} autoComplete="email" />
        </label>
        <label className="dash-field">
          <span>Signo</span>
          <select value={signoNormalizado} onChange={(e) => onChange('signo', e.target.value)}>
            <option value="">—</option>
            {/* Mantém valor legado disponível para não quebrar edição de dados antigos. */}
            {!signoEhDaLista && signoNormalizado && (
              <option value={signoNormalizado}>{signoNormalizado} (legado)</option>
            )}
            {SIGNOS.map((s) => (
              <option key={s.nome} value={s.nome} title={s.periodo}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field dash-field--full">
          <span>Observações</span>
          <textarea value={obs} onChange={(e) => onChange('obs', e.target.value)} rows={3} />
        </label>
      </div>
    </section>
  );
}
