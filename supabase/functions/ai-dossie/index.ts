// ============================================================================
// ai-dossie — do alerta solto ao dossiê analisado
// ----------------------------------------------------------------------------
// O ai-briefing resume resumos: ele lê o ai_summary de cada match (uma ou duas
// frases) e escreve quatro parágrafos em cima. O que sai dali é uma paráfrase,
// nunca uma análise, porque a informação que interessa (prazo, quem é afetado,
// o que fazer) nunca esteve na matéria-prima.
//
// Aqui a matéria-prima é o ato: uma janela larga do raw_text em volta de cada
// acerto. E a saída é tipada, não prosa livre:
//
//   * o prazo NÃO sai do modelo. Sai de regra, do texto literal (prazos.ts).
//     Prazo alucinado faz o leitor perder direito. Quando a regra não acha, o
//     dossiê diz "não informado no ato" e ninguém é induzido a nada.
//   * cada item carrega a citação literal que o sustenta, para conferência.
//   * o modelo preenche uma estrutura fixa via tool call, então a forma é
//     garantida pelo schema e não pela boa vontade do prompt.
//
// O resultado fica gravado em `briefings`: dossiê é peça de trabalho, precisa
// sobreviver ao refresh da página e poder ser comparado com o da semana passada.
// ============================================================================

import { preflight } from "../_shared/cors.ts";
import { adminClient, getEnabledIntegration } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/invoke.ts";
import { type Prazos, descreverPrazo, extrairPrazos, janela } from "../_shared/prazos.ts";

const RAIO_ANALISE = 1500;
const MAX_ATOS = 20;

interface Ato {
  match_id: string;
  radar: string;
  categoria: string;
  confianca: number | null;
  fonte: string;
  data: string;
  url: string | null;
  titulo: string | null;
  trecho: string;
  prazos: Prazos;
}

const ESQUEMA = {
  name: "dossie",
  description: "Dossiê analítico do período, preenchido a partir dos atos fornecidos.",
  input_schema: {
    type: "object",
    properties: {
      veredito: {
        type: "string",
        description:
          "Uma frase que responde 'o que eu preciso saber?'. Se nada exige ação, diga isso com todas as letras.",
      },
      exige_acao: {
        type: "boolean",
        description: "true se algum ato do período impõe providência ao monitorado.",
      },
      itens: {
        type: "array",
        description: "Um item por ato relevante, do mais urgente ao menos.",
        items: {
          type: "object",
          properties: {
            match_id: { type: "string", description: "id do ato, copiado da entrada" },
            titulo: { type: "string", description: "Até 70 caracteres, direto ao ponto." },
            o_que_aconteceu: { type: "string", description: "2 a 3 frases, sem repetir o trecho." },
            quem_e_afetado: { type: "string", description: "Quem sofre efeito. Uma frase." },
            o_que_fazer: {
              type: "string",
              description:
                "Providência concreta, ou 'Nenhuma providência: ato apenas informativo.' Nunca invente prazo aqui.",
            },
            urgencia: { type: "string", enum: ["alta", "media", "baixa", "informativo"] },
            citacao: {
              type: "string",
              description: "Trecho LITERAL do ato que sustenta o item, até 200 caracteres.",
            },
          },
          required: [
            "match_id",
            "titulo",
            "o_que_aconteceu",
            "quem_e_afetado",
            "o_que_fazer",
            "urgencia",
            "citacao",
          ],
        },
      },
      padrao: {
        type: "string",
        description:
          "O que o conjunto revela e um ato isolado não revelaria. Se não houver padrão, diga que não houve.",
      },
    },
    required: ["veredito", "exige_acao", "itens", "padrao"],
  },
} as const;

