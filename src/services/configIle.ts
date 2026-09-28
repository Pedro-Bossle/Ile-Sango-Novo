import { supabase } from '../lib/supabaseClient';

export type ConfigIle = {
  id: number;
  nome_ile: string | null;
  logo_base64: string | null;
  chave_pix: string | null;
  chave_pix_tipo: string | null;
  pix_qr_base64: string | null;
  mensalidade_valor?: number | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  endereco_padrao_evento: string | null;
};

const SELECT_FULL =
  'id, nome_ile, logo_base64, chave_pix, chave_pix_tipo, pix_qr_base64, mensalidade_valor, cep, logradouro, numero, bairro, cidade, uf, endereco_padrao_evento';

const SELECT_SEM_QR =
  'id, nome_ile, logo_base64, chave_pix, chave_pix_tipo, cep, logradouro, numero, bairro, cidade, uf, endereco_padrao_evento';

const SELECT_LEGACY =
  'id, nome_ile, logo_base64, chave_pix, cep, logradouro, numero, bairro, cidade, uf, endereco_padrao_evento';

export async function fetchConfigIle(): Promise<ConfigIle> {
  const empty: ConfigIle = {
    id: 1,
    nome_ile: null,
    logo_base64: null,
    chave_pix: null,
    chave_pix_tipo: null,
    pix_qr_base64: null,
    cep: null,
    logradouro: null,
    numero: null,
    bairro: null,
    cidade: null,
    uf: null,
    endereco_padrao_evento: null,
  };

  const withQr = await supabase.from('configuracoes_terreiro').select(SELECT_FULL).eq('id', 1).maybeSingle();
  if (!withQr.error) {
    return (withQr.data as ConfigIle) ?? empty;
  }

  const withTipo = await supabase.from('configuracoes_terreiro').select(SELECT_SEM_QR).eq('id', 1).maybeSingle();
  if (!withTipo.error) {
    return withTipo.data ? ({ ...withTipo.data, pix_qr_base64: null } as ConfigIle) : empty;
  }

  const legacy = await supabase.from('configuracoes_terreiro').select(SELECT_LEGACY).eq('id', 1).maybeSingle();
  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data
    ? ({ ...legacy.data, chave_pix_tipo: null, pix_qr_base64: null } as ConfigIle)
    : empty;
}

export async function saveConfigIle(patch: Partial<ConfigIle>): Promise<void> {
  const { error } = await supabase.from('configuracoes_terreiro').upsert({ id: 1, ...patch });
  if (!error) return;

  // Fallback progressivo se migrations ainda não foram aplicadas
  let next: Partial<ConfigIle> = { ...patch };
  if (Object.prototype.hasOwnProperty.call(next, 'pix_qr_base64')) {
    const { pix_qr_base64: _qr, ...rest } = next;
    next = rest;
    const retryQr = await supabase.from('configuracoes_terreiro').upsert({ id: 1, ...next });
    if (!retryQr.error) return;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'chave_pix_tipo')) {
    const { chave_pix_tipo: _tipo, ...rest } = next;
    const retry = await supabase.from('configuracoes_terreiro').upsert({ id: 1, ...rest });
    if (!retry.error) return;
    throw new Error(retry.error.message);
  }
  throw new Error(error.message);
}
