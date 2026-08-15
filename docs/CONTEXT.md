# Mapa da solução + estado real

> Levantado em 2026-07-28 a partir do código no commit `740538d` e de consultas diretas ao banco do projeto Lovable via MCP.

## O que o produto é

SaaS single-tenant (modelo "remix": cada cliente roda a própria instância com as próprias API keys) que varre Diários Oficiais brasileiros atrás de termos cadastrados pelo usuário, classifica cada ocorrência com IA e dispara alerta por WhatsApp/e-mail.

Público: escritórios de advocacia, empresas que vendem para o governo, compliance, assessoria política.

## Pipeline (o coração)

Tudo é **trigger-driven** no Postgres. Nenhuma fila externa.

```
pg_cron (30 min)
   └─ internal.call_function('scrape-orchestrator')
        └─ upsert scrape_runs (status='pending')
             └─ trigger trg_fire_adapter → internal.adapter_function_name(adapter)
                  ├─ inlabs           (DOU, XML oficial, grátis)
                  ├─ querido-diario   (DOMs, API pública Open Knowledge, grátis)
                  └─ firecrawl        (DOEs estaduais, scrape/crawl/extract)
                       └─ insert publications
                            └─ trigger trg_fire_match_extractor → match-extractor
                                 └─ aplica terms (literal | regex | cnpj) por source
                                      └─ insert matches
                                           ├─ pg_cron (2 min) → ai-classifier (Anthropic Haiku 4.5
                                           │    + prompt caching): categoria, resumo, confiança,
                                           │    is_false_positive, motivo
                                           └─ trigger trg_enqueue_notifications → notifications
                                                └─ pg_cron (1 min) → notify-dispatcher
                                                     ├─ Evolution API (WhatsApp)
                                                     └─ Resend (e-mail)
                                                     retry até 5 tentativas → DLQ
```

Categorias da IA: `licitacao`, `nomeacao`, `exoneracao`, `processo`, `multa`, `homologacao`, `outro`.

O `context_hint` do termo é o que desambigua homônimo. É passado no prompt e é o mecanismo anti-falso-positivo.

## Camadas

**Frontend.** TanStack Start (SSR) + React 19 + Tailwind 4 + shadcn/ui, hospedado em Cloudflare Workers. `/` redireciona para `/login`; não há landing.

Rotas logadas (`/app`): dashboard, `entities`, `topics`, `sources`, `alerts`, `search`, `pipeline`, `radar/$termId`, `notifications`, `integrations`, `account`, `onboarding`. Admin: `admin/{index,sources,runs,dlq,cron,team}`.

**Backend.** Supabase (Postgres + RLS + 18 edge functions Deno).

Chaves de terceiros ficam no **Vault**, lidas pelas functions via RPC `_internal_get_integration_secrets`. `integration_configs` guarda só a parte não-secreta (modelo, e-mail, base_url) e é admin-only por RLS.

Provisionamento do runtime (`functions_url` + key para o pg_cron chamar as functions) é feito pela edge function `bootstrap-runtime` → RPC `admin_apply_runtime` → `internal.runtime_config`.

**Multi-tenant?** Não. É single-tenant por instância: o primeiro usuário que se cadastra vira `admin` (`handle_new_user`), os demais entram como `user` por convite.

## Estado do backend (projeto `afe4eee0…`, Supabase `zcvkyfxwawtsvksjnstk`)

**Em 28/07/2026 à tarde o pipeline foi religado e roda ponta a ponta.** A prova
foi uma passada real sobre os diários de 24/07 de Rio, Goiânia e Curitiba: 5
publicações coletadas, 3 matches, 3 classificados pela IA com confiança de 0,70
a 0,95 e **zero falso positivo**.

O que estava quebrado e foi reconstruído, tudo versionado em
`20260728180000_reconstroi_internal_e_modo_nome.sql`:

| Objeto | Situação encontrada |
|---|---|
| schema `internal` | não existia |
| `internal.call_function` | não existia |
| `internal.adapter_function_name` | não existia, **e nunca esteve em migration** |
| `internal.log_event` | não existia, **e nunca esteve em migration** |
| gatilho `on_auth_user_created` | não existia, então signup não criava perfil nem papel |
| cron jobs | zero |
| `sources` / `integration_configs` | vazias |

