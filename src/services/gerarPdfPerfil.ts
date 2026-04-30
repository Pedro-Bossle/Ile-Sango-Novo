import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DadosPdfMembro {
  nome: string;
  nascimento: string;
  signo: string;
  telefone: string;
  email: string;
  observacoes?: string;
  cabeca: { orisa: string; qualidade: string; sobrenome: string; digina: string; reza: string; dataBori?: string };
  corpo: { orisa: string; qualidade: string; sobrenome: string; digina: string; reza: string };
  passagem: { orisa: string; qualidade: string; sobrenome: string; digina: string; reza: string };
  saida: { orisa: string; qualidade: string; sobrenome: string; digina: string; reza: string };
  orunmila: Array<{
    orisa: string;
    qualidade: string;
    sobrenome: string;
    digina: string;
    feitura: string;
    historico: Array<{ data: string; descricao: string }>;
  }>;
  exus: Array<{ nome: string; feitura: string }>;
  entidades: Array<{ nome: string; feitura: string }>;
  cobrancas: Array<{ nome: string; data: string; descricao: string; valor: number }>;
  totalDevido: number;
  logoBase64?: string | null;
}

const CORES = {
  vinho: '#6B1A2A',
  vinhoEscuro: '#4A0F1C',
  texto: '#1a1a1a',
  branco: '#ffffff',
};

const toRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
};

