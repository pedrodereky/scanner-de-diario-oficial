// ============================================================================
// cron-dossie — o dossiê do dia chega ao usuário
// ----------------------------------------------------------------------------
// Antes disso o produto prometia "alertas" e não entregava nenhum: as duas
// saídas configuráveis (Evolution e Resend) estavam desligadas, então o dossiê
// só existia para quem abrisse a tela e clicasse.
//
// E-mail primeiro, de propósito. WhatsApp exige VPS e número dedicado, e o
// risco de ban em disparo automático é real. E-mail com domínio verificado
// entrega hoje.
//
// Um e-mail por dia por usuário. Se o dossiê não tem item, não manda nada:
// e-mail que chega dizendo "nada aconteceu" treina o leitor a ignorar o
// remetente, e aí o dia em que algo acontece ele também ignora.
// ============================================================================

import { adminClient, getEnabledIntegration } from "../_shared/supabase.ts";
import { invokeFunction, jsonResponse } from "../_shared/invoke.ts";

interface ItemDossie {
  titulo: string;
  o_que_aconteceu: string;
  quem_e_afetado: string;
  o_que_fazer: string;
  urgencia: string;
  citacao: string;
  radar: string | null;
  fonte: string | null;
  data: string | null;
  url: string | null;
  prazos: string[];
  datas_citadas: string[];
}

interface Dossie {
  veredito: string;
  exige_acao: boolean;
  itens: ItemDossie[];
  padrao: string;
}

Deno.serve(async (req) => {
  let body: { dias?: number; force?: boolean; user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }
  const dias = Number(body.dias) > 0 ? Number(body.dias) : 1;

  const supa = adminClient();
  try {
    const resend = await getEnabledIntegration("resend");
    const apiKey = resend.secrets.api_key;
    const cfg = resend.config as { from_email?: string; from_name?: string };
    const remetente = cfg.from_email;
    if (!apiKey) throw new Error("resend: api_key ausente no Vault");
    if (!remetente) throw new Error("resend: from_email ausente na configuração");

    let q = supa.from("profiles").select("id, display_name").eq("notify_email", true);
    if (body.user_id) q = q.eq("id", body.user_id);
    const { data: perfis, error } = await q;
    if (error) throw error;

    const { data: usuarios } = await supa.auth.admin.listUsers({ perPage: 1000 });
    const emailPorId = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? null]));

    const saida: Array<Record<string, unknown>> = [];

    for (const perfil of perfis ?? []) {
      const email = emailPorId.get(perfil.id);
      if (!email) {
        saida.push({ user_id: perfil.id, status: "sem e-mail" });
        continue;
      }

      // Um por dia. Reenvio só com force, para não duplicar na caixa de entrada.
      if (!body.force) {
        const desde = new Date(Date.now() - 20 * 3600_000).toISOString();
        const { count } = await supa
          .from("briefings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", perfil.id)
          .eq("enviado_por_email", true)
          .gte("created_at", desde);
        if ((count ?? 0) > 0) {
          saida.push({ user_id: perfil.id, status: "já enviado hoje" });
          continue;
        }
      }

      const r = await invokeFunction("ai-dossie", { user_id: perfil.id, dias });
      const dados = await r.json();

      if (dados?.error) {
        saida.push({ user_id: perfil.id, status: "erro no dossiê", erro: String(dados.error).slice(0, 120) });
        continue;
      }

      const dossie = dados.dossie as Dossie;
      if (!dossie?.itens?.length) {
        saida.push({ user_id: perfil.id, status: "nada no período, não enviado" });
        continue;
      }

      const assunto = montarAssunto(dossie, dias);
      const html = montarHtml(dossie, perfil.display_name ?? "", dias);

      const envio = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: cfg.from_name ? `${cfg.from_name} <${remetente}>` : remetente,
          to: [email],
          subject: assunto,
          html,
        }),
      });

      if (!envio.ok) {
        const texto = await envio.text();
        saida.push({ user_id: perfil.id, status: "falha no envio", erro: texto.slice(0, 150) });
        continue;
      }

      if (dados.id) {
        await supa
          .from("briefings")
          .update({ enviado_por_email: true, enviado_em: new Date().toISOString() })
          .eq("id", dados.id);
      }

      saida.push({ user_id: perfil.id, status: "enviado", itens: dossie.itens.length, assunto });
    }

    return jsonResponse({ processados: saida.length, resultado: saida });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ----------------------------------------------------------------------------
// Redação
// ----------------------------------------------------------------------------

