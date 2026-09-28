import { jsPDF } from 'jspdf';
import { formatDateBR } from './formatDate';
import { formatMoneyBRL } from './money';
import { formatarPixMascara, inferirPixTipo, isPixTipo, type PixKeyTipo } from './pix';

export type ReciboAtendimentoInput = {
  ileNome: string | null;
  logoBase64?: string | null;
  chavePix?: string | null;
  chavePixTipo?: string | null;
  pixQrBase64?: string | null;
  clienteNome: string;
  data: string;
  resumo?: string | null;
  valor?: number | null;
  pago?: boolean;
};

function pixLabel(tipo: string | null | undefined, chave: string): string {
  const t: PixKeyTipo = isPixTipo(tipo) ? tipo : inferirPixTipo(chave);
  return formatarPixMascara(t, chave);
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

/** Gera e baixa o PDF do recibo de um atendimento/visita. */
export function baixarReciboAtendimento(input: ReciboAtendimentoInput): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 52;

  const ile = (input.ileNome || 'Ilê').trim();

  if (input.logoBase64) {
    const fmt = imageFormat(input.logoBase64);
    if (fmt) {
      try {
        doc.addImage(input.logoBase64, fmt, margin, y, 56, 56);
      } catch {
        /* logo inválida — segue sem imagem */
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(83, 5, 5);
  doc.text(ile, input.logoBase64 ? margin + 68 : margin, y + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 50, 40);
  doc.text('Recibo de atendimento', input.logoBase64 ? margin + 68 : margin, y + 42);

  y = input.logoBase64 ? y + 78 : y + 56;
  doc.setDrawColor(200, 188, 176);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 28;

  doc.setFontSize(11);
  doc.setTextColor(40, 32, 28);
  const linhas: [string, string][] = [
    ['Cliente', input.clienteNome],
    ['Data', formatDateBR(input.data)],
    ['Situação', input.pago ? 'Pago' : 'Em aberto'],
  ];
  if (input.resumo?.trim()) linhas.push(['Descrição', input.resumo.trim()]);
  if (input.valor != null && Number.isFinite(Number(input.valor))) {
    linhas.push(['Valor', formatMoneyBRL(Number(input.valor))]);
  }

  for (const [label, value] of linhas) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(value, pageW - margin * 2 - 90);
    doc.text(wrapped, margin + 90, y);
    y += 18 + Math.max(0, (wrapped.length - 1) * 14);
  }

  y += 16;
  doc.setDrawColor(200, 188, 176);
  doc.line(margin, y, pageW - margin, y);
  y += 28;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(83, 5, 5);
  doc.text('Pagamento Pix', margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 32, 28);

  if (input.chavePix?.trim()) {
    doc.text(`Chave: ${pixLabel(input.chavePixTipo, input.chavePix)}`, margin, y);
    y += 18;
  }

  if (input.pixQrBase64) {
    const fmt = imageFormat(input.pixQrBase64) ?? 'PNG';
    const qrSize = 160;
    const qrX = (pageW - qrSize) / 2;
    try {
      doc.addImage(input.pixQrBase64, fmt, qrX, y, qrSize, qrSize);
      y += qrSize + 14;
      doc.setFontSize(9);
      doc.setTextColor(100, 90, 80);
      doc.text('Escaneie o QR Code para pagar via Pix', pageW / 2, y, { align: 'center' });
      y += 20;
    } catch {
      doc.setTextColor(140, 60, 50);
      doc.text('Não foi possível incluir o QR Code neste recibo.', margin, y);
      y += 18;
    }
  } else if (!input.chavePix?.trim()) {
    doc.setTextColor(100, 90, 80);
    doc.text('Pix ainda não configurado em Dados do Ilê.', margin, y);
    y += 18;
  }

  y = Math.max(y + 24, doc.internal.pageSize.getHeight() - 60);
  doc.setFontSize(8);
  doc.setTextColor(140, 130, 120);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, y, { align: 'center' });

  const safeName = input.clienteNome.replace(/[^\wÀ-ú\- ]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 40);
  doc.save(`recibo-${safeName || 'atendimento'}-${input.data}.pdf`);
}
