# Integração com o FinOps (financial-operations-service) — T-13

> Escrito em 15/11/2026, a partir da leitura do código dos dois projetos. O serviço Go fica em
> `C:\projects\faculdade\financial-operations-service` e **não pode ser alterado por nós**: toda
> adaptação é do nosso lado.

## 1. O que é

O **FinOps** é o último serviço da esteira de crédito (Score → Decisão → **Juros (nós)** → FinOps).
Ele recebe a operação já fechada com o cliente, registra o contrato e passa a controlar parcelas,
pagamentos, atraso, amortização e liquidação. Depois do registro, quem responde sobre a operação é ele.

```text
POST /api/operacoes             →  SIMULADA  (nós: Price + SAC, encargos, CET)
POST /api/operacoes/:id/definicao  →  DEFINIDA  (outro grupo escolhe PRICE ou SAC)
                                        │
                                        └─► POST {FINOPS_URL}/operacoes  (automático, mesmo request)
                                               201 criada / 200 já existia → finops.status = REGISTRADA
                                               400 / sem resposta        → finops.status = FALHOU
POST /api/operacoes/:id/finops  →  reenvio manual quando ficou FALHOU ou PENDENTE
```

## 2. O contrato deles (o que importa para nós)

Fonte: `api/openapi.yaml`, `internal/handler/operacao_handler.go`, `internal/service/validacao.go`,
`internal/service/calendario.go` e `docs/architecture/adr/ADR-009-*.md` do FinOps.

| Item | Regra do FinOps |
| --- | --- |
| Endpoint | `POST /operacoes` na porta **8083**, JSON, sem autenticação |
| Payload | **O nosso consolidado, sem adaptação** (`GET /api/operacoes/:id/consolidado`). Campos que eles não usam (`operacao.id`, `operacao.criadoEm`, `condicoes.primeiroRelacionamento`, `resumo.parcelaFixa`/`amortizacaoBase`, `demonstrativo`, `calendario[].diasCorridos`) são aceitos e ignorados |
| `operacao.estado` | Só `DEFINIDA` é aceito |
| `operacao.identificador` | Vira o `numeroOperacao` deles. Formato `^OP-\d{4}-\d{4,}$` (maiúsculo), coluna `VARCHAR(20)` |
| `operacao.definidoEm` | `YYYY-MM-DD HH:MM:SS` lido como **GMT-03:00 fixo**, ou ISO-8601 com fuso |
| Dinheiro | Até 2 casas decimais; 3 casas é **recusado**, não arredondado |
| Taxas | Entram em **percentual** (`1.85`), eles guardam e devolvem em **fração** (`0.0185`) |
| Conferências | Uma parcela por mês de `prazoMeses`, numeradas de 1; vencimentos crescentes e após a liberação; `valor = amortizacao + juros`; saldo encadeado de `condicoes.valor` até 0; `resumo.totalJuros`/`totalPago` = somas do calendário; `iof.total = diario + adicional`; `encargos.total = iof.total + tarifaCadastro`; `valorLiberado = valor − encargos.total` |
| Resposta | `201` + `Location` quando cria; **`200` quando o identificador já existia** (idempotente); corpo `{ id, numeroOperacao, status: "ATIVA", criadoEm }` |
| Erro | `400 { "erro": "mensagem" }`. A orientação deles: 400 → não reenviar igual; timeout → **reenviar o mesmo payload** |

Confirmado na prática em 15/11/2026, com o FinOps rodando em Docker: o consolidado PRICE e o SAC do
cenário A.5 foram aceitos sem nenhuma alteração (`201`), e o reenvio respondeu `200`.

## 3. O que mudou na nossa API

### 3.1 Validação do `POST /api/operacoes` (falhar cedo, não na definição)

