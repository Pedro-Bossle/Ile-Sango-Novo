import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { signoFromDate } from '../utils/signo';
import { somenteDigitosTelefone } from '../utils/telefone';

const HEADERS = [
  'nome',
  'data_entrada',
  'data_nascimento',
  'signo',
  'email',
  'telefone',
  'obs',
  'orisa_cabeca',
  'qualidade_cabeca',
  'sobrenome_cabeca',
  'digina_cabeca',
  'data_feitura_bori',
  'reza_cabeca',
];

export function downloadMembrosTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ['Maria Exemplo', '2015-03-20', '1990-05-15', '', 'maria@email.com', '54999999999', '', 'Xangô', '', '', '', '', ''],
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['Instruções'],
    ['Datas: AAAA-MM-DD ou DD/MM/AAAA'],
    ['data_entrada: data de entrada / iniciação no Ilê'],
    ['Telefone: só dígitos com DDD'],
    ['Orisá/Qualidade/Sobrenome: nomes iguais aos cadastrados em Configurações → Orixás'],
    ['Corpo/exus/umbanda: editar depois na ficha'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cadastro');
  XLSX.utils.book_append_sheet(wb, ws2, 'Instrucoes');
  XLSX.writeFile(wb, 'modelo_membros.xlsx');
}

function parseDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

export type ImportResult = { ok: number; skipped: number; errors: string[] };

export async function importMembrosFromExcel(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const errors: string[] = [];
  let ok = 0;
  let skipped = 0;

  const { data: existentes } = await supabase.from('pessoas').select('id, email, contato').is('deleted_at', null);
  const emails = new Set((existentes ?? []).map((p) => String(p.email ?? '').toLowerCase()).filter(Boolean));
  const tels = new Set((existentes ?? []).map((p) => somenteDigitosTelefone(String(p.contato ?? ''))).filter(Boolean));

  const { data: orixas } = await supabase.from('orixas').select('id, nome');
  const orixaByName = new Map((orixas ?? []).map((o) => [String(o.nome).toLowerCase(), o.id]));

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const nome = String(r.nome ?? '').trim();
    if (!nome) {
      errors.push(`Linha ${i + 2}: nome obrigatório`);
      continue;
    }
    const email = String(r.email ?? '').trim().toLowerCase();
    const telefone = somenteDigitosTelefone(String(r.telefone ?? ''));
    if ((email && emails.has(email)) || (telefone && tels.has(telefone))) {
      skipped += 1;
      errors.push(`Linha ${i + 2}: duplicado (${nome})`);
      continue;
    }
    const nasc = parseDate(r.data_nascimento);
    const entrada = parseDate(r.data_entrada);
    let signo = String(r.signo ?? '').trim();
    if (!signo && nasc) signo = signoFromDate(nasc);

    const { data: pessoa, error } = await supabase
      .from('pessoas')
      .insert({
        nome,
        data_entrada: entrada || null,
        data_nascimento: nasc || null,
        email: email || null,
        contato: telefone || null,
        signo: signo || null,
        obs: String(r.obs ?? '').trim() || null,
      })
      .select('id')
      .single();
    if (error || !pessoa) {
      errors.push(`Linha ${i + 2}: ${error?.message || 'falha insert'}`);
      continue;
    }

    const orisaNome = String(r.orisa_cabeca ?? '').trim().toLowerCase();
    const orixaId = orisaNome ? orixaByName.get(orisaNome) : null;
    if (orixaId) {
      await supabase.from('cadastro_orixas').upsert({
        pessoa_id: pessoa.id,
        orixa_cabeca_id: orixaId,
        digina_cabeca: String(r.digina_cabeca ?? '').trim() || null,
        data_feitura_bori: parseDate(r.data_feitura_bori) || null,
        orixa_cabeca_reza: String(r.reza_cabeca ?? '').trim() || null,
      });
    }

    if (email) emails.add(email);
    if (telefone) tels.add(telefone);
    ok += 1;
  }

  return { ok, skipped, errors };
}
