# Onboarding Técnico — API de Simulação de Crédito (`calculo-juros`)

> **Para quem é**: pessoa desenvolvedora que acabou de entrar no projeto e precisa rodar, entender e
> alterar o código com segurança.
> **Estado descrito**: 16/11/2026, depois da T-14. Reflete o código real, não o planejado.

## 0. Qual documento ler, e em que ordem

O repositório tem bastante documentação, mas ela foi escrita em momentos diferentes. Leia nesta ordem:

| # | Documento | Serve para | Cuidado |
|---|---|---|---|
| 1 | **este arquivo** | rodar o projeto e entender a arquitetura atual | — |
| 2 | [`regras-de-negocio.md`](regras-de-negocio.md) | entender **o que** o sistema decide e por quê | linguagem de negócio, sem código |
| 2b | [`painel-operacoes.md`](painel-operacoes.md) | o frontend de acompanhamento em `public/` | só leitura; é a maneira mais rápida de ver uma operação sem Postman |
| 3 | [`guia-de-estudo-do-codigo.md`](guia-de-estudo-do-codigo.md) | aprender o JavaScript/Node usado aqui, linha por linha | é material de estudo da linguagem, não referência de arquitetura |
| 4 | [`integracao-finops.md`](integracao-finops.md) | contrato com o grupo financeiro | **descreve a rota `POST /:id/finops`, que hoje não existe** (ver §9) |
| 5 | [`backlog.md`](backlog.md), [`backlog-api.md`](backlog-api.md), [`backlog-db.md`](backlog-db.md) | de onde vieram os requisitos (T-01…T-14) | é backlog: a maior parte das fases **não** foi implementada |
| 6 | [`inventario-processos.md`](inventario-processos.md) | visão de processo do sistema *pretendido* | tem seção "regras a especificar": é desenho, não implementação |
| 7 | [`DOCUMENTACAO.md`](DOCUMENTACAO.md) | histórico detalhado do banco e das rotas | **congelado em 24/09/2026**, antes de T-07…T-14 |

Fonte da verdade, em ordem de confiança: **o código** → os testes (`npm test`, `npm run verifica`) →
o Swagger (`/api/docs`) → os documentos acima.

---

## 1. O que este serviço é

É **um** dos serviços de uma esteira de crédito acadêmica, dividida entre grupos. O nosso pedaço é o
**motor de cálculo e precificação**: recebe uma proposta já aprovada, calcula taxa, parcelas,
encargos e CET, guarda a operação e avisa os outros grupos.

```
  Grupo de DECISÃO                 NÓS (calculo-juros)              Grupo FINOPS (Go, :8083)
  score, aprovação,      ──POST──▶  taxa, PRICE/SAC, IOF,   ──POST──▶  registra o contrato
  sistema de amortização            CET, cronograma                 
                                            │              
                                            └───────POST──▶  Grupo DOCUMENTOS (Python, :8000)
                                                             gera o PDF do demonstrativo
```

O que **não** somos: não calculamos score, não decidimos aprovação, não geramos PDF, não guardamos
contrato assinado. Ver §4 de [`regras-de-negocio.md`](regras-de-negocio.md).

---

## 2. Subir o projeto

### Pré-requisitos

- **Node.js ≥ 20.6** (o `package.json` exige; usamos `--env-file`, que só existe a partir dessa versão).
  Em produção/desenvolvimento aqui: Node 22.
- **MySQL 8** acessível. Não há Docker neste ambiente — é MySQL instalado localmente
  (no Windows, serviço `MySQL80`).

### Passo a passo

```bash
npm install

cp .env.example .env     # e ajuste a senha do MySQL
npm run schema           # cria o banco calculo_juros e as 3 tabelas
npm run seed             # carrega 6 modalidades + 30 faixas de juros
npm start                # sobe em http://localhost:3000
```

Confira: `http://localhost:3000/api/health` deve responder `{"status":"ok","banco":"ok"}` e
`http://localhost:3000/api/docs` abre o Swagger UI.

### Variáveis de ambiente (`.env`)

