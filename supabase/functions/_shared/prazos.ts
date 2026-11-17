// ============================================================================
// Extração de prazos e datas do texto do diário
// ----------------------------------------------------------------------------
// O que transforma um alerta em algo acionável é a resposta a "até quando".
// Isso NÃO pode sair de modelo: prazo inventado faz o leitor perder direito.
// Então o prazo é extraído por regra, do texto literal, e o modelo só recebe o
// que foi extraído para redigir em volta. Se a regra não achar, o dossiê diz
// "prazo não informado no ato" em vez de chutar.
//
// As formas abaixo vieram de leitura de ato real. Diário oficial escreve o
// número duas vezes ("30 (trinta) dias"), quebra linha no meio da expressão e
// alterna entre "a contar da", "contados da" e "após a".
// ============================================================================

export type Unidade = "dias" | "meses" | "anos" | "horas";
export type Contagem = "úteis" | "corridos";

export interface PrazoRelativo {
  quantidade: number;
  unidade: Unidade;
  contagem: Contagem;
  /** de onde o prazo começa a correr, quando o ato diz */
  termoInicial: string | null;
  /** trecho literal do ato, para o leitor conferir */
  trecho: string;
}

export interface DataAbsoluta {
  /** ISO YYYY-MM-DD */
  data: string;
  trecho: string;
}

export interface Prazos {
  relativos: PrazoRelativo[];
  datas: DataAbsoluta[];
}

const EXTENSO: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  noventa: 90,
  cento: 100,
};

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** Sem acento, minúsculo, espaço colapsado. O ato quebra linha em qualquer lugar. */
function achatar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

function normalizarUnidade(bruta: string): Unidade | null {
  const u = bruta.toLowerCase();
  if (u.startsWith("dia")) return "dias";
  if (u.startsWith("mes") || u.startsWith("mês")) return "meses";
  if (u.startsWith("ano")) return "anos";
  if (u.startsWith("hora")) return "horas";
  return null;
}

/**
 * "no prazo de 30 (trinta) dias úteis, contados da publicação"
 *
 * O número em algarismo manda; o extenso entre parênteses serve de conferência
 * e de resgate quando o ato escreve só por extenso.
 */
const RE_PRAZO = new RegExp(
  [
    "(?:prazo\\s+(?:de|maximo\\s+de|improrrogavel\\s+de)\\s+|dentro\\s+de\\s+|em\\s+ate\\s+|no\\s+prazo\\s+de\\s+|ate\\s+)?",
    "(\\d{1,4}|[a-z]+)", // 1: quantidade em algarismo ou extenso
    "\\s*(?:\\(\\s*([a-z\\s]+?)\\s*\\))?", // 2: extenso entre parênteses
    "\\s*(dias?|meses|mes|anos?|horas?)\\b", // 3: unidade
    "(\\s*(?:uteis|corridos|consecutivos))?", // 4: contagem
    "([^.;]{0,60}?(?:a\\s+contar|contados?|contadas?|apos|a\\s+partir)\\s+d[aeo]s?\\s+[a-z\\s]{3,40})?", // 5: termo inicial
  ].join(""),
  "g",
);

const RE_DATA_NUM = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const RE_DATA_EXT = /\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/g;

// "Lei Complementar nº 349, de 4 de março de 2022" é referência normativa, não
// data que o leitor precisa cumprir. Sem esse corte o dossiê enche de 1999.
const RE_NORMA = new RegExp(
  "(lei(\\s+complementar)?|decreto(-lei)?|portaria|resolucao|instrucao\\s+normativa|" +
    "medida\\s+provisoria|emenda|ato|oficio|circular|sumula|parecer|acordao|convenio)" +
    "[^.;]{0,45}$",
);

// "contados da publicação deste ato" tem como termo inicial a publicação; o
// "deste ato" é referência ao próprio documento e só polui a frase do dossiê.
const CORTA_TERMO = new Set([
  "deste",
  "desta",
  "destes",
  "destas",
  "neste",
  "nesta",
  "nestes",
  "nestas",
  "para",
  "por",
  "e",
  "que",
  "sob",
  "com",
]);