export const gerarPdfPerfil = (dados: DadosPdfMembro): void => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const VINHO = toRgb(CORES.vinho);
  const VINHO_ESCURO = toRgb(CORES.vinhoEscuro);
  const TEXTO = toRgb(CORES.texto);
  const BRANCO = toRgb(CORES.branco);
  const margem = 15;
  const largura = 210 - margem * 2;
  let y = 15;

  const adicionarLogo = () => {
    if (!dados.logoBase64) return;
    // Header: logo centralizada no topo da página.
    const logoW = 20;
    const logoH = 20;
    const logoX = 105 - logoW / 2;
    doc.addImage(dados.logoBase64, 'PNG', logoX, 6, logoW, logoH);
  };

  const adicionarRodape = () => {
    const yBase = 290;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXTO);
    doc.text('Ilê Sàngó Aganjù e Ossun Pandá', 105, yBase, { align: 'center' });
    doc.text('Tiago de Sàngó Aganjù e Rosangela de Ossun Pandá', 105, yBase + 3.2, { align: 'center' });
  };

  const novaPagina = () => {
    doc.addPage();
    adicionarLogo();
    adicionarRodape();
    y = 38;
  };

  const checarPagina = (espacoNecessario = 20) => {
    if (y + espacoNecessario <= 276) return;
    novaPagina();
  };

  const tituloSecao = (texto: string) => {
    checarPagina(10);
    y += 2;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...VINHO);
    doc.text(texto, 105, y, { align: 'center' });
    y += 7;
    doc.setTextColor(...TEXTO);
  };

  const linhaLabel = (campos: Array<{ label: string; valor: string }>, x = margem) => {
    const larguraCampo = largura / Math.max(campos.length, 1);
    checarPagina(6);
    campos.forEach((campo, i) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const posX = x + i * larguraCampo;
      const label = campo.label.endsWith(':') ? campo.label : `${campo.label}:`;
      doc.text(label, posX, y);
      doc.setFont('helvetica', 'normal');
      // Espaço obrigatório após ":" para melhorar legibilidade do valor.
      doc.text(` ${campo.valor || '—'}`, posX + doc.getTextWidth(label) + 0.5, y);
    });
    y += 5;
  };

  const valorArquivo = (dados.nome || 'perfil_membro').replace(/\s+/g, '_');

  // Página 1
  adicionarLogo();
  adicionarRodape();
  y = 38;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...VINHO);
  doc.text('Perfil do Membro', 105, y, { align: 'center' });
  y += 10;
  doc.setTextColor(...TEXTO);

  linhaLabel([
    { label: 'Nome:', valor: dados.nome },
    { label: 'Nascimento:', valor: dados.nascimento },
    { label: 'Signo:', valor: dados.signo },
  ]);
  linhaLabel([
    { label: 'Telefone:', valor: dados.telefone },
    { label: 'Email:', valor: dados.email },
  ]);
  linhaLabel([{ label: 'Observações:', valor: dados.observacoes || '—' }]);

  tituloSecao('Orisás');
  const blocos = [
    { titulo: 'Cabeça', dados: dados.cabeca },
    { titulo: 'Corpo', dados: dados.corpo },
    { titulo: 'Passagem', dados: dados.passagem },
    { titulo: 'Saída', dados: dados.saida },
  ];
  blocos.forEach((bloco) => {
    checarPagina(22);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(bloco.titulo, margem, y);
    y += 5;
    linhaLabel([
      { label: 'Orisá:', valor: bloco.dados.orisa },
      { label: 'Qualidade:', valor: bloco.dados.qualidade },
      { label: 'Sobrenome:', valor: bloco.dados.sobrenome },
      { label: 'Digina:', valor: bloco.dados.digina },
    ]);
    if (bloco.titulo === 'Cabeça') {
      linhaLabel([{ label: 'Data de Bori:', valor: dados.cabeca.dataBori || '—' }]);
    }
    linhaLabel([{ label: 'Reza:', valor: bloco.dados.reza }]);
    // Espaço extra entre blocos de Orisás para leitura mais confortável.
    y += 3;
  });

  if (dados.orunmila.length > 0) {
    tituloSecao('Orumalé');
    dados.orunmila.forEach((entrada, idx) => {
      checarPagina(22 + entrada.historico.length * 4);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      // O subtítulo da entrada agora mostra o nome do Orisá da própria entrada.
      doc.text(entrada.orisa || `Entrada ${idx + 1} do orumalé`, margem, y);
      y += 5;
      linhaLabel([
        { label: 'Orisá:', valor: entrada.orisa },
        { label: 'Qualidade:', valor: entrada.qualidade },
        { label: 'Sobrenome:', valor: entrada.sobrenome },
      ]);
      linhaLabel([
        { label: 'Digina:', valor: entrada.digina },
        { label: 'Feitura:', valor: entrada.feitura },
      ]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Histórico:', margem, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      if (entrada.historico.length === 0) {
        doc.text('- Sem registros', margem + 3, y);
        y += 4;
      } else {
        entrada.historico.forEach((h) => {
          checarPagina(5);
          doc.text(`- ${h.data} — ${h.descricao}`, margem + 3, y);
          y += 4;
        });
      }
      y += 2;
    });
  }

  // Página 2
  novaPagina();

  if (dados.exus.length > 0) {
    tituloSecao('Quimbanda');
    dados.exus.forEach((exu, i) => {
      linhaLabel(
        [
          { label: `${i + 1}. Exu:`, valor: exu.nome },
          { label: 'Feitura:', valor: exu.feitura },
        ],
        margem + 2,
      );
    });
    y += 2;
  }

  if (dados.entidades.length > 0) {
    tituloSecao('Umbanda');
    dados.entidades.forEach((entidade, i) => {
      linhaLabel(
        [
          { label: `${i + 1}. Entidade:`, valor: entidade.nome },
          { label: 'Feitura:', valor: entidade.feitura },
        ],
        margem + 2,
      );
    });
    y += 2;
  }

  tituloSecao('Cobranças');
  autoTable(doc, {
    startY: y,
    head: [['Nome', 'Data', 'Descrição', 'Valor']],
    body: dados.cobrancas.map((c) => [c.nome, c.data, c.descricao, `R$ ${c.valor.toFixed(2).replace('.', ',')}`]),
    headStyles: {
      fillColor: VINHO_ESCURO,
      textColor: BRANCO,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: TEXTO },
    margin: { left: margem, right: margem },
    theme: 'plain',
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXTO);
  doc.text(`Total devido: R$ ${dados.totalDevido.toFixed(2).replace('.', ',')}`, margem, Math.min(finalY + 6, 276));

  const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  doc.save(`perfil_${valorArquivo}_${dataHoje}.pdf`);
};
