import { corsHeaders, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { adminClient, getEnabledIntegration } from "../_shared/supabase.ts";
import { avaliarConteudo } from "./heuristica.ts";

/**
 * Testa uma source rodando o adapter dela (com override opcional de URL/mode)
 * e retorna um preview do conteúdo + heurística de "parece conteúdo de verdade".
 *
 * Body: { source_id, override_url?, override_mode? }
 * Returns: { ok, content_length, preview, looks_like_content, mode_used, error? }
 */
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    await requireAdmin(req);
    const body = await req.json();
    const sourceId: string | undefined = body.source_id;
    const overrideUrl: string | undefined = body.override_url;
    const overrideMode: string | undefined = body.override_mode;

    if (!sourceId) return json({ ok: false, error: "source_id required" }, 400);

    const supa = adminClient();
    const { data: src, error: sErr } = await supa
      .from("sources")
      .select("code, name, scraper_adapter, adapter_config")
      .eq("id", sourceId)
      .single();
    if (sErr || !src) return json({ ok: false, error: "source not found" }, 404);

    const cfg = (src.adapter_config ?? {}) as { url?: string; mode?: string };
    const url = overrideUrl?.trim() || cfg.url;
    const mode = overrideMode || cfg.mode || "scrape";

    if (src.scraper_adapter !== "firecrawl") {
      return json({
        ok: false,
        error: `Test só está implementado para adapter Firecrawl. Adapter atual: ${src.scraper_adapter}`,
      });
    }
    if (!url) {
      return json({ ok: false, error: "URL ausente (adapter_config.url ou override_url)" });
    }

    const fc = await getEnabledIntegration("firecrawl");
    const apiKey = fc.secrets.api_key;
    if (!apiKey) return json({ ok: false, error: "Firecrawl não configurada" });

    // v2 com waitFor: os portais estaduais são SPA e renderizam o conteúdo por
    // JS. Sem esperar, o teste reprova o portal pelo motivo errado (recebe a
    // casca) e a gente conclui que a fonte não serve quando só a leitura era
    // que estava errada.
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 6000,
        timeout: 60000,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return json({
        ok: false,
        error: `Firecrawl ${r.status}: ${text.slice(0, 200)}`,
        mode_used: mode,
      });
    }
    const data = await r.json();
    const markdown: string = (data?.data?.markdown ?? "").trim();
    const contentLength = markdown.length;

    const veredito = avaliarConteudo(markdown);

    // O resultado fica na fonte: "já testei e reprovou, por este motivo" é
    // estado do produto. Sem isso, todo admin refaz a mesma descoberta.
    await supa
      .from("sources")
      .update({
        testada_em: new Date().toISOString(),
        teste_ok: veredito.ok,
        teste_motivo: veredito.motivo.slice(0, 400),
      })
      .eq("id", sourceId);

    return json({
      ok: true,
      content_length: contentLength,
      preview: markdown.slice(0, 600),
      looks_like_content: veredito.ok,
      hint: veredito.motivo,
      atos_encontrados: veredito.atos,
      mode_used: mode,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