| Variável | Obrigatória | O que faz |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | sim | conexão MySQL (`src/db.js`) |
| `DB_TIMEZONE` | não (padrão `-03:00`) | fuso da sessão MySQL, afeta `NOW()` em `definido_em` |
| `PORT` | não (padrão `3000`) | porta HTTP |
| `DOCUMENTOS_URL` | não | API do grupo 6. **Vazia = não envia nada, em silêncio** |
| `FINOPS_URL` | não | API do grupo financeiro. **Vazia = não envia nada, em silêncio** |
| `FINOPS_TIMEOUT_MS` | não | timeout do FinOps |

> **Armadilha nº 1 do projeto**: variável de integração vazia não é erro nem aviso — o código
> considera "esse grupo ainda não está integrado" e pula o envio (`src/lib/api.js:28`). Se você
> está testando integração e "nada acontece", confira o `.env` **antes** de depurar o código.
> Hoje só o FinOps anuncia na subida se está ligado (`index.js:11`); o grupo de Documentos não anuncia nada.

### Scripts

| Comando | O que faz |
|---|---|
| `npm start` | sobe a API |
| `npm run dev` | sobe com `--watch` (reinicia ao salvar) |
| `npm test` | **116 testes** unitários (`node --test`), sem banco, ~0,5 s |
| `npm run verifica` | suíte ponta a ponta contra o **MySQL real** — hoje **61/63** (ver §9) |
| `npm run schema` | cria banco/tabelas (não altera tabela existente) |
| `npm run seed` | carga de modalidades e faixas (idempotente) |
| `npm run reset` | **apaga e recria tudo, incluindo as operações gravadas** |

---

## 3. Arquitetura em camadas

```
index.js                     sobe o servidor HTTP e loga a configuração
  └─ src/app.js              Express: CORS, express.json(), serve public/, monta /api, erros
      ├─ public/             painel de acompanhamento (HTML/CSS/JS puros) servido em /
      └─ src/routes/         HTTP: lê req, valida parâmetros de URL, devolve status + JSON
          ├─ src/servicos/   regras de negócio e orquestração
          │   ├─ src/lib/            cálculo puro (matemática, datas, documentos)
          │   ├─ src/repositorios/   SQL e tradução snake_case ⇄ camelCase
          │   └─ src/dados/          parâmetros fixos (alíquotas, tarifas)
          └─ src/openapi.js  especificação OpenAPI servida em /api/docs
```

**Regra de dependência** (quebrar isso é o jeito mais rápido de bagunçar o projeto):

- `src/lib/` não importa **nada** do projeto além de outros `lib/` — sem Express, sem MySQL.
  É por isso que os testes dessas funções rodam sem banco.
- `src/servicos/` pode usar `lib/`, `repositorios/` e `dados/`. Não conhece `req`/`res`.
- `src/routes/` é a **única** camada que fala HTTP.
- `src/repositorios/` é a **única** camada que conhece nomes de coluna.

Duas consequências práticas:

1. **Injeção de dependência pelo último parâmetro.** `validaEntrada(body, repositorio)` e
   `calculaTaxa(modalidade, score, repositorio)` recebem o repositório como argumento com valor
   padrão. Em produção vem o módulo real; nos testes vem o `src/servicos/bancoFalso.js`. É assim
   que 116 testes rodam em meio segundo sem MySQL.
2. **Erros são lançados, não retornados.** Regras de negócio lançam `ErroDeNegocio(status, codigo,
   mensagem, detalhes)` (`src/lib/erros.js`). O Express 5 captura exceções de handlers `async`
   automaticamente e entrega ao tratador em `src/app.js:33`, que formata a resposta. **Não use
   `try/catch` na rota só para responder erro** — deixe subir.

---

## 4. O caminho de uma requisição: `POST /api/operacoes`

É o endpoint principal. Os 8 passos estão numerados em `src/routes/operacoes.js:56-116`:

