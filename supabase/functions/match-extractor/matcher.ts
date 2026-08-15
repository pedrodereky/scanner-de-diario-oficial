// ============================================================================
// Casamento de termos contra o texto do diário
// ----------------------------------------------------------------------------
// A versão anterior era `texto.toLowerCase().indexOf(padrao.toLowerCase())`.
// Isso falha nos dois sentidos, e os dois aparecem no dado real:
//
//   1. NÃO acha o que existe. Gazeta publica "JOSÉ ANTÔNIO" e o usuário
//      cadastra "Jose Antonio". Publica "MARIA DA\nCONCEIÇÃO" quebrado entre
//      colunas. Publica "CONSTRUTORA  ALFA" com espaço duplo.
//   2. ACHA o que não existe. "ANA" casa dentro de "SEMANA" e de "análise";
//      "PLANO" casa dentro de "PLANALTO".
//
// O efeito conjunto é o pior possível: o match legítimo nunca aparece, o lixo
// aparece, a IA classifica o lixo como falso positivo e o radar fica vazio com
// a aba de inválidos cheia.
//
// Aqui o texto e o padrão são normalizados do mesmo jeito (sem acento, caixa
// baixa, espaço colapsado) e a busca respeita fronteira de palavra. O mapa de
// índices leva a posição encontrada de volta ao texto ORIGINAL, para o excerto
// sair legível, com acento e pontuação.
// ============================================================================

export type MatchType = "literal" | "regex" | "cnpj" | "nome" | "prefixo";

export interface TermInput {
  pattern: string;
  match_type: MatchType | string;
}

export interface Hit {
  /** posição no texto original */
  index: number;
  /** trecho do texto original que casou */
  text: string;
}

/** Teto de posições por termo/publicação: o resto é repetição do mesmo achado. */
export const MAX_HITS = 5;

/** Regex do usuário roda com orçamento: catastrófica trava a função inteira. */
const REGEX_BUDGET_MS = 250;

// ----------------------------------------------------------------------------
// Normalização
// ----------------------------------------------------------------------------

export interface Normalized {
  /** texto normalizado: sem acento, minúsculo, espaço colapsado */
  text: string;
  /** para cada posição do normalizado, a posição correspondente no original */
  map: number[];
}

const ESPACO = /\s/;

/**
 * Normaliza preservando o caminho de volta. Cada caractere do resultado sabe
 * de onde veio, então um acerto no normalizado vira um recorte no original.
 */
export function normalize(source: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ESPACO.test(ch)) {
      // Qualquer corrida de espaço, tab ou quebra de linha vira um espaço só.
      pendingSpace = out.length > 0;
      continue;
    }

    if (pendingSpace) {
      out.push(" ");
      map.push(i);
      pendingSpace = false;
    }

    // NFD separa a letra do acento; o range remove só os diacríticos.
    const folded = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    // Um caractere pode virar vários (ligaduras) ou nenhum (acento solto).
    for (const piece of folded) {
      out.push(piece);
      map.push(i);
    }
  }

  return { text: out.join(""), map };
}

/** Índice no original a partir do índice no normalizado. */
function toOriginal(norm: Normalized, index: number, fallback: number): number {
  if (index < 0) return fallback;
  if (index >= norm.map.length) return fallback;
  return norm.map[index];
}

// ----------------------------------------------------------------------------
// Fronteira de palavra
// ----------------------------------------------------------------------------

// Depois da normalização só sobram [a-z0-9] e pontuação ASCII, então a classe
// de "caractere de palavra" é simples e previsível.
const PALAVRA = /[a-z0-9]/;

function isBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  if (before && PALAVRA.test(before)) return false;
  if (after && PALAVRA.test(after)) return false;
  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------------------------
// Modos
// ----------------------------------------------------------------------------

/** Literal com fronteira de palavra, sobre o texto normalizado. */
function findLiteral(norm: Normalized, original: string, pattern: string): Hit[] {
  const needle = normalize(pattern).text.trim();
  if (!needle) return [];

  const hits: Hit[] = [];
  let from = 0;

  while (from <= norm.text.length) {
    const at = norm.text.indexOf(needle, from);
    if (at < 0) break;
    const end = at + needle.length;

    if (isBoundary(norm.text, at, end)) {
      const start = toOriginal(norm, at, 0);
      const stop = toOriginal(norm, end - 1, original.length - 1) + 1;
      hits.push({ index: start, text: original.slice(start, stop) });
      if (hits.length >= MAX_HITS) break;
    }

    from = at + 1; // +1, não +needle.length: sobreposição ainda é ocorrência
  }

  return hits;
}

/**
 * Prefixo: casa a palavra que COMEÇA com o padrão.
 *
 * O modo literal exige palavra inteira, e isso deixa passar a flexão, que em
 * português é a regra e não a exceção: quem cadastra "licitação" não acha
 * "licitações" (o radical muda de ão para ões) nem "licitatório". Para quem
 * vende ao governo, perder o plural é perder metade dos avisos.
 *
 * Com "licitac" o usuário pega a família inteira e continua no controle de
 * onde cortar. A fronteira no início continua valendo: "ana" não vira "semana".
 */
function findPrefixo(norm: Normalized, original: string, pattern: string): Hit[] {
  const raiz = normalize(pattern).text.trim();
  if (raiz.length < 3) return []; // prefixo curto demais casa o dicionário inteiro

  const re = new RegExp(`\\b${escapeRegex(raiz)}[a-z0-9]*`, "g");
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(norm.text))) {
    const start = toOriginal(norm, m.index, 0);
    const stop = toOriginal(norm, m.index + m[0].length - 1, original.length - 1) + 1;
    hits.push({ index: start, text: original.slice(start, stop) });
    if (hits.length >= MAX_HITS) break;
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  return hits;
}

