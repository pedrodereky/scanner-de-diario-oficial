// Fixtures capturadas do in.gov.br em 28/07/2026 (busca do DOU de 24/07).
//   deno test --allow-read supabase/functions/scrape-dou/dou_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { paraIso, paraPortal, parseBusca, parseMateria, urlDaBusca } from "./dou.ts";

const busca = await Deno.readTextFile(new URL("./fixtures/busca.html", import.meta.url));
const materia = await Deno.readTextFile(new URL("./fixtures/materia.html", import.meta.url));

Deno.test("a listagem vem do json embutido, não do HTML renderizado", () => {
  const itens = parseBusca(busca);
  assertEquals(itens.length > 0, true);
  const primeiro = itens[0];
  assertEquals(primeiro.titulo.length > 5, true);
  assertEquals(primeiro.urlTitle.length > 5, true);
  assertEquals(primeiro.secao, "DO1");
});

Deno.test("o trecho vem sem tag e sem entidade HTML", () => {
  const itens = parseBusca(busca);
  const comTrecho = itens.filter((i) => i.trecho.length > 0);
  assertEquals(comTrecho.length > 0, true);
  for (const i of comTrecho) {
    assertEquals(/<[^>]+>/.test(i.trecho), false);
    assertEquals(/&(quot|amp|lt|gt|nbsp);/.test(i.trecho), false);
  }
});

Deno.test("busca sem resultado devolve lista vazia, não erro", () => {
  assertEquals(parseBusca('<script type="application/json">{"jsonArray":[]}</script>'), []);
});

Deno.test("portal mudando de formato devolve vazio em vez de lixo", () => {
  assertEquals(parseBusca("<html><body>nada aqui</body></html>"), []);
  assertEquals(parseBusca('<script type="application/json">{quebrado</script>'), []);
});

Deno.test("item sem urlTitle é descartado: sem ele não há como ler o ato", () => {
  const itens = parseBusca(
    '<script type="application/json">{"jsonArray":[{"title":"X","urlTitle":""},{"title":"Y","urlTitle":"y-123"}]}</script>',
  );
  assertEquals(itens.length, 1);
  assertEquals(itens[0].urlTitle, "y-123");
});

Deno.test("o corpo da matéria sai dos parágrafos, não da div inteira", () => {
  const texto = parseMateria(materia);
  assertEquals(texto.length > 200, true);
  assertEquals(/<[^>]+>/.test(texto), false);
  assertEquals(texto.includes("\n\n"), true); // parágrafos preservados
});

Deno.test("matéria sem parágrafo devolve vazio", () => {
  assertEquals(parseMateria("<html><body><div>texto solto</div></body></html>"), "");
});

Deno.test("conversão de data nos dois sentidos", () => {
  assertEquals(paraIso("24/07/2026"), "2026-07-24");
  assertEquals(paraIso("2026-07-24"), null); // já ISO não é formato do portal
  assertEquals(paraIso(null), null);
  assertEquals(paraPortal("2026-07-24"), "24-07-2026");
});

Deno.test("a URL de busca leva termo, seção e o dia nos dois extremos", () => {
  const url = urlDaBusca("Ministério da Fazenda", "do1", "2026-07-24");
  assertEquals(url.includes("q=Minist%C3%A9rio+da+Fazenda"), true);
  assertEquals(url.includes("s=do1"), true);
  assertEquals(url.includes("publishFrom=24-07-2026"), true);
  assertEquals(url.includes("publishTo=24-07-2026"), true);
});