| # | Onde | O que acontece | Pode falhar com |
|---|---|---|---|
| 1 | `servicos/validaEntrada.js` | valida **tudo** e normaliza (documento só com dígitos, `amortizacao` em maiúsculas, `dataLiberacao` = hoje se ausente). Consulta `modalidades` no banco | `400 DADOS_INVALIDOS` com **todos** os problemas em `detalhes` |
| 2 | `servicos/definicao.js` → `exigeDecisaoAprovada` | recusa crédito não aprovado antes de calcular ou gravar | `422 DECISAO_NAO_APROVADA` |
| 3 | `repositorios/operacoes.js` → `existeIdentificador` | identificador é único | `409 IDENTIFICADOR_DUPLICADO` |
| 4 | `servicos/taxa.js` → `calculaTaxa` | score → faixa → taxa, lendo `faixas_juros` | `422 SCORE_INSUFICIENTE` (faixa E) |
| 5 | `servicos/simulacao.js` → `simulaOperacao` | **função pura**: calcula PRICE **e** SAC, cronograma, encargos, CET, demonstrativo | `422 CET_NAO_CONVERGE` |
| 6 | `repositorios/operacoes.js` → `salvar` | um `INSERT`, já com `estado='DEFINIDA'` e `finops_status='PENDENTE'` | `409` traduzido de `ER_DUP_ENTRY` (corrida) |
| 7 | `repositorios/operacoes.js` → `buscarPorId` | relê do banco para devolver exatamente o que ficou gravado | — |
| 8 | `servicos/integracoes.js` → `notificaDefinicao` | envia a operação para FinOps e Documentos | **nunca falha a requisição** — só loga |

Depois: `201` com a operação completa.

Dois detalhes que surpreendem:

- **O passo 3 não é suficiente, e isso é de propósito.** Entre o `SELECT` do passo 3 e o `INSERT`
  do passo 6 cabem duas requisições simultâneas. Quem decide é a `UNIQUE KEY` do banco; o `catch`
  traduz `ER_DUP_ENTRY` para o mesmo `409`. Há cenário no `verifica` que dispara dois POSTs em
  paralelo e exige exatamente um `201` e um `409`.
- **O passo 8 roda com `await`, mas erro dele é engolido.** A operação já está gravada: derrubar a
  resposta por causa de outro grupo seria pior. `Promise.allSettled` espera os dois destinos e
  registra sucesso/falha no terminal (`[integração] ...`).

---

## 5. Endpoints

| Método e rota | O que faz | Observação |
|---|---|---|
| `GET /api/health` | API + banco | `503` se o MySQL não responder |
| `POST /api/operacoes` | **cria a operação já DEFINIDA** | o endpoint principal (T-14) |
| `GET /api/operacoes?pagina=&tamanho=&estado=` | listagem paginada, resumo sem o JSON | `tamanho` máximo 100 |
| `GET /api/operacoes/:id` | operação completa | mesmo formato do `POST` |
| `GET /api/operacoes/:id/consolidado` | documento para contrato, só do sistema escolhido | `422` se não estiver DEFINIDA |
| `GET /api/operacoes/por-identificador/:identificador/consolidado` | o mesmo, pela chave de negócio | registrada antes de `/:id` |
| `POST /api/operacoes/:id/definicao` | escolhe PRICE/SAC | **legado desde a T-14**: responde `409` para tudo que nasce depois dela |
| `POST /api/operacoes/:id/finops` | reenvio ao FinOps | **documentado no Swagger, mas inexistente no código → `404`** (§9) |
| `POST /api/juros/simples`, `POST /api/juros/composto`, `GET /api/juros/faixas` | cálculo legado da primeira fase | não passam pelas camadas novas; mantidos por compatibilidade |
| `GET /api/modalidades`, `GET /api/modalidades/:codigo` | catálogo e tabela de taxas | `:codigo` traz as 5 faixas |
| `GET /api/docs`, `GET /api/docs.json` | Swagger UI e especificação crua | importável no Postman |
| `GET /` (e `/css/…`, `/js/…`) | painel de acompanhamento, arquivos estáticos de `public/` | **não é API**: não entra no OpenAPI nem no `verifica` ([`painel-operacoes.md`](painel-operacoes.md)) |

### Códigos de erro

Todos saem no mesmo formato: `{ "erro": { "codigo", "mensagem", "detalhes"? } }`.

