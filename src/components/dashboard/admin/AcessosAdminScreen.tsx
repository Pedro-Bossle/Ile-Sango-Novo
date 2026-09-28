import { useEffect, useState, Fragment } from 'react';
import {
  ALL_RESOURCES,
  PERMISSION_PRESETS,
  RESOURCE_LABELS,
  emptyPermissions,
  fullPermissions,
  resourceAllowsAction,
  type PermFlags,
  type PermissionsMap,
  type ResourceKey,
} from '../../../lib/permissions';
import { fetchProfiles, updateProfilePermissions, type Profile } from '../../../services/profiles';
import {
  fetchAuditLog,
  formatAuditAcao,
  formatAuditOQueAconteceu,
  formatAuditPreview,
  formatAuditQuando,
  auditTela,
  writeAuditLog,
  type AuditDiff,
  type AuditRow,
} from '../../../services/auditLog';
import { Toast } from '../Toast';

type Tab = 'acessos' | 'auditoria';

const ACOES: { key: keyof PermFlags; label: string; hint: string }[] = [
  { key: 'r', label: 'Ver', hint: 'Pode abrir e consultar' },
  { key: 'c', label: 'Criar', hint: 'Pode adicionar novos' },
  { key: 'u', label: 'Editar', hint: 'Pode alterar dados' },
  { key: 'd', label: 'Excluir', hint: 'Pode apagar ou inativar' },
  { key: 's', label: 'Enviar', hint: 'WhatsApp / e-mail' },
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
    const on = ACOES.filter((a) => flags[a.key]).map((a) => a.label);
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
    descricao: 'Mensalidades, obrigações, caixa e consulta de membros',
  },
  auxiliar_eventos: {
    titulo: 'Auxiliar de eventos',
    descricao: 'Eventos e catálogo',
  },
  auxiliar_atendimento: {
    titulo: 'Auxiliar de atendimento',
    descricao: 'Clientes, orçamentos e agenda',
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
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try {
      const p = await fetchProfiles();
      setProfiles(p);
      if (selected) {
        const again = p.find((x) => x.user_id === selected.user_id);
        if (again) {
          setSelected(again);
          setBaseline(again);
          setDraft(again.is_admin ? fullPermissions() : { ...emptyPermissions(), ...again.permissions });
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
    fetchAuditLog()
      .then(setAudit)
      .catch((e) => setToast({ msg: e.message, variant: 'error' }));
  }, [tab]);

  const openProfile = (p: Profile) => {
    setSelected(p);
    setBaseline(p);
    setDraft(p.is_admin ? fullPermissions() : { ...emptyPermissions(), ...p.permissions });
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
              permissions: selected.is_admin ? fullPermissions() : draft,
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

  return (
    <div className="dash-acessos" data-tour="acessos-admin">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      <header className="dash-page-head dash-acessos__page-head">
        <div className="dash-page-head__titles">
          <h1>Acessos de Admin</h1>
          <p className="dash-muted">Escolha uma pessoa à esquerda e marque o que ela pode fazer em cada tela.</p>
        </div>
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
                <button type="button" className="dash-btn-primary" disabled={saving} onClick={() => void salvar()}>
                  {saving ? 'Salvando…' : 'Salvar permissões'}
                </button>
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
                        if (is_admin) setDraft(fullPermissions());
                      }}
                    />
                    <span>
                      <strong>Administrador total</strong>
                      <small>Acesso completo a todas as telas (as opções abaixo ficam bloqueadas)</small>
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
                  Esta pessoa é <strong>administrador total</strong>. Desmarque essa opção se quiser definir permissões
                  tela a tela.
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
                      Nenhuma alteração registrada ainda.
                    </td>
                  </tr>
                )}
                {audit.map((a) => {
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
        </div>
      )}
    </div>
  );
}