| Campo | Antes | Agora | Motivo |
| --- | --- | --- | --- |
| `identificador` | qualquer texto de 1 a 60 caracteres | `OP-AAAA-NNNN` (4+ dígitos na sequência), maiúsculo, **até 20 caracteres** | O FinOps recusa outro formato com `400`, e acima de 20 caracteres estoura a coluna deles |
| `valor` | qualquer número > 0 | **até 2 casas decimais** | O FinOps recusa fração de centavo; e o encadeamento do saldo só fecha ao centavo se o principal já estiver em centavos |

A coluna `operacoes.identificador` continua `VARCHAR(60)`; a regra fica na validação.

### 3.2 Envio automático na definição

`POST /api/operacoes/:id/definicao` grava a definição e, **no mesmo request**, monta o consolidado
(`montaConsolidado`, o mesmo documento do `GET .../consolidado`) e faz o `POST` no FinOps
(`src/servicos/finops.js`). A resposta continua sendo `200` com a operação; o resultado do envio vem em
`operacao.finops`:

| `finops.status` | Significado | O que fazer |
| --- | --- | --- |
| `REGISTRADA` | FinOps aceitou (201) ou já tinha (200). `finops.id` é o id lá; o `numeroOperacao` lá é o nosso `identificador` | Nada. É definitivo |
| `FALHOU` | A última tentativa falhou; `finops.erro` diz por quê (mensagem deles ou da rede), `finops.tentativaEm` quando | `POST /api/operacoes/:id/finops` |
| `PENDENTE` | DEFINIDA mas nunca enviada: `FINOPS_URL` vazia, ou a API caiu entre gravar e enviar | Configurar `FINOPS_URL` e `POST /api/operacoes/:id/finops` |

**A definição nunca depende do FinOps.** Ela é gravada antes do envio; se o envio falhar, a operação
fica `FALHOU` para ser reenviada. É o desenho de "reenvio seguro" que o próprio FinOps recomenda, e
evita o pior caso do envio-antes-de-gravar: registrar um contrato lá com um sistema que acabou perdendo
a corrida da definição aqui.

### 3.3 Reenvio: `POST /api/operacoes/:id/finops`

| Situação | Resposta |
| --- | --- |
| Registrou agora (ou o FinOps respondeu 200 porque já tinha) | `200` com a operação, `finops.status = REGISTRADA` |
| Já estava `REGISTRADA` | `200` com a operação como está, **sem chamar o FinOps** (evita trocar um REGISTRADA por uma falha de rede passageira) |
| Operação `SIMULADA` | `422 OPERACAO_NAO_DEFINIDA` |
| FinOps sem resposta (conexão recusada, timeout) | `503 FINOPS_INDISPONIVEL`, operação fica `FALHOU`; tente de novo depois |
| `FINOPS_URL` vazia | `503 FINOPS_INDISPONIVEL` com a mensagem de configuração |
| FinOps recusou (400) ou respondeu algo inesperado (404, 500) | `502 FINOPS_RECUSOU`, operação fica `FALHOU`; `detalhes[0]` traz a mensagem deles. Não adianta reenviar igual |

Em caso de falha, um `finops.id` de um registro anterior é preservado (a falha é da tentativa, não do registro).

### 3.4 Banco (versão 3 do schema) — exige `npm run reset`

Quatro colunas novas em `operacoes`, todas `NULL` enquanto `SIMULADA` (constraint `ck_operacoes_finops`):

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `finops_status` | `VARCHAR(10)` | `PENDENTE` (nasce assim no `definir`), `REGISTRADA`, `FALHOU` |
| `finops_id` | `BIGINT UNSIGNED` | id da operação no FinOps |
| `finops_erro` | `VARCHAR(255)` | motivo da última falha (a mensagem é cortada em 255) |
| `finops_tentativa_em` | `DATETIME` | última tentativa |

`npm run schema` em banco antigo avisa que faltam as colunas e pede o `reset`. A coluna `resultado` continua nunca recebendo UPDATE.

### 3.5 Fuso horário: `DB_TIMEZONE` (padrão `-03:00`)