`DADOS_INVALIDOS` (400) · `IDENTIFICADOR_DUPLICADO` (409) · `AMORTIZACAO_JA_DEFINIDA` (409) ·
`MODALIDADE_NAO_ENCONTRADA` (404) · `OPERACAO_NAO_ENCONTRADA` (404) · `OPERACAO_NAO_DEFINIDA` (422) ·
`SCORE_INSUFICIENTE` (422) · `DECISAO_NAO_APROVADA` (422) · `CET_NAO_CONVERGE` (422) ·
`FINOPS_INDISPONIVEL` (503) · `FINOPS_RECUSOU` (502) · `ERRO_INTERNO` (500)

Regra de escolha entre 400 e 422: **400** = o corpo está malformado; **422** = o corpo está correto,
mas o pedido não pode ser atendido.

---

## 6. Banco de dados

Três tabelas, em `db/schema.sql`. A tabela `operacoes` está na **versão 3**.

```
modalidades (codigo PK)
     │ 1─N
faixas_juros (modalidade_codigo, faixa)   -- 5 faixas A..E por modalidade
     
modalidades (codigo PK)
     │ 1─N
operacoes (id PK, identificador UNIQUE)
```

- **`modalidades`** — catálogo de 6 produtos: teto de taxa, prazo mínimo/máximo, `ativo`.
- **`faixas_juros`** — 6 × 5 = 30 linhas. Guarda a taxa **final** de cada faixa. Faixa E tem
  `taxa_mes NULL`, e isso **é** a regra de recusa (um `CHECK` garante que só a E seja nula).
- **`operacoes`** — uma linha por operação. Colunas "planas" para consulta e filtro
  (`faixa_risco`, `taxa_final_mes`, `cet_price_ano`, `cet_sac_ano`) e a coluna JSON `resultado`.

> **Regra de ouro**: a coluna `resultado` é escrita **uma vez**, no `INSERT`, e **nunca** recebe
> `UPDATE`. Ela guarda `{ cliente, entrada, taxa, simulacoes, decisao, probabilidadeDefault,
> contextoScore }`. É por isso que consultar a mesma operação duas vezes devolve exatamente o mesmo
> documento, sem recalcular nada. Definir o sistema altera só `estado`, `sistema_definido`,
> `definido_em` e `finops_*`.

`linhaParaOperacao` (`src/repositorios/operacoes.js`) espalha o JSON no nível de cima
(`...resultado`), então `cliente`, `entrada`, `taxa`, `simulacoes` e os campos de auditoria da
decisão aparecem na raiz da resposta — sem precisar de código novo quando se acrescenta um campo ao JSON.

### `CHECK` constraints que você vai esbarrar

- `ck_operacoes_definicao` — SIMULADA exige `sistema_definido`/`definido_em` nulos; DEFINIDA exige os dois preenchidos.
- `ck_operacoes_finops` — DEFINIDA exige `finops_status` em `PENDENTE|REGISTRADA|FALHOU`.
- `ck_operacoes_documento` — só dígitos, 11 para PF e 14 para PJ.

### Migração de schema: não há ferramenta

Decisão do time (D6): sem migrations. O schema evolui por `npm run reset` + checagem de colunas em
`db/schema.js`. **Consequência prática**: `npm run schema` num banco que já existe não altera nada —
`CREATE TABLE IF NOT EXISTS` só pula. Se aparecer
`ER_BAD_FIELD_ERROR: Unknown column 'finops_status'`, seu banco está numa versão antiga.

Para não perder dados, prefira `ALTER TABLE` aditivo a `npm run reset`. **Ordem importa**: adicione
as colunas, faça o *backfill* das linhas existentes e só então crie o `CHECK` — uma linha
`DEFINIDA` com `finops_status NULL` faz o `ck_operacoes_finops` falhar na criação.

---

## 7. Integrações com os outros grupos

`src/servicos/integracoes.js` → `notificaDefinicao(operacao)` manda a **operação completa** (o mesmo
JSON do `GET /api/operacoes/:id`) para os destinos configurados:

| Grupo | Variável | Endpoint | Resposta |
|---|---|---|---|
| FinOps (Go) | `FINOPS_URL` | `POST {url}/operacoes` | confirmação com id deles |
| Documentos (Python/FastAPI) | `DOCUMENTOS_URL` | `POST {url}/api/documentos/juros` | `201` + `documento_id` e `url_pdf` |

