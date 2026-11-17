// Os quatro casos que a heurística antiga aprovou por engano, medidos contra
// os portais reais em 29/07/2026, mais o formato de uma edição de verdade.
//   deno test supabase/functions/test-source/heuristica_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { avaliarConteudo } from "./heuristica.ts";

Deno.test("portal de notícias do estado não é edição (caso doe-sp)", () => {
  const v = avaliarConteudo(
    "![Logo Governo SP] ### Governo de São Paulo prorroga inscrições dos editais do ProAC " +
      "### Conheça as leis do Governo de SP ### Veja como será a acessibilidade em Libras " +
      "nas eleições. Publicado em 28/07/2026. ".repeat(20),
  );
  assertEquals(v.ok, false);
});

Deno.test("menu do portal não é edição (caso doe-sc)", () => {
  const v = avaliarConteudo(
    "- [PORTAL DE NOTÍCIAS](https://estado.sc.gov.br/noticias/) ".repeat(60),
  );
  assertEquals(v.ok, false);
  assertEquals(v.motivo.includes("portal"), true);
});

Deno.test("página de download não é edição (caso doe-am)", () => {
  const v = avaliarConteudo(
    "Diário Oficial Diários Extras CLIQUE AQUI E FAÇA O DOWNLOAD ".repeat(30),
  );
  assertEquals(v.ok, false);
});

Deno.test("formulário de busca não é edição (caso doe-ms)", () => {
  const v = avaliarConteudo(
    "Pular para conteúdo principal DIÁRIO OFICIAL Buscar por: Número do diário Data inicial ".repeat(
      40,
    ),
  );
  assertEquals(v.ok, false);
});

Deno.test("'acesse a edição do dia' é convite, não a edição (caso doe-mg)", () => {
  const v = avaliarConteudo("Foto: André Bernardes # Acesse a edição do dia ".repeat(80));
  assertEquals(v.ok, false);
});

Deno.test("edição de verdade passa", () => {
  const ato =
    "PORTARIA Nº 1.234, DE 28 DE JULHO DE 2026. O Secretário resolve: Art. 1º Fica designado " +
    "o servidor para exercer a função. Art. 2º Esta portaria entra em vigor na data de sua " +
    "publicação, revogadas as disposições em contrário. ";
  const v = avaliarConteudo(ato.repeat(120));
  assertEquals(v.ok, true);
  assertEquals(v.atos >= 4, true);
  assertEquals(v.caracteres >= 20000, true);
});

Deno.test("edição grande porém sem ato nenhum é reprovada", () => {
  const v = avaliarConteudo("texto corrido sem cabeçalho de ato nenhum. ".repeat(800));
  assertEquals(v.ok, false);
  assertEquals(v.motivo.includes("cabeçalho"), true);
});

Deno.test("resposta vazia é reprovada com motivo próprio", () => {
  const v = avaliarConteudo("");
  assertEquals(v.ok, false);
  assertEquals(v.caracteres, 0);
});
