# Erro: FinOps recebeu a operação completa em vez do consolidado (16/11/2026)

> Registro de causa raiz. Leia junto com `docs/onboarding-tecnico.md` §7 e §9 e
> `docs/integracao-finops.md` §3.2.

## Sintoma

Na primeira operação real criada pela esteira depois da T-14, o terminal da API mostrou:

```text
[integração] FinOps: falha ao enviar OP-2026-000123 → POST http://localhost:8083/operacoes respondeu 400:
{"erro":"operacao.identificador não pode ser vazio"}
```

O identificador não estava vazio: a operação 7 (`OP-2026-000123`) estava gravada, `DEFINIDA`, com
`finops_status = PENDENTE`, `finops_erro = NULL` e `finops_tentativa_em = NULL` — ou seja, a tentativa
nem passou pelo cliente do FinOps (`src/servicos/finops.js`), que gravaria `FALHOU` com o motivo.

## Causa raiz

1. O serviço Go do FinOps faz o *bind* de `POST /operacoes` em `CriarOperacaoRequest`
   (`internal/handler/operacao_handler.go`), que lê o identificador em **`operacao.identificador`** e
   valida em `internal/service/validacao.go`: vazio → `400 operacao.identificador não pode ser vazio`.
   É o formato do nosso **consolidado** (`GET /api/operacoes/:id/consolidado`).
2. O merge `394a2e6` (16/11/2026) resolveu o conflito em `src/routes/operacoes.js` ficando com a versão
   da branch de Documentos. Ela trocou `registraOperacaoDefinida` (consolidado) por
   `notificaDefinicao`, que mandava a **operação completa** (`GET /api/operacoes/:id`) para FinOps e
   Documentos com o mesmo `fetch`. Na operação completa o `identificador` fica na raiz, então para o
   FinOps `operacao.identificador` chegava vazio.
3. A mesma resolução apagou a rota de reenvio `POST /api/operacoes/:id/finops` e deixou
   `registraOperacaoDefinida` importado sem uso. O Swagger, o `index.js` e o `verifica` continuaram
   descrevendo o comportamento antigo — `npm run verifica` ficou em 61/63 e isso foi anotado como
   "esperado hoje" em vez de investigado.

## Evidência

- `git show 035b9aa:src/routes/operacoes.js` tem a rota `/:id/finops` e chama `registraOperacaoDefinida`;
  `git show 394a2e6:src/routes/operacoes.js` não tem nenhum dos dois.
- `grep -rn "não pode ser vazio" financial-operations-service/internal` → `validacao.go:46`.
- O `GET http://localhost:8083/operacoes` listava a operação de teste do dia 15 (`OP-9999-...`), enviada
  pelo caminho antigo com `201` — o contrato do consolidado estava correto desde a T-13.

## Correção (mesmo dia)

| Onde | O quê |
| --- | --- |
| `src/servicos/integracoes.js` | `notificaDefinicao` envia ao FinOps via `registraOperacaoDefinida` (consolidado + `finops_*`) e só Documentos recebe a operação completa. Falha continua não derrubando a resposta |
| `src/routes/operacoes.js` | `POST /` e `/definicao` releem a operação depois do envio (a resposta traz o `finops` real); rota `POST /:id/finops` restaurada da T-13 |
| `src/servicos/integracoes.test.js` | FinOps passa pelo `registraFinops` injetado; teste falha se alguém voltar a usar `fetch` cru para o FinOps |
| `scripts/verifica-endpoints.mjs` | cenários do POST conferem `finops` conforme o ambiente (`REGISTRADA` / `FALHOU` / `PENDENTE`), não mais `PENDENTE` fixo |
| `src/openapi.js`, docs | textos e exemplos alinhados ao comportamento real |

Resultado: `npm test` 119/119; `npm run verifica` 67/67 com o FinOps no ar.

## Prevenção

- **Cada grupo tem o seu contrato.** Um "JSON para todos" só funciona quando todos aceitam o mesmo
  documento. Antes de generalizar um envio, leia o *handler* de quem recebe.
- **Merge que toca rota de integração exige `npm run verifica` em N/N.** Um cenário a menos não é
  "esperado hoje": é a regressão avisando. O import morto deixado "para não ficar invisível" ficou
  invisível mesmo assim; o teste que falha é o único aviso que funciona.
- **Mensagem de erro do outro serviço aponta o campo pelo caminho dele.** `operacao.identificador`
  vazio com `identificador` preenchido na raiz significa formato errado, não dado faltando.
