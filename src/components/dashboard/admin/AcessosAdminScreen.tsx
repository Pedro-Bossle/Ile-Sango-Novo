import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  ALL_RESOURCES,
  PERMISSION_PRESETS,
  RESOURCE_LABELS,
  emptyPermissions,
  fullPermissions,
  mergeMensalidadeExtras,
  resourceAllowsAction,
  type PermFlags,
  type PermissionsMap,
  type ResourceKey,
} from '../../../lib/permissions';
import { fetchProfiles, updateProfilePermissions, type Profile } from '../../../services/profiles';
import { criarAcesso, excluirAcesso, reenviarCredenciaisAcesso } from '../../../services/criarAcesso';
import { onModalOverlayClick } from '../../../utils/modalOverlay';
import {
  AUDIT_RETENTION_DAYS,
  fetchAuditLog,
  formatAuditAcao,
  formatAuditOQueAconteceu,
  formatAuditPreview,
  formatAuditQuando,
  auditTela,
  purgeExpiredAuditLog,
  writeAuditLog,
  type AuditDiff,
  type AuditRow,
} from '../../../services/auditLog';
import { Toast } from '../Toast';
import { PaginationControls } from '../PaginationControls';

type Tab = 'acessos' | 'auditoria';

const ACOES: { key: keyof PermFlags; label: string; hint: string }[] = [
  { key: 'r', label: 'Ver', hint: 'Pode abrir e consultar' },
  { key: 'c', label: 'Criar', hint: 'Pode adicionar novos' },
  { key: 'u', label: 'Editar', hint: 'Pode alterar dados' },
  { key: 'd', label: 'Excluir', hint: 'Pode apagar ou inativar' },
  { key: 's', label: 'Enviar', hint: 'WhatsApp / e-mail' },
];

/** Extras de mensalidades (independentes de admin) — entram no diff de auditoria. */
const EXTRAS_MENSALIDADE: { key: keyof PermFlags; label: string }[] = [
  { key: 'lote', label: 'Lote' },
];

function buildPermissionsAuditDiff(
  before: { is_admin: boolean; ativo: boolean; nome_exibicao: string | null; permissions: PermissionsMap },
  after: { is_admin: boolean; ativo: boolean; nome_exibicao: string | null; permissions: PermissionsMap },
): AuditDiff {
  const changes: AuditDiff['changes'] = [];
  if (before.is_admin !== after.is_admin) {
    changes.push({
      campo: 'Administrador total',
      antigo: before.is_admin ? 'Sim' : 'Não',
      novo: after.is_admin ? 'Sim' : 'Não',
    });
  }
  if (before.ativo !== after.ativo) {
    changes.push({
      campo: 'Conta ativa',
      antigo: before.ativo ? 'Sim' : 'Não',
      novo: after.ativo ? 'Sim' : 'Não',
    });
  }
  if ((before.nome_exibicao || '') !== (after.nome_exibicao || '')) {
    changes.push({
      campo: 'Nome de exibição',
      antigo: before.nome_exibicao || null,
      novo: after.nome_exibicao || null,
    });
  }

  const fmtFlags = (flags: PermFlags | undefined) => {
    if (!flags) return 'Nenhuma';
    const on = [
      ...ACOES.filter((a) => flags[a.key]).map((a) => a.label),
      ...EXTRAS_MENSALIDADE.filter((a) => flags[a.key]).map((a) => a.label),
    ];
    return on.length ? on.join(', ') : 'Nenhuma';
  };

  for (const res of ALL_RESOURCES) {
    const b = fmtFlags(before.permissions[res]);
    const a = fmtFlags(after.permissions[res]);
    if (b === a) continue;
    changes.push({ campo: RESOURCE_LABELS[res], antigo: b, novo: a });
  }

  return { tela: 'Acessos de Admin', changes };
}

const PRESET_META: Record<string, { titulo: string; descricao: string }> = {
  auxiliar_cobrancas: {
    titulo: 'Auxiliar de cobranças',
    descricao: 'Mensalidades, cobranças, caixa e consulta de membros',
  },
  auxiliar_eventos: {
    titulo: 'Auxiliar de eventos',
    descricao: 'Eventos e catálogo',
  },
  auxiliar_atendimento: {
    titulo: 'Auxiliar de atendimento',
    descricao: 'Clientes, vendas e agenda',
  },
  auxiliar_leitura: {
    titulo: 'Somente leitura',
    descricao: 'Consulta a maior parte das telas, sem alterar',
  },
};

