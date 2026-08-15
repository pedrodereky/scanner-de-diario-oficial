# Contexto operacional: Diário Oficial Scanner

## Identidade do projeto

| Item                | Valor                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Repo GitHub         | `MindOpsTeam/remix-scanner-de-diario-oficial`                          |
| Projeto Lovable     | `afe4eee0-4cb4-4548-a3e4-a5df2f7375b4` ("Remix - Scanner de Diario Oficial") |
| Workspace Lovable   | `4CscjTfdP3u4Xba0i5P3` (VIVER DE IA Team Workspace)                    |
| Editor              | https://lovable.dev/projects/afe4eee0-4cb4-4548-a3e4-a5df2f7375b4      |
| Preview             | https://id-preview--afe4eee0-4cb4-4548-a3e4-a5df2f7375b4.lovable.app   |
| Backend (Supabase)  | `zcvkyfxwawtsvksjnstk` (Lovable Cloud)                                 |
| Stack template      | `tanstack_start_ts_2026-05-12`                                          |
| Git sync            | ativo (GitHub ↔ Lovable, provider `github`)                            |

Existe um segundo projeto, `ee645071-4474-46f9-8398-77516d760d8f` ("Remix of Remix — Scanner de Diario Oficial"), **sem git sync**. Ele não é este repo. Não mexer nele achando que é.

## Como operar (MCP oficial do Lovable no Claude)

Ferramentas: `mcp__claude_ai_Lovable__*` (conector oficial claude.ai) e `mcp__lovable__*` (PAT, para `gitsync_status`, `list_functions`, `get_logs`).

Chamadas úteis, sempre com `project_id=afe4eee0-4cb4-4548-a3e4-a5df2f7375b4`:

- `get_project`: status, `latest_commit_sha`, screenshot
- `query_database`: SQL direto no Postgres do projeto
- `list_files` / `read_file` / `get_diff`: inspeção do código no lado Lovable
- `deploy_project`: publicar
- `send_message`: **somente** para mandar o Lovable aplicar/deployar um commit já existente

## Regra de autoridade (vale para toda sessão)

O Lovable aqui é **deploy target**, não desenvolvedor.

1. Todo código (migration SQL, edge function, componente) é escrito **localmente**, neste repo.
2. Commit e push com autoria própria.
3. Só então, se necessário, um prompt curto ao Lovable: "puxe e aplique o commit `<sha>`".
4. Verificar o resultado por conta própria (`get_project` → `latest_commit_sha`, `query_database`, preview).

Nunca pedir ao agente do Lovable para decidir arquitetura, nomear arquivo, escolher formato de migration ou "resolver" um bug.

## Estado real do backend (verificado em 2026-07-28)

O código está completo; **o banco está pela metade**. Ver [docs/CONTEXT.md](docs/CONTEXT.md) para o diagnóstico e o caminho de conserto.