const INSTRUCAO = `Você é analista de Diário Oficial e escreve para quem vai decidir algo hoje.

Regras que não se negociam:
- Cada afirmação sai do texto fornecido. O que não está no ato, você não afirma.
- PRAZO: use exclusivamente os prazos já extraídos e listados em cada ato. Eles vieram do texto literal por regra. Se um ato não traz prazo na lista, o campo "o_que_fazer" NÃO pode conter prazo nenhum, nem aproximado, nem "cerca de".
- "citacao" é recorte literal do trecho fornecido, sem reescrever.
- Ato que só informa recebe urgencia "informativo" e o_que_fazer explicitando que não há providência. Inflar urgência destrói a utilidade do dossiê.
- Português brasileiro, direto, sem jargão de consultoria e sem adjetivo de venda.
- Nunca use travessão. Use ponto ou vírgula.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const body = await req.json().catch(() => ({}));
    const dias = Number(body?.dias) > 0 ? Math.min(Number(body.dias), 90) : 7;
    const termId: string | null = body?.term_id ?? null;

    let userId: string | null = body?.user_id ?? null;
    if (!userId) userId = decodeJwtSub(req.headers.get("Authorization") ?? "");
    if (!userId) return jsonResponse({ error: "unauthorized: sem user_id no JWT ou no body" }, 401);

    const supa = adminClient();
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();

    let q = supa
      .from("matches")
      .select(
        "id, excerpt, ai_category, ai_confidence, publication_id, terms(label), publications(publication_date, title, url, raw_text, sources(name))",
      )
      .eq("user_id", userId)
      .eq("is_false_positive", false)
      .gte("created_at", desde)
      .order("ai_confidence", { ascending: false, nullsFirst: false })
      .limit(MAX_ATOS);
    if (termId) q = q.eq("term_id", termId);

    const { data: linhas, error } = await q;
    if (error) throw error;

    if (!linhas?.length) {
      return jsonResponse({
        vazio: true,
        periodo_dias: dias,
        dossie: {
          veredito: `Nenhum ato encontrado nos últimos ${dias} dias para os radares monitorados.`,
          exige_acao: false,
          itens: [],
          padrao: "Sem material no período.",
        },
      });
    }

    const atos = linhas.map((linha) => montarAto(linha)).filter((a): a is Ato => a !== null);

    const anthropic = await getEnabledIntegration("anthropic");
    const apiKey = anthropic.secrets.api_key;
    if (!apiKey) throw new Error("anthropic: api_key ausente no Vault");
    const modelo = (anthropic.config as { model?: string }).model || "claude-haiku-4-5-20251001";

    const dossie = await analisar(apiKey, modelo, atos, dias);

    // Enriquece cada item com o que o modelo não decide: prazo e procedência.
    const porId = new Map(atos.map((a) => [a.match_id, a]));
    const brutos = Array.isArray(dossie.itens) ? (dossie.itens as Record<string, unknown>[]) : [];
    const itens = brutos.map((item) => {
      const ato = porId.get(String(item.match_id));
      return {
        ...item,
        radar: ato?.radar ?? null,
        fonte: ato?.fonte ?? null,
        data: ato?.data ?? null,
        url: ato?.url ?? null,
        categoria: ato?.categoria ?? null,
        prazos: (ato?.prazos.relativos ?? []).map(descreverPrazo),
        datas_citadas: (ato?.prazos.datas ?? []).map((d) => d.data),
      };
    });

    const conteudo = { ...dossie, itens };

    const { data: gravado } = await supa
      .from("briefings")
      .insert({
        user_id: userId,
        term_id: termId,
        periodo_dias: dias,
        atos_analisados: atos.length,
        exige_acao: Boolean(dossie.exige_acao),
        conteudo,
        modelo,
      })
      .select("id, created_at")
      .maybeSingle();

    return jsonResponse({
      id: gravado?.id ?? null,
      gerado_em: gravado?.created_at ?? new Date().toISOString(),
      periodo_dias: dias,
      atos_analisados: atos.length,
      dossie: conteudo,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ----------------------------------------------------------------------------

function montarAto(linha: unknown): Ato | null {
  const l = linha as {
    id: string;
    excerpt: string | null;
    ai_category: string | null;
    ai_confidence: number | null;
    terms: { label: string } | { label: string }[] | null;
    publications: {
      publication_date: string;
      title: string | null;
      url: string | null;
      raw_text: string | null;
      sources: { name: string } | { name: string }[] | null;
    } | null;
  };

  const term = Array.isArray(l.terms) ? l.terms[0] : l.terms;
  const pub = l.publications;
  if (!term || !pub) return null;
  const fonte = Array.isArray(pub.sources) ? pub.sources[0] : pub.sources;

  // A janela larga é o ponto: o excerto do card tem 200 caracteres e quase
  // nunca alcança o prazo, que costuma vir parágrafos depois do nome.
  const bruto = pub.raw_text ?? "";
  const ancora = l.excerpt ? posicaoDoExcerto(bruto, l.excerpt) : -1;
  const trecho = ancora >= 0 ? janela(bruto, ancora, RAIO_ANALISE) : (l.excerpt ?? "");

  return {
    match_id: l.id,
    radar: term.label,
    categoria: l.ai_category ?? "outro",
    confianca: l.ai_confidence,
    fonte: fonte?.name ?? "",
    data: pub.publication_date,
    url: pub.url,
    titulo: pub.title,
    trecho,
    // hoje corta data vencida: prazo que já passou não é agenda de ninguém
    prazos: extrairPrazos(trecho, new Date().toISOString().slice(0, 10)),
  };
}

/** Reencontra o excerto no texto cheio; o excerto veio com espaços colapsados. */
function posicaoDoExcerto(bruto: string, excerpt: string): number {
  const miolo = excerpt
    .replace(/^\.{3}|\.{3}$/g, "")
    .trim()
    .slice(0, 60);
  if (!miolo) return -1;
  const direto = bruto.indexOf(miolo);
  if (direto >= 0) return direto;

  // com espaço colapsado o recorte não bate literalmente: tenta a primeira frase
  const primeiras = miolo.split(/\s+/).slice(0, 4).join(" ");
  return primeiras ? bruto.indexOf(primeiras) : -1;
}

async function analisar(
  apiKey: string,
  modelo: string,
  atos: Ato[],
  dias: number,
): Promise<Record<string, unknown>> {
  const material = atos
    .map((a, i) => {
      const prazos = a.prazos.relativos.length
        ? a.prazos.relativos.map((p) => `- ${descreverPrazo(p)} ("${p.trecho}")`).join("\n")
        : "- nenhum prazo enunciado no ato";
      return [
        `### Ato ${i + 1}`,
        `match_id: ${a.match_id}`,
        `radar monitorado: ${a.radar}`,
        `fonte: ${a.fonte} · publicado em ${a.data}`,
        // O título traz o tipo do ato (Aviso, Edital, Portaria, Ata). Aviso de
        // licitação é oportunidade com prazo; ata é registro do que já passou.
        a.titulo ? `título do ato: ${a.titulo}` : `título do ato: não informado pela fonte`,
        `categoria atribuída: ${a.categoria}`,
        `PRAZOS EXTRAÍDOS DO TEXTO (use só estes):`,
        prazos,
        `texto do ato:`,
        `"""${a.trecho.slice(0, 4000)}"""`,
      ].join("\n");
    })
    .join("\n\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 4000,
      system: [{ type: "text", text: INSTRUCAO, cache_control: { type: "ephemeral" } }],
      tools: [ESQUEMA],
      tool_choice: { type: "tool", name: "dossie" },
      messages: [
        {
          role: "user",
          content: `Período: últimos ${dias} dias. ${atos.length} ato(s) encontrados pelos radares.\n\n${material}`,
        },
      ],
    }),
  });

  if (!r.ok) {
    const texto = await r.text();
    throw new Error(`Anthropic ${r.status}: ${texto.slice(0, 300)}`);
  }

  const json = await r.json();
  const uso = json.content?.find((c: { type: string }) => c.type === "tool_use");
  if (!uso?.input) throw new Error("modelo não devolveu o dossiê no formato esperado");
  return uso.input as Record<string, unknown>;
}

function decodeJwtSub(authHeader: string): string | null {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