Falta uma credencial para o DOU: o INLabs exige cadastro em
<https://inlabs.in.gov.br/>. Enquanto ela não entra, a fonte `dou` fica
habilitada mas falha a cada rodada. Os 19 DOMs do Querido Diário são públicos e
já coletam.

### O diagnóstico anterior, para registro

O código está completo. **O banco estava pela metade, o pipeline não rodava.**

Verificado por SQL direto:

| Checagem                          | Esperado           | Real          |
| --------------------------------- | ------------------ | ------------- |
| Schema `internal`                 | existe             | **não existe** |
| `internal.runtime_config`         | 1 linha            | **não existe** |
| `internal.call_function`          | existe             | **não existe** |
| Jobs em `cron.job`                | 4                  | **0**          |
| `sources`                         | 48 seedadas        | **0**          |
| `integration_configs`             | 5 providers seed   | **0**          |
| `auth.users`                      | ≥1 (admin)         | **0**          |
| Tabelas/funções/triggers `public` | completos          | ✅ completos   |
| Partições de `publications`       | 2025-01 … 2028-12  | ✅ presentes   |
| Edge functions deployadas         | 18                 | ✅ 18 ACTIVE   |

Consequência prática: `public.fire_adapter_for_scrape_run`, `admin_run_orchestrator` e `get_runtime_status` chamam `internal.*`, que não existe. Qualquer insert em `scrape_runs` com `status='pending'` estoura no trigger. O produto não coleta nada.

Diagnóstico: o banco foi resetado (ou os objetos fora de `public` foram derrubados) em algum momento depois do deploy. Os dados de seed sumiram junto. Indício adicional de drift: `supabase/migrations/20260518005854_3bd88c2c-….sql` está **vazio** (0 bytes), e o README documenta 7 cron jobs enquanto as migrations versionadas criam só 4. Houve SQL aplicado do lado do Lovable que nunca foi versionado aqui.

### Como consertar (quando for a hora)

1. Reaplicar `supabase/migrations/20260513200500_runtime_config_and_cron.sql` (cria schema `internal`, `runtime_config`, `call_function`, `adapter_function_name` e agenda os 3 crons).
2. Reaplicar os seeds: providers de `integration_configs` (em `20260513200000_remove_billing_add_integrations.sql`) e as 48 sources (`20260513200200` + `20260514120000`).
3. Reaplicar o cron de partição em `20260516140000_partition_publications_matches.sql`.
4. Criar o primeiro usuário via `/signup` (vira admin) e rodar **Ativar** em `/app/integrations` (chama `bootstrap-runtime`).
5. Cadastrar as keys: Anthropic (obrigatória), INLabs (DOU), Firecrawl (DOEs), Evolution (WhatsApp), Resend (e-mail).

## Por que os radares não devolviam nada, e por que devolviam "inválido"

Não era só a coleta parada. A busca em si errava nos dois sentidos. Ela era
`texto.toLowerCase().indexOf(padrao.toLowerCase())`, e medida contra texto de
gazeta isso dá:

| Situação | Termo cadastrado | Antes | Agora |
|---|---|---|---|
| Gazeta escreve `JOSÉ ANTÔNIO` | `Jose Antonio` | não achava | acha |
| Gazeta escreve `JOSE ANTONIO` | `José Antônio` | não achava | acha |
| Nome quebrado entre colunas | `MARIA DA CONCEICAO` | não achava | acha |
| Espaço duplo na razão social | `CONSTRUTORA ALFA LTDA` | não achava | acha |
| `SEMANA`, `análise` | `ANA` | achava | não acha |
| `PLANALTO` | `PLANO` | achava | não acha |

O resultado combinado explica o sintoma exato: o match legítimo nunca entrava,
o lixo de substring entrava, a IA classificava o lixo como falso positivo (que
é a leitura correta dela) e a UI escondia falso positivo em toda tela. Radar
vazio, aba de inválidos cheia.

Três mudanças fecharam isso:

1. **`matcher.ts`** normaliza texto e padrão do mesmo jeito (sem acento, caixa
   baixa, espaço colapsado) mantendo o mapa de volta ao original, para o
   excerto sair legível. A busca literal exige fronteira de palavra.
