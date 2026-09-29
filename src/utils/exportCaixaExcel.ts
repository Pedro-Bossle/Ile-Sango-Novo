import ExcelJS from 'exceljs';
import type { CaixaLancamento } from '../services/caixa';

const BORDO = 'FF530526';
const GREEN = 'FF2F6F4E';
const RED = 'FFA63D3D';
const HEADER_FG = 'FFFFFFFF';
const ZEBRA = 'FFF7F3EF';
const BORDER = 'FFE1D9D1';

function parseIsoDate(iso: string): Date | null {
  const s = String(iso ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function thinBorder() {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } };
  return { top: side, left: side, bottom: side, right: side };
}

function downloadBuffer(buffer: ExcelJS.Buffer | ArrayBuffer, fileName: string) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer as ArrayBufferLike);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Exporta o fluxo de caixa com larguras, tipos (data/moeda) e cores. */
export async function exportCaixaExcel(rows: CaixaLancamento[], ano: number): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ilê Sangô';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Caixa ${ano}`, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: 'Pgto', key: 'pgto', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 36 },
    { header: 'Valor', key: 'valor', width: 14 },
    { header: 'Origem', key: 'origem', width: 18 },
    { header: 'Membro', key: 'membro', width: 28 },
  ];

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BORDO } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
  });

  for (const r of rows) {
    const isEntrada = r.tipo === 'entrada';
    const data = parseIsoDate(r.data);
    const valor = Number(r.valor) || 0;
    const row = ws.addRow({
      data: data ?? r.data,
      tipo: isEntrada ? 'Entrada' : 'Saída',
      categoria: r.categoria || '',
      pgto: r.forma_pagamento ?? '',
      descricao: r.descricao ?? '',
      valor,
      origem: r.origem || '',
      membro: r.membro_nome ?? '',
    });

    const zebra = row.number % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: col === 5 };
      if (zebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });

    const dataCell = row.getCell(1);
    if (data) {
      dataCell.value = data;
      dataCell.numFmt = 'dd/mm/yyyy';
    }
    dataCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const tipoCell = row.getCell(2);
    tipoCell.font = {
      bold: true,
      color: { argb: isEntrada ? GREEN : RED },
    };
    tipoCell.alignment = { vertical: 'middle', horizontal: 'center' };

    const valorCell = row.getCell(6);
    valorCell.value = isEntrada ? valor : -Math.abs(valor);
    valorCell.numFmt = '"R$"#,##0.00';
    valorCell.font = { bold: true, color: { argb: isEntrada ? GREEN : RED } };
    valorCell.alignment = { vertical: 'middle', horizontal: 'right' };
  }

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 8 },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBuffer(buffer, `caixa_${ano}.xlsx`);
}
