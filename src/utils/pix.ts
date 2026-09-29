/** Tipos de chave Pix suportados no cadastro do Ilê. */
export type PixKeyTipo = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export const PIX_KEY_TIPOS: { value: PixKeyTipo; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

function soDigitos(valor: string, max?: number): string {
  const d = valor.replace(/\D/g, '');
  return typeof max === 'number' ? d.slice(0, max) : d;
}

/** Normaliza para persistência (sem máscara visual). */
export function normalizarPixChave(tipo: PixKeyTipo, valor: string): string {
  const v = String(valor ?? '').trim();
  if (!v) return '';
  switch (tipo) {
    case 'cpf':
      return soDigitos(v, 11);
    case 'cnpj':
      return soDigitos(v, 14);
    case 'telefone':
      return soDigitos(v, 11);
    case 'email':
      return v.toLowerCase();
    case 'aleatoria':
      return v.replace(/\s/g, '');
    default:
      return v;
  }
}

/** Máscara progressiva para o input conforme o tipo. */
export function formatarPixMascara(tipo: PixKeyTipo, valor: string): string {
  switch (tipo) {
    case 'cpf': {
      const d = soDigitos(valor, 11);
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
      if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    case 'cnpj': {
      const d = soDigitos(valor, 14);
      if (d.length <= 2) return d;
      if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
      if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
      if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }
    case 'telefone': {
      const d = soDigitos(valor, 11);
      if (!d) return '';
      if (d.length <= 2) return `(${d}`;
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    case 'email':
      return String(valor ?? '').replace(/\s/g, '').toLowerCase();
    case 'aleatoria':
      return String(valor ?? '').replace(/\s/g, '');
    default:
      return String(valor ?? '');
  }
}

export function placeholderPix(tipo: PixKeyTipo): string {
  switch (tipo) {
    case 'cpf':
      return '000.000.000-00';
    case 'cnpj':
      return '00.000.000/0000-00';
    case 'email':
      return 'email@exemplo.com';
    case 'telefone':
      return '(00) 00000-0000';
    case 'aleatoria':
      return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
    default:
      return '';
  }
}

export function inputModePix(tipo: PixKeyTipo): 'email' | 'numeric' | 'text' {
  if (tipo === 'email') return 'email';
  if (tipo === 'cpf' || tipo === 'cnpj' || tipo === 'telefone') return 'numeric';
  return 'text';
}

export function isPixTipo(v: string | null | undefined): v is PixKeyTipo {
  return PIX_KEY_TIPOS.some((t) => t.value === v);
}

/** Infere o tipo a partir de uma chave já salva (quando tipo ainda não existe). */
export function inferirPixTipo(chave: string | null | undefined): PixKeyTipo {
  const raw = String(chave ?? '').trim();
  if (!raw) return 'cpf';
  if (raw.includes('@')) return 'email';
  const digitos = soDigitos(raw);
  if (digitos.length === 11 && /^[1-9]/.test(digitos) && digitos.slice(0, 2) !== '00') {
    // 11 dígitos: CPF ou telefone — se começa como DDD comum e 3º dígito 9, tende a telefone
    if (/^\d{2}9\d{8}$/.test(digitos)) return 'telefone';
    return 'cpf';
  }
  if (digitos.length === 14) return 'cnpj';
  if (digitos.length === 10 || digitos.length === 11) return 'telefone';
  return 'aleatoria';
}
