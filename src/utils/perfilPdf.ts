import { jsPDF } from 'jspdf';
import type { CobrancaComMembro } from '../services/cobrancas';
import type { CadastroFormState } from '../types/memberForm';
import type { ExuFormRow, OrumaleFormRow, UmbandaFormRow } from '../hooks/useMemberForm';
import type { Orixa } from '../types/database';
import type { HistoricoOrumaleItem } from '../services/orumaleHistorico';
import { formatDateBR } from './formatDate';

type OrumaleHistoricoMap = Record<string, HistoricoOrumaleItem[]>;

type GerarPerfilPdfArgs = {
  nome: string;
  dataNascimento: string;
  contatoFormatado: string;
  email: string;
  signo: string;
  obs: string;
  orixas: Orixa[];
  cadastro: CadastroFormState;
  orumale: OrumaleFormRow[];
  exus: ExuFormRow[];
  umbanda: UmbandaFormRow[];
  cobrancas: CobrancaComMembro[];
  qualidadeNomeById: Record<string, string>;
  sobrenomeNomeById: Record<string, string>;
  historicoOrumaleById: OrumaleHistoricoMap;
};

const formatMoney = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

/**
 * Gera PDF textual (A4) com paginação automática sem abrir diálogo de impressora.
 */
export function gerarPerfilPdf(args: GerarPerfilPdfArgs): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (required: number) => {
    if (y + required <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const writeTitle = (text: string, align: 'left' | 'center' = 'left') => {
    ensureSpace(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    if (align === 'center') {
      doc.text(text, pageWidth / 2, y, { align: 'center' });
    } else {
      doc.text(text, margin, y);
    }
    y += 20;
  };

  const writeLine = (text: string, indent = 0) => {
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    ensureSpace(lines.length * 14 + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(lines, margin + indent, y);
    y += lines.length * 14;
  };

  const writeBlockGap = () => {
    y += 8;
  };

  const writeColumns = (left: string, right: string, leftIndent = 0, rightX = margin + contentWidth / 2) => {
    ensureSpace(16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(left, margin + leftIndent, y);
    doc.text(right, rightX, y);
    y += 14;
  };

  const orixaNomeById = new Map(args.orixas.map((o) => [String(o.id), o.nome]));
  const nomeArquivoBase = (args.nome || 'perfil_membro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  // Cabeçalho único do documento (sem duplicar bloco de dados pessoais).
  writeTitle('Perfil do Membro', 'center');
  writeColumns(`Nome: ${args.nome || '—'}`, `Nascimento: ${formatDateBR(args.dataNascimento)}`);
  writeColumns(`Signo: ${args.signo || '—'}`, '');
  writeColumns(`Telefone: ${args.contatoFormatado || '—'}`, `Email: ${args.email || '—'}`);
  writeLine('Endereço: —');
  if (args.obs) writeLine(`Observações: ${args.obs}`);
  writeBlockGap();

  writeTitle('Orisás');
  const blocosOrisa = [
    {
      titulo: 'Cabeça',
      orixaId: args.cadastro.orixa_cabeca_id,
      qualidadeId: args.cadastro.qualidade_cabeca_id,
      sobrenomeId: args.cadastro.sobrenome_orisa_cabeca_id,
      digina: args.cadastro.digina_cabeca,
      reza: args.cadastro.orixa_cabeca_reza,
    },
    {
      titulo: 'Corpo',
      orixaId: args.cadastro.orixa_corpo_id,
      qualidadeId: args.cadastro.qualidade_corpo_id,
      sobrenomeId: args.cadastro.sobrenome_orisa_corpo_id,
      digina: args.cadastro.digina_corpo,
      reza: args.cadastro.orixa_corpo_reza,
    },
    {
      titulo: 'Passagem',
      orixaId: args.cadastro.orixa_passagem_id,
      qualidadeId: args.cadastro.qualidade_passagem_id,
      sobrenomeId: args.cadastro.sobrenome_orisa_passagem_id,
      digina: args.cadastro.digina_passagem,
      reza: args.cadastro.orixa_passagem_reza,
    },
    {
      titulo: 'Saída',
      orixaId: args.cadastro.orixa_saida_id,
      qualidadeId: args.cadastro.qualidade_saida_id,
      sobrenomeId: args.cadastro.sobrenome_orisa_saida_id,
      digina: args.cadastro.digina_saida,
      reza: args.cadastro.orixa_saida_reza,
    },
  ];
  for (const b of blocosOrisa) {
    // Subtítulo da posição do Orisá alinhado à esquerda.
    writeLine(b.titulo, 8);
    writeColumns(
      `Orisá: ${orixaNomeById.get(b.orixaId) ?? '—'} | Qualidade: ${args.qualidadeNomeById[b.qualidadeId] ?? '—'}`,
      `Sobrenome: ${args.sobrenomeNomeById[b.sobrenomeId] ?? '—'} | Digina: ${b.digina || '—'}`,
      16,
      margin + contentWidth * 0.55,
    );
    writeLine(`Reza: ${b.reza || '—'}`, 16);
    writeBlockGap();
  }

  if (args.orumale.length > 0) {
    writeTitle('Orumalé');
    let idx = 1;
    for (const row of args.orumale) {
      writeLine(`Entrada ${idx} do Orumalé`, 8);
      writeColumns(
        `Data: ${formatDateBR(row.data_feitura)} | Orisá: ${orixaNomeById.get(row.orixa_id) ?? '—'}`,
        `Qualidade: ${args.qualidadeNomeById[row.qualidade_id] ?? '—'} | Sobrenome: ${
          args.sobrenomeNomeById[row.sobrenome_orisa_id] ?? '—'
        }`,
        16,
        margin + contentWidth * 0.52,
      );
      writeColumns(`Digina: ${row.digina || '—'}`, `Feitura: ${formatDateBR(row.data_feitura)}`, 16);
      const historico = row.id ? args.historicoOrumaleById[row.id] ?? [] : [];
      writeLine('Histórico', 16);
      if (historico.length === 0) {
        writeLine('—', 24);
      } else {
        for (const h of historico) {
          writeLine(`- ${formatDateBR(h.data)} — ${h.descricao}`, 24);
        }
      }
      writeBlockGap();
      idx += 1;
    }
  }

  if (args.exus.length > 0) {
    writeTitle('Exus (Quimbanda)');
    let idx = 1;
    for (const row of args.exus) {
      writeLine(`${idx}. ${row.exu_nome || '—'} - Feitura: ${formatDateBR(row.data_feitura)}`, 8);
      idx += 1;
    }
    writeBlockGap();
  }

  if (args.umbanda.length > 0) {
    writeTitle('Umbanda');
    let idx = 1;
    for (const row of args.umbanda) {
      writeLine(`${idx}. ${row.umbanda_nome || '—'} - Feitura: ${formatDateBR(row.data_feitura)}`, 8);
      idx += 1;
    }
    writeBlockGap();
  }

  writeTitle('Cobranças');
  if (args.cobrancas.length === 0) {
    writeLine('Sem cobranças associadas.');
  } else {
    // Cabeçalho em colunas para manter disposição semelhante ao relatório de cobranças.
    writeColumns('Data', 'Descrição / Valor', 8, margin + contentWidth * 0.38);
    for (const c of args.cobrancas) {
      writeColumns(
        `${formatDateBR(c.vencimento ?? null)}`,
        `${c.descricao || c.tipo || 'Sem descrição'} — ${formatMoney(Number(c.valor_total ?? c.valor ?? 0))}`,
        8,
        margin + contentWidth * 0.38,
      );
    }
  }

  doc.save(`${nomeArquivoBase || 'perfil_membro'}.pdf`);
}
