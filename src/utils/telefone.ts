/**
 * Remove qualquer caractere não numérico para manter persistência consistente no banco.
 */
export function somenteDigitosTelefone(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '').slice(0, 11);
}

/**
 * Máscara visual: (XX)X.XXXX-XXXX com aplicação progressiva durante digitação.
 */
export function formatarTelefoneMascara(valor: string | null | undefined): string {
  const digitos = somenteDigitosTelefone(valor);
  if (!digitos) return '';
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 3) return `(${digitos.slice(0, 2)})${digitos.slice(2)}`;
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)})${digitos.slice(2, 3)}.${digitos.slice(3)}`;
  return `(${digitos.slice(0, 2)})${digitos.slice(2, 3)}.${digitos.slice(3, 7)}-${digitos.slice(7, 11)}`;
}
