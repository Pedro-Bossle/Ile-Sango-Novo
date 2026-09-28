/** Gera ficheiro .ics e dispara download. */
export function downloadIcs(input: {
  titulo: string;
  inicio: Date;
  fim?: Date | null;
  descricao?: string;
  local?: string;
  uid?: string;
}) {
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const uid = input.uid ?? `${Date.now()}@ilesango`;
  const end = input.fim ?? new Date(input.inicio.getTime() + 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ile Sango//Agenda//PT',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(input.inicio)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcs(input.titulo)}`,
    input.descricao ? `DESCRIPTION:${escapeIcs(input.descricao)}` : '',
    input.local ? `LOCATION:${escapeIcs(input.local)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${input.titulo.replace(/\s+/g, '_').slice(0, 40) || 'evento'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeIcs(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function googleCalendarUrl(input: {
  titulo: string;
  inicio: Date;
  fim?: Date | null;
  descricao?: string;
  local?: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = input.fim ?? new Date(input.inicio.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.titulo,
    dates: `${fmt(input.inicio)}/${fmt(end)}`,
    details: input.descricao ?? '',
    location: input.local ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
