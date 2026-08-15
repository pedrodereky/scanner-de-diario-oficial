import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceConnectDialog, type SourceLite } from "@/components/sources/SourceConnectDialog";

export const Route = createFileRoute("/app/sources")({
  component: SourcesPage,
});

function SourcesPage() {
  const isAdmin = useIsAdmin();
  const [q, setQ] = useState("");
  const [connecting, setConnecting] = useState<SourceLite | null>(null);
  const sources = useQuery({
    queryKey: ["sources-all"],
    queryFn: async () => {
      // A view carrega a verdade que a tabela não tem: última edição vista e
      // atraso real. "Ativa" sem entrega é a pior informação possível numa
      // tela de cobertura, porque promete monitoramento que não acontece.
      const { data, error } = await supabase
        .from("fontes_saude")
        .select(
          "id, code, name, level, uf, enabled, scraper_adapter, situacao, ultima_edicao, dias_de_atraso, total_publicacoes, ultimo_erro, teste_motivo, teste_ok",
        )
        .order("level")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!sources.data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return sources.data;
    return sources.data.filter(
      (s) =>
        (s.name ?? "").toLowerCase().includes(term) ||
        (s.code ?? "").toLowerCase().includes(term) ||
        (s.uf ?? "").toLowerCase().includes(term),
    );
  }, [sources.data, q]);

  const groups = useMemo(() => {
    return {
      federal: filtered.filter((s) => s.level === "federal"),
      state: filtered.filter((s) => s.level === "state"),
      municipal: filtered.filter((s) => s.level === "municipal"),
    };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo de fontes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Diários oficiais disponíveis para monitorar. Adicione novos no painel admin.
        </p>
      </div>

      <Input
        placeholder="Buscar por nome, UF ou código..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <Tabs defaultValue="federal">
        <TabsList>
          <TabsTrigger value="federal">
            Federal{" "}
            <Badge variant="secondary" className="ml-2">
              {groups.federal.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="state">
            Estaduais{" "}
            <Badge variant="secondary" className="ml-2">
              {groups.state.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="municipal">
            Municipais{" "}
            <Badge variant="secondary" className="ml-2">
              {groups.municipal.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        {(["federal", "state", "municipal"] as const).map((level) => (
          <TabsContent key={level} value={level}>
            <SourceList
              loading={sources.isLoading}
              items={groups[level]}
              isAdmin={isAdmin}
              onConnect={(s) => setConnecting(s)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <SourceConnectDialog source={connecting} onOpenChange={() => setConnecting(null)} />
    </div>
  );
}

type SourceItem = {
  id: string | null;
  code: string | null;
  name: string | null;
  level: string | null;
  uf: string | null;
  enabled: boolean | null;
  scraper_adapter: string | null;
  situacao: string | null;
  ultima_edicao: string | null;
  dias_de_atraso: number | null;
  total_publicacoes: number | null;
  ultimo_erro: string | null;
  teste_motivo: string | null;
  teste_ok: boolean | null;
};

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

/**
 * Situação vem da view, não do campo `enabled`. Fonte marcada como ativa que
 * não entrega há semanas é a informação mais enganosa que esta tela pode dar.
 */
function SituacaoBadge({ situacao, atraso }: { situacao: string | null; atraso: number | null }) {
  const mapa: Record<string, { texto: string; classe: string }> = {
    "em dia": { texto: "em dia", classe: "bg-emerald-600 text-white" },
    atrasada: { texto: `atrasada ${atraso ?? "?"}d`, classe: "bg-amber-500 text-white" },
    parada: { texto: `parada ${atraso ?? "?"}d`, classe: "bg-destructive text-white" },
    "nunca entregou": { texto: "nunca entregou", classe: "bg-destructive/80 text-white" },
    "reprovada no teste": {
      texto: "reprovada no teste",
      classe: "bg-muted text-muted-foreground",
    },
    desligada: { texto: "desligada", classe: "bg-muted text-muted-foreground" },
  };
  const item = mapa[situacao ?? ""] ?? mapa.desligada;
  return <Badge className={`text-[10px] ${item.classe}`}>{item.texto}</Badge>;
}

function SourceList({
  loading,
  items,
  isAdmin,
  onConnect,
}: {
  loading: boolean;
  items: SourceItem[];
  isAdmin: boolean;
  onConnect: (s: SourceLite) => void;
}) {
  if (loading) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;
  if (items.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">Nenhuma fonte encontrada.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <Card key={s.id} className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium leading-snug">{s.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px] font-mono">
                {s.code}
              </Badge>
              {s.uf && (
                <Badge variant="outline" className="text-[10px]">
                  {s.uf}
                </Badge>
              )}
              <SituacaoBadge situacao={s.situacao} atraso={s.dias_de_atraso} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{s.scraper_adapter}</span>
              <span className="tabular-nums">
                {s.ultima_edicao
                  ? `última edição ${formatarData(s.ultima_edicao)}`
                  : "nenhuma edição coletada"}
              </span>
            </div>
            {s.ultimo_erro ? (
              <p className="text-[11px] leading-snug text-destructive">{s.ultimo_erro}</p>
            ) : (
              s.teste_ok === false &&
              s.teste_motivo && (
                // Por que esta fonte está fora, medido, e não "porque sim".
                <p className="text-[11px] leading-snug text-muted-foreground">{s.teste_motivo}</p>
              )
            )}
          </CardContent>
          {isAdmin && s.scraper_adapter === "firecrawl" && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onConnect(s as unknown as SourceLite)}
              >
                <Plug className="mr-2 h-3.5 w-3.5" />
                {s.enabled ? "Reconfigurar" : "Conectar"}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
