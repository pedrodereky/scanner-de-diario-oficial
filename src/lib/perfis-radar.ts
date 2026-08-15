// ============================================================================
// Perfis de radar por persona
// ----------------------------------------------------------------------------
// A descrição do produto nomeia três públicos: advogados, empresas B2G e
// jornalistas. O cadastro de termo não sabia disso: pedia "rótulo, padrão,
// tipo" e deixava o usuário inventar sozinho o que monitorar. Quem não sabe o
// que cadastrar cadastra pouco, cadastra errado, e conclui que o radar não
// funciona.
//
// Aqui cada persona vira um ponto de partida concreto: o que ela cadastra, em
// que formato, e quais categorias de ato importam para ela.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import { Building2, Newspaper, Scale } from "lucide-react";

export type MatchType = "literal" | "regex" | "cnpj" | "nome";

export interface SugestaoTermo {
  rotulo: string;
  /** o que o usuário precisa digitar no lugar */
  placeholder: string;
  tipo: MatchType;
  /** pista de contexto que a IA usa para desambiguar homônimo */
  contexto: string;
}

export interface PerfilRadar {
  id: "advogado" | "b2g" | "jornalista";
  nome: string;
  icone: LucideIcon;
  paraQuem: string;
  /** o que muda no dossiê para essa persona */
  oQueImporta: string;
  /** categorias do classificador que essa persona quer ver primeiro */
  categorias: string[];
  sugestoes: SugestaoTermo[];
}

export const PERFIS: PerfilRadar[] = [
  {
    id: "advogado",
    nome: "Escritório de advocacia",
    icone: Scale,
    paraQuem: "Quem precisa saber no mesmo dia que um cliente foi citado, intimado ou processado.",
    oQueImporta: "Citação, intimação e prazo processual. O prazo é o produto.",
    categorias: ["processo", "multa"],
    sugestoes: [
      {
        rotulo: "Cliente pessoa física",
        placeholder: "João Carlos de Oliveira",
        tipo: "nome",
        contexto: "Cliente do escritório. Tolerar partícula e nome do meio abreviado.",
      },
      {
        rotulo: "Cliente pessoa jurídica",
        placeholder: "12.345.678/0001-90",
        tipo: "cnpj",
        contexto: "CNPJ de cliente. Interessa qualquer ato que o cite.",
      },
      {
        rotulo: "Razão social do cliente",
        placeholder: "Construtora Alfa Ltda",
        tipo: "literal",
        contexto: "Razão social. Ignorar menção que não seja ato dirigido à empresa.",
      },
      {
        rotulo: "Número de processo",
        placeholder: "\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4}",
        tipo: "regex",
        contexto: "Número CNJ de processo acompanhado pelo escritório.",
      },
    ],
  },
  {
    id: "b2g",
    nome: "Empresa que vende ao governo",
    icone: Building2,
    paraQuem: "Quem precisa achar edital antes do concorrente e não perder prazo de impugnação.",
    oQueImporta:
      "Abertura de edital, homologação, aditivo e o prazo de impugnação. Cadastrar a palavra \"licitação\" sozinha traz o índice do diário, não o edital: use a expressão de abertura ou o objeto que você fornece.",
    categorias: ["licitacao", "homologacao"],
    sugestoes: [
      {
        rotulo: "O que você vende",
        placeholder: "locação de veículos",
        tipo: "literal",
        contexto: "Objeto licitado que a empresa fornece. Interessa abertura e resultado.",
      },
      {
        // Medido em rodada real: cadastrar só "licitação" traz o índice do
        // diário e citação de lei, não o edital. O que separa oportunidade de
        // registro é a expressão de abertura.
        rotulo: "Aviso de abertura",
        placeholder: "aviso de licitação",
        tipo: "literal",
        contexto: "Abertura de certame. É o ato que ainda dá para disputar, com prazo correndo.",
      },
      {
        rotulo: "Seu próprio CNPJ",
        placeholder: "12.345.678/0001-90",
        tipo: "cnpj",
        contexto: "CNPJ da própria empresa: habilitação, homologação, sanção, pagamento.",
      },
      {
        rotulo: "Concorrente que você acompanha",
        placeholder: "Cicloway Indústria e Comércio",
        tipo: "literal",
        contexto: "Concorrente. Interessa que contratos ele está ganhando e por quanto.",
      },
      {
        rotulo: "Órgão comprador",
        placeholder: "Secretaria Municipal de Educação",
        tipo: "literal",
        contexto: "Órgão que compra o que a empresa vende.",
      },
    ],
  },
  {
    id: "jornalista",
    nome: "Jornalismo e assessoria",
    icone: Newspaper,
    paraQuem: "Quem precisa ver nomeação, exoneração e contrato no dia em que sai.",
    oQueImporta: "Movimentação de pessoal e valor de contrato.",
    categorias: ["nomeacao", "exoneracao", "licitacao"],
    sugestoes: [
      {
        rotulo: "Agente público que você cobre",
        placeholder: "Maria da Conceição Santos",
        tipo: "nome",
        contexto: "Agente público acompanhado na cobertura. Nomeação, exoneração, designação.",
      },
      {
        rotulo: "Órgão da sua editoria",
        placeholder: "Secretaria de Saúde",
        tipo: "literal",
        contexto: "Órgão coberto pela editoria.",
      },
      {
        rotulo: "Empresa sob apuração",
        placeholder: "12.345.678/0001-90",
        tipo: "cnpj",
        contexto: "Empresa em apuração. Interessa contrato, sanção e pagamento.",
      },
    ],
  },
];

export function perfilPorId(id: string | null | undefined): PerfilRadar | undefined {
  return PERFIS.find((p) => p.id === id);
}

/** Categorias que a persona quer ver no topo do dossiê. */
export function categoriasDoPerfil(id: string | null | undefined): string[] {
  return perfilPorId(id)?.categorias ?? [];
}
