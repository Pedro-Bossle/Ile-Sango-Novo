import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FiltroPeriodoCobranca } from '../services/cobrancas';

export type LinhaRelatorio = {
  nome: string;
  data: string;
  descricao: string;
  valor: number;
  /** Mensalidade / Cobrança / Outros / entrada / saida — entrada/saida coloridas na variante caixa */
  tipo?: string | null;
  /** Forma de pagamento (Pix, Dinheiro, Cartão) — usada na variante fluxo */
  forma?: string | null;
};

export type PdfRelatorioVariante = 'aberto' | 'fluxo' | 'caixa';

export type PdfRelatorioOpcoes = {
  periodo: FiltroPeriodoCobranca | null;
  linhas: LinhaRelatorio[];
  total: number;
  tituloPrincipal?: string;
  subtitulo?: string;
  ileNome?: string;
  /** Endereço do Ilê no rodapé */
  ileEndereco?: string | null;
  logoBase64?: string | null;
  /** aberto = saldos pendentes; fluxo = valores pagos; caixa = lançamentos do fluxo */
  variante?: PdfRelatorioVariante;
  totalLabel?: string;
  fileNamePrefix?: string;
};

function tituloPeriodo(f: FiltroPeriodoCobranca | null): string {
  if (f?.de && f?.ate) return `Período: ${f.de} até ${f.ate}`;
  return 'Período: todos';
}

function labelTipo(t: string | null | undefined): string {
  if (t === 'mensalidade') return 'Mensalidade';
  if (t === 'obrigacao') return 'Cobrança';
  if (t === 'outros') return 'Outro';
  if (t === 'entrada') return 'Entrada';
  if (t === 'saida') return 'Saída';
  return t?.trim() ? String(t) : '—';
}

