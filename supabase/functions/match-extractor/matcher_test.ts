// Casos medidos em texto real de Diário Oficial. Os seis primeiros são os que
// provaram o defeito da versão anterior: quatro que deveriam achar e não
// achavam, dois que achavam e não deveriam.
//
//   deno test supabase/functions/match-extractor/matcher_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type MatchType, buildExcerpt, findMatches, normalize } from "./matcher.ts";

function achou(texto: string, pattern: string, match_type: MatchType = "literal"): number {
  return findMatches(texto, normalize(texto), { pattern, match_type }).length;
}

Deno.test("acento no texto, termo sem acento", () => {
  assertEquals(achou("Nomeia JOSÉ ANTÔNIO DA SILVA para o cargo", "Jose Antonio da Silva"), 1);
});

Deno.test("acento no termo, texto sem acento", () => {
  assertEquals(achou("Nomeia JOSE ANTONIO DA SILVA para o cargo", "José Antônio da Silva"), 1);
});

Deno.test("nome quebrado entre colunas", () => {
  assertEquals(
    achou("Fica exonerado MARIA DA\nCONCEICAO SANTOS, matricula 123", "MARIA DA CONCEICAO SANTOS"),
    1,
  );
});

Deno.test("espaço duplo no meio da razão social", () => {
  assertEquals(achou("Contrato com  CONSTRUTORA ALFA  LTDA", "CONSTRUTORA ALFA LTDA"), 1);
});

Deno.test("não casa dentro de outra palavra", () => {
  assertEquals(achou("Publicado no DIARIO OFICIAL na SEMANA de analise", "ANA"), 0);
  assertEquals(achou("A PLANALTO ADVOGADOS e o PLANO DIRETOR", "PLANALTO"), 1);
});

Deno.test("casa como palavra inteira quando existe de verdade", () => {
  assertEquals(achou("Nomeia CARLOS EDUARDO LIMA", "CARLOS EDUARDO LIMA"), 1);
  assertEquals(achou("Aviso a ANA e demais servidores", "ANA"), 1);
});

Deno.test("modo nome tolera partícula ausente e nome do meio abreviado", () => {
  assertEquals(achou("Designa JOAO CARLOS DE OLIVEIRA", "Joao Carlos Oliveira", "nome"), 1);
  assertEquals(achou("Designa JOAO C. OLIVEIRA", "Joao Carlos Oliveira", "nome"), 1);
});

Deno.test("modo nome aceita a ordem invertida da listagem", () => {
  assertEquals(achou("OLIVEIRA, JOAO CARLOS - matricula 88", "Joao Carlos Oliveira", "nome"), 1);
});

Deno.test("modo nome não junta duas pessoas diferentes", () => {
  const texto = "Constam JOAO SOUZA, MARIA LIMA, PEDRO OLIVEIRA e outros " +
    "servidores da pasta, conforme a relacao anexa a este ato administrativo";
  assertEquals(achou(texto, "Joao Oliveira", "nome"), 0);
});

Deno.test("CNPJ com e sem separador, inclusive quebrado", () => {
  assertEquals(achou("empresa 12.345.678/0001-90 venceu", "12345678000190", "cnpj"), 1);
  assertEquals(achou("empresa 12345678000190 venceu", "12.345.678/0001-90", "cnpj"), 1);
  assertEquals(achou("empresa 12.345.678/\n0001-90 venceu", "12345678000190", "cnpj"), 1);
});

Deno.test("regex do usuário continua funcionando", () => {
  assertEquals(achou("Processo 0001234-56.2026.8.24.0023", "\\d{7}-\\d{2}\\.\\d{4}", "regex"), 1);
});

Deno.test("regex inválida não derruba a rodada", () => {
  assertEquals(achou("qualquer texto", "([a-z", "regex"), 0);
});

Deno.test("teto de 5 ocorrências por publicação", () => {
  assertEquals(achou("alfa ".repeat(30), "alfa"), 5);
});

Deno.test("o excerto sai do texto original, com acento", () => {
  const texto = "Ato do dia. Nomeia JOSÉ ANTÔNIO DA SILVA para o cargo de diretor.";
  const hits = findMatches(texto, normalize(texto), {
    pattern: "Jose Antonio da Silva",
    match_type: "literal",
  });
  assertEquals(hits.length, 1);
  assertEquals(hits[0].text, "JOSÉ ANTÔNIO DA SILVA");
  assertEquals(buildExcerpt(texto, hits[0].index, 60).includes("JOSÉ ANTÔNIO DA SILVA"), true);
});

Deno.test("normalização preserva o caminho de volta ao original", () => {
  const texto = "  AÇÃO\n\nCIVIL  ";
  const n = normalize(texto);
  assertEquals(n.text, "acao civil");
  // cada posição do normalizado aponta para um caractere real do original
  for (const idx of n.map) {
    assertEquals(idx >= 0 && idx < texto.length, true);
  }
});

Deno.test("prefixo pega a flexão que o literal perde", () => {
  // "licitação" no modo literal não acha o plural: o radical muda de ão para ões.
  assertEquals(achou("Licitações do mês", "licitação"), 0);
  // com a raiz, a família inteira entra
  assertEquals(achou("Aviso de Licitação nº 45", "licita", "prefixo"), 1);
  assertEquals(achou("Licitações do mês", "licita", "prefixo"), 1);
  assertEquals(achou("Processo licitatório aberto", "licita", "prefixo"), 1);
  assertEquals(achou("LICITACOES E CONTRATOS", "licita", "prefixo"), 1);
});

Deno.test("prefixo casa só no começo da palavra, nunca no meio", () => {
  // "ana" não vira "semana", porque a fronteira do início continua valendo
  assertEquals(achou("Publicado na SEMANA", "ana", "prefixo"), 0);
  // mas casa "análise", e isso é o contrato do modo: raiz curta traz a família
  // inteira. Quem escolhe onde cortar é quem cadastra.
  assertEquals(achou("em análise pelo setor", "ana", "prefixo"), 1);
  assertEquals(achou("A PLANALTO ADVOGADOS", "plan", "prefixo"), 1);
});

Deno.test("prefixo curto demais é recusado: casaria o dicionário inteiro", () => {
  assertEquals(achou("qualquer texto com ab e abc", "ab", "prefixo"), 0);
});
