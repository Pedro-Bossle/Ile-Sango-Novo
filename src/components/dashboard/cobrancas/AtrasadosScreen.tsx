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
  mensalidadeEstaAtrasada,
  mesAntesDaEntrada,
  mesDesligadoPorInativacao,
  type MensalidadeRow,
  type MembroMensalidade,
} from '../../../services/mensalidades';
import { fetchConfigIle, formatarEnderecoIle } from '../../../services/configIle';
import { enviarEmail } from '../../../services/enviarEmail';
import { fetchMapaOrixaCabeca, type OrixaCabecaRef } from '../../../services/membros';
import { buildWaMeLink, openExternal } from '../../../utils/whatsappLink';
import { formatDateBR } from '../../../utils/formatDate';
import { gerarPdfRelatorio } from '../../../utils/pdfRelatorio';
import { carregarLogoBase64 } from '../../../utils/logoBase64';
import { primeiroNome, saudacaoFilhoSanto } from '../../../utils/saudacaoFilhoSanto';
import { matchesSearch } from '../../../utils/searchFold';
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

function mensalidadeAtrasada(ano: number, mes: number, hoje: Date) {
  return mensalidadeEstaAtrasada(ano, mes, hoje);
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
  const [ileLogo, setIleLogo] = useState<string | null>(null);
  const [ileEndereco, setIleEndereco] = useState('');
  const [loading, setLoading] = useState(true);
  const [cabecaByPessoa, setCabecaByPessoa] = useState<Map<string, OrixaCabecaRef>>(() => new Map());

  const hojeIso = new Date().toISOString().slice(0, 10);
  const hoje = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchCobrancasComMembros().then((data) => data.filter((c) => !isMensalidadeTipo(c))),
      fetchConfigIle().then(async (c) => {
        const logo = c.logo_base64 || (await carregarLogoBase64());
        return { c, logo };
      }),
    ])
      .then(([cob, cfg]) => {
        if (cancelled) return;
        setCobrancas(cob);
        setPix(cfg.c.chave_pix ?? '');
        setIleNome(cfg.c.nome_ile?.trim() || 'Ilê');
        setIleEndereco(formatarEnderecoIle(cfg.c));
        setIleLogo(cfg.logo);
      })
      .catch((e) => {
        if (!cancelled) {
          setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' });
          void carregarLogoBase64().then(setIleLogo);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchMensalidadesAno(ano), fetchMembrosMensalidade()])
      .then(async ([rows, membros]) => {
        if (cancelled) return;
        setMensRows(rows);
        setMembrosBase(membros);
        const mapa = await fetchMapaOrixaCabeca(membros.map((m) => m.id));
        if (!cancelled) setCabecaByPessoa(mapa);
      })
      .catch((e) => {
        if (!cancelled) {
          setToast({ msg: e instanceof Error ? e.message : 'Erro nas mensalidades', variant: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
    const q = busca.trim();
    return membros.filter((m) => {
      if (soAtrasados && m.qtdAtraso === 0) return false;
      if (q && !matchesSearch(m.nome, q)) return false;
      return true;
    });
  }, [membros, busca, soAtrasados]);

  const kpis = useMemo(() => {
    const comAtraso = filtrados.filter((m) => m.qtdAtraso > 0).length;
    const total = filtrados.reduce((a, m) => a + m.totalMens + m.totalCob, 0);
    return { membros: filtrados.length, comAtraso, total };
  }, [filtrados]);

  const buildMsg = (m: MembroAtraso) => {
    const cabeca = cabecaByPessoa.get(m.pessoaId);
    const lines = [
      saudacaoFilhoSanto({
        nome: m.nome,
        orixaCabeca: cabeca?.orixa_cabeca_nome,
        qualidadeCabeca: cabeca?.orixa_cabeca_qualidade_nome,
      }),
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
      lines.push('', 'Cobranças:');
      m.cobrancas.forEach((c) => {
        lines.push(
          `• ${c.descricao || 'Cobrança'} (venc. ${formatDateBR(c.vencimento)}) — ${money(valorSaldoCobranca(c))}`,
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

  const email = (m: MembroAtraso) => {
    void (async () => {
      const to = String(m.email ?? '').trim();
      if (!to) {
        setToast({ msg: 'Membro sem e-mail cadastrado.', variant: 'error' });
        return;
      }
      try {
        await enviarEmail({
          to,
          subject: `Valores em aberto — ${ileNome}`,
          title: 'Valores em aberto',
          text: buildMsg(m),
        });
        const quem = primeiroNome(m.nome) || m.nome;
        setToast({ msg: `E-mail enviado à ${quem}.`, variant: 'success' });
      } catch (e) {
        setToast({
          msg: e instanceof Error ? e.message : 'Não foi possível enviar o e-mail.',
          variant: 'error',
        });
      }
    })();
  };

  const relatorio = () => {
    const map = new Map<string, number>();
    for (const m of filtrados) {
      const total = m.totalMens + m.totalCob;
      if (total <= 0) continue;
      map.set(m.nome, (map.get(m.nome) ?? 0) + total);
    }
    const linhas = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }))
      .map(([nome, valor]) => ({
        nome,
        data: '',
        descricao: '',
        valor,
      }));
    gerarPdfRelatorio({
      periodo: { de: `${ano}-01-01`, ate: `${ano}-12-31` },
      tituloPrincipal: `Atrasados — ${ano}`,
      subtitulo: soAtrasados ? 'Somente membros com atraso.' : 'Membros com valores em aberto.',
      total: kpis.total,
      totalLabel: 'Total em aberto',
      ileNome,
      ileEndereco,
      logoBase64: ileLogo,
      variante: 'aberto',
      fileNamePrefix: `atrasados-${ano}`,
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
          Mensalidades e cobranças em aberto/atraso. Mensagem pronta para WhatsApp com Pix.
        </p>
      </header>

      <div className="dash-atrasados__toolbar" data-tour="atrasados-toolbar">
        <SearchableSelect
          className="dash-atrasados__ano"
          options={anoOptions}
          value={String(ano)}
          onChange={(v) => setAno(Number(v))}
          aria-label="Ano"
        />
        <input
          className="dash-atrasados__busca"
          placeholder="Buscar membro…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar membro"
        />
        <button
          type="button"
          className={`dash-toggle-paid${soAtrasados ? ' is-on' : ''}`}
          onClick={() => setSoAtrasados((v) => !v)}
          aria-pressed={soAtrasados}
        >
          Só atrasados
          <span className="dash-atrasados__badge">{kpis.comAtraso}</span>
        </button>
        <button type="button" className="dash-add-button dash-add-button--secondary" onClick={relatorio}>
          Relatório
        </button>
      </div>

      <div className="dash-grid-stats dash-atrasados__kpis" data-tour="atrasados-kpis">
        {loading ? (
          <p className="dash-muted">Carregando…</p>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="dash-atrasados__list" data-tour="atrasados-lista">
        {loading ? null : filtrados.length === 0 ? (
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
                    <button
                      type="button"
                      className="dash-add-button dash-add-button--secondary"
                      onClick={() => email(m)}
                    >
                      E-mail
                    </button>
                  )}
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
                      <h4>Cobranças</h4>
                      <ul>
                        {m.cobrancas.map((c) => (
                          <li key={String(c.id)}>
                            <span
                              className={
                                isAtrasada(c, hojeIso) ? 'dash-atrasados__dot' : 'dash-atrasados__dot--ok'
                              }
                            />
                            {c.descricao || 'Cobrança'} (venc. {formatDateBR(c.vencimento)}) —{' '}
                            {money(valorSaldoCobranca(c))}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="dash-atrasados__totais">
                  <p>Mensalidades: {money(m.totalMens)}</p>
                  <p>Cobranças: {money(m.totalCob)}</p>
                  <p>
                    <strong>Total: {money(m.totalMens + m.totalCob)}</strong>
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
