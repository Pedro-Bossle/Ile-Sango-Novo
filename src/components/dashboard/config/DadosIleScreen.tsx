import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchConfigIle, saveConfigIle, type ConfigIle } from '../../../services/configIle';
import {
  cadastroPublicUrl,
  fetchActiveCadastroLink,
  getOrCreateCadastroLink,
  maskCadastroToken,
  regenerateCadastroLink,
  type CadastroLink,
} from '../../../services/membroCadastro';
import { fetchCepBrasilApi } from '../../../utils/brasilApiCep';
import {
  formatarPixMascara,
  inferirPixTipo,
  inputModePix,
  isPixTipo,
  normalizarPixChave,
  placeholderPix,
  PIX_KEY_TIPOS,
  type PixKeyTipo,
} from '../../../utils/pix';
import { writeAuditLog, buildAuditDiff } from '../../../services/auditLog';
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect';
import { Toast } from '../Toast';
import { useConfirmAction } from '../ConfirmActionModal';
import { parseValorInput, sanitizeValorInput, valorToMaskedInput } from '../../../utils/money';

const PIX_TIPO_OPTIONS: SearchableSelectOption[] = PIX_KEY_TIPOS.map((t) => ({
  value: t.value,
  label: t.label,
}));

type Props = { canEdit: boolean };

const ILE_FIELD_LABELS: Record<string, string> = {
  nome_ile: 'Nome do Ilê',
  chave_pix: 'Chave Pix',
  chave_pix_tipo: 'Tipo da chave Pix',
  pix_qr_base64: 'QR Code Pix',
  mensalidade_valor: 'Valor da mensalidade',
  cep: 'CEP',
  logradouro: 'Logradouro',
  numero: 'Número',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  logo_base64: 'Logo',
};

const MAX_QR_BYTES = 800_000; // ~600 KB em base64

