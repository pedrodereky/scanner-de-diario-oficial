# A promessa, medida

> "O Diário Oficial Scanner é uma plataforma que monitora automaticamente o
> Diário Oficial da União (DOU) e Diários Estaduais/Municipais. O objetivo é
> remover o trabalho manual de leitura e busca por termos específicos,
> entregando inteligência e alertas em tempo real para advogados, empresas B2G
> e jornalistas."

Este documento existe para que a distância entre essa frase e o software seja
medida, e não estimada. Cada linha abaixo tem uma consulta que a prova.

## Placar em 28/07/2026

| Promessa | Antes | Depois |
|---|---|---|
| Monitora o **DOU** | não coletava nada: adapter `inlabs` exigia cadastro que ninguém fez | **80 publicações**, texto integral, sem credencial, em dia |
| Monitora **Diários Municipais** | 19 habilitados, 7 entregando | **7 habilitados, 7 entregando** |
| Monitora **Diários Estaduais** | 27 cadastrados, 27 desligados, URL apontando para a home | segue desligado, e agora aparece como desligado na tela |
| Remove a busca manual | busca literal quebrada por acento e por flexão | acento, fronteira de palavra, nome de pessoa, prefixo, CNPJ |
| Entrega **inteligência** | resumo de resumos | dossiê com prazo extraído do texto literal |
| Entrega **alertas** | nenhum alerta saía | dossiê diário por e-mail, 8h em dias úteis |
| Para **3 personas** | termo genérico | perfis com o que cada uma cadastra, no formato certo |

## Como conferir cada linha

```sql
-- DOU coletando
select count(*) from publications p
join sources s on s.id = p.source_id where s.code = 'dou';

-- cobertura honesta: nenhuma fonte "ativa" sem entregar
select situacao, count(*) from fontes_saude group by situacao;

-- o radar acha o que deveria achar
select t.label, t.match_type, count(m.id)
from terms t left join matches m on m.term_id = t.id group by 1,2;

-- o alerta saiu
select count(*) from briefings where enviado_por_email;
```

## O que ainda não cumprimos

Honestidade aqui vale mais que marketing, porque o cliente descobre sozinho.

- **Diários Estaduais.** Os 27 continuam desligados, e agora com motivo medido
  em vez de suposição. Em 29/07/2026 os 27 foram raspados com renderização de
  JS na URL cadastrada: **nenhum entrega a edição**. O conteúdo fica atrás de
  busca (MS, CE), de PDF (BA, GO, ES), ou é montado por JS depois (RS, SC).
  Quatro chegaram a passar na heurística antiga e eram falso positivo, entre
  eles São Paulo, que devolve o portal de notícias do governo.

  O motivo de cada um está gravado na fonte e aparece em `/app/sources`. Ligar
  qualquer um deles hoje faria o radar casar termo em manchete de governo.
  Cada estado precisa da URL da edição, e o teste em Fontes diz se a URL serve.
- **São Paulo.** A maior praça de licitação do país não tem cobertura utilizável
  no Querido Diário (20 edições no acervo inteiro). Precisa de adapter próprio
  da Imprensa Oficial.
- **"Tempo real".** O DOU publica uma vez por dia. Prometer tempo real é
  prometer o que a fonte não dá. O que entregamos, e dá para verificar, é
  **no mesmo dia da publicação**.

## Uma decisão que vale registrar

O DOU passou a ser consultado **por termo**, não baixado inteiro.

O in.gov.br responde sem credencial, aceita busca por termo e a página da
matéria entrega o texto integral. Em vez de puxar três seções por dia e casar
localmente, perguntamos ao índice do próprio DOU pelos termos do cliente e só
lemos na íntegra o que voltou.

O índice deles não decide nada: gera candidatos, e o nosso matcher confirma.
Sem essa confirmação a gente importaria o falso positivo deles e perderia o
controle do excerto e do prazo.