/** O assunto é a única coisa que 100% dos destinatários leem. Ele carrega o veredito. */
function montarAssunto(dossie: Dossie, dias: number): string {
  const n = dossie.itens.length;
  const periodo = dias === 1 ? "hoje" : `em ${dias} dias`;
  if (dossie.exige_acao) {
    const comPrazo = dossie.itens.filter((i) => i.prazos.length > 0).length;
    return comPrazo > 0
      ? `Ação necessária: ${comPrazo} ato(s) com prazo ${periodo}`
      : `Ação necessária: ${n} ato(s) ${periodo}`;
  }
  return `${n} menção(ões) ${periodo}, nenhuma exige ação`;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CORES: Record<string, string> = {
  alta: "#98341F",
  media: "#B57A08",
  baixa: "#10333C",
  informativo: "#6B7B7F",
};

const ROTULOS: Record<string, string> = {
  alta: "URGENTE",
  media: "ATENÇÃO",
  baixa: "ACOMPANHAR",
  informativo: "INFORMATIVO",
};

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

/**
 * HTML de e-mail é HTML de 2003: tabela, estilo inline, nada de flex. Cliente
 * de e-mail ignora <style> em bloco com frequência suficiente para não valer
 * o risco.
 */
function montarHtml(dossie: Dossie, nome: string, dias: number): string {
  const itens = dossie.itens
    .map((item) => {
      const cor = CORES[item.urgencia] ?? CORES.informativo;
      const rotulo = ROTULOS[item.urgencia] ?? ROTULOS.informativo;

      const prazos = [...item.prazos, ...item.datas_citadas.map(formatarData)].filter(Boolean);
      const blocoPrazo = prazos.length
        ? `<tr><td style="padding:10px 14px;background:#FBF1DC;border-left:3px solid #B57A08;font:600 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#5C4708;">
             Prazo no ato: ${escapar(prazos.join(" · "))}
           </td></tr>`
        : "";

      const link = item.url
        ? `<tr><td style="padding-top:10px;font:500 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;">
             <a href="${escapar(item.url)}" style="color:#10333C;">Abrir o ato na fonte</a>
           </td></tr>`
        : "";

      return `
      <tr><td style="padding:0 0 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D9DEDD;border-radius:6px;">
          <tr><td style="padding:16px 18px 0;">
            <span style="display:inline-block;padding:3px 8px;border-radius:3px;background:${cor};color:#fff;font:700 10px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;">${rotulo}</span>
            <span style="font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6B7B7F;padding-left:8px;">
              ${escapar(item.radar ?? "")} · ${escapar(item.fonte ?? "")} · ${formatarData(item.data)}
            </span>
          </td></tr>
          <tr><td style="padding:10px 18px 0;font:700 16px/1.35 Georgia,serif;color:#0A2229;">${escapar(item.titulo)}</td></tr>
          <tr><td style="padding:8px 18px 0;font:400 14px/1.6 Georgia,serif;color:#2A3B40;">${escapar(item.o_que_aconteceu)}</td></tr>
          <tr><td style="padding:12px 18px 0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#2A3B40;">
            <strong style="color:#0A2229;">Quem é afetado:</strong> ${escapar(item.quem_e_afetado)}<br>
            <strong style="color:#0A2229;">O que fazer:</strong> ${escapar(item.o_que_fazer)}
          </td></tr>
          <tr><td style="padding:12px 18px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blocoPrazo}</table>
          </td></tr>
          <tr><td style="padding:12px 18px 16px;">
            <div style="border-left:2px solid #D9DEDD;padding-left:12px;font:italic 12px/1.6 Georgia,serif;color:#6B7B7F;">${escapar(item.citacao)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0">${link}</table>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");

  const saudacao = nome ? `${escapar(nome)}, ` : "";
  const periodo = dias === 1 ? "nas últimas 24 horas" : `nos últimos ${dias} dias`;

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F1F3F2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F3F2;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border-radius:8px;padding:26px;">

        <tr><td style="font:700 10px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;color:#10333C;text-transform:uppercase;padding-bottom:8px;">
          Diário Oficial Scanner
        </td></tr>

        <tr><td style="font:700 24px/1.2 Georgia,serif;color:#0A2229;padding-bottom:6px;">Dossiê do dia</td></tr>

        <tr><td style="font:400 14px/1.6 Georgia,serif;color:#2A3B40;padding-bottom:18px;">
          ${saudacao}o que os seus radares encontraram ${periodo}.
        </td></tr>

        <tr><td style="padding:14px 16px;margin-bottom:20px;background:${dossie.exige_acao ? "#FCF0EC" : "#F1F3F2"};border-left:3px solid ${dossie.exige_acao ? "#98341F" : "#10333C"};font:600 15px/1.55 Georgia,serif;color:#0A2229;">
          ${escapar(dossie.veredito)}
        </td></tr>

        <tr><td style="height:20px;"></td></tr>

        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itens}</table>
        </td></tr>

        ${
          dossie.padrao
            ? `<tr><td style="padding:14px 16px;border:1px dashed #D9DEDD;border-radius:6px;font:400 13px/1.6 Georgia,serif;color:#2A3B40;">
                 <strong style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6B7B7F;display:block;padding-bottom:4px;">O que o conjunto mostra</strong>
                 ${escapar(dossie.padrao)}
               </td></tr>`
            : ""
        }

        <tr><td style="padding-top:22px;font:400 11px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#6B7B7F;border-top:1px solid #E4E8E7;margin-top:20px;">
          Os prazos citados foram extraídos do texto literal do ato, não gerados por IA.
          Quando o ato não enuncia prazo, o dossiê não inventa nenhum.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}
