// ============================================================================
// "Isso que voltou é uma edição de diário, ou é o portal?"
// ----------------------------------------------------------------------------
// A versão anterior aprovava com 2 sinais em qualquer texto acima de 300
// caracteres. Medido contra os 27 DOEs em 29/07/2026, ela aprovou quatro, e os
// quatro eram falso positivo:
//
//   doe-sp  portal de notícias  ("prorroga inscrições dos editais do ProAC")
//   doe-sc  menu do portal
//   doe-am  página com botão de download
//   doe-ms  formulário de busca
//
// Aprovar SP nessa base seria pior que deixar desligado: o radar passaria a
// casar termos na manchete do governo e o dossiê encheria de nada.
//
// A correção vem da escala. Uma edição de diário estadual tem dezenas de atos
// e centenas de milhares de caracteres. Portal tem menu e manchete. Não é uma
// diferença sutil, é uma ordem de grandeza, e a regra passa a medir isso.
// ============================================================================

/** Abaixo disso não existe edição de diário: é página de portal. */
const MINIMO_EDICAO = 20000;

/** Cabeçalhos de ato. Contamos OCORRÊNCIAS, não tipos: edição tem vários. */
const CABECALHOS = [
  /PORTARIA\s+N[°ºo]?[\s.]*\d/gi,
  /RESOLU[ÇC][ÃA]O\s+N[°ºo]?[\s.]*\d/gi,
  /DECRETO\s+N[°ºo]?[\s.]*\d/gi,
  /INSTRU[ÇC][ÃA]O\s+NORMATIVA\s+N[°ºo]?[\s.]*\d/gi,
  /EDITAL\s+N[°ºo]?[\s.]*\d/gi,
  /EXTRATO\s+D[EO]\s+/gi,
  /AVISO\s+DE\s+LICITA[ÇC][ÃA]O/gi,
  /\bArt\.\s*\d+/gi,
];

/** Marcas de que veio o portal e não o conteúdo. */
const SINAIS_DE_PORTAL = [
  /pular\s+para\s+(o\s+)?conte[úu]do/i,
  /portal\s+de\s+(not[íi]cias|servi[çc]os)/i,
  /clique\s+aqui\s+e\s+fa[çc]a\s+o\s+download/i,
  /buscar\s+por:/i,
  /acesse\s+a\s+edi[çc][ãa]o\s+do\s+dia/i,
  /carregando\.\.\./i,
];

export interface Veredito {
  ok: boolean;
  motivo: string;
  caracteres: number;
  atos: number;
}

export function avaliarConteudo(markdown: string): Veredito {
  const md = (markdown ?? "").trim();
  const caracteres = md.length;

  const atos = CABECALHOS.reduce((soma, re) => soma + (md.match(re)?.length ?? 0), 0);

  if (caracteres === 0) {
    return { ok: false, motivo: "Nada voltou. A URL não entrega conteúdo legível.", caracteres, atos };
  }

  const doPortal = SINAIS_DE_PORTAL.find((re) => re.test(md));
  if (doPortal) {
    return {
      ok: false,
      motivo:
        "Isto é a página do portal, não a edição. O conteúdo do diário fica atrás de uma " +
        "busca, de um PDF ou de uma chamada interna: aponte a URL para a edição do dia.",
      caracteres,
      atos,
    };
  }

  if (caracteres < MINIMO_EDICAO) {
    return {
      ok: false,
      motivo:
        `Só ${caracteres.toLocaleString("pt-BR")} caracteres. Uma edição de diário tem ordem ` +
        `de centenas de milhares; este tamanho é de página de portal.`,
      caracteres,
      atos,
    };
  }

  if (atos < 4) {
    return {
      ok: false,
      motivo: `Tamanho até serve, mas só ${atos} cabeçalho(s) de ato. Edição de diário traz dezenas.`,
      caracteres,
      atos,
    };
  }

  return {
    ok: true,
    motivo: `Parece edição de verdade: ${atos} cabeçalhos de ato em ${caracteres.toLocaleString("pt-BR")} caracteres.`,
    caracteres,
    atos,
  };
}
