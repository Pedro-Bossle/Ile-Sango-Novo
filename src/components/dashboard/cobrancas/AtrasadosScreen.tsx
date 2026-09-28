import { useEffect, useMemo, useState } from 'react';
import {
  fetchCobrancasComMembros,
  isCobrancaContabilizavel,
  isCobrancaPendente,
  isMensalidadeTipo,
  valorSaldoCobranca,
  type CobrancaComMembro,
} from '../../../services/cobrancas';
import {
  fetchMensalidadesAno,
  fetchMembrosMensalidade,
  MESES_LABEL,
  membroApareceNoAno,
  mesAntesDaEntrada,
  mesDesligadoPorInativacao,
  type MensalidadeRow,
  type MembroMensalidade,
} from '../../../services/mensalidades';
import { fetchConfigIle } from '../../../services/configIle';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { formatDateBR } from '../../../utils/formatDate';
import { gerarPdfRelatorio } from '../../../utils/pdfRelatorio';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isAtrasada(c: CobrancaComMembro, hoje: string) {
  if (!isCobrancaPendente(c) || valorSaldoCobranca(c) <= 0) return false;
  const venc = (c.vencimento ?? '').slice(0, 10);
  return Boolean(venc && venc < hoje);
}

function mensalidadeAtrasada(ano: number, mes: number, hoje: Date, diaLimite = 15) {
  const limite = new Date(ano, mes - 1, diaLimite);
  return hoje > limite;
}

type MensalidadeAberto = {
  mes: number;
  valor: number;
  atrasada: boolean;
};

type MembroAtraso = {
  pessoaId: string;
  nome: string;
  contato?: string | null;
  email?: string | null;
  mensalidades: MensalidadeAberto[];
  cobrancas: CobrancaComMembro[];
  totalMens: number;
  totalCob: number;
  qtdAtraso: number;
};

type Props = { canSend?: boolean };

