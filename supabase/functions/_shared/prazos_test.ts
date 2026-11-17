// Trechos no formato em que o diário oficial realmente escreve.
//   deno test supabase/functions/_shared/prazos_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { descreverPrazo, extrairPrazos, janela } from "./prazos.ts";

Deno.test("prazo com algarismo e extenso, contado da publicação", () => {
  const { relativos } = extrairPrazos(
    "Fica aberto o prazo de 30 (trinta) dias, contados da publicação deste ato, para manifestação.",
  );
  assertEquals(relativos.length, 1);
  assertEquals(relativos[0].quantidade, 30);
  assertEquals(relativos[0].unidade, "dias");
  assertEquals(relativos[0].contagem, "corridos");
  assertEquals(relativos[0].termoInicial, "publicacao");
});

Deno.test("dias úteis são distinguidos de corridos", () => {
  const { relativos } = extrairPrazos("Recurso no prazo de 5 (cinco) dias úteis.");
  assertEquals(relativos[0].quantidade, 5);
  assertEquals(relativos[0].contagem, "úteis");
});

Deno.test("prazo escrito só por extenso", () => {
  const { relativos } = extrairPrazos("Apresente defesa dentro de quinze dias.");
  assertEquals(relativos[0].quantidade, 15);
  assertEquals(relativos[0].unidade, "dias");
});

Deno.test("expressão quebrada por linha e espaço duplo", () => {
  const { relativos } = extrairPrazos("no prazo de 10 (dez)\n   dias  úteis, contados da ciência");
  assertEquals(relativos[0].quantidade, 10);
  assertEquals(relativos[0].contagem, "úteis");
  assertEquals(relativos[0].termoInicial, "ciencia");
});

Deno.test("meses e anos também são prazo", () => {
  assertEquals(extrairPrazos("vigência de 12 (doze) meses").relativos[0].unidade, "meses");
  assertEquals(extrairPrazos("suspensão pelo prazo de 2 (dois) anos").relativos[0].unidade, "anos");
});

Deno.test("prazo absurdo em dias é vigência, não prazo do leitor", () => {
  assertEquals(extrairPrazos("pelo prazo de 1825 dias").relativos.length, 0);
});

Deno.test("não repete o mesmo prazo citado duas vezes", () => {
  const { relativos } = extrairPrazos(
    "prazo de 30 (trinta) dias. Reitera-se o prazo de 30 (trinta) dias.",
  );
  assertEquals(relativos.length, 1);
});

Deno.test("texto sem prazo devolve lista vazia, não inventa", () => {
  assertEquals(extrairPrazos("Nomeia o servidor para o cargo em comissão.").relativos.length, 0);
});

Deno.test("datas em algarismo e por extenso", () => {
  const { datas } = extrairPrazos("Sessão em 05/08/2026, com entrega até 12 de setembro de 2026.");
  assertEquals(
    datas.map((d) => d.data),
    ["2026-08-05", "2026-09-12"],
  );
});

Deno.test("data inválida é descartada", () => {
  assertEquals(extrairPrazos("processo 45/99/2026").datas.length, 0);
});

Deno.test("a janela cobre o entorno do acerto, não o excerto do card", () => {
  const texto = "a".repeat(3000) + "MARCO" + "b".repeat(3000);
  const t = janela(texto, 3000, 1500);
  assertEquals(t.includes("MARCO"), true);
  assertEquals(t.length, 3000); // 1500 para cada lado
});

Deno.test("descrição sai em português de gente", () => {
  const { relativos } = extrairPrazos("prazo de 15 (quinze) dias úteis, contados da notificação");
  assertEquals(descreverPrazo(relativos[0]), "15 dias úteis, contados da notificacao");
});

Deno.test("data da ementa de norma citada não é compromisso do leitor", () => {
  const { datas } = extrairPrazos(
    "observadas as metas do Plano Diretor, Lei Complementar nº 349, de 4 de março de 2022, e a Portaria nº 42, de 14 de abril de 1999.",
  );
  assertEquals(datas.length, 0);
});

Deno.test("data de compromisso continua passando mesmo com norma no mesmo texto", () => {
  const { datas } = extrairPrazos(
    "Nos termos do Decreto nº 39.094, de 2014, a sessão será realizada em 12/09/2026.",
  );
  assertEquals(
    datas.map((d) => d.data),
    ["2026-09-12"],
  );
});

Deno.test("data já vencida some quando o hoje é informado", () => {
  const texto = "Sessão em 01/02/2026 e entrega até 20/12/2026.";
  assertEquals(extrairPrazos(texto).datas.length, 2);
  assertEquals(
    extrairPrazos(texto, "2026-07-28").datas.map((d) => d.data),
    ["2026-12-20"],
  );
});

Deno.test("datas saem em ordem cronológica", () => {
  const { datas } = extrairPrazos("prazos em 30/11/2026, 05/08/2026 e 12/09/2026.");
  assertEquals(
    datas.map((d) => d.data),
    ["2026-08-05", "2026-09-12", "2026-11-30"],
  );
});
