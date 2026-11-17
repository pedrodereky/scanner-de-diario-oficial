// ============================================================================
// DOU sem credencial: perguntar ao índice em vez de baixar o diário inteiro
// ----------------------------------------------------------------------------
// O adapter antigo dependia do INLabs, que exige cadastro. Enquanto o cadastro
// não sai, a promessa do título do produto ("monitora o Diário Oficial da
// União") simplesmente não acontece.
//
// O in.gov.br responde sem credencial e aceita busca por termo. Isso inverte a
// arquitetura para melhor: em vez de baixar as três seções inteiras todo dia e
// casar localmente, a gente pergunta ao índice do próprio DOU pelos termos do
// cliente e só lê na íntegra o que voltou.
//
// Duas ressalvas que o desenho respeita:
//
//   1. O índice deles NÃO substitui o nosso matcher. A busca do in.gov.br tem
//      semântica própria (stemming, sinônimo), então ela entra como geradora de
//      candidatos e o match-extractor confirma com a nossa regra. Sem isso a
//      gente importaria o falso positivo deles e perderia o controle do excerto.
//   2. O trecho que vem na busca é curto. O dossiê precisa do ato inteiro para
//      achar prazo, então cada candidato é lido na página da matéria.
// ============================================================================

export const SECOES = ["do1", "do2", "do3"] as const;
export type Secao = (typeof SECOES)[number];

const BUSCA = "https://www.in.gov.br/consulta/-/buscar/dou";
const MATERIA = "https://www.in.gov.br/web/dou/-/";

// Sem user-agent de navegador o portal devolve 403.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface Materia {
  titulo: string;
  /** slug da matéria; vira URL e também id estável */
  urlTitle: string;
  /** trecho com o termo, como o índice devolveu */
  trecho: string;
  secao: string;
  pagina: string | null;
  edicao: string | null;
  /** DD/MM/YYYY como o portal devolve */
  publicadoEm: string | null;
  tipo: string | null;
}

// ----------------------------------------------------------------------------
// Parsers (puros, testáveis sem rede)
// ----------------------------------------------------------------------------

function desescapar(valor: string): string {
  return valor
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function semTags(html: string): string {
  return desescapar(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A listagem vem num <script type="application/json"> embutido na página.
 * Quando a busca não acha nada, o array vem vazio, e isso é resultado válido.
 */
export function parseBusca(html: string): Materia[] {
  const bloco = html.match(
    /<script[^>]*type="application\/json"[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/,
  );
  if (!bloco) return [];

  let dados: { jsonArray?: Array<Record<string, unknown>> };
  try {
    dados = JSON.parse(bloco[1]);
  } catch {
    return []; // portal mudou o formato: melhor zero que lixo
  }

  return (dados.jsonArray ?? [])
    .map((item) => ({
      titulo: semTags(String(item.title ?? "")),
      urlTitle: String(item.urlTitle ?? ""),
      trecho: semTags(String(item.content ?? "")),
      secao: String(item.pubName ?? ""),
      pagina: item.numberPage ? String(item.numberPage) : null,
      edicao: item.editionNumber ? String(item.editionNumber) : null,
      publicadoEm: item.pubDate ? String(item.pubDate) : null,
      tipo: item.artType ? String(item.artType) : null,
    }))
    .filter((m) => m.urlTitle && m.titulo);
}

/**
 * O corpo da matéria são os <p class="dou-paragraph">. Pegar a div inteira
 * traria menu, rodapé e o "compartilhe no whatsapp".
 */
export function parseMateria(html: string): string {
  const paragrafos = html.match(/<p[^>]*class="[^"]*dou-paragraph[^"]*"[^>]*>[\s\S]*?<\/p>/g);
  if (!paragrafos?.length) return "";
  return paragrafos.map(semTags).filter(Boolean).join("\n\n");
}

/** DD/MM/YYYY -> YYYY-MM-DD. O resto do sistema fala ISO. */
export function paraIso(data: string | null): string | null {
  const m = (data ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** YYYY-MM-DD -> DD-MM-YYYY, que é o formato que o portal exige. */
export function paraPortal(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}-${m}-${a}`;
}

export function urlDaMateria(urlTitle: string): string {
  return MATERIA + urlTitle;
}

export function urlDaBusca(termo: string, secao: Secao, dataIso: string, delta = 20): string {
  const dia = paraPortal(dataIso);
  const p = new URLSearchParams({
    q: termo,
    s: secao,
    exactDate: "personalizado",
    sortType: "0",
    delta: String(delta),
    publishFrom: dia,
    publishTo: dia,
  });
  return `${BUSCA}?${p}`;
}

// ----------------------------------------------------------------------------
// Rede
// ----------------------------------------------------------------------------

async function baixar(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!r.ok) throw new Error(`in.gov.br respondeu ${r.status} em ${url.slice(0, 90)}`);
  return await r.text();
}

/** Busca um termo numa seção do DOU, num dia. */
export async function buscar(termo: string, secao: Secao, dataIso: string): Promise<Materia[]> {
  return parseBusca(await baixar(urlDaBusca(termo, secao, dataIso)));
}

/** Texto integral do ato. É o que alimenta o dossiê e a extração de prazo. */
export async function textoIntegral(urlTitle: string): Promise<string> {
  return parseMateria(await baixar(urlDaMateria(urlTitle)));
}