function limparTermo(bruto: string): string | null {
  const m = bruto.match(
    /(?:a\s+contar|contados?|contadas?|apos|a\s+partir)\s+d[aeo]s?\s+([a-z\s]{3,40})/,
  );
  if (!m) return null;

  const palavras: string[] = [];
  for (const palavra of m[1].trim().split(/\s+/)) {
    if (CORTA_TERMO.has(palavra)) break;
    palavras.push(palavra);
  }

  // conector solto no fim ("data da") não ajuda ninguém
  while (palavras.length && /^(d[aeo]s?|a|o)$/.test(palavras[palavras.length - 1])) palavras.pop();

  return palavras.join(" ") || null;
}

/**
 * Varre o texto e devolve os prazos que ele realmente enuncia.
 * `janela` limita a leitura ao entorno do acerto, porque um diário inteiro tem
 * centenas de prazos que não têm nada a ver com o termo monitorado.
 */
export function extrairPrazos(texto: string, hoje?: string): Prazos {
  const plano = achatar(texto);
  const relativos: PrazoRelativo[] = [];
  const vistos = new Set<string>();

  RE_PRAZO.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RE_PRAZO.exec(plano))) {
    const unidade = normalizarUnidade(m[3]);
    if (!unidade) continue;

    const bruta = m[1];
    let quantidade = /^\d+$/.test(bruta) ? Number(bruta) : (EXTENSO[bruta] ?? 0);

    // "trinta dias" sem algarismo, ou algarismo ilegível: tenta o extenso do parêntese
    if (!quantidade && m[2]) quantidade = EXTENSO[m[2].trim()] ?? 0;
    if (!quantidade) continue;

    // Prazo processual acima disso quase sempre é vigência de contrato, não prazo do leitor.
    if (unidade === "dias" && quantidade > 365) continue;

    const contagem: Contagem = /uteis/.test(m[4] ?? "") ? "úteis" : "corridos";
    const termoInicial = m[5] ? limparTermo(m[5]) : null;
    const trecho = m[0].trim().replace(/\s+/g, " ");

    const chave = `${quantidade}|${unidade}|${contagem}|${termoInicial ?? ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    relativos.push({ quantidade, unidade, contagem, termoInicial, trecho });
  }

  return { relativos, datas: extrairDatas(plano, hoje) };
}

/**
 * Datas que o leitor precisa marcar na agenda. Duas exclusões, ambas medidas
 * em ato real: a data que faz parte da ementa de uma norma citada, e a data que
 * já passou. Nenhuma das duas é compromisso de ninguém.
 */
function extrairDatas(plano: string, hoje?: string): DataAbsoluta[] {
  const datas: DataAbsoluta[] = [];
  const vistas = new Set<string>();

  const guardar = (ano: number, mes: number, dia: number, trecho: string, antes: string) => {
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return;
    if (RE_NORMA.test(antes)) return;

    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (hoje && iso < hoje) return;
    if (vistas.has(iso)) return;

    vistas.add(iso);
    datas.push({ data: iso, trecho: trecho.trim() });
  };

  RE_DATA_NUM.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DATA_NUM.exec(plano))) {
    guardar(Number(m[3]), Number(m[2]), Number(m[1]), m[0], plano.slice(0, m.index));
  }

  RE_DATA_EXT.lastIndex = 0;
  while ((m = RE_DATA_EXT.exec(plano))) {
    const mes = MESES[m[2]];
    if (mes) guardar(Number(m[3]), mes, Number(m[1]), m[0], plano.slice(0, m.index));
  }

  return datas.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Janela de leitura em volta do acerto. O excerto de 200 caracteres que serve
 * para o card é curto demais para conter o prazo: em ato real o "no prazo de
 * 30 dias" costuma vir alguns parágrafos depois do nome.
 */
export function janela(texto: string, posicao: number, raio = 1500): string {
  const ini = Math.max(0, posicao - raio);
  const fim = Math.min(texto.length, posicao + raio);
  return texto.slice(ini, fim);
}

/** Frase curta para o dossiê, já no português que o leitor espera ver. */
export function descreverPrazo(p: PrazoRelativo): string {
  const base = `${p.quantidade} ${p.unidade}${p.contagem === "úteis" ? " úteis" : ""}`;
  return p.termoInicial ? `${base}, contados da ${p.termoInicial}` : base;
}