2. **Modo `nome`** para o caso dominante: tolera partícula que some (`de`,
   `da`), nome do meio abreviado e a ordem invertida da listagem
   (`OLIVEIRA, JOÃO CARLOS`). O vão entre primeiro e último nome é contado em
   tokens e não atravessa vírgula, senão `JOÃO SOUZA, MARIA LIMA, PEDRO
   OLIVEIRA` casaria com "João Oliveira", que é outra pessoa.
3. **A tela parou de esconder o descarte.** O filtro "todos" agora inclui o que
   a IA derrubou, rebaixado no card e com o motivo dela à vista. Esconder o
   descarte é esconder o próprio diagnóstico.

Regex do usuário passou a rodar com teto de tempo: antes, uma regex
catastrófica travava a edge function inteira.

Os 15 casos acima viraram teste: `deno test supabase/functions/match-extractor/matcher_test.ts`.

## O que o produto entrega no fim: dossiê, não lista

Um radar que devolve trechos casados devolve trabalho, não resposta. A pergunta
do usuário nunca é "onde meu nome apareceu", é "isso muda alguma coisa para mim,
e até quando".

O `ai-briefing` original não respondia isso, e não podia: ele lia o `ai_summary`
de cada match, que tem uma ou duas frases, e escrevia quatro parágrafos em cima.
Paráfrase de paráfrase. Prazo, quem é afetado e providência nunca estiveram na
matéria-prima que ele recebia.

O `ai-dossie` muda a matéria-prima e a forma da saída:

| | ai-briefing | ai-dossie |
|---|---|---|
| Lê | `ai_summary` (1 a 2 frases) | janela de 1.500 caracteres do `raw_text` em volta do acerto |
| Devolve | prosa livre, 4 parágrafos | estrutura tipada por tool schema |
| Prazo | não extrai | extraído por regra do texto literal |
| Providência | não diz | campo obrigatório por item |
| Procedência | nenhuma | citação literal + link para o ato |
| Persistência | some no refresh | gravado em `briefings`, com histórico |

### O prazo não pode sair do modelo

É a decisão de arquitetura que sustenta o resto. Prazo alucinado faz o leitor
perder direito, e um dossiê que erra prazo uma vez não é usado nunca mais.

Então `_shared/prazos.ts` extrai por regra, do texto literal, e o modelo recebe
a lista pronta com instrução explícita de não inventar nenhum outro. Quando o
ato não enuncia prazo, o dossiê diz isso. São 16 testes com as formas que o
diário realmente usa: `30 (trinta) dias úteis, contados da publicação`, número
só por extenso, expressão quebrada entre colunas, CNPJ e datas partidas.

Dois filtros vieram de rodar contra ato real e ver a saída errada:

- **Data de norma citada não é agenda.** `Lei Complementar nº 349, de 4 de março
  de 2022` colocava 2022 na lista de datas. Data precedida de referência
  normativa é descartada.
- **Data vencida não é agenda.** O que já passou não é compromisso de ninguém.

### A janela de leitura

O excerto de 200 caracteres serve para o card e não serve para análise: em ato
real o "no prazo de 30 dias" costuma vir parágrafos depois do nome monitorado.
O dossiê reancora o excerto no `raw_text` e lê 1.500 caracteres para cada lado.

## Pontos de atenção

- **`bootstrap-runtime` tem `verify_jwt = false`.** A checagem de admin é feita dentro da função (`requireAdmin`), então não é buraco aberto, mas é a única superfície não protegida pelo gateway que faz escrita privilegiada. Vale confirmar `requireAdmin` a cada mudança.
- **`.env` está versionado** com URL, project id e publishable key. Não há service role key ali (bom), mas é a chave publicável exposta em repo. Trocar se o repo virar público.
- **`match-extractor` limita a 5 posições por termo/publicação** e monta excerpt de ±200 caracteres. Termo muito genérico gera ruído e custo de IA.
- **Regex do usuário roda direto em `new RegExp`** dentro da edge function. Regex catastrófico é DoS na própria função (falha silenciosa no `catch`, mas trava o event loop antes disso).
- **DOEs estaduais vêm desabilitados.** Cada portal tem layout próprio e a URL precisa apontar para a edição do dia, não para a home.
- README cita "15 fontes"; a realidade das migrations é 48 (1 federal + 27 estaduais + 20 municipais). Doc desatualizado.