É chamado em dois lugares: `routes/operacoes.js:113` (o POST novo) e `:203` (a `/definicao` legada).

Sobre o grupo de Documentos: o JSON Schema deles **não** usa `additionalProperties: false`, então
campos novos que acrescentarmos (como `finops` ou `contextoScore`) passam sem quebrar. Não altere o
repositório deles — é de outro grupo.

Para testar localmente a integração de Documentos, suba a API Python deles e aponte `STORAGE_DIR`
para fora da pasta do projeto deles, para não criar `storage/` lá dentro.

---

## 8. Testes

### `npm test` — 116 testes, sem banco

Usa o runner nativo (`node --test`), sem Jest. Arquivos `*.test.js` ao lado do código. O que cada
grupo cobre:

- `src/lib/*.test.js` — matemática pura: PRICE, SAC, cronograma, datas, IOF/tarifa, CET, demonstrativo, CPF/CNPJ.
- `src/servicos/*.test.js` — regras: validação de entrada, taxa, simulação, definição, consolidado, FinOps, integrações.
- `src/openapi.test.js` — valida a **especificação**: toda `$ref` existe, a lista de caminhos está exata, os exemplos são calculados pelo código.

> **Armadilha nº 2**: `openapi.test.js` confere o **documento OpenAPI**, não as rotas que o Express
> realmente registrou. Foi assim que a rota `/finops` desapareceu num merge com os 116 testes
> continuando verdes. Teste de documentação não substitui teste de rota.

> **Armadilha nº 3**: `openapi.test.js` compara a lista de caminhos com um array literal. Criar um
> endpoint sem documentá-lo **quebra o teste** — e é essa a intenção.

### `npm run verifica` — 63 cenários contra o MySQL real

`scripts/verifica-endpoints.mjs` sobe a app de verdade, cria operações, confere números e **apaga o
que criou no fim**. É o que pega integração, SQL, `CHECK` e corrida — coisas que o teste unitário não vê.

Hoje: **61/63**. As duas falhas são a rota `/finops` ausente (§9), não regressão nova.

---

## 9. Estado atual e dívidas conhecidas

Leia esta seção antes de abrir qualquer PR — evita "consertar" o que é decisão, e evita achar que
quebrou o que já estava quebrado.

### Regressão do merge `394a2e6` (pendente de decisão)

O merge de 16/11/2026 resolveu `src/routes/operacoes.js` ficando com a versão de "documentos"
inteira, e isso descartou o lado FinOps:

- `POST /api/operacoes/:id/finops` **não existe mais** → `404`. Continua no Swagger e na mensagem de
  subida do `index.js`.
- `registraOperacaoDefinida` segue **importado e nunca chamado** (`routes/operacoes.js:10`). O import
  morto foi **deixado de propósito**, para a regressão não ficar invisível.
- Consequência: `finops_status` **nunca sai de `PENDENTE`**, mesmo quando o FinOps aceita com `201`.
  As ~285 linhas de `finops.test.js` testam código que nenhuma rota chama.
- O payload mudou sem ninguém decidir: `notificaDefinicao` manda a **operação completa**, mas
  `servicos/finops.js` documenta que o contrato deles é o **consolidado**.

A decisão pendente é: FinOps passa pelo `notificaDefinicao` genérico (e então removem-se `finops.js`,
a rota de reenvio, as colunas `finops_*` e o trecho do Swagger) **ou** volta pelo
`registraOperacaoDefinida` (e `notificaDefinicao` fica só com Documentos). Pelos comentários do
`finops.js`, a segunda combina com o contrato real deles.

### Decisões que parecem bug e não são

- **`estado = 'SIMULADA'` é histórico.** Desde a T-14 toda operação nasce `DEFINIDA`. O estado
  continua no enum porque existem operações antigas gravadas assim, e `?estado=SIMULADA` precisa
  achá-las. Idem para a rota `/definicao`: é legado deliberado.
- **`amortizacao` é obrigatória** no `POST /api/operacoes`. Foi decisão explícita do PM, ciente de
  que é mudança quebra-contrato.
- **`decisao` ausente não bloqueia** a criação (compatibilidade com quem ainda não envia o campo).
  Só um valor diferente de `APROVADO` gera `422`.
