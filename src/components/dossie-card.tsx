import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ExternalLink, FileText, Quote } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface DossieItem {
  match_id: string;
  titulo: string;
  o_que_aconteceu: string;
  quem_e_afetado: string;
  o_que_fazer: string;
  urgencia: "alta" | "media" | "baixa" | "informativo";
  citacao: string;
  radar: string | null;
  fonte: string | null;
  data: string | null;
  url: string | null;
  categoria: string | null;
  prazos: string[];
  datas_citadas: string[];
}

export interface Dossie {
  veredito: string;
  exige_acao: boolean;
  itens: DossieItem[];
  padrao: string;
}

interface Resposta {
  id: string | null;
  periodo_dias: number;
  atos_analisados?: number;
  vazio?: boolean;
  dossie: Dossie;
}

/** Urgência é estado, então precisa ler como estado, não como mais um texto. */
const TOM: Record<DossieItem["urgencia"], { rotulo: string; classe: string }> = {
  alta: { rotulo: "Urgente", classe: "border-destructive/40 bg-destructive/10 text-destructive" },
  media: {
    rotulo: "Atenção",
    classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  baixa: { rotulo: "Acompanhar", classe: "border-primary/30 bg-primary/10 text-primary" },
  informativo: {
    rotulo: "Informativo",
    classe: "border-muted-foreground/25 bg-muted text-muted-foreground",
  },
};

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export function DossieCard({ termId }: { termId?: string }) {
  const dossie = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-dossie", {
        body: { dias: 7, term_id: termId ?? null },
      });
      if (error) throw error;
      return data as Resposta;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dados = dossie.data;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-base">Dossiê do período</CardTitle>
              <CardDescription className="text-xs">
                Leitura dos atos dos últimos 7 dias, com prazo e providência de cada um.
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant={dados ? "outline" : "default"}
            onClick={() => dossie.mutate()}
            disabled={dossie.isPending}
          >
            {dossie.isPending ? "Analisando..." : dados ? "Refazer" : "Gerar dossiê"}
          </Button>
        </div>
      </CardHeader>

      {dados && (
        <CardContent className="space-y-5">
          {/* Veredito: a resposta antes do detalhe. */}
          <div
            className={`rounded-lg border p-4 ${
              dados.dossie.exige_acao
                ? "border-destructive/30 bg-destructive/5"
                : "border-border bg-muted/40"
            }`}
          >
            <div className="flex items-start gap-2">
              {dados.dossie.exige_acao && (
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
              )}
              <p className="text-sm font-medium leading-relaxed">{dados.dossie.veredito}</p>
            </div>
          </div>

          {dados.dossie.itens.map((item) => {
            const tom = TOM[item.urgencia] ?? TOM.informativo;
            return (
              <article key={item.match_id} className="rounded-lg border border-border p-4">
                <header className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tom.classe}`}
                  >
                    {tom.rotulo}
                  </span>
                  {item.radar && (
                    <Badge variant="secondary" className="text-[10px]">
                      {item.radar}
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {item.fonte}
                    {item.data ? ` · ${formatarData(item.data)}` : ""}
                  </span>
                </header>

                <h4 className="text-sm font-semibold leading-snug">{item.titulo}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.o_que_aconteceu}
                </p>

                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Quem é afetado
                    </dt>
                    <dd className="mt-0.5 text-sm">{item.quem_e_afetado}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      O que fazer
                    </dt>
                    <dd className="mt-0.5 text-sm">{item.o_que_fazer}</dd>
                  </div>
                </dl>

                {/* O prazo não vem do modelo: é extraído do texto por regra. */}
                {(item.prazos.length > 0 || item.datas_citadas.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                    <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    {item.prazos.map((p) => (
                      <span key={p} className="text-xs font-medium tabular-nums">
                        {p}
                      </span>
                    ))}
                    {item.datas_citadas.map((d) => (
                      <span key={d} className="text-xs tabular-nums text-muted-foreground">
                        {formatarData(d)}
                      </span>
                    ))}
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                      extraído do ato
                    </span>
                  </div>
                )}

                <figure className="mt-3 border-l-2 border-border pl-3">
                  <Quote className="mb-1 h-3 w-3 text-muted-foreground" />
                  <blockquote className="text-xs italic leading-relaxed text-muted-foreground">
                    {item.citacao}
                  </blockquote>
                </figure>

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Abrir o ato na fonte <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </article>
            );
          })}

          {dados.dossie.padrao && (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                O que o conjunto mostra
              </p>
              <p className="mt-1 text-sm leading-relaxed">{dados.dossie.padrao}</p>
            </div>
          )}

          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {dados.atos_analisados ?? 0} ato(s) lidos na íntegra · prazos extraídos do texto, não do
            modelo
          </p>
        </CardContent>
      )}
    </Card>
  );
}
