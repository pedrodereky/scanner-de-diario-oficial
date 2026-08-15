import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PERFIS, type PerfilRadar, type SugestaoTermo } from "@/lib/perfis-radar";

interface Props {
  /** chamado quando o usuário escolhe uma sugestão para virar radar */
  onUsarSugestao: (sugestao: SugestaoTermo, perfil: PerfilRadar) => void;
}

/**
 * Ponto de partida por persona. Quem não sabe o que cadastrar cadastra pouco e
 * conclui que o radar não funciona, então a tela mostra exemplos concretos do
 * que aquela persona monitora, no formato certo.
 */
export function EscolhaPerfil({ onUsarSugestao }: Props) {
  const [aberto, setAberto] = useState<PerfilRadar["id"] | null>(null);
  const perfil = PERFIS.find((p) => p.id === aberto);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {PERFIS.map((p) => {
          const Icone = p.icone;
          const ativo = aberto === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setAberto(ativo ? null : p.id)}
              aria-pressed={ativo}
              className={`rounded-lg border p-4 text-left transition-colors ${
                ativo
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icone className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{p.nome}</span>
                {ativo && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.paraQuem}</p>
            </button>
          );
        })}
      </div>

      {perfil && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              No dossiê desta persona pesa
            </p>
            {perfil.categorias.map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{perfil.oQueImporta}</p>

          <div className="mt-4 space-y-2">
            {perfil.sugestoes.map((s) => (
              <div
                key={s.rotulo}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.rotulo}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {s.placeholder}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {s.tipo}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => onUsarSugestao(s, perfil)}>
                  Usar <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
