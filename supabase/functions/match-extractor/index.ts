// schema v2: partitioned by publication_date
import { adminClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/invoke.ts";
import { type Normalized, buildExcerpt, findMatches, normalize } from "./matcher.ts";

/**
 * Recebe { publication_ids: string[] } e aplica todos os termos ativos ligados
 * à fonte de cada publicação. Grava os matches; o ai-classifier pega depois.
 *
 * O casamento em si vive em matcher.ts, testado por matcher_test.ts. O que
 * está aqui é só a costura com o banco.
 */
Deno.serve(async (req) => {
  let body: { publication_ids?: string[]; term_id?: string; dias?: number } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const ids = body.publication_ids ?? [];
  const termId = body.term_id ?? null;

  if (ids.length === 0 && !termId) {
    return jsonResponse({ error: "publication_ids ou term_id required" }, 400);
  }

  const supa = adminClient();
  try {
    // O gatilho em publications só dispara no INSERT. Radar cadastrado hoje
    // nunca veria o diário de ontem, e o usuário novo abriria a tela vazia
    // concluindo que o produto não funciona. Com term_id, varre o que já está
    // no banco para as fontes daquele radar.
    let alvos = ids;

    if (termId) {
      const { data: fontes, error: fErr } = await supa
        .from("term_sources")
        .select("source_id")
        .eq("term_id", termId);
      if (fErr) throw fErr;

      const sourceIds = (fontes ?? []).map((f) => (f as { source_id: string }).source_id);
      if (!sourceIds.length) {
        return jsonResponse({ error: "termo sem fonte vinculada" }, 400);
      }

      const dias = Number(body.dias) > 0 ? Math.min(Number(body.dias), 365) : 30;
      const desde = new Date(Date.now() - dias * 86400_000).toISOString().slice(0, 10);

      const { data: antigas, error: aErr } = await supa
        .from("publications")
        .select("id")
        .in("source_id", sourceIds)
        .gte("publication_date", desde)
        .limit(500);
      if (aErr) throw aErr;

      alvos = (antigas ?? []).map((p) => (p as { id: string }).id);
      console.log(`[match-extractor] backfill do termo ${termId}: ${alvos.length} publicação(ões)`);
      if (!alvos.length) return jsonResponse({ publications_processed: 0, matches_inserted: 0 });
    }

    const { data: pubs, error: pErr } = await supa
      .from("publications")
      .select("id, source_id, raw_text, publication_date")
      .in("id", alvos);
    if (pErr) throw pErr;

    let inserted = 0;
    let avaliados = 0;
    const matchIds: string[] = [];

    for (const pub of pubs ?? []) {
      const { data: termRows, error: tErr } = await supa
        .from("term_sources")
        .select("term_id, terms!inner(id, user_id, label, pattern, match_type, active)")
        .eq("source_id", pub.source_id)
        .eq("terms.active", true);
      if (tErr) throw tErr;

      const text: string = pub.raw_text ?? "";
      if (!text) continue;

      // Normalizar é o passo caro e o texto é o mesmo para todos os termos
      // desta publicação: faz uma vez só.
      const norm: Normalized = normalize(text);

      for (const row of termRows ?? []) {
        // O join do PostgREST vem tipado como array; aqui é sempre um só.
        const bruto = (row as unknown as { terms: TermDef | TermDef[] }).terms;
        const term = Array.isArray(bruto) ? bruto[0] : bruto;
        if (!term) continue;
        avaliados++;

        const hits = findMatches(text, norm, {
          pattern: term.pattern,
          match_type: term.match_type,
        });
        if (hits.length === 0) continue;

        const excerpt = buildExcerpt(text, hits[0].index, 200);

        const { error: insErr, data: ins } = await supa
          .from("matches")
          .upsert(
            {
              user_id: term.user_id,
              term_id: term.id,
              publication_id: pub.id,
              publication_date: (pub as { publication_date: string }).publication_date,
              excerpt,
            },
            { onConflict: "term_id,publication_id", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        if (insErr) throw insErr;
        if (ins?.id) {
          inserted++;
          matchIds.push(ins.id);
        }
      }
    }

    // ai-classifier roda em cron de 2 min; match novo é pego sozinho.

    return jsonResponse({
      publications_processed: pubs?.length ?? 0,
      term_checks: avaliados,
      matches_inserted: inserted,
      match_ids: matchIds,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

type TermDef = {
  id: string;
  user_id: string;
  label: string;
  pattern: string;
  match_type: "literal" | "regex" | "cnpj" | "nome";
  active: boolean;
};