export function AcessosAdminScreen() {
  const [tab, setTab] = useState<Tab>('acessos');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [baseline, setBaseline] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<PermissionsMap>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditOpen, setAuditOpen] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(
    () => Number(localStorage.getItem('auditoria_page_size') || '20'),
  );
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [criarOpen, setCriarOpen] = useState(false);
  const [criarSaving, setCriarSaving] = useState(false);
  const [criarForm, setCriarForm] = useState({
    email: '',
    nome_exibicao: '',
    is_admin: true,
  });
  const [senhaFallback, setSenhaFallback] = useState<{
    email: string;
    nome: string;
    senha: string;
  } | null>(null);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const reload = async () => {
    try {
      const p = await fetchProfiles();
      setProfiles(p);
      if (selected) {
        const again = p.find((x) => x.user_id === selected.user_id);
        if (again) {
          setSelected(again);
          setBaseline(again);
          setDraft(
            again.is_admin
              ? mergeMensalidadeExtras(fullPermissions(), again.permissions?.cobrancas)
              : { ...emptyPermissions(), ...again.permissions },
          );
        }
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' });
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial
  }, []);

  useEffect(() => {
    if (tab !== 'auditoria') return;
    let cancelled = false;
    void (async () => {
      await purgeExpiredAuditLog(AUDIT_RETENTION_DAYS);
      try {
        const rows = await fetchAuditLog();
        if (!cancelled) {
          setAudit(rows);
          setAuditPage(1);
          setAuditOpen(null);
        }
      } catch (e) {
        if (!cancelled) {
          setToast({ msg: e instanceof Error ? e.message : 'Erro ao carregar auditoria.', variant: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const totalAudit = audit.length;
  const auditPaginado = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize;
    return audit.slice(start, start + auditPageSize);
  }, [audit, auditPage, auditPageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalAudit / auditPageSize));
    if (auditPage > totalPages) setAuditPage(totalPages);
  }, [totalAudit, auditPage, auditPageSize]);

  useEffect(() => {
    localStorage.setItem('auditoria_page_size', String(auditPageSize));
  }, [auditPageSize]);

  const openProfile = (p: Profile) => {
    setSelected(p);
    setBaseline(p);
    setDraft(
      p.is_admin
        ? mergeMensalidadeExtras(fullPermissions(), p.permissions?.cobrancas)
        : { ...emptyPermissions(), ...p.permissions },
    );
  };

  const toggle = (res: ResourceKey, key: keyof PermFlags) => {
    setDraft((d) => ({
      ...d,
      [res]: { ...(d[res] ?? {}), [key]: !d[res]?.[key] },
    }));
  };

  const salvar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateProfilePermissions(selected.user_id, {
        permissions: draft,
        is_admin: selected.is_admin,
        ativo: selected.ativo,
        nome_exibicao: selected.nome_exibicao,
      });
      const diff =
        baseline != null
          ? buildPermissionsAuditDiff(baseline, {
              is_admin: selected.is_admin,
              ativo: selected.ativo,
              nome_exibicao: selected.nome_exibicao,
              permissions: draft,
            })
          : undefined;
      await writeAuditLog({
        action: 'update',
        entity: 'profiles',
        entity_id: selected.user_id,
        resumo: selected.email,
        diff,
      });
      setToast({ msg: 'Permissões salvas.', variant: 'success' });
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const abrirCriar = () => {
    setCriarForm({ email: '', nome_exibicao: '', is_admin: true });
    setSenhaFallback(null);
    setCriarOpen(true);
  };

  const confirmarCriarAcesso = async () => {
    setCriarSaving(true);
    try {
      const result = await criarAcesso({
        email: criarForm.email,
        nome_exibicao: criarForm.nome_exibicao,
        is_admin: criarForm.is_admin,
      });
      await writeAuditLog({
        action: 'create',
        entity: 'profiles',
        entity_id: result.user_id,
        resumo: `${result.email}${criarForm.is_admin ? ' (admin)' : ''}`,
      });
      if (result.email_enviado) {
        setToast({ msg: `Acesso criado e senha enviada para ${result.email}.`, variant: 'success' });
        setCriarOpen(false);
      } else if (result.senha_temporaria) {
        setSenhaFallback({
          email: result.email,
          nome: criarForm.nome_exibicao.trim(),
          senha: result.senha_temporaria,
        });
        setToast({
          msg: 'Acesso criado. Envie a senha por e-mail (envio automático indisponível).',
          variant: 'success',
        });
      } else {
        setToast({ msg: `Acesso criado para ${result.email}.`, variant: 'success' });
        setCriarOpen(false);
      }
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao criar acesso.', variant: 'error' });
    } finally {
      setCriarSaving(false);
    }
  };

  const confirmarExcluirAcesso = async () => {
    if (!selected) return;
    setExcluindo(true);
    try {
      const result = await excluirAcesso(selected.user_id);
      await writeAuditLog({
        action: 'delete',
        entity: 'profiles',
        entity_id: result.user_id,
        resumo: result.email || selected.email,
      });
      setToast({ msg: `Acesso de ${result.email || selected.email} excluído.`, variant: 'success' });
      setExcluirOpen(false);
      setSelected(null);
      setBaseline(null);
      await reload();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao excluir acesso.', variant: 'error' });
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="dash-acessos" data-tour="acessos-admin">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-page-head dash-acessos__page-head">
        <div className="dash-page-head__titles">
          <h1>Acessos de Admin</h1>
          <p className="dash-muted">Escolha uma pessoa à esquerda e marque o que ela pode fazer em cada tela.</p>
        </div>
        {tab === 'acessos' && (
          <div className="dash-page-head__actions">
            <button type="button" className="dash-add-button" onClick={abrirCriar}>
              Novo acesso
            </button>
          </div>
        )}
      </header>

      <div className="dash-tabs" data-tour="acessos-abas">
        <button type="button" className={tab === 'acessos' ? 'active' : ''} onClick={() => setTab('acessos')}>
          Pessoas e permissões
        </button>
        <button type="button" className={tab === 'auditoria' ? 'active' : ''} onClick={() => setTab('auditoria')}>
          Histórico de alterações
        </button>
      </div>

      {tab === 'acessos' && (
        <div className="dash-acessos__layout">
          <aside className="dash-acessos__sidebar" data-tour="acessos-pessoas">
            <h2 className="dash-acessos__sidebar-title">Pessoas</h2>
            <ul className="dash-acessos__list">
              {profiles.map((p) => (
                <li key={p.user_id}>
                  <button
                    type="button"
                    className={selected?.user_id === p.user_id ? 'active' : ''}
                    onClick={() => openProfile(p)}
                  >
                    <strong>{p.nome_exibicao || p.email}</strong>
                    <span>{p.email}</span>
                    <span className="dash-acessos__badges">
                      {p.is_admin && <em className="is-admin">Admin</em>}
                      {!p.ativo && <em className="is-off">Inativo</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {!selected ? (
            <div className="dash-acessos__empty">
              <p>Selecione uma pessoa na lista para ver e editar as permissões.</p>
            </div>
          ) : (
            <div className="dash-acessos__editor" data-tour="acessos-editor">
              <div className="dash-acessos__editor-head">
                <div>
                  <h2>{selected.nome_exibicao || selected.email}</h2>
                  <p className="dash-muted">{selected.email}</p>
                </div>
                <div className="dash-acessos__editor-actions">
                  <button
                    type="button"
                    className="dash-btn-danger"
                    disabled={saving || excluindo}
                    onClick={() => setExcluirOpen(true)}
                  >
                    Excluir acesso
                  </button>
                  <button type="button" className="dash-btn-primary" disabled={saving} onClick={() => void salvar()}>
                    {saving ? 'Salvando…' : 'Salvar permissões'}
                  </button>
                </div>
              </div>

              <section className="dash-acessos__block">
                <h3>Nome de exibição</h3>
                <p className="dash-muted dash-acessos__block-hint">
                  Aparece nos compromissos da Agenda e na lista de pessoas. Use o nome pelo qual a pessoa é conhecida no Ilê.
                </p>
                <label className="dash-field">
                  <span>Nome</span>
                  <input
                    type="text"
                    value={selected.nome_exibicao ?? ''}
                    placeholder="Ex.: Mãe Fulana, Fulano"
                    maxLength={80}
                    onChange={(e) => setSelected({ ...selected, nome_exibicao: e.target.value || null })}
                  />
                </label>
              </section>

              <section className="dash-acessos__block">
                <h3>Situação da conta</h3>
                <div className="dash-acessos__flags">
                  <label className="dash-acessos__check">
                    <input
                      type="checkbox"
                      checked={selected.is_admin}
                      onChange={(e) => {
                        const is_admin = e.target.checked;
                        setSelected({ ...selected, is_admin });
                        if (is_admin) {
                          setDraft((d) => mergeMensalidadeExtras(fullPermissions(), d.cobrancas));
                        }
                      }}
                    />
                    <span>
                      <strong>Administrador total</strong>
                      <small>Acesso completo às telas (Lote e Sem caixa continuam à parte)</small>
                    </span>
                  </label>
                  <label className="dash-acessos__check">
                    <input
                      type="checkbox"
                      checked={selected.ativo}
                      onChange={(e) => setSelected({ ...selected, ativo: e.target.checked })}
                    />
                    <span>
                      <strong>Conta ativa</strong>
                      <small>Se desmarcar, a pessoa não entra no sistema</small>
                    </span>
                  </label>
                </div>
              </section>

              <section className="dash-acessos__block">
                <h3>Mensalidades — opções extras</h3>
                <p className="dash-muted dash-acessos__block-hint">
                  Independente de administrador: marque só se esta pessoa puder usar pagamento em lote.
                </p>
                <div className="dash-acessos__flags">
                  <label className="dash-acessos__check">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.cobrancas?.lote)}
                      onChange={() => toggle('cobrancas', 'lote')}
                    />
                    <span>
                      <strong>Lote</strong>
                      <small>Pagar o mês atual em lote na tela de mensalidades</small>
                    </span>
                  </label>
                </div>
              </section>

              {!selected.is_admin && (
                <>
                  <section className="dash-acessos__block">
                    <h3>Atalhos prontos</h3>
                    <p className="dash-muted dash-acessos__block-hint">
                      Clique num atalho para preencher as permissões de uma vez. Depois você pode ajustar tela a tela.
                    </p>
                    <div className="dash-acessos__presets">
                      {Object.keys(PERMISSION_PRESETS).map((k) => {
                        const meta = PRESET_META[k] ?? { titulo: k.replace(/_/g, ' '), descricao: '' };
                        return (
                          <button
                            key={k}
                            type="button"
                            className="dash-acessos__preset"
                            onClick={() => setDraft({ ...emptyPermissions(), ...PERMISSION_PRESETS[k] })}
                          >
                            <strong>{meta.titulo}</strong>
                            {meta.descricao && <span>{meta.descricao}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="dash-acessos__block">
                    <h3>O que esta pessoa pode fazer</h3>
                    <p className="dash-muted dash-acessos__block-hint">
                      Em cada tela, marque as ações permitidas.
                    </p>
                    <div className="dash-perm-legend" aria-hidden>
                      {ACOES.map((a) => (
                        <span key={a.key}>
                          <strong>{a.label}</strong> — {a.hint}
                        </span>
                      ))}
                    </div>
                    <div className="dash-perm-table-wrap">
                      <table className="dash-perm-table">
                        <thead>
                          <tr>
                            <th scope="col">Tela</th>
                            {ACOES.map((a) => (
                              <th key={a.key} scope="col" title={a.hint}>
                                {a.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ALL_RESOURCES.map((res) => (
                              <tr key={res}>
                                <th scope="row">{RESOURCE_LABELS[res]}</th>
                                {ACOES.map((a) => {
                                  if (!resourceAllowsAction(res, a.key)) {
                                    return (
                                      <td key={a.key} className="dash-perm-table__na" title="Não se aplica a esta tela">
                                        —
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={a.key}>
                                      <label className="dash-perm-table__cell">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(draft[res]?.[a.key])}
                                          onChange={() => toggle(res, a.key)}
                                          aria-label={`${RESOURCE_LABELS[res]}: ${a.label}`}
                                        />
                                        <span className="dash-visually-hidden">{a.label}</span>
                                      </label>
                                    </td>
                                  );
                                })}
                              </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {selected.is_admin && (
                <p className="dash-acessos__admin-note">
                  Esta pessoa é <strong>administrador total</strong> nas telas. Lote e Sem caixa só valem se
                  estiverem marcados acima — admin sozinho não libera essas opções.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'auditoria' && (
        <div className="dash-audit" data-tour="acessos-auditoria">
          <p className="dash-muted dash-audit__hint">
            Clique em uma linha para ver o detalhe: quando, quem, em qual tela e o que mudou (antigo → atual).
            Registros com mais de {AUDIT_RETENTION_DAYS} dias são removidos automaticamente.
          </p>
          <div className="dash-audit-table-wrap">
            <table className="dash-audit-table">
              <thead>
                <tr>
                  <th className="dash-audit-table__expand-col" aria-hidden />
                  <th>Quando</th>
                  <th>Quem fez</th>
                  <th>O que aconteceu</th>
                  <th>Antigo → atual</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 && (
                  <tr>
                    <td colSpan={5} className="dash-muted">
                      Nenhuma alteração nos últimos {AUDIT_RETENTION_DAYS} dias.
                    </td>
                  </tr>
                )}
                {auditPaginado.map((a) => {
                  const aberto = auditOpen === a.id;
                  const preview = formatAuditPreview(a.diff);
                  const tela = auditTela(a.entity, a.diff);
                  return (
                    <Fragment key={a.id}>
                      <tr
                        className={`dash-audit-table__row${aberto ? ' is-open' : ''}`}
                        onClick={() => setAuditOpen(aberto ? null : a.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setAuditOpen(aberto ? null : a.id);
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={aberto}
                      >
                        <td className="dash-audit-table__expand-col">
                          <span className="dash-audit-table__chevron" aria-hidden>
                            {aberto ? '▾' : '▸'}
                          </span>
                        </td>
                        <td className="dash-audit-table__quando">{formatAuditQuando(a.created_at)}</td>
                        <td>{a.actor_email || '—'}</td>
                        <td>{formatAuditOQueAconteceu(a)}</td>
                        <td className="dash-audit-table__preview">
                          {preview ? (
                            <span className="dash-audit-arrow">{preview}</span>
                          ) : (
                            <span className="dash-muted">Sem detalhe de campos</span>
                          )}
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="dash-audit-table__detail-row">
                          <td colSpan={5}>
                            <div className="dash-audit-detail">
                              <dl className="dash-audit-detail__meta">
                                <div>
                                  <dt>Quando</dt>
                                  <dd>{formatAuditQuando(a.created_at)}</dd>
                                </div>
                                <div>
                                  <dt>Quem</dt>
                                  <dd>{a.actor_email || '—'}</dd>
                                </div>
                                <div>
                                  <dt>Tela</dt>
                                  <dd>{tela}</dd>
                                </div>
                                <div>
                                  <dt>Tipo</dt>
                                  <dd>{formatAuditAcao(a.action)}</dd>
                                </div>
                              </dl>

                              {a.diff?.changes?.length ? (
                                <table className="dash-audit-changes">
                                  <thead>
                                    <tr>
                                      <th>Campo</th>
                                      <th>Antes</th>
                                      <th />
                                      <th>Depois</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {a.diff.changes.map((c, i) => (
                                      <tr key={`${c.campo}-${i}`}>
                                        <td>{c.campo}</td>
                                        <td className="dash-audit-changes__old">{c.antigo ?? '—'}</td>
                                        <td className="dash-audit-changes__arrow" aria-hidden>
                                          →
                                        </td>
                                        <td className="dash-audit-changes__new">{c.novo ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="dash-muted dash-audit-detail__empty">
                                  Esta alteração foi registrada antes do detalhe campo a campo. Novas mudanças
                                  mostrarão o valor antigo e o atual aqui.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalAudit > 0 && (
            <PaginationControls
              totalItems={totalAudit}
              currentPage={auditPage}
              pageSize={auditPageSize}
              onPageChange={(p) => {
                setAuditPage(p);
                setAuditOpen(null);
              }}
              onPageSizeChange={setAuditPageSize}
            />
          )}
        </div>
      )}

      {criarOpen && (
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="criar-acesso-title"
          onClick={onModalOverlayClick(() => {
            if (!criarSaving) setCriarOpen(false);
          })}
        >
          <div className="dash-modal dash-modal--acesso" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal__head">
              <h2 id="criar-acesso-title">Novo acesso</h2>
              <button
                type="button"
                className="dash-modal__close"
                aria-label="Fechar"
                disabled={criarSaving}
                onClick={() => setCriarOpen(false)}
              >
                ×
              </button>
            </div>

            {!senhaFallback ? (
              <>
                <p className="dash-muted">
                  Cria a conta, gera uma senha aleatória e envia para o e-mail. No primeiro login a pessoa troca a
                  senha.
                </p>
                <div className="dash-member-form">
                  <label className="dash-field">
                    <span>E-mail</span>
                    <input
                      type="email"
                      autoComplete="off"
                      value={criarForm.email}
                      onChange={(e) => setCriarForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="pessoa@email.com"
                      disabled={criarSaving}
                    />
                  </label>
                  <label className="dash-field">
                    <span>Nome de exibição</span>
                    <input
                      type="text"
                      value={criarForm.nome_exibicao}
                      onChange={(e) => setCriarForm((f) => ({ ...f, nome_exibicao: e.target.value }))}
                      placeholder="Ex.: Fulano"
                      maxLength={80}
                      disabled={criarSaving}
                    />
                  </label>
                  <label className="dash-acessos__check">
                    <input
                      type="checkbox"
                      checked={criarForm.is_admin}
                      onChange={(e) => setCriarForm((f) => ({ ...f, is_admin: e.target.checked }))}
                      disabled={criarSaving}
                    />
                    <span>
                      <strong>Administrador total</strong>
                      <small>Acesso completo às telas (recomendado para novos acessos de gestão)</small>
                    </span>
                  </label>
                </div>
                <div className="dash-modal__actions">
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    disabled={criarSaving}
                    onClick={() => setCriarOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    disabled={criarSaving || !criarForm.email.trim()}
                    onClick={() => void confirmarCriarAcesso()}
                  >
                    {criarSaving ? 'Criando…' : 'Criar e enviar senha'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="dash-muted">
                  Conta criada. O envio automático de e-mail não está configurado — envie a senha abaixo para{' '}
                  <strong>{senhaFallback.email}</strong>.
                </p>
                <label className="dash-field">
                  <span>Senha temporária</span>
                  <input type="text" readOnly value={senhaFallback.senha} onFocus={(e) => e.target.select()} />
                </label>
                <div className="dash-modal__actions">
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(senhaFallback.senha);
                      setToast({ msg: 'Senha copiada.', variant: 'success' });
                    }}
                  >
                    Copiar senha
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={() => {
                      void (async () => {
                        try {
                          await reenviarCredenciaisAcesso({
                            to: senhaFallback.email,
                            nome: senhaFallback.nome,
                            senha: senhaFallback.senha,
                          });
                          setToast({ msg: 'E-mail enviado pelo No-reply.', variant: 'success' });
                          setCriarOpen(false);
                          setSenhaFallback(null);
                        } catch (e) {
                          setToast({
                            msg: e instanceof Error ? e.message : 'Não foi possível enviar o e-mail.',
                            variant: 'error',
                          });
                        }
                      })();
                    }}
                  >
                    Enviar e-mail (No-reply)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {excluirOpen && selected && (
        <div
          className="dash-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="excluir-acesso-title"
          onClick={onModalOverlayClick(() => {
            if (!excluindo) setExcluirOpen(false);
          })}
        >
          <div className="dash-modal dash-modal--acesso" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal__head">
              <h2 id="excluir-acesso-title">Excluir acesso</h2>
              <button
                type="button"
                className="dash-modal__close"
                aria-label="Fechar"
                disabled={excluindo}
                onClick={() => setExcluirOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="dash-muted">
              Remover permanentemente o acesso de <strong>{selected.nome_exibicao || selected.email}</strong> (
              {selected.email})? A pessoa deixa de conseguir entrar na área restrita.
            </p>
            <div className="dash-modal__actions">
              <button
                type="button"
                className="dash-btn-secondary"
                disabled={excluindo}
                onClick={() => setExcluirOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="dash-btn-danger"
                disabled={excluindo}
                onClick={() => void confirmarExcluirAcesso()}
              >
                {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