export function DadosIleScreen({ canEdit }: Props) {
  const [form, setForm] = useState<Partial<ConfigIle>>({});
  const [baseline, setBaseline] = useState<Partial<ConfigIle>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);
  const [cadastroLink, setCadastroLink] = useState<CadastroLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [mensalidadeMask, setMensalidadeMask] = useState('');
  const { ask: askConfirm, modal: confirmModal } = useConfirmAction();

  useEffect(() => {
    fetchConfigIle()
      .then((data) => {
        const tipo = isPixTipo(data.chave_pix_tipo) ? data.chave_pix_tipo : inferirPixTipo(data.chave_pix);
        const next = { ...data, chave_pix_tipo: tipo };
        setForm(next);
        setBaseline(next);
        setMensalidadeMask(valorToMaskedInput(data.mensalidade_valor ?? 20));
      })
      .catch((e) => setToast({ msg: e.message, variant: 'error' }))
      .finally(() => setLoading(false));

    fetchActiveCadastroLink()
      .then(setCadastroLink)
      .catch(() => setCadastroLink(null));
  }, []);

  const linkUrl = cadastroLink ? cadastroPublicUrl() : '';
  const tokenMascarado = cadastroLink ? maskCadastroToken(cadastroLink.token) : '';

  const gerarOuGarantirLink = async () => {
    if (!canEdit) return;
    setLinkBusy(true);
    try {
      const link = await getOrCreateCadastroLink();
      setCadastroLink(link);
      setToast({ msg: 'Link de cadastro pronto.', variant: 'success' });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao gerar link.', variant: 'error' });
    } finally {
      setLinkBusy(false);
    }
  };

  const regenerarLink = async () => {
    if (!canEdit) return;
    const ok = await askConfirm({
      title: 'Regenerar link',
      message: 'Regenerar invalida o link atual. Continuar?',
      confirmLabel: 'Regenerar',
      confirmingLabel: 'Gerando…',
    });
    if (!ok) return;
    setLinkBusy(true);
    try {
      const link = await regenerateCadastroLink();
      setCadastroLink(link);
      try {
        await navigator.clipboard.writeText(cadastroPublicUrl());
        setToast({ msg: 'Novo link gerado e copiado.', variant: 'success' });
      } catch {
        setToast({ msg: 'Novo link gerado.', variant: 'success' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Erro ao regenerar link.', variant: 'error' });
    } finally {
      setLinkBusy(false);
    }
  };

  const copiarLink = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setToast({ msg: 'Link copiado.', variant: 'success' });
    } catch {
      setToast({ msg: 'Não foi possível copiar.', variant: 'error' });
    }
  };

  const pixTipo: PixKeyTipo = isPixTipo(form.chave_pix_tipo) ? form.chave_pix_tipo : 'cpf';

  const pixExibido = useMemo(
    () => formatarPixMascara(pixTipo, form.chave_pix ?? ''),
    [pixTipo, form.chave_pix],
  );

  const onCepBlur = async () => {
    const cep = String(form.cep ?? '').replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const data = await fetchCepBrasilApi(cep);
      setForm((f) => ({
        ...f,
        cep: data.cep,
        logradouro: data.street || f.logradouro,
        bairro: data.neighborhood || f.bairro,
        cidade: data.city || f.cidade,
        uf: data.state || f.uf,
      }));
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'CEP inválido', variant: 'error' });
    }
  };

  const onLogo = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo_base64: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const onPixQr = (file?: File | null) => {
    if (!file) return;
    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
    if (!isPng) {
      setToast({ msg: 'Envie um arquivo PNG do QR Code.', variant: 'error' });
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      setToast({ msg: 'QR Code muito grande. Use um PNG até ~600 KB.', variant: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, pix_qr_base64: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const onPixTipoChange = (tipo: PixKeyTipo) => {
    setForm((f) => ({
      ...f,
      chave_pix_tipo: tipo,
      chave_pix: normalizarPixChave(tipo, f.chave_pix ?? ''),
    }));
  };

  const onPixChaveChange = (raw: string) => {
    setForm((f) => ({
      ...f,
      chave_pix: normalizarPixChave(pixTipo, raw),
    }));
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const chave = normalizarPixChave(pixTipo, form.chave_pix ?? '');
      const after = {
        nome_ile: form.nome_ile ?? null,
        logo_base64: form.logo_base64 ?? null,
        chave_pix: chave || null,
        chave_pix_tipo: pixTipo,
        pix_qr_base64: form.pix_qr_base64 ?? null,
        mensalidade_valor:
          form.mensalidade_valor != null && Number.isFinite(Number(form.mensalidade_valor))
            ? Number(form.mensalidade_valor)
            : 20,
        cep: form.cep ?? null,
        logradouro: form.logradouro ?? null,
        numero: form.numero ?? null,
        bairro: form.bairro ?? null,
        cidade: form.cidade ?? null,
        uf: form.uf ?? null,
      };
      await saveConfigIle(after);
      const before = {
        nome_ile: baseline.nome_ile ?? null,
        logo_base64: baseline.logo_base64 ?? null,
        chave_pix: baseline.chave_pix ?? null,
        chave_pix_tipo: baseline.chave_pix_tipo ?? null,
        pix_qr_base64: baseline.pix_qr_base64 ?? null,
        mensalidade_valor: baseline.mensalidade_valor ?? null,
        cep: baseline.cep ?? null,
        logradouro: baseline.logradouro ?? null,
        numero: baseline.numero ?? null,
        bairro: baseline.bairro ?? null,
        cidade: baseline.cidade ?? null,
        uf: baseline.uf ?? null,
      };
      await writeAuditLog({
        action: 'update',
        entity: 'configuracoes_terreiro',
        entity_id: 1,
        resumo: 'Dados do Ilê',
        diff: buildAuditDiff('Dados do Ilê', before, after, ILE_FIELD_LABELS),
      });
      setBaseline({ ...baseline, ...after });
      setToast({ msg: 'Dados do Ilê salvos.', variant: 'success' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Erro ao salvar.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Carregando…</p>;

  return (
    <div className="dash-config-ile" data-tour="dados-ile">
      <Toast message={toast?.msg ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
      {confirmModal}
      <header className="dash-page-head">
        <div className="dash-page-head__titles">
          <h1>Dados do Ilê</h1>
          <p className="dash-muted">Identidade, Pix e endereço usados nas cobranças, recibos e PDFs.</p>
        </div>
      </header>
      <form className="dash-config-ile__form" onSubmit={salvar}>
        <section className="dash-form-section" data-tour="dados-ile-identidade">
          <h2 className="dash-form-section__title">Identidade da casa</h2>
          <div className="dash-config-ile__row dash-config-ile__row--identidade">
            <label className="dash-field">
              <span>Nome do Ilê</span>
              <input
                value={form.nome_ile ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, nome_ile: e.target.value })}
              />
            </label>
            <div className="dash-field">
              <span>Logo</span>
              <div className="dash-file-field">
                <label className={`dash-file-field__btn${!canEdit ? ' is-disabled' : ''}`}>
                  {form.logo_base64 ? 'Trocar imagem' : 'Escolher imagem'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={!canEdit}
                    onChange={(e) => {
                      onLogo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <span className="dash-file-field__name">
                  {form.logo_base64 ? 'Logo definida' : 'Nenhuma imagem'}
                </span>
                {form.logo_base64 && (
                  <img src={form.logo_base64} alt="" className="dash-file-field__preview" />
                )}
              </div>
              <p className="dash-field-hint">Opcional — aparece em PDFs e mensagens</p>
            </div>
          </div>
        </section>

        <section className="dash-form-section" data-tour="dados-ile-pix">
          <h2 className="dash-form-section__title">Pagamento</h2>
          <div className="dash-config-ile__row dash-config-ile__row--pix">
            <label className="dash-field dash-config-ile__pix-tipo">
              <span>Tipo da chave</span>
              <SearchableSelect
                options={PIX_TIPO_OPTIONS}
                value={pixTipo}
                disabled={!canEdit}
                onChange={(v) => onPixTipoChange(v as PixKeyTipo)}
                aria-label="Tipo da chave Pix"
              />
            </label>
            <label className="dash-field dash-config-ile__pix-chave">
              <span>Chave Pix</span>
              <input
                value={pixExibido}
                disabled={!canEdit}
                onChange={(e) => onPixChaveChange(e.target.value)}
                placeholder={placeholderPix(pixTipo)}
                inputMode={inputModePix(pixTipo)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <p className="dash-field-hint">Usada nas cobranças por WhatsApp e no recibo de atendimento</p>

          <label className="dash-field" style={{ marginTop: '0.75rem' }}>
            <span>Valor padrão da mensalidade</span>
            <input
              inputMode="decimal"
              value={mensalidadeMask}
              disabled={!canEdit}
              placeholder="R$ 0,00"
              onChange={(e) => {
                const masked = sanitizeValorInput(e.target.value);
                setMensalidadeMask(masked);
                setForm({
                  ...form,
                  mensalidade_valor: parseValorInput(masked),
                });
              }}
            />
            <p className="dash-field-hint">Usado na grade anual de Mensalidades</p>
          </label>

          <div className="dash-field dash-config-ile__pix-qr" data-tour="dados-ile-pix-qr">
            <span>QR Code Pix (PNG)</span>
            <div className="dash-file-field">
              <label className={`dash-file-field__btn${!canEdit ? ' is-disabled' : ''}`}>
                {form.pix_qr_base64 ? 'Trocar PNG' : 'Enviar PNG'}
                <input
                  type="file"
                  accept="image/png,.png"
                  hidden
                  disabled={!canEdit}
                  onChange={(e) => {
                    onPixQr(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {canEdit && form.pix_qr_base64 && (
                <button
                  type="button"
                  className="dash-btn-secondary"
                  onClick={() => setForm((f) => ({ ...f, pix_qr_base64: null }))}
                >
                  Remover
                </button>
              )}
              <span className="dash-file-field__name">
                {form.pix_qr_base64 ? 'QR Code definido' : 'Nenhum QR Code'}
              </span>
              {form.pix_qr_base64 && (
                <img src={form.pix_qr_base64} alt="Pré-visualização do QR Code Pix" className="dash-file-field__preview dash-file-field__preview--qr" />
              )}
            </div>
            <p className="dash-field-hint">Aparece no recibo PDF de cada visita/atendimento</p>
          </div>
        </section>

        <section className="dash-form-section" data-tour="dados-ile-endereco">
          <h2 className="dash-form-section__title">Endereço</h2>
          <div className="dash-config-ile__row dash-config-ile__row--cep">
            <label className="dash-field dash-config-ile__cep">
              <span>CEP</span>
              <input
                value={form.cep ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
                onBlur={onCepBlur}
                inputMode="numeric"
                placeholder="00000-000"
              />
            </label>
            <label className="dash-field dash-config-ile__logradouro">
              <span>Endereço</span>
              <input
                value={form.logradouro ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
              />
            </label>
            <label className="dash-field dash-config-ile__numero">
              <span>Número</span>
              <input
                value={form.numero ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </label>
          </div>
          <div className="dash-config-ile__row dash-config-ile__row--cidade">
            <label className="dash-field">
              <span>Bairro</span>
              <input
                value={form.bairro ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
              />
            </label>
            <label className="dash-field">
              <span>Cidade</span>
              <input
                value={form.cidade ?? ''}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              />
            </label>
            <label className="dash-field dash-config-ile__uf">
              <span>UF</span>
              <input
                value={form.uf ?? ''}
                disabled={!canEdit}
                maxLength={2}
                onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
              />
            </label>
          </div>
        </section>

        {canEdit && (
          <div className="dash-form-actions">
            <button type="submit" className="dash-btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )}
      </form>

      <section className="dash-form-section" data-tour="dados-ile-cadastro-link" style={{ marginTop: '1.5rem' }}>
        <h2 className="dash-form-section__title">Link de cadastro de membros</h2>
        <p className="dash-muted" style={{ marginBottom: '0.75rem' }}>
          Envie este link para o membro preencher a ficha completa. As submissões aparecem no inbox da dashboard.
        </p>
        {linkUrl ? (
          <>
            <label className="dash-field">
              <span>URL pública</span>
              <input type="text" readOnly value={linkUrl} onFocus={(e) => e.target.select()} />
            </label>
            <p className="dash-field-hint">
              Token interno (mascarado): <code>{tokenMascarado}</code> — não aparece na URL enviada aos membros.
            </p>
          </>
        ) : (
          <p className="dash-muted">Nenhum link ativo. Gere um para começar.</p>
        )}
        <div className="dash-form-actions" style={{ marginTop: '0.75rem', gap: '0.5rem', display: 'flex', flexWrap: 'wrap' }}>
          {!cadastroLink && canEdit && (
            <button type="button" className="dash-btn-primary" disabled={linkBusy} onClick={() => void gerarOuGarantirLink()}>
              {linkBusy ? 'Gerando…' : 'Gerar link'}
            </button>
          )}
          {cadastroLink && (
            <>
              <button type="button" className="dash-btn-primary" onClick={() => void copiarLink()}>
                Copiar link
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="dash-add-button dash-add-button--secondary"
                  disabled={linkBusy}
                  onClick={() => void regenerarLink()}
                >
                  {linkBusy ? 'Regenerando…' : 'Regenerar'}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
