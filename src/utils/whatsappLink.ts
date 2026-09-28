/** Normaliza telefone BR e monta link wa.me com texto. */
export function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

export function toWaPhone(phone: string | null | undefined): string | null {
  let d = digitsOnly(phone);
  if (!d) return null;
  if (d.length <= 11 && !d.startsWith('55')) d = `55${d}`;
  return d;
}

export function buildWaMeLink(phone: string | null | undefined, text: string): string | null {
  const p = toWaPhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoLink(
  email: string | null | undefined,
  subject: string,
  body: string,
): string | null {
  const e = String(email ?? '').trim();
  if (!e || !e.includes('@')) return null;
  return `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function openExternal(url: string | null) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
