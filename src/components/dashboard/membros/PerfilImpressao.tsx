import type { CobrancaComMembro } from '../../../services/cobrancas';
import type { CadastroFormState } from '../../../types/memberForm';
import type { ExuFormRow, OrumaleFormRow, UmbandaFormRow } from '../../../hooks/useMemberForm';
import type { Orixa } from '../../../types/database';
import { formatDateBR } from '../../../utils/formatDate';

type Props = {
  nome: string;
  dataNascimento: string;
  contatoFormatado: string;
  email: string;
  signo: string;
  obs: string;
  orixas: Orixa[];
  cadastro: CadastroFormState;
  orumale: OrumaleFormRow[];
  exus: ExuFormRow[];
  umbanda: UmbandaFormRow[];
  cobrancas: CobrancaComMembro[];
  qualidadeNomeById: Record<string, string>;
  sobrenomeNomeById: Record<string, string>;
};

type BlocoOrisa = {
  titulo: string;
  orixaId: string;
  qualidadeId: string;
  sobrenomeId: string;
  digina: string;
};

const formatMoney = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function PerfilImpressao({
  nome,
  dataNascimento,
  contatoFormatado,
  email,
  signo,
  obs,
  orixas,
  cadastro,
  orumale,
  exus,
  umbanda,
  cobrancas,
  qualidadeNomeById,
  sobrenomeNomeById,
}: Props) {
  // Mapa para resolver IDs de orixá em texto no layout impresso.
  const orixaNomeById = new Map(orixas.map((o) => [String(o.id), o.nome]));
  const blocosOrisa: BlocoOrisa[] = [
    {
      titulo: 'Cabeça',
      orixaId: cadastro.orixa_cabeca_id,
      qualidadeId: cadastro.qualidade_cabeca_id,
      sobrenomeId: cadastro.sobrenome_orisa_cabeca_id,
      digina: cadastro.digina_cabeca,
    },
    {
      titulo: 'Corpo',
      orixaId: cadastro.orixa_corpo_id,
      qualidadeId: cadastro.qualidade_corpo_id,
      sobrenomeId: cadastro.sobrenome_orisa_corpo_id,
      digina: cadastro.digina_corpo,
    },
    {
      titulo: 'Passagem',
      orixaId: cadastro.orixa_passagem_id,
      qualidadeId: cadastro.qualidade_passagem_id,
      sobrenomeId: cadastro.sobrenome_orisa_passagem_id,
      digina: cadastro.digina_passagem,
    },
    {
      titulo: 'Saída',
      orixaId: cadastro.orixa_saida_id,
      qualidadeId: cadastro.qualidade_saida_id,
      sobrenomeId: cadastro.sobrenome_orisa_saida_id,
      digina: cadastro.digina_saida,
    },
  ];

  return (
    <article className="perfil-impressao" aria-hidden>
      <header className="perfil-cabecalho perfil-secao-principal">
        <div>
          <h1>{nome || 'Perfil do membro'}</h1>
          <div className="perfil-cabecalho__dados">
            <p>
              <strong>Data de nascimento:</strong> {formatDateBR(dataNascimento)}
            </p>
            <p>
              <strong>Signo:</strong> {signo || '—'}
            </p>
            <p>
              <strong>Telefone:</strong> {contatoFormatado || '—'}
            </p>
            <p>
              <strong>Email:</strong> {email || '—'}
            </p>
            <p>
              <strong>Endereço:</strong> —
            </p>
          </div>
        </div>
        <div className="perfil-cabecalho__foto">
          {/* Placeholder até o projeto ter campo de foto no perfil do membro. */}
          <div>Sem foto</div>
        </div>
      </header>

      <section className="perfil-bloco perfil-secao-principal">
        <h2>Orisás</h2>
        <div className="perfil-grid perfil-grid--4">
          {blocosOrisa.map((b) => (
            <div key={b.titulo} className="perfil-card">
              <h3>{b.titulo}</h3>
              <p>
                <strong>Orisá:</strong> {orixaNomeById.get(b.orixaId) ?? '—'}
              </p>
              <p>
                <strong>Qualidade:</strong> {qualidadeNomeById[b.qualidadeId] ?? '—'}
              </p>
              <p>
                <strong>Sobrenome:</strong> {sobrenomeNomeById[b.sobrenomeId] ?? '—'}
              </p>
              <p>
                <strong>Digina:</strong> {b.digina || '—'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="perfil-bloco perfil-secao-principal">
        <h2>Orumalé</h2>
        {orumale.length === 0 ? (
          <p>Sem registros.</p>
        ) : (
          <ul className="perfil-lista">
            {orumale.map((row) => (
              <li key={row.key}>
                {formatDateBR(row.data_feitura)} — {orixaNomeById.get(row.orixa_id) ?? '—'} /{' '}
                {qualidadeNomeById[row.qualidade_id] ?? '—'} / {sobrenomeNomeById[row.sobrenome_orisa_id] ?? '—'} /
                Digina: {row.digina || '—'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="perfil-bloco perfil-secao-principal">
        <h2>Exu</h2>
        {exus.length === 0 ? (
          <p>Sem registros.</p>
        ) : (
          <ul className="perfil-lista">
            {exus.map((row) => (
              <li key={row.key}>
                {row.exu_nome || '—'} — Ordem {row.exu_ordem || 1} — Feitura: {formatDateBR(row.data_feitura)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="perfil-bloco perfil-secao-principal">
        <h2>Umbanda</h2>
        {umbanda.length === 0 ? (
          <p>Sem registros.</p>
        ) : (
          <ul className="perfil-lista">
            {umbanda.map((row) => (
              <li key={row.key}>
                {row.umbanda_nome || '—'} — Ordem {row.umbanda_ordem || 1} — Feitura:{' '}
                {formatDateBR(row.data_feitura)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="perfil-bloco perfil-secao-principal">
        <h2>Cobranças / Obrigações</h2>
        {cobrancas.length === 0 ? (
          <p>Sem cobranças associadas.</p>
        ) : (
          <ul className="perfil-lista">
            {cobrancas.map((c) => (
              <li key={String(c.id)}>
                {formatDateBR(c.vencimento ?? null)} — {c.descricao || c.tipo || 'Sem descrição'} —{' '}
                {formatMoney(Number(c.valor_total ?? c.valor ?? 0))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {obs && (
        <section className="perfil-bloco perfil-secao-principal">
          <h2>Observações</h2>
          <p>{obs}</p>
        </section>
      )}
    </article>
  );
}
