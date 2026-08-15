// ============================================================================
// scrape-dou — Diário Oficial da União, sem credencial
// ----------------------------------------------------------------------------
// Espelha o contrato dos outros adapters: recebe { source_id, date }, marca a
// scrape_run e insere publications. A diferença é a estratégia de coleta.
//
// Os outros adapters baixam a edição inteira e deixam o match-extractor casar.
// Aqui isso seria absurdo: as três seções do DOU passam de 3 MB por dia e a
// maior parte não interessa a ninguém. Então a coleta é PULL POR TERMO: para
// cada termo ativo ligado a esta fonte, pergunta ao índice do DOU e lê na
// íntegra só o que voltou.
//
// O índice deles gera candidatos; quem decide continua sendo o nosso matcher,
// pelo caminho normal (trigger -> match-extractor).
// ============================================================================

import { adminClient } from "../_shared/supabase.ts";
import { jsonResponse, sha256Hex } from "../_shared/invoke.ts";
import { preflight } from "../_shared/cors.ts";
import { SECOES, type Materia, buscar, paraIso, textoIntegral, urlDaMateria } from "./dou.ts";

/** Teto por rodada. Sem isso, 50 termos x 3 seções viram 150 requisições ao portal. */
const MAX_MATERIAS = 40;
/** Pausa entre requisições: o portal é público e gratuito, não vale martelar. */
const PAUSA_MS = 350;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  let payload: { source_id?: string; source_code?: string; date?: string } = {};
  try {
    payload = await req.json();
  } catch {
    // ignore
  }
  const { source_id, source_code, date } = payload;
  if (!source_id || !date) return jsonResponse({ error: "source_id, date required" }, 400);

  const supa = adminClient();
  await marcarRun(supa, source_id, date, "running");

  try {
    // Termos ativos ligados a esta fonte. Sem termo, não há o que perguntar.
    const { data: vinculos, error: tErr } = await supa
      .from("term_sources")
      .select("terms!inner(id, pattern, label, active)")
      .eq("source_id", source_id)
      .eq("terms.active", true);
    if (tErr) throw tErr;

    const termos = (vinculos ?? [])
      .map((v) => {
        const t = (v as { terms: { pattern: string } | { pattern: string }[] }).terms;
        return Array.isArray(t) ? t[0] : t;
      })
      .filter(Boolean)
      .map((t) => t.pattern.trim())
      .filter((p) => p.length >= 3);

    const unicos = [...new Set(termos)];

    if (!unicos.length) {
      await marcarRun(supa, source_id, date, "success", 0, "nenhum termo ativo ligado ao DOU");
      return jsonResponse({ source: source_code, termos: 0, publicacoes: 0 });
    }

    // ---- 1. Candidatos: o índice do DOU responde por termo e por seção ----
    const candidatos = new Map<string, Materia>();
    const avisos: string[] = [];

    for (const termo of unicos) {
      for (const secao of SECOES) {
        if (candidatos.size >= MAX_MATERIAS) break;
        try {
          for (const m of await buscar(termo, secao, date)) {
            if (!candidatos.has(m.urlTitle)) candidatos.set(m.urlTitle, m);
          }
        } catch (e) {
          avisos.push(`${termo}/${secao}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await dormir(PAUSA_MS);
      }
    }

    console.log(
      `[scrape-dou] ${unicos.length} termo(s) x ${SECOES.length} seções -> ${candidatos.size} matéria(s) candidatas`,
    );

    // ---- 2. Já conhecidas não são relidas ----
    const chaves = [...candidatos.keys()];
    const jaTemos = new Set<string>();
    if (chaves.length) {
      const urls = chaves.map(urlDaMateria);
      const { data: existentes } = await supa
        .from("publications")
        .select("url")
        .eq("source_id", source_id)
        .in("url", urls);
      for (const e of existentes ?? []) jaTemos.add(String((e as { url: string }).url));
    }

    // ---- 3. Texto integral só do que é novo ----
    const linhas: Array<Record<string, unknown>> = [];
    let relidas = 0;

    for (const [urlTitle, m] of candidatos) {
      const url = urlDaMateria(urlTitle);
      if (jaTemos.has(url)) {
        relidas++;
        continue;
      }
      try {
        const corpo = await textoIntegral(urlTitle);
        // Sem corpo, o trecho da busca ainda serve: melhor um match curto que
        // nenhum. O dossiê avisa quando não achou prazo.
        const texto = corpo || m.trecho;
        if (!texto) continue;

        // O tipo do ato (Aviso, Edital, Portaria, Ata) muda a leitura por
        // completo: aviso de licitação é oportunidade com prazo, ata é registro
        // do que já foi decidido. Sem ele o dossiê trata tudo igual.
        linhas.push({
          source_id,
          publication_date: paraIso(m.publicadoEm) ?? date,
          title: [m.tipo, m.titulo].filter(Boolean).join(" · ").slice(0, 500),
          url,
          raw_text: texto,
          content_hash: await sha256Hex(texto),
        });
      } catch (e) {
        avisos.push(`${urlTitle}: ${e instanceof Error ? e.message : String(e)}`);
      }
      await dormir(PAUSA_MS);
    }

    // ---- 4. Grava. O trigger em publications dispara o match-extractor. ----
    let inseridas = 0;
    if (linhas.length) {
      // A chave única da tabela é (source_id, content_hash, publication_date):
      // é o hash do texto que define duplicata, não a URL.
      const { error: insErr, count } = await supa.from("publications").upsert(linhas, {
        onConflict: "source_id,content_hash,publication_date",
        ignoreDuplicates: true,
        count: "exact",
      });
      if (insErr) throw insErr;
      inseridas = count ?? linhas.length;
    }

    const resumo = `${unicos.length} termo(s), ${candidatos.size} candidata(s), ${inseridas} nova(s), ${relidas} já conhecida(s)`;
    console.log(`[scrape-dou] ${resumo}`);
    await marcarRun(supa, source_id, date, "success", inseridas, avisos[0] ?? null);

    return jsonResponse({
      source: source_code,
      termos: unicos.length,
      candidatas: candidatos.size,
      publicacoes_novas: inseridas,
      ja_conhecidas: relidas,
      avisos: avisos.slice(0, 5),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await marcarRun(supa, source_id, date, "failed", 0, msg);
    return jsonResponse({ error: msg }, 500);
  }
});

async function marcarRun(
  supa: ReturnType<typeof adminClient>,
  source_id: string,
  publication_date: string,
  status: string,
  pages = 0,
  erro: string | null = null,
) {
  const agora = new Date().toISOString();
  await supa.from("scrape_runs").upsert(
    {
      source_id,
      publication_date,
      status,
      pages_processed: pages,
      error: erro ? erro.slice(0, 500) : null,
      ...(status === "running" ? { started_at: agora } : { finished_at: agora }),
    },
    { onConflict: "source_id,publication_date" },
  );
}