export function AtrasadosScreen({ canSend = true }: Props) {
  const yearNow = new Date().getFullYear();
  const [ano, setAno] = useState(yearNow);
  const [busca, setBusca] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(true);
  const [cobrancas, setCobrancas] = useState<CobrancaComMembro[]>([]);
  const [mensRows, setMensRows] = useState<MensalidadeRow[]>([]);
  const [membrosBase, setMembrosBase] = useState<MembroMensalidade[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [pix, setPix] = useState('');
  const [ileNome, setIleNome] = useState('Ilê');
  const [obs, setObs] = useState<Record<string, string>>({});

  const hojeIso = new Date().toISOString().slice(0, 10);
  const hoje = useMemo(() => new Date(), []);

  const obsKey = (pessoaId: string) => `atrasados_obs_${ano}_${pessoaId}`;

  useEffect(() => {
    void fetchCobrancasComMembros()
      .then((data) => setCobrancas(data.filter((c) => !isMensalidadeTipo(c))))
      .catch((e) => setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' }));
    fetchConfigIle()
      .then((c) => {
        setPix(c.chave_pix ?? '');
        setIleNome(c.nome_ile?.trim() || 'Ilê');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void Promise.all([fetchMensalidadesAno(ano), fetchMembrosMensalidade()])
      .then(([rows, membros]) => {
        setMensRows(rows);
        setMembrosBase(membros);
      })
      .catch((e) => setToast({ msg: e instanceof Error ? e.message : 'Erro nas mensalidades', variant: 'error' }));
  }, [ano]);

  const membros = useMemo(() => {
    const map = new Map<string, MembroAtraso>();

    const ensure = (pessoaId: string, nome: string, contato?: string | null, email?: string | null) => {
      if (!map.has(pessoaId)) {
        map.set(pessoaId, {
          pessoaId,
          nome,
          contato,
          email,
          mensalidades: [],
          cobrancas: [],
          totalMens: 0,
          totalCob: 0,
          qtdAtraso: 0,
        });
      }
      return map.get(pessoaId)!;
    };

    const membroById = new Map(membrosBase.map((m) => [m.id, m]));

    for (const r of mensRows) {
      if (r.status !== 'aberto') continue;
      const m = membroById.get(r.pessoa_id);
      if (!m || !membroApareceNoAno(m, ano)) continue;
      if (mesDesligadoPorInativacao(m, ano, r.mes)) continue;
      if (mesAntesDaEntrada(m, ano, r.mes)) continue;
      const row = ensure(m.id, m.nome, m.contato, m.email);
      const atrasada = mensalidadeAtrasada(ano, r.mes, hoje);
      row.mensalidades.push({ mes: r.mes, valor: Number(r.valor), atrasada });
      row.totalMens += Number(r.valor);
      if (atrasada) row.qtdAtraso += 1;
    }

    for (const c of cobrancas) {
      const pid = String(c.pessoa_id ?? c.membro_id ?? '');
      if (!pid) continue;
      const venc = (c.vencimento ?? c.created_at ?? '').slice(0, 10);
      if (venc && !venc.startsWith(String(ano))) continue;
      if (!isCobrancaContabilizavel(c)) continue;

      const row = ensure(pid, c.membro_nome || '—', c.membro_contato, c.membro_email);
      const saldo = valorSaldoCobranca(c);
      row.cobrancas.push(c);
      row.totalCob += saldo;
      if (isAtrasada(c, hojeIso)) row.qtdAtraso += 1;
    }

    for (const row of map.values()) {
      row.mensalidades.sort((a, b) => a.mes - b.mes);
    }

    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [mensRows, membrosBase, cobrancas, ano, hoje, hojeIso]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return membros.filter((m) => {
      if (soAtrasados && m.qtdAtraso === 0) return false;
      if (q && !m.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [membros, busca, soAtrasados]);

  const kpis = useMemo(() => {
    const comAtraso = filtrados.filter((m) => m.qtdAtraso > 0).length;
    const total = filtrados.reduce((a, m) => a + m.totalMens + m.totalCob, 0);
    return { membros: filtrados.length, comAtraso, total };
  }, [filtrados]);

  const buildMsg = (m: MembroAtraso) => {
    const lines = [
      `Olá ${m.nome}!`,
      '',
      `Segue o resumo de valores em aberto com o ${ileNome}:`,
    ];
    if (m.mensalidades.length) {
      lines.push('', 'Mensalidades:');
      m.mensalidades.forEach((c) => {
        lines.push(`• ${MESES[c.mes - 1] || MESES_LABEL[c.mes - 1]} — ${money(c.valor)}${c.atrasada ? ' (atrasado)' : ''}`);
      });
    }
    if (m.cobrancas.length) {
      lines.push('', 'Obrigações:');
      m.cobrancas.forEach((c) => {
        lines.push(
          `• ${c.descricao || 'Obrigação'} (venc. ${formatDateBR(c.vencimento)}) — ${money(valorSaldoCobranca(c))}`,
        );
      });
    }
    lines.push('', `Total: ${money(m.totalMens + m.totalCob)}`);
    if (pix) lines.push(`Pix: ${pix}`);
    lines.push('', 'Obrigado!');
    return lines.join('\n');
  };

  const copiar = async (m: MembroAtraso) => {
    try {
      await navigator.clipboard.writeText(buildMsg(m));
      setToast({ msg: 'Mensagem copiada.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar.', variant: 'error' });
    }
  };

  const whatsapp = (m: MembroAtraso) => {
    const url = buildWaMeLink(m.contato, buildMsg(m));
    if (!url) {
      setToast({ msg: 'Membro sem telefone.', variant: 'error' });
      return;
    }
    openExternal(url);
  };

  const setObsMembro = (pessoaId: string, value: string) => {
    setObs((prev) => ({ ...prev, [pessoaId]: value }));
    try {
      localStorage.setItem(obsKey(pessoaId), value);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const next: Record<string, string> = {};
    membros.forEach((m) => {
      try {
        next[m.pessoaId] = localStorage.getItem(obsKey(m.pessoaId)) ?? '';
      } catch {
        next[m.pessoaId] = '';
      }
    });
    setObs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega obs ao mudar lista/ano
  }, [membros, ano]);

  const relatorio = () => {
    const linhas = filtrados.flatMap((m) => [
      ...m.mensalidades.map((c) => ({
        nome: m.nome,
        data: `${String(c.mes).padStart(2, '0')}/${ano}`,
        descricao: `Mensalidade ${MESES_LABEL[c.mes - 1]}`,
        valor: c.valor,
        tipo: 'mensalidade',
      })),
      ...m.cobrancas.map((c) => ({
        nome: m.nome,
        data: formatDateBR(c.vencimento),
        descricao: c.descricao || 'Obrigação',
        valor: valorSaldoCobranca(c),
        tipo: c.tipo,
      })),
    ]);
    gerarPdfRelatorio({
      periodo: { de: `${ano}-01-01`, ate: `${ano}-12-31` },
      tituloPrincipal: `Atrasados — ${ano}`,
      subtitulo: `${kpis.membros} membros · ${kpis.comAtraso} com atraso · Total ${money(kpis.total)}`,
      total: kpis.total,
      linhas,
    });
  };

  const anoOptions = useMemo(
    (): SearchableSelectOption[] =>
      [yearNow, yearNow - 1, yearNow - 2].map((y) => ({ value: String(y), label: String(y) })),
    [yearNow],
  );

  return (
    <div className="dash-atrasados" data-tour="atrasados">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-atrasados__header">
        <h1>Atrasados</h1>
        <p className="dash-muted">
          Mensalidades e obrigações em aberto/atraso. Mensagem pronta para WhatsApp com Pix.
        </p>
      </header>

      <div className="dash-atrasados__toolbar" data-tour="atrasados-toolbar">
        <SearchableSelect
          options={anoOptions}
          value={String(ano)}
          onChange={(v) => setAno(Number(v))}
          aria-label="Ano"
        />
        <input
          className="dash-atrasados__busca"
          placeholder="Nome do membro"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button
          type="button"
          className={`dash-toggle-paid${soAtrasados ? ' is-on' : ''}`}
          onClick={() => setSoAtrasados((v) => !v)}
        >
          Só atrasados
          <span className="dash-atrasados__badge">{kpis.comAtraso}</span>
        </button>
        <button type="button" className="dash-add-button dash-add-button--secondary" onClick={relatorio}>
          Relatório
        </button>
      </div>

      <div className="dash-grid-stats dash-atrasados__kpis" data-tour="atrasados-kpis">
        <article className="dash-card">
          <h3>Membros na lista</h3>
          <p className="dash-big">{kpis.membros}</p>
        </article>
        <article className="dash-card">
          <h3>Com atraso</h3>
          <p className="dash-big dash-atrasados__warn">{kpis.comAtraso}</p>
        </article>
        <article className="dash-card">
          <h3>Total em aberto</h3>
          <p className="dash-big dash-big--money">{money(kpis.total)}</p>
        </article>
      </div>

      <div className="dash-atrasados__list" data-tour="atrasados-lista">
        {filtrados.length === 0 ? (
          <p className="dash-muted">Nenhum registro para os filtros atuais.</p>
        ) : (
          filtrados.map((m) => (
            <article key={m.pessoaId} className="dash-card dash-atrasados__card">
              <div className="dash-atrasados__card-head">
                <div>
                  <strong>{m.nome}</strong>
                  {m.qtdAtraso > 0 && (
                    <span className="dash-atrasados__badge">
                      {m.qtdAtraso} atrasado{m.qtdAtraso === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="dash-atrasados__card-actions">
                  <button
                    type="button"
                    className="dash-add-button dash-add-button--secondary"
                    onClick={() => void copiar(m)}
                  >
                    Copiar
                  </button>
                  {canSend && (
                    <button type="button" className="dash-btn-primary" onClick={() => whatsapp(m)}>
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>

              <div className="dash-atrasados__card-body">
                <div>
                  {m.mensalidades.length > 0 && (
                    <>
                      <h4>Mensalidades</h4>
                      <ul>
                        {m.mensalidades.map((c) => (
                          <li key={`${m.pessoaId}-m-${c.mes}`}>
                            <span className={c.atrasada ? 'dash-atrasados__dot' : 'dash-atrasados__dot--ok'} />
                            {MESES[c.mes - 1]} — {money(c.valor)}
                            {c.atrasada ? ' (atrasado)' : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.cobrancas.length > 0 && (
                    <>
                      <h4>Obrigações</h4>
                      <ul>
                        {m.cobrancas.map((c) => (
                          <li key={String(c.id)}>
                            <span
                              className={
                                isAtrasada(c, hojeIso) ? 'dash-atrasados__dot' : 'dash-atrasados__dot--ok'
                              }
                            />
                            {c.descricao || 'Obrigação'} (venc. {formatDateBR(c.vencimento)}) —{' '}
                            {money(valorSaldoCobranca(c))}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="dash-atrasados__totais">
                  <p>Mensalidades: {money(m.totalMens)}</p>
                  <p>Obrigações: {money(m.totalCob)}</p>
                  <p>
                    <strong>Total: {money(m.totalMens + m.totalCob)}</strong>
                  </p>
                  <label className="dash-field">
                    <span>Obs.</span>
                    <textarea
                      rows={2}
                      value={obs[m.pessoaId] ?? ''}
                      onChange={(e) => setObsMembro(m.pessoaId, e.target.value)}
                      placeholder="Anotação local…"
                    />
                  </label>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