// Partículas que a gazeta engole ou troca sem avisar.
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "d"]);

/**
 * Modo nome: tolera partícula que some ou troca, nome do meio abreviado, e a
 * ordem invertida que a gazeta usa em lista ("SILVA, JOSÉ ANTÔNIO").
 *
 * O primeiro e o último token são obrigatórios e casam por palavra inteira. Os
 * do meio precisam aparecer na ordem, aceitando a inicial no lugar do nome.
 */
function findNome(norm: Normalized, original: string, pattern: string): Hit[] {
  const tokens = normalize(pattern).text.split(" ").filter(Boolean);
  const fortes = tokens.filter((t) => !PARTICULAS.has(t) && t.length > 1);
  if (fortes.length < 2) {
    // Um nome só não é nome: cai no literal, que ao menos exige palavra inteira.
    return findLiteral(norm, original, pattern);
  }

  const primeiro = fortes[0];
  const ultimo = fortes[fortes.length - 1];
  const meio = fortes.slice(1, -1);

  // O vão entre o primeiro e o último nome é contado em TOKENS, não em
  // caracteres, e não atravessa vírgula. Com vão livre, "JOAO SOUZA, MARIA
  // LIMA, PEDRO OLIVEIRA" casaria com "João Oliveira", que é gente diferente.
  const TOKEN = "[a-z0-9.]+";
  const partes = [
    // ordem natural: JOAO CARLOS DE OLIVEIRA
    `${escapeRegex(primeiro)}(?:\\s+${TOKEN}){0,4}\\s+${escapeRegex(ultimo)}`,
    // ordem de listagem: OLIVEIRA, JOAO CARLOS
    `${escapeRegex(ultimo)}\\s*,\\s*${escapeRegex(primeiro)}(?:\\s+${TOKEN}){0,4}`,
  ];
  const re = new RegExp(`\\b(?:${partes.join("|")})`, "g");

  const hits: Hit[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(norm.text))) {
    const trecho = m[0];

    // Cada nome do meio precisa aparecer no trecho, inteiro ou abreviado.
    const cabe = meio.every((nome) => {
      const inicial = nome[0];
      return (
        new RegExp(`\\b${escapeRegex(nome)}\\b`).test(trecho) ||
        new RegExp(`\\b${escapeRegex(inicial)}\\.?\\b`).test(trecho)
      );
    });

    if (cabe) {
      const start = toOriginal(norm, m.index, 0);
      const stop = toOriginal(norm, m.index + trecho.length - 1, original.length - 1) + 1;
      hits.push({ index: start, text: original.slice(start, stop) });
      if (hits.length >= MAX_HITS) break;
    }

    if (m.index === re.lastIndex) re.lastIndex++;
  }

  return hits;
}

/** CNPJ com separador opcional, sobre o texto já sem quebra de linha. */
function findCnpj(norm: Normalized, original: string, pattern: string): Hit[] {
  const digits = pattern.replace(/\D/g, "");
  if (digits.length !== 14) return [];

  const grupos = [
    digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8),
    digits.slice(8, 12), digits.slice(12, 14),
  ];
  // Até dois separadores entre grupos: a gazeta quebra "678/\n0001", e a
  // normalização deixa isso como "678/ 0001", ou seja, barra mais espaço.
  const re = new RegExp(grupos.map((g, i) => g + (i < 4 ? "[.\\-/ ]{0,2}" : "")).join(""), "g");

  const hits: Hit[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(norm.text))) {
    const start = toOriginal(norm, m.index, 0);
    const stop = toOriginal(norm, m.index + m[0].length - 1, original.length - 1) + 1;
    hits.push({ index: start, text: original.slice(start, stop) });
    if (hits.length >= MAX_HITS) break;
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  return hits;
}

/** Regex do usuário, sobre o texto ORIGINAL e com teto de tempo. */
function findRegex(original: string, pattern: string): Hit[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "gi");
  } catch {
    return []; // regex inválida é problema do cadastro, não derruba a rodada
  }

  const hits: Hit[] = [];
  const deadline = Date.now() + REGEX_BUDGET_MS;
  let m: RegExpExecArray | null;

  while ((m = re.exec(original))) {
    hits.push({ index: m.index, text: m[0] });
    if (hits.length >= MAX_HITS) break;
    if (Date.now() > deadline) break; // regex catastrófica não trava a função
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  return hits;
}

// ----------------------------------------------------------------------------
// Fachada
// ----------------------------------------------------------------------------

/**
 * Acha as ocorrências de um termo no texto. `norm` vem pronto de fora porque
 * normalizar é o passo caro e o mesmo texto enfrenta dezenas de termos.
 */
export function findMatches(original: string, norm: Normalized, term: TermInput): Hit[] {
  if (!term.pattern?.trim()) return [];

  switch (term.match_type) {
    case "regex":
      return findRegex(original, term.pattern);
    case "cnpj":
      return findCnpj(norm, original, term.pattern);
    case "nome":
      return findNome(norm, original, term.pattern);
    case "prefixo":
      return findPrefixo(norm, original, term.pattern);
    default:
      return findLiteral(norm, original, term.pattern);
  }
}

/** Recorte legível em volta do acerto, com reticências quando corta. */
export function buildExcerpt(text: string, pos: number, radius = 200): string {
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return (prefix + text.slice(start, end) + suffix).replace(/\s+/g, " ").trim();
}