- **As duas simulações (PRICE e SAC) continuam sendo calculadas e gravadas**, mesmo com o sistema já
  escolhido. O consolidado e o PDF mostram as duas para comparação.
- **`src/routes/teste-exemplo.js` não está registrado** em `routes/index.js`. É modelo didático.
- **`src/lib/calculaParcela.js`** é a função legada da primeira fase, usada só por `/api/juros/*`.
  Não a use como base para nada novo.

### Pontas soltas menores (não bloqueiam nada, mas confundem)

- **A conversão score → faixa existe em dois lugares.** `src/dados/score.js` (usado **só** pela rota
  legada `GET /api/juros/faixas`) e a tabela `faixas_juros` (usada por todo o fluxo novo). Hoje os
  limites coincidem — A ≥ 800, B ≥ 600, C ≥ 400, D ≥ 200, E abaixo — mas mudar a política no banco
  **não** muda o arquivo. Se alterar as faixas, altere os dois ou remova o legado.
- **`buscarFaixaPorScore` (`repositorios/faixasJuros.js`) não é chamada por ninguém** em produção.
  `calculaTaxa` usa `listarFaixas` e escolhe a linha em memória, porque precisa também da faixa A
  para informar a taxa base. A função só é espelhada no `bancoFalso.js`.

---

## 10. Convenções que você precisa respeitar

1. **Dinheiro em centavos, sempre via `arredonda2`.** `src/lib/util.js` arredonda com correção de
   `Number.EPSILON`. Não use `toFixed` para calcular (só para exibir).
2. **Taxa em porcentagem até a última hora.** A tabela, os serviços e a resposta usam `1.85` = 1,85%.
   A divisão por 100 acontece em **um único lugar**: `simulacao.js`, na primeira linha. Não divida de novo.
3. **`snake_case` no banco, `camelCase` na API.** A tradução é responsabilidade exclusiva do repositório.
4. **Validação acumula erros, não para no primeiro.** `validaEntrada` junta tudo em `erros[]` e lança
   um único `400` com a lista. Mantenha esse padrão: quem chama corrige tudo de uma vez.
5. **Função de cálculo é pura.** Mesma entrada, mesma saída, sem `Date.now()`, sem banco, sem log.
6. **Comentários explicam o *porquê*.** O código do projeto é comentado em português explicando
   decisões e armadilhas, não o óbvio. Siga o tom.
7. **Nada de commit direto na `main`.** O fluxo do time é branch + PR.

### Checklist para adicionar um endpoint

1. Criar o arquivo em `src/routes/` (ou adicionar ao router existente).
2. Registrar em `src/routes/index.js`.
3. Pôr as regras em `src/servicos/` e o cálculo puro em `src/lib/` — **não** na rota.
4. Documentar em `src/openapi.js` (caminho, schema, exemplos, erros).
5. Atualizar a lista de caminhos em `src/openapi.test.js` (o teste vai falhar até você fazer isso).
6. Acrescentar cenário em `scripts/verifica-endpoints.mjs`, **incluindo a limpeza** do que criar.
7. Rodar `npm test` **e** `npm run verifica`.

---

## 11. Diagnóstico rápido

| Sintoma | Causa provável |
|---|---|
| `ER_BAD_FIELD_ERROR: Unknown column 'finops_status'` | banco em versão antiga → `ALTER TABLE` aditivo (§6) |
| `Unknown database 'calculo_juros'` | falta `npm run schema` |
| `modalidade "X" não existe` em modalidade conhecida | falta `npm run seed` |
| `faixas_juros não cobre o score N` (erro 500) | seed incompleto |
| Integração "não faz nada", sem erro | `DOCUMENTOS_URL`/`FINOPS_URL` vazias no `.env` (§2) |
| `POST /api/operacoes/:id/finops` → 404 | esperado hoje (§9) |
| `npm run verifica` em 61/63 | esperado hoje (§9) |
| `400` no payload do grupo de decisão | confira o CPF/CNPJ: os dígitos verificadores são validados de verdade |
| `npm test` quebrando em vários arquivos de uma vez | provavelmente um *fixture* compartilhado de entrada; confira se `validaEntrada` passou a exigir campo novo |