O FinOps interpreta `definidoEm` sem fuso como **GMT-03:00**. O nosso `definido_em` vem de `NOW()` do
MySQL, que usa o fuso da **sessão**; o MySQL local desta máquina está em **UTC**, então o horário chegaria
lá 3 horas adiantado (um `15:12` nosso virava `18:12 -03:00`). `src/db.js` agora roda
`SET time_zone = ?` em toda conexão nova do pool, com `DB_TIMEZONE` (padrão `-03:00` fixo, o mesmo que o
FinOps usa; `SYSTEM` herda o fuso do servidor). Isso vale para `criado_em`, `definido_em` e
`finops_tentativa_em`: todos passam a sair em horário de Brasília (sem horário de verão, igual ao FinOps).

## 4. Configuração (`.env`)

```ini
FINOPS_URL=http://localhost:8083   # vazio desliga o envio (operações definidas ficam PENDENTE)
FINOPS_TIMEOUT_MS=5000             # tempo máximo esperando o FinOps responder
DB_TIMEZONE=-03:00                 # fuso da sessão MySQL (ver 3.5)
```

A API avisa na subida se o FinOps está configurado. Para subir o FinOps localmente (precisa do Docker):

```bash
cd C:\projects\faculdade\financial-operations-service
docker compose up -d --build        # API em http://localhost:8083, painel em /, Swagger em /swagger
docker compose down                 # para (acrescente -v para apagar o banco deles)
```

## 5. Como conferir

- `npm test`: `src/servicos/finops.test.js` cobre o cliente HTTP (201, 200, 400, 500, conexão recusada,
  timeout, desligado) e a orquestração (grava REGISTRADA/FALHOU, preserva id, não lança em falha do
  FinOps, deixa bug subir como 500). Um dos testes refaz, em JavaScript, as mesmas conferências ao
  centavo de `validacao.go` e `calendario.go` sobre o payload que enviamos, em PRICE e SAC.
- `npm run verifica` (ponta a ponta, precisa do MySQL): com `FINOPS_URL` apontando para um FinOps no ar,
  define as operações de teste, confere `finops.status = REGISTRADA`, lê a operação e as parcelas **no
  FinOps** e compara com o nosso cronograma (taxas em fração: `0.0185`, `0.3089`), confere o
  `definidoEm` em UTC (+3h) e exercita o reenvio marcando uma operação como `FALHOU` no banco. Sem
  FinOps no ar, confere `FALHOU` + `503`; com `FINOPS_URL` vazia, confere `PENDENTE` + `503`.
  As operações de teste ficam gravadas no FinOps (ele não tem `DELETE`); os identificadores são
  `OP-9999-<timestamp>NN`, então não colidem entre execuções.

## 6. Decisões e limites conhecidos

- **Payload = consolidado, sem transformação.** Qualquer campo novo no consolidado vai junto; o FinOps
  ignora o que não conhece. Se um dia eles passarem a exigir algo que não temos, o lugar de mexer é
  `montaConsolidado` (e o `GET .../consolidado` muda junto, de propósito: é um documento só).
- **Síncrono, no request da definição.** Simples e visível para quem chama (`finops` já vem na
  resposta). Custa o tempo de uma chamada HTTP (até `FINOPS_TIMEOUT_MS`) a mais na definição.
- **Sem retry automático nem fila.** Um `FALHOU` fica esperando alguém chamar o reenvio. Um job que
  varre `finops_status IN ('PENDENTE', 'FALHOU')` seria o próximo passo natural se isso incomodar.
- **GMT-03:00 fixo é um acordo implícito** com o FinOps (ADR-009 deles): se eles mudarem, muda-se `DB_TIMEZONE`.
- **`identificador` passou a ser restrito.** Quem cria operações (Decisão) precisa mandar `OP-AAAA-NNNN`;
  qualquer outro formato agora é `400` na criação, em vez de um `FALHOU` só na definição.