function money(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Valor do fluxo: + verde / − vermelho. */
function moneyAssinado(valorAbs: number, tipo: string | null | undefined): string {
  const abs = Math.abs(Number(valorAbs) || 0);
  const base = money(abs);
  if (tipo === 'saida' || (tipo !== 'entrada' && Number(valorAbs) < 0)) return `- ${base}`;
  return `+ ${base}`;
}

const COR_ENTRADA: [number, number, number] = [22, 128, 61];
const COR_SAIDA: [number, number, number] = [185, 28, 28];

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

/** Header: logo + nome do terreiro (+ título do relatório abaixo). */
function desenharCabecalho(
  doc: jsPDF,
  opcoes: { ileNome: string; logoBase64?: string | null; titulo: string },
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 12;

  if (opcoes.logoBase64) {
    const fmt = imageFormat(opcoes.logoBase64);
    if (fmt) {
      try {
        const logoW = 22;
        const logoH = 22;
        doc.addImage(opcoes.logoBase64, fmt, (pageW - logoW) / 2, y, logoW, logoH);
        y += logoH + 5;
      } catch {
        /* logo inválida */
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(83, 5, 5);
  doc.text(opcoes.ileNome, pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40, 32, 28);
  doc.text(opcoes.titulo, pageW / 2, y, { align: 'center' });
  y += 6;

  doc.setDrawColor(200, 188, 176);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  return y + 6;
}

/**
 * Footer:
 * Nome do terreiro                         carimbo
 * Endereço
 */
function desenharRodape(
  doc: jsPDF,
  ileNome: string,
  ileEndereco?: string | null,
): void {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const agora = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endereco = String(ileEndereco ?? '').trim();
  const margin = 14;
  const maxW = pageW - margin * 2;

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const lineY = pageH - (endereco ? 20 : 14);
    doc.setDrawColor(180, 168, 156);
    doc.setLineWidth(0.3);
    doc.line(margin, lineY - 5, pageW - margin, lineY - 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(90, 70, 60);
    doc.text(ileNome, margin, lineY);

    doc.setFont('helvetica', 'normal');
    doc.text(`Carimbo de expedição: ${agora}`, pageW - margin, lineY, { align: 'right' });

    if (endereco) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 95, 85);
      const lines = doc.splitTextToSize(endereco, maxW);
      doc.text(lines, margin, lineY + 5);
    }
  }
}

/**
 * Gera PDF de relatório (cobranças em aberto, valores pagos ou fluxo de caixa)
 * com logo + nome no cabeçalho e nome / carimbo / endereço no rodapé.
 */
export function gerarPdfRelatorio(opcoes: PdfRelatorioOpcoes): void {
  const {
    periodo,
    linhas,
    total,
    tituloPrincipal,
    subtitulo,
    ileNome = 'Ilê',
    ileEndereco,
    logoBase64,
    variante = 'aberto',
    totalLabel,
    fileNamePrefix,
  } = opcoes;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isFluxo = variante === 'fluxo';
  const isCaixa = variante === 'caixa';
  const titulo =
    tituloPrincipal ??
    (isCaixa
      ? 'Fluxo de caixa'
      : isFluxo
        ? 'Fluxo de caixa — Valores pagos'
        : 'Relatório — cobranças pendentes (saldo em aberto)');

  let y = desenharCabecalho(doc, { ileNome, logoBase64, titulo });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 50, 40);
  doc.text(tituloPeriodo(periodo), 14, y);
  y += 5;
  if (subtitulo) {
    const lines = doc.splitTextToSize(subtitulo, 182);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 2;
  }

  const body = linhas.map((l) => {
    if (isCaixa) {
      return [
        l.data,
        l.nome,
        l.descricao || '—',
        l.forma?.trim() || '—',
        moneyAssinado(l.valor, l.tipo),
      ];
    }
    if (isFluxo) {
      return [
        l.data,
        l.nome,
        l.descricao,
        l.forma?.trim() || labelTipo(l.tipo),
        money(l.valor),
      ];
    }
    return [l.nome, money(l.valor)];
  });

  const head = isCaixa
    ? [['Data', 'Categoria', 'Descrição', 'Pgto', 'Valor']]
    : isFluxo
      ? [['Data', 'Membro / categoria', 'Descrição', 'Forma / tipo', 'Valor']]
      : [['Nome', 'Total devido']];

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [94, 23, 40], textColor: 255 },
    columnStyles: isCaixa
      ? {
          0: { cellWidth: 22 },
          1: { cellWidth: 36 },
          3: { cellWidth: 24 },
          4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        }
      : isFluxo
        ? undefined
        : {
            0: { cellWidth: 110 },
            1: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
          },
    margin: { left: 14, right: 14, bottom: enderecoFooterMargin(ileEndereco) },
    didParseCell: (data) => {
      if (!isCaixa || data.section !== 'body' || data.column.index !== 4) return;
      const row = linhas[data.row.index];
      if (!row) return;
      const saida = row.tipo === 'saida' || (row.tipo !== 'entrada' && Number(row.valor) < 0);
      data.cell.styles.textColor = saida ? COR_SAIDA : COR_ENTRADA;
    },
  });

  const d = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  const finalY = d.lastAutoTable?.finalY ?? 200;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const label = totalLabel ?? (isCaixa ? 'Resultado' : isFluxo ? 'Total recebido' : 'Total em aberto');
  if (isCaixa) {
    const negativo = total < 0;
    doc.setTextColor(...(negativo ? COR_SAIDA : COR_ENTRADA));
    doc.text(`${label}: ${moneyAssinado(total, negativo ? 'saida' : 'entrada')}`, 14, finalY + 8);
  } else {
    doc.setTextColor(40, 32, 28);
    doc.text(`${label}: ${money(total)}`, 14, finalY + 8);
  }

  desenharRodape(doc, ileNome, ileEndereco);

  const prefix =
    fileNamePrefix ?? (isCaixa ? 'fluxo-caixa' : isFluxo ? 'fluxo-valores-pagos' : 'relatorio-cobrancas');
  doc.save(`${prefix}-${Date.now()}.pdf`);
}

function enderecoFooterMargin(ileEndereco?: string | null): number {
  return String(ileEndereco ?? '').trim() ? 28 : 22;
}
