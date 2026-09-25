# Documentação do Projeto — Cálculo de Juros (API + Banco de Dados)

> Documento gerado a partir da leitura completa do código-fonte, dos scripts de banco e dos
> documentos de planejamento (`docs/backlog-api.md`, `docs/backlog-db.md`, `docs/backlog.md`,
> `docs/research_tabela-juros-brasil_20260831.md`, `docs/inventario-processos.md`) existentes no
> repositório em **24/09/2026**. Sempre que uma informação não pôde ser confirmada olhando o
> código real, este documento diz isso explicitamente — nada aqui foi inventado.

---

## 1. Visão geral

Este é um projeto acadêmico de uma **API de cálculo de juros e simulação de crédito**, construída
em **Node.js + Express**, com um **banco MySQL 8** para guardar o catálogo de modalidades de
crédito, as faixas de taxa por score e as operações simuladas.

O projeto está em dois estágios bem diferentes:

- **O que já existe e funciona, hoje, no código:** um esqueleto Express com rotas de exemplo
  (`/api/juros/simples`, `/api/juros/composto`), um endpoint de saúde (`/api/health`) e — como
  resultado do trabalho registrado neste documento — **o banco de dados MySQL completo, populado,
  testado, e conectado ao Node.js**, com uma camada de repositórios prontos para uso.
- **O que está especificado em detalhe, mas ainda não implementado:** a API completa de simulação
  de crédito (Price, SAC, CET, IOF, cronograma de parcelas, endpoints `/api/modalidades` e
  `/api/operacoes`), descrita tarefa a tarefa em `docs/backlog-api.md`. Este documento **não**
  descreve essas funções como se existissem — elas ainda são planejamento.

## 2. Objetivo do sistema

Segundo `docs/inventario-processos.md` e `docs/backlog-api.md`: uma API HTTP que recebe um pedido
de crédito (valor, modalidade, score do cliente, prazo) e devolve uma simulação completa —
parcelas pelos sistemas **Price** e **SAC**, com datas reais de vencimento, IOF, tarifa de
cadastro e o CET (Custo Efetivo Total, conforme a Resolução CMN 4.881/2020). Cada simulação seria
gravada no banco e consultável depois, de forma paginada.

**Hoje**, o código implementado calcula apenas juros simples e compostos "genéricos" (rota legada
`/api/juros`), e o banco de dados já está pronto para sustentar a simulação de crédito completa
quando a API for implementada.

## 3. Tecnologias utilizadas

Confirmado em `package.json` e nos arquivos de código:

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | ≥ 20.6 (`engines.node`) | Runtime |
| Express | ^5.2.1 | Framework HTTP |
| mysql2 | ^3.24.4 | Driver MySQL (usa a API `mysql2/promise`) |
| MySQL Server | 8.4.9 (instalado nesta máquina) | Banco de dados |
| ES Modules | `"type": "module"` no `package.json` | Todo `import`/`export`, sempre com `.js` no caminho |
| `node --test` | nativo do Node | Framework de testes (ainda sem arquivos `*.test.js` no projeto) |

Não há ORM, não há framework de migrations, não há TypeScript. Não há autenticação, nem rate
limit (decisão de escopo registrada em `docs/backlog.md`: "projeto acadêmico").

## 4. Arquitetura

O projeto segue uma separação simples em camadas, típica de projetos Express pequenos:

```
requisição HTTP → routes/ → (lib/ para cálculo puro | repositorios/ para acesso a dados) → resposta
```

- **`routes/`** — recebe a requisição HTTP, valida o corpo, chama a lógica e devolve a resposta.
  Não deveria conter SQL nem fórmulas de negócio complexas.
- **`lib/`** — funções puras (sem I/O), como o cálculo de parcelas.
- **`repositorios/`** — (criado nesta fase) tudo que fala SQL com o banco MySQL.
- **`db.js`** — a conexão (pool) com o MySQL, compartilhada por todos os repositórios.

Esta é a arquitetura **real, observada no código atual** — é mais simples que a arquitetura
completa descrita em `docs/backlog-api.md` (que prevê também `services/`, `dados/` e
`middlewares/`), porque essas camadas ainda não foram criadas.

## 5. Estrutura de pastas (estado real em 24/09/2026)

```
calculo-juros-facul-main/
├─ .env                          ← credenciais do banco (local, NÃO vai para o git)
├─ .env.example                  ← modelo do .env, sem senha real
├─ .gitignore                    ← ignora node_modules/, claudedocs/, .env
├─ como-criar-endpoint.txt       ← guia rápido de como rodar a API e criar uma rota nova
├─ index.js                      ← ponto de entrada; sobe o servidor Express
├─ package.json / package-lock.json
├─ db/
│  ├─ schema.sql                 ← cria o banco calculo_juros e as 3 tabelas
│  ├─ seed.sql                   ← carga inicial: 6 modalidades + 30 faixas de juros
│  ├─ reset.sql                  ← apaga o banco inteiro (uso só em desenvolvimento)
│  ├─ exemplos-operacoes.sql     ← 3 operações de exemplo, para testar consultas
│  ├─ consultas.sql              ← 11 consultas de conferência e de uso, comentadas
│  └─ testa-repositorios.mjs     ← script que testa as funções de src/repositorios/ contra o banco real
├─ docs/
│  ├─ DOCUMENTACAO.md            ← este arquivo
│  ├─ backlog.md                 ← backlog completo do processo BPMN (48 tarefas, contexto)
│  ├─ backlog-api.md             ← backlog reduzido da API (8 tarefas — a maior parte AINDA NÃO implementada)
│  ├─ backlog-db.md              ← backlog reduzido do banco (guia que originou os arquivos de db/)
│  ├─ inventario-processos.md    ← levantamento de processos do domínio (base do BPMN)
│  ├─ research_tabela-juros-brasil_20260831.md ← pesquisa sobre a fonte de dados do BCB
│  ├─ bcb_taxas_juros_2026-08-11_a_2026-08-17.csv ← extração real da API do Banco Central (790 linhas)
│  ├─ processo-principal.bpmn    ← diagrama BPMN do processo completo
│  ├─ visualizar-bpmn.html       ← visualizador standalone do .bpmn
│  └─ pesquisa aula segunda.pdf, backlog-db.pdf ← materiais de apoio (não analisados em detalhe — fora do escopo de código)
└─ src/
   ├─ app.js                     ← monta o Express, registra middlewares e rotas
   ├─ db.js                      ← pool de conexões com o MySQL
   ├─ lib/
   │  └─ calculaParcela.js       ← função legada de geração de parcelas (usada só por /api/juros)
   ├─ repositorios/
   │  ├─ modalidades.js          ← consultas de modalidades
   │  ├─ faixasJuros.js          ← consultas de faixas de juros por score
   │  └─ operacoes.js            ← consultas e gravação de operações simuladas
   └─ routes/
      ├─ index.js                ← registro central das rotas (tudo sob /api)
      ├─ health.js                ← GET /api/health (com checagem do banco)
      ├─ juros.js                ← POST /api/juros/simples e /composto (cálculo genérico, legado)
      └─ teste-exemplo.js        ← rota de exemplo didática (não registrada em index.js)
```

**Observação sobre `teste-exemplo.js`:** existe no disco e é referenciado por
`como-criar-endpoint.txt` como modelo a copiar, mas **não está registrado** em
`src/routes/index.js` — ou seja, `GET /api/exemplo` e `POST /api/outro` (que ele definiria) **não
respondem** na API atual. Isso é esperado: é um arquivo-modelo, não uma rota ativa.

## 6. Banco de dados

- **SGBD:** MySQL, versão **8.4.9** (instalada nesta máquina via winget; requisito mínimo do
  projeto é 8.0.19+, por causa da sintaxe `INSERT ... AS novo ON DUPLICATE KEY UPDATE`).
- **Nome do banco:** `calculo_juros`.
- **Charset:** `utf8mb4` / `utf8mb4_unicode_ci` (necessário para os acentos do português).
- **Convenção de nomes:** `snake_case` no banco (`prazo_meses`), `camelCase` no JavaScript
  (`prazoMeses`) — a tradução acontece só dentro de `src/repositorios/`.
- **Sem ORM e sem ferramenta de migrations.** Dois arquivos fazem esse papel: `db/schema.sql`
  (estrutura) e `db/seed.sql` (dados). Ambos foram escritos para poder rodar mais de uma vez sem
  quebrar (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON DUPLICATE KEY UPDATE`).

### 6.1 Diagrama de relacionamento

```
modalidades (codigo PK) ──1:N── faixas_juros (modalidade_codigo FK)
modalidades (codigo PK) ──1:N── operacoes (modalidade_codigo FK)
```

Uma modalidade tem exatamente 5 faixas de juros (A a E) e pode ter várias operações simuladas.
Nenhuma faixa ou operação pode apontar para uma modalidade inexistente (chave estrangeira).

### 6.2 Tabela `modalidades`

Catálogo dos 6 tipos de crédito pessoa física que a API simula. Chave primária **natural**: o
próprio `codigo`.

| Coluna | Tipo | Nulo? | Descrição |
|---|---|---|---|
| `codigo` | VARCHAR(40) | não (PK) | Código usado pela API, ex.: `CONSIGNADO_INSS` |
| `nome` | VARCHAR(80) | não | Nome para exibição |
| `modalidade_bcb` | VARCHAR(120) | não | Texto exato da série de taxas do Banco Central (rastreabilidade) |
| `publico` | CHAR(2) | não | `PF` ou `PJ` (só `PF` nesta versão) |
| `regime_indexacao` | VARCHAR(20) | não | `PREFIXADO` nesta versão |
| `teto_taxa_mes` | DECIMAL(6,2) | não | Taxa máxima permitida, % ao mês |
| `taxa_referencia_bcb_mes` | DECIMAL(6,2) | sim | Mediana da série do BCB (11–17/08/2026); já inclui IOF — só para comparação |
| `prazo_min_meses` / `prazo_max_meses` | SMALLINT UNSIGNED | não | Limites de prazo da modalidade |
| `descricao` | VARCHAR(255) | sim | Texto livre |
| `ativo` | BOOLEAN | não (default TRUE) | `FALSE` esconde a modalidade sem apagar histórico |
| `criado_em` | DATETIME | não (default `CURRENT_TIMESTAMP`) | Preenchido pelo banco |

Restrições: `ck_modalidades_prazo` (prazo mínimo ≥ 1 e máximo ≥ mínimo) e `ck_modalidades_teto`
(teto > 0).

### 6.3 Tabela `faixas_juros`

Para cada modalidade, a taxa de cada uma das 5 faixas de score (A a E). Chave primária
**artificial** (`id`), porque não há um identificador natural curto.

| Coluna | Tipo | Nulo? | Descrição |
|---|---|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT | não (PK) | Identificador artificial |
| `modalidade_codigo` | VARCHAR(40) | não (FK → `modalidades.codigo`) | A qual modalidade a faixa pertence |
| `faixa` | CHAR(1) | não | `A` (melhor) a `E` (recusado) |
| `score_min` / `score_max` | SMALLINT UNSIGNED | não | Intervalo de score coberto pela faixa (inclusivo) |
| `taxa_mes` | DECIMAL(6,2) | sim | % ao mês; `NULL` **só** na faixa `E` (recusado, sem taxa) |
| `taxa_ano` | DECIMAL(6,2) | sim | % ao ano, capitalização composta; `NULL` só na faixa `E` |
| `descricao` | VARCHAR(80) | sim | Rótulo, ex.: "Risco baixo" |

Restrições: `uk_faixas_modalidade_faixa` (UNIQUE em `modalidade_codigo, faixa` — impede duas
faixas "B" para a mesma modalidade); `ck_faixas_letra` (faixa só pode ser A–E); `ck_faixas_score`
(`score_min <= score_max <= 1000`); `ck_faixas_taxa` (faixa `E` tem `taxa_mes` `NULL`, as demais
não podem ser `NULL`).

**Regra de cálculo das taxas** (de `docs/backlog-db.md`, Anexo A): `taxa_mes = MIN(taxa_base +
spread, teto)`, com spreads A +0,00 / B +0,50 / C +1,00 / D +2,00 pontos percentuais, e
`taxa_ano = ((1 + taxa_mes/100)^12 − 1) × 100`. A tabela completa das 30 combinações
modalidade×faixa está no seed (`db/seed.sql`) e foi conferida linha a linha contra o Anexo A do
backlog.

### 6.4 Tabela `operacoes`

Cada operação de crédito simulada (seria preenchida por um futuro `POST /api/operacoes` — ver
§15). Guarda colunas "planas" para listagem rápida e o resultado completo em uma coluna `JSON`.

| Coluna | Tipo | Nulo? | Descrição |
|---|---|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT | não (PK) | Id devolvido pela API |
| `identificador` | VARCHAR(60) | não (UNIQUE) | Enviado pelo cliente da API |
| `modalidade_codigo` | VARCHAR(40) | não (FK → `modalidades.codigo`) | |
| `valor` | DECIMAL(15,2) | não (`> 0`) | Valor solicitado, em reais |
| `score` | SMALLINT UNSIGNED | não (`≤ 1000`) | Score do cliente |
| `prazo_meses` | SMALLINT UNSIGNED | não | Número de parcelas |
| `data_liberacao` | DATE | não | Data de liberação do crédito |
| `primeiro_relacionamento` | BOOLEAN | não (default FALSE) | Define se cobra tarifa de cadastro |
| `faixa_risco` | CHAR(1) | não | Faixa usada na precificação (A–D) |
| `taxa_final_mes` | DECIMAL(8,4) | não | % ao mês efetivamente aplicada |
| `cet_price_ano` / `cet_sac_ano` | DECIMAL(8,2) | não | CET % ao ano em cada sistema de amortização |
| `resultado` | JSON | não | `{ entrada, taxa, simulacoes }` — a resposta completa da simulação |
| `criado_em` | DATETIME | não (default `CURRENT_TIMESTAMP`) | |

Restrições: `uk_operacoes_identificador` (UNIQUE), `fk_operacoes_modalidade` (FK),
`ck_operacoes_valor` (`valor > 0`), `ck_operacoes_score` (`score <= 1000`).

### 6.5 Dados iniciais (seed)

`db/seed.sql` insere **6 modalidades** (`CREDITO_PESSOAL`, `CONSIGNADO_INSS`,
`CONSIGNADO_PUBLICO`, `CONSIGNADO_PRIVADO`, `VEICULOS`, `OUTROS_BENS`) e **30 faixas de juros**
(6 × 5). Os valores de taxa vêm de `docs/backlog-db.md` (Anexo A) e foram conferidos, após a
carga, com as seguintes consultas (todas executadas e com resultado **confirmado** nesta sessão):

- `SELECT COUNT(*) FROM modalidades` → **6**.
- `SELECT COUNT(*) FROM faixas_juros` → **30**, das quais **6** com `taxa_mes IS NULL` (as faixas E).
- Para cada modalidade, as 5 faixas cobrem o intervalo `0..1000` sem sobreposição nem buraco
  (`SUM(score_max - score_min + 1) = 1001` para as 6 modalidades).
- Nenhuma `taxa_mes` excede o `teto_taxa_mes` da sua modalidade (consulta retorna 0 linhas).
- `taxa_ano` bate com a fórmula composta `((1 + taxa_mes/100)^12 − 1) × 100` em todas as 24 linhas
  com taxa (tolerância de 0,005 devido a ponto flutuante).

`db/exemplos-operacoes.sql` insere 3 operações fictícias (`OP-TESTE-0001/2/3`) só para exercitar
consultas antes de existir um endpoint real que grave operações.

### 6.6 Consultas (`db/consultas.sql`)

11 consultas comentadas, cada uma com o resultado esperado documentado ao lado. Todas foram
**executadas e conferidas nesta sessão** contra o banco populado:

1. Listar modalidades ativas.
2. Buscar uma modalidade pelo código.
3. Faixas de uma modalidade (com `JOIN`), da melhor (A) para a pior (E).
4. **A consulta principal** — taxa para um par (modalidade, score), usando `BETWEEN score_min AND
   score_max`.
5. Tabela completa de taxas (30 linhas) para conferência.
6. Existência de uma operação por `identificador`.
7. Uma operação completa por `id`.
8. Listagem paginada de operações (`LIMIT ... OFFSET ...`, sempre com `ORDER BY`).
9. Contagem total de operações.
10. Leitura de um campo de dentro da coluna `JSON` (`resultado->>'$.taxa.taxaFinalMes'`).
11. Operações agrupadas por modalidade (`JOIN` + `GROUP BY`).

As defesas do banco (chave estrangeira, `UNIQUE`, `CHECK`) também foram testadas nesta sessão e
falham exatamente como esperado — ver §17 "Segurança do banco".

## 7. `src/db.js` — conexão com o MySQL

```js
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
});
```

### Finalidade
Criar e exportar um **pool** de conexões com o MySQL, compartilhado por toda a aplicação.

### Por que um pool, e não uma conexão só
Abrir uma conexão nova a cada requisição é lento (~50 ms) e não escala. O pool mantém algumas
conexões (até `connectionLimit: 10`) já abertas e as reaproveita entre requisições.

### `decimalNumbers: true`
Sem essa opção, o driver `mysql2` devolve colunas `DECIMAL` como **string** (`"1.85"` em vez de
`1.85`). Isso quebraria comparações numéricas (`if (taxa > 5)`) e testes (`assert.equal(taxa,
1.85)` falharia contra `"1.85"`).

### `dateStrings: true`
Sem essa opção, colunas `DATE`/`DATETIME` voltam como objetos `Date` do JavaScript, que carregam
fuso horário e podem "escorregar" um dia ao serem convertidos (problema clássico de fuso — ver
também §11, cronograma de datas). Com `dateStrings: true`, `data_liberacao` volta como a string
`'2026-10-30'`, sem ambiguidade.

### Quem utiliza
Todos os arquivos em `src/repositorios/` importam `{ pool }` daqui. `src/routes/health.js`
também importa para checar a conectividade.

## 8. Repositórios (`src/repositorios/`)

Regra de ouro do projeto (definida em `docs/backlog-db.md`): **tudo que fala SQL fica aqui**. As
rotas e serviços não devem montar SQL nem saber que colunas existem — só chamam estas funções.

### 8.1 `src/repositorios/modalidades.js`

| Função | Parâmetros | Retorno | Consulta usada |
|---|---|---|---|
| `listarModalidades()` | nenhum | array de modalidades (camelCase), só as `ativo = TRUE`, ordenadas por código | Q1 |
| `buscarModalidade(codigo)` | `codigo: string` | uma modalidade ou `undefined` | Q2 |

`linhaParaModalidade(linha)` é uma função interna (não exportada) que traduz uma linha do banco
(`snake_case`) para o formato usado pelo resto da aplicação (`camelCase`), inclusive convertendo
`ativo` de `0`/`1` (como o MySQL devolve um `BOOLEAN`) para `true`/`false`.

### 8.2 `src/repositorios/faixasJuros.js`

| Função | Parâmetros | Retorno | Consulta usada |
|---|---|---|---|
| `listarFaixas(modalidadeCodigo)` | `modalidadeCodigo: string` | as 5 faixas da modalidade, da melhor (A) para a pior (E) | Q3 |
| `buscarFaixaPorScore(modalidadeCodigo, score)` | `modalidadeCodigo: string`, `score: number` | a faixa que cobre aquele score, ou `undefined` se a modalidade não existir ou o score estiver fora de 0–1000 | Q4 |

Cada faixa devolvida inclui `permiteContratacao: boolean` (`true` exceto na faixa `E`, calculado
a partir de `taxa_mes !== null`) — um campo derivado que facilita a decisão de recusa no futuro
serviço de simulação, sem que quem chama precise saber que "faixa E" significa "sem taxa".

**Cuidado com a ordem dos parâmetros:** em `buscarFaixaPorScore`, o SQL é `WHERE
modalidade_codigo = ? AND ? BETWEEN score_min AND score_max` — os dois `?` precisam vir na
ordem `[modalidadeCodigo, score]`. Trocar a ordem faz a consulta sempre devolver vazio.

### 8.3 `src/repositorios/operacoes.js`

| Função | Parâmetros | Retorno | Consulta usada |
|---|---|---|---|
| `existeIdentificador(identificador)` | `identificador: string` | `boolean` | Q6 |
| `salvar({ identificador, entrada, taxa, simulacoes })` | objeto com os dados da simulação | `id` numérico gerado (`insertId`) | `INSERT` |
| `buscarPorId(id)` | `id: number` | a operação completa (campos planos + o JSON "aberto" em cima do objeto), ou `undefined` | Q7 |
| `listar({ pagina, tamanho })` | `pagina, tamanho: number` | `{ itens: [...], total: number }`, mais recente primeiro | Q8 + Q9 |

Estas quatro assinaturas são, segundo `docs/backlog-db.md`, **um contrato** com a futura
implementação de `POST /api/operacoes` e `GET /api/operacoes` (tarefas T-07/T-08 do
`backlog-api.md`) — os nomes de função e o formato de retorno não devem ser renomeados sem
avisar quem for implementar esses endpoints.

**Fluxo interno de `salvar`:**
```
recebe { identificador, entrada, taxa, simulacoes }
   ↓
monta um INSERT com 12 placeholders (?), nunca concatenando valores na string SQL
   ↓
serializa { entrada, taxa, simulacoes } inteiro como JSON.stringify(...) na coluna `resultado`
   ↓
MySQL valida as CHECK/FK/UNIQUE da tabela operacoes
   ↓
devolve resultado.insertId (o id gerado pelo AUTO_INCREMENT)
```

**Fluxo interno de `buscarPorId`:** busca a linha, e depois **"abre" o JSON da coluna
`resultado`** de volta em cima do objeto de retorno (`...resultado`), de forma que quem chamar
recebe `op.taxa.taxaFinalMes` diretamente, sem precisar navegar em `op.resultado.taxa...`.

**Segurança contra SQL Injection:** todas as consultas usam `?` (placeholder) para qualquer dado
vindo de fora — nunca `+` ou template string com valor de usuário dentro do SQL. A única
exceção deliberada é a constante `COLUNAS` em `modalidades.js` e `faixasJuros.js`, que é uma
string fixa do próprio código-fonte, nunca dado de entrada.

## 9. Rotas (`src/routes/`)

### 9.1 `src/routes/index.js` — registro central

```js
router.use('/health', healthRoutes);
router.use('/juros', jurosRoutes);
```//comentário do arquivo: "para adicionar uma nova [rota], crie o arquivo em ./routes e faça o router.use aqui."

Só duas sub-rotas estão registradas hoje: `/health` e `/juros`. `teste-exemplo.js` existe no
disco mas não está `import`ado aqui (ver observação no §5).

### 9.2 `src/routes/health.js`

`GET /api/health` — depois da D-04, este endpoint faz uma consulta real (`SELECT 1`) ao MySQL
antes de responder. Ver contrato completo em §14.

### 9.3 `src/routes/juros.js` — cálculo legado

Duas rotas, **sem relação com o banco de dados** e sem relação com o catálogo de modalidades:

- `POST /api/juros/simples` — juros simples: `montante = capital × (1 + taxa/100 × períodos)`.
- `POST /api/juros/composto` — juros compostos: `montante = capital × (1 + taxa/100) ^ períodos`.

Ambas validam que `capital`, `taxa` e `periodos` são números finitos (400 caso contrário) e
devolvem `{ tipo, capital, taxa, periodos, juros, montante, parcelas }`, onde `parcelas` vem de
`calculaParcela()` (§10).

**Isto é o motor de cálculo genérico já existente no repositório antes desta fase** — não deve
ser confundido com o motor Price/SAC/CET planejado em `backlog-api.md` (T-02 a T-06), que ainda
não existe.

### 9.4 `src/routes/teste-exemplo.js` — modelo didático, não ativo

Arquivo de referência, citado por `como-criar-endpoint.txt`, ensinando a estrutura mínima de uma
rota (`GET /exemplo`, `POST /outro`). **Não registrado em `index.js`** — copiar este arquivo
(renomeado) e registrá-lo é o passo a passo oficial para criar uma rota nova neste projeto.

## 10. `src/lib/calculaParcela.js` — função legada de parcelas

```js
export function calculaParcela(montante, periodos) {
    const parcela = montante / periodos;
    const arr = [];
    const dtInicio = new Date();
    for (let i = 0; i < periodos; i++) {
        const vencimento = new Date(dtInicio.getFullYear(), dtInicio.getMonth() + i, dtInicio.getDate());
        arr.push({ valor: +parcela.toFixed(2), vencimento: vencimento.toISOString().split('T')[0] });
    }
    return arr;
}
```

### O que faz
Divide o montante em parcelas iguais e gera uma data de vencimento por parcela, incrementando o
mês a partir de hoje.

### Por que não deve ser copiada como base para T-04
`docs/backlog-api.md` (T-04) já identifica **dois bugs conhecidos** nesta função, que **não devem
ser propagados** para o novo cronograma de amortização:

1. **Estouro de mês:** `new Date(ano, mes, dia)` não valida o dia — se o mês de destino não tiver
   aquele dia (ex.: 30 de fevereiro), o JavaScript "estoura" silenciosamente para o mês seguinte,
   dando uma data errada.
2. **Fuso horário:** o construtor usa o fuso **local**, mas `toISOString()` converte para UTC —
   no Brasil (UTC−3), isso pode fazer a data "andar" um dia para trás dependendo do horário.

O backlog é explícito: **não altere este arquivo** — a rota `/api/juros` ainda depende dele. A
correção mora em um arquivo novo (`src/lib/datas.js`, ainda não criado), usando `Date.UTC(...)`
para evitar os dois problemas.

## 11. Regras de negócio

Nesta seção, apenas regras **confirmadas em código executando ou em dados gravados no banco** —
não as regras apenas descritas em backlog e ainda não implementadas (essas estão listadas, sem
confundir, no §15).

### RN — Cálculo de juros simples e compostos (implementada em `src/routes/juros.js`)
- Simples: `juros = capital × (taxa/100) × periodos`.
- Composto: `juros = capital × [(1 + taxa/100)^periodos − 1]`.
- Onde está: `src/routes/juros.js`, linhas 6–50.
- Dados usados: `capital`, `taxa` (% já, não decimal — diferente da convenção interna de
  `backlog-api.md`), `periodos`, todos vindos do corpo da requisição.
- Erros: `400 { erro: 'Campos "capital", "taxa" e "periodos" devem ser números' }` se qualquer
  campo não for um número finito.

### RN — Taxa por modalidade e faixa de score (implementada no banco, `faixas_juros`)
- `taxa_mes = MIN(taxa_base + spread, teto)`, com spread A=0,00 / B=0,50 / C=1,00 / D=2,00 p.p.
- Faixa E (score 0–199) não tem taxa — representa recusa.
- Onde está: dados gravados por `db/seed.sql`, consultáveis via
  `buscarFaixaPorScore()` (`src/repositorios/faixasJuros.js`).
- **Esta regra já está pronta para ser consumida pela API**, mas **nenhuma rota HTTP a expõe
  ainda** — não existe `GET /api/modalidades/:codigo/faixas` nem qualquer endpoint que chame
  `buscarFaixaPorScore`.

## 12. Variáveis de ambiente

Definidas em `.env` (local, fora do git) e documentadas sem segredo em `.env.example`:

| Variável | Finalidade | Onde é usada | Obrigatória? | Exemplo |
|---|---|---|---|---|
| `DB_HOST` | Endereço do servidor MySQL | `src/db.js` | Sim | `localhost` |
| `DB_PORT` | Porta do MySQL | `src/db.js` | Sim (default 3306 se ausente) | `3306` |
| `DB_USER` | Usuário do MySQL | `src/db.js` | Sim | `root` |
| `DB_PASSWORD` | Senha do MySQL | `src/db.js` | Sim | *(não reproduzida aqui — ver `.env` local)* |
| `DB_NAME` | Nome do banco | `src/db.js` | Sim | `calculo_juros` |
| `PORT` | Porta HTTP da API | `index.js` | Não (default 3000) | `3000` |

**Cuidado de segurança:** o projeto usa o usuário `root` do MySQL local — decisão explícita e
documentada em `docs/backlog-db.md` como aceitável **só porque é um projeto acadêmico local**; não
é uma prática recomendada para produção. `.env` está listado em `.gitignore`; **nunca** commitar
esse arquivo. A senha efetivamente configurada nesta máquina não é reproduzida neste documento.

## 13. Instalação e configuração (passo a passo real, testado nesta sessão)

1. **Instalar o Node.js ≥ 20.6.** Confirme com `node -v`.
2. **Instalar o MySQL Server 8** (≥ 8.0.19) e o **MySQL Workbench**. Nesta máquina, ambos foram
   instalados via `winget install Oracle.MySQL` e `winget install Oracle.MySQLWorkbench`.
   Resultado esperado: `SELECT VERSION();` no cliente MySQL mostra 8.x.
3. **Inicializar o diretório de dados e subir o servidor** (necessário só na primeira vez, ou se
   o MySQL não estiver rodando como serviço do Windows nesta máquina):
   ```
   mysqld --initialize-insecure --datadir="<pasta-de-dados>" --basedir="<pasta-de-instalação>"
   mysqld --datadir="<pasta-de-dados>" --basedir="<pasta-de-instalação>" --port=3306
   ```
4. **Definir a senha do usuário `root`** (o `--initialize-insecure` cria o usuário sem senha):
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'sua-senha';
   ```
5. **Clonar/abrir o projeto** e rodar `npm install` (instala `express` e `mysql2`).
6. **Copiar `.env.example` para `.env`** e preencher `DB_PASSWORD` com a senha definida no passo 4.
7. **Rodar o schema:** `mysql -u root -p < db/schema.sql`. Resultado esperado: banco
   `calculo_juros` com 3 tabelas.
8. **Rodar o seed:** `mysql -u root -p < db/seed.sql`. Resultado esperado: 6 modalidades, 30
   faixas.
9. *(Opcional, só para testar consultas)* Rodar `db/exemplos-operacoes.sql` e depois
   `db/consultas.sql`.
10. **Subir a API:** `npm run dev`. Resultado esperado no terminal:
    `API rodando em http://localhost:3000`.
11. **Conferir a saúde:** `GET http://localhost:3000/api/health` deve responder `200` com
    `"banco": "ok"`.
12. *(Opcional)* Rodar `npm run db:teste` para validar os repositórios contra o banco real.

Todos os passos acima foram **executados nesta sessão de trabalho**, nesta máquina, com sucesso.

## 14. `GET /api/health`

### Método e URL
`GET /api/health`

### Objetivo
Confirmar que (a) o servidor Node.js está de pé e (b) o banco MySQL está acessível.

### Parâmetros / Body / Headers
Nenhum.

### Autenticação
Nenhuma (projeto acadêmico, sem autenticação em nenhum endpoint).

### Resposta de sucesso
```
200 OK
{ "status": "ok", "mensagem": "API está ok", "banco": "ok" }
```

### Resposta de erro
```
503 Service Unavailable
{ "status": "erro", "mensagem": "API está ok, mas o banco não respondeu", "banco": "erro" }
```

### Fluxo interno
```
Cliente → GET /api/health → src/routes/index.js → src/routes/health.js
   → pool.query('SELECT 1') em src/db.js → MySQL
   → 200 (se respondeu) ou 503 (se deu erro, com console.error do erro original)
```

### Validado nesta sessão
Testado nos dois cenários: com o MySQL rodando (`200`, `banco: "ok"`) e com o MySQL parado
(`503`, `banco: "erro"`), e novamente `200` após reiniciar o MySQL.

## 15. Endpoints planejados, ainda não implementados

Esta seção documenta o que **está especificado em `docs/backlog-api.md` mas não existe no
código hoje** — para não confundir planejamento com implementação. Nenhum destes endpoints
responde na API atual:

| Endpoint planejado | Tarefa | O que faria |
|---|---|---|
| `GET /api/modalidades` | T-01 | Listaria as 6 modalidades de crédito (hoje só existem como dados no banco, acessíveis via `listarModalidades()`) |
| `GET /api/modalidades/:codigo` | T-01 | Uma modalidade específica |
| `POST /api/operacoes` | T-07 | Receberia um pedido de crédito, calcularia a simulação completa (Price, SAC, IOF, CET) e gravaria via `operacoes.salvar()` |
| `GET /api/operacoes` | T-08 | Listagem paginada, usando `operacoes.listar()` |
| `GET /api/operacoes/:id` | T-08 | Uma operação específica, usando `operacoes.buscarPorId()` |

O banco de dados e a camada de repositórios (`src/repositorios/`) já foram construídos **prontos
para sustentar esses endpoints** quando forem implementados — essa foi justamente a entrega desta
fase do projeto (Fase 2, "Construção do Banco de Dados e das Consultas").

Também não existem ainda, no código: as funções puras de cálculo Price/SAC/cronograma/IOF/CET
(`src/lib/price.js`, `sac.js`, `datas.js`, `cronograma.js`, `encargos.js`, `cet.js`,
`demonstrativo.js`), o catálogo `src/dados/modalidades.js`, a classe `ErroDeNegocio`
(`src/lib/erros.js`) e o tratador de erros central em `src/app.js`. Todos estão detalhados,
tarefa por tarefa, em `docs/backlog-api.md`.

## 16. Segurança

- **Sem autenticação, sem autorização, sem rate limit** — decisão de escopo explícita do
  projeto (`docs/backlog.md`: "Sem testes automatizados e sem requisitos de segurança (auth,
  rate limit etc.) — projeto acadêmico").
- **Credenciais do banco:** só em `.env`, nunca no código-fonte; `.env` está no `.gitignore`.
- **SQL Injection:** todas as consultas em `src/repositorios/` usam placeholders `?`; nenhuma
  concatena dado de usuário na string SQL (ver §8.3).
- **CORS:** não há configuração de CORS em `src/app.js` — o Express, por padrão, não bloqueia
  nem libera CORS explicitamente (não há middleware `cors` instalado). Para consumo por um
  front-end em outra origem, isso precisaria ser adicionado.
- **Validação de entrada:** existe de forma pontual em `src/routes/juros.js` (checa se os campos
  são números finitos). Não há uma camada de validação central nem um formato padrão de erro
  ainda implementado (o formato padrão descrito em `backlog-api.md` — `{ erro: { codigo,
  mensagem, detalhes } }` — é só planejamento; a rota `juros.js` usa um formato mais simples,
  `{ erro: 'mensagem' }`).

### 16.1 Segurança do banco (testada nesta sessão)

Todas as defesas abaixo foram **executadas e confirmadas** contra o banco real:

| Tentativa | Erro do MySQL | Mecanismo |
|---|---|---|
| Inserir faixa para modalidade inexistente | `1452 Cannot add or update a child row: a foreign key constraint fails` | `FOREIGN KEY` |
| Inserir faixa duplicada (mesma modalidade + letra) | `1062 Duplicate entry 'VEICULOS-B'` | `UNIQUE KEY` |
| Inserir faixa com letra fora de A–E | `3819 Check constraint 'ck_faixas_letra' is violated` | `CHECK` |
| Apagar modalidade que tem faixas | `1451 Cannot delete or update a parent row` | `FOREIGN KEY` |
| Inserir operação com `identificador` repetido | `1062 Duplicate entry` | `UNIQUE KEY` |
| Inserir operação com modalidade inexistente | `1452 ... foreign key constraint fails` | `FOREIGN KEY` |
| Inserir operação com `valor = 0` | `3819 Check constraint 'ck_operacoes_valor' is violated` | `CHECK` |

## 17. APIs — referência completa (implementadas hoje)

### `GET /api/health`
Ver §14.

### `POST /api/juros/simples`
- **Body:** `{ "capital": number, "taxa": number, "periodos": number }` (taxa em %, ex. `2` = 2%)
- **200:** `{ tipo: 'simples', capital, taxa, periodos, juros, montante, parcelas: [{ valor, vencimento }, ...] }`
- **400:** `{ erro: 'Campos "capital", "taxa" e "periodos" devem ser números' }`

### `POST /api/juros/composto`
- **Body:** igual ao `/simples`.
- **200:** `{ tipo: 'composto', capital, taxa, periodos, juros, montante, parcelas: [...] }`
- **400:** igual ao `/simples`.

Nenhum dos dois endpoints acessa o banco de dados nem o catálogo de modalidades — são cálculos
genéricos independentes.

## 18. Regras de negócio ainda não implementadas (só especificação)

Documentadas em `docs/inventario-processos.md` §7 e detalhadas em `docs/backlog-api.md`:
composição de taxa (custo de captação + spread + margem − desconto), CET por Resolução CMN
4.881/2020, IOF (Decreto 6.306/2007), tarifa de cadastro condicionada a "início de
relacionamento" (STJ Tema 620), regras de vencimento com ajuste de dia útil. Nenhuma tem código
correspondente ainda — não confundir com o §11 (regras já implementadas).

## 19. Integrações externas

**Nenhuma integração externa está implementada no código atual.** O projeto de pesquisa
(`docs/research_tabela-juros-brasil_20260831.md`) usou a API pública do Banco Central (Olinda e
SGS) para **coletar os dados que viraram o seed** (`docs/bcb_taxas_juros_2026-08-11_a_2026-08-17.csv`),
mas essa coleta foi um processo manual de pesquisa, não um client HTTP dentro da aplicação. Não
há, hoje, nenhuma chamada de rede de saída no código-fonte de `src/`.

## 20. Scripts

| Script | Comando | O que faz | Confirmado nesta sessão |
|---|---|---|---|
| `start` | `npm start` → `node --env-file=.env index.js` | Sobe a API em modo normal | Sim (equivalente testado via `node --env-file=.env index.js`) |
| `dev` | `npm run dev` → `node --watch --env-file=.env index.js` | Sobe a API reiniciando a cada alteração salva | Sim |
| `test` | `npm test` → `node --test` | Rodaria os testes `*.test.js` do projeto (nenhum existe ainda) | Comando existe; **não há testes para rodar** |
| `db:teste` | `npm run db:teste` → `node --env-file=.env db/testa-repositorios.mjs` | Testa as 9 funções de `src/repositorios/` contra o banco real | **Sim — 9/9 passaram** nesta sessão |

## 21. Testes

- **Testes automatizados de código (`node --test`):** não existem arquivos `*.test.js` no
  projeto hoje. O comando `npm test` está configurado, mas não há nada para ele rodar até que
  `backlog-api.md` (T-02 em diante) seja implementado com seus respectivos `*.test.js`.
- **Teste de integração do banco (`db/testa-repositorios.mjs`):** existe, foi executado nesta
  sessão contra o banco real (schema + seed + exemplos carregados) e **passou em 9 de 9
  verificações**: listagem de modalidades, busca por código, listagem de faixas, busca de faixa
  por score (incluindo limites de faixa e a faixa de recusa), existência de identificador, busca
  de operação por id (com abertura do JSON), paginação sem repetição de id entre páginas, e
  gravação de nova operação (incluindo os casos de erro esperados: identificador duplicado e
  modalidade inexistente).
- **Testes manuais de API:** `GET /api/health` testado manualmente (200 com banco ligado, 503
  com banco desligado, 200 de novo após religar).

Não existem testes para `/api/juros/simples` e `/api/juros/composto` — nem automatizados, nem
registrados como testados manualmente neste documento (fora do escopo desta fase).

## 22. Organização — cada coisa no seu devido lugar

Avaliação da estrutura atual, sem alterar nada automaticamente:

### O que está bem organizado (não precisa mudar)
- `src/lib/` só tem funções sem efeito colateral (`calculaParcela.js`) — consistente com o
  princípio "lib não sabe o que é banco" do `backlog-api.md`.
- `src/repositorios/` concentra 100% do SQL do projeto; nenhuma rota ou outro arquivo monta SQL
  diretamente.
- `src/db.js` é o único lugar que cria conexão com o banco; todo o resto importa `{ pool }` dali.
- `.env`/`.env.example` seguem a convenção padrão (exemplo sem segredo, real fora do git).

### Pontos que merecem atenção (observação, não correção automática)

| Arquivo | Situação atual | Observação | Ação sugerida |
|---|---|---|---|
| `src/routes/teste-exemplo.js` | Existe, não é importado em `index.js` | Fica ambíguo se é "código morto" ou "modelo intencional" | Nenhuma ação necessária — é referenciado como modelo por `como-criar-endpoint.txt`; só vale considerar um comentário no topo do arquivo deixando essa intenção explícita |
| `docs/backlog-db.pdf` e `docs/pesquisa aula segunda.pdf` | PDFs no repositório, não analisados em detalhe neste documento | Fora do escopo de "código-fonte"; podem duplicar conteúdo já presente nos `.md` correspondentes | Nenhuma ação — não foi possível confirmar se são idênticos aos `.md` sem abrir o binário |
| `src/routes/juros.js` | Usa `calculaParcela.js`, que tem os dois bugs de data descritos no backlog (§10) | Já é um "legado" conhecido e documentado pela própria equipe do projeto — não corrigir sem necessidade, conforme a nota do backlog ("não altere o arquivo legado") | Nenhuma ação — comportamento intencional |

Não foram encontradas pastas fora do padrão esperado (`controllers/`, `services/`, `middlewares/`
ainda não existem porque as tarefas que os criariam — T-01 em diante — não foram implementadas;
isso é esperado, não é um problema de organização).

## 23. Duplicidades

Nenhuma duplicação de função, consulta SQL ou validação foi encontrada no código atual. O volume
de código implementado ainda é pequeno o suficiente (dois arquivos de rota "de negócio", três
repositórios, uma função de cálculo) para que isso não tenha surgido ainda. Vale reavaliar esta
seção conforme `backlog-api.md` for implementado.

## 24. Código não utilizado

- `src/routes/teste-exemplo.js` **não é código morto no sentido usual** — é um modelo didático,
  citado explicitamente por `como-criar-endpoint.txt` como o arquivo a copiar para criar rotas
  novas. Não registrar suas rotas em `index.js` é proposital.
- Não foram encontrados imports não utilizados, funções não chamadas, nem dependências do
  `package.json` sem uso (`express` e `mysql2` são ambos usados).

## 25. Mapa de dependências (estado real)

```
index.js
 └─ src/app.js
      └─ src/routes/index.js
           ├─ src/routes/health.js
           │     └─ src/db.js
           │           └─ MySQL (pool via mysql2/promise)
           └─ src/routes/juros.js
                 └─ src/lib/calculaParcela.js

db/testa-repositorios.mjs
 ├─ src/db.js
 ├─ src/repositorios/modalidades.js   → src/db.js → MySQL
 ├─ src/repositorios/faixasJuros.js   → src/db.js → MySQL
 └─ src/repositorios/operacoes.js     → src/db.js → MySQL
```

Note que **`src/repositorios/*` ainda não é chamado por nenhuma rota HTTP** — hoje só o script de
teste (`db/testa-repositorios.mjs`) os utiliza. Eles ficarão "conectados" ao restante da árvore
quando `POST /api/operacoes` e `GET /api/modalidades` forem implementados (T-01/T-07 do
`backlog-api.md`), passando a pendurar embaixo de `src/routes/`.

## 26. Como adicionar novas funcionalidades

### Uma rota HTTP simples (sem banco)
```
1. Copie src/routes/teste-exemplo.js para um novo arquivo em src/routes/.
2. Ajuste os métodos e caminhos.
3. Importe o arquivo em src/routes/index.js e registre com router.use('/caminho', suaRota).
4. Teste em http://localhost:3000/api/<caminho>/<endpoint>.
```
(Este é, literalmente, o procedimento descrito em `como-criar-endpoint.txt`.)

### Uma funcionalidade que precisa do banco
```
1. Se precisar de uma tabela/coluna nova: altere db/schema.sql (mantendo IDEMPOTÊNCIA — 
   CREATE TABLE IF NOT EXISTS, ALTER TABLE com checagem) e, se precisar de dado inicial, 
   db/seed.sql.
2. Rode o schema/seed num banco de teste e confira com as consultas de db/consultas.sql 
   (ou novas consultas, seguindo o mesmo padrão comentado).
3. Adicione a função de acesso em src/repositorios/<entidade>.js — sempre com placeholders `?`, 
   sempre traduzindo snake_case → camelCase dentro do repositório.
4. Se o repositório for novo, adicione testes em db/testa-repositorios.mjs (ou um script 
   próprio) e rode `npm run db:teste`.
5. Crie a rota em src/routes/, chamando o repositório — nunca SQL diretamente na rota.
6. Registre a rota em src/routes/index.js.
7. Atualize este documento (as seções de banco, API e regras de negócio relevantes).
```

## 27. Manutenção — onde mexer

| Preciso... | Vou mexer em |
|---|---|
| ...corrigir um cálculo de juros simples/composto | `src/routes/juros.js` |
| ...corrigir um bug de data (cronograma) | Não em `src/lib/calculaParcela.js` (legado, não mexer) — crie `src/lib/datas.js` novo, conforme T-04 do `backlog-api.md` |
| ...adicionar uma consulta nova ao banco | Escreva e teste primeiro em `db/consultas.sql`, depois "embrulhe" em `src/repositorios/` |
| ...adicionar um endpoint novo | `src/routes/` + registro em `src/routes/index.js` |
| ...alterar uma taxa de juros de uma modalidade | `db/seed.sql` (e `docs/backlog-db.md`, Anexo A, para manter a rastreabilidade da origem do número) |
| ...alterar a estrutura de uma tabela | `db/schema.sql`, mantendo compatível com `CREATE TABLE IF NOT EXISTS` |
| ...alterar credenciais do banco | `.env` (nunca em código, nunca commitado) |
| ...adicionar validação de entrada | Na rota, antes de chamar o repositório/serviço (não existe ainda uma camada central de validação) |
| ...adicionar teste do banco | `db/testa-repositorios.mjs` |

## 28. Solução de problemas (troubleshooting)

| Sintoma | Causa provável | Solução |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL não está rodando, ou está em outra porta | Confirme o processo `mysqld` rodando; confira `DB_PORT` no `.env` |
| `ER_ACCESS_DENIED_ERROR` | Senha errada em `.env` | Confira `DB_PASSWORD`; teste a senha direto com `mysql -u root -p` |
| `ER_BAD_DB_ERROR` | O banco `calculo_juros` não foi criado | Rode `db/schema.sql` |
| `GET /api/health` devolve 503 | Banco inacessível (verifique a mensagem de erro no console do Node, registrada via `console.error`) | Suba o MySQL; confira `.env` |
| `node: .env: not found` | Falta o arquivo `.env` (só existe `.env.example`) | Copie `.env.example` para `.env` e preencha |
| `Cannot find module 'mysql2/promise'` | `npm install` não foi rodado, ou `mysql2` não está no `package.json` desta cópia | `npm install mysql2` |
| Erro de sintaxe `... near 'AS novo'` ao rodar `seed.sql` | MySQL abaixo da versão 8.0.19 | Atualize o MySQL, ou troque a sintaxe por `ON DUPLICATE KEY UPDATE coluna = VALUES(coluna)` |
| `1452 foreign key constraint fails` ao inserir faixa/operação | `modalidade_codigo` não existe em `modalidades` | Confira o código digitado; rode `SELECT codigo FROM modalidades` para ver os válidos |
| `1062 Duplicate entry` | Está tentando inserir uma chave (PK/UNIQUE) que já existe | Normal se rodou o script duas vezes sem `ON DUPLICATE KEY UPDATE`, ou se o identificador realmente já existe |
| `3819 Check constraint ... is violated` | Um valor não passou numa regra `CHECK` (ex.: faixa fora de A–E, valor ≤ 0) | Corrija o valor enviado |
| Porta 3000 já em uso | Outro processo Node (ou outra instância da API) já está rodando | Finalize o processo anterior, ou mude `PORT` no `.env` |

## 29. Problemas encontrados (análise de código)

Nenhum problema de segurança grave foi encontrado nas partes efetivamente implementadas
(SQL Injection: mitigado consistentemente com placeholders; credenciais: fora do código e do
git). Os pontos abaixo são observações, não bugs:

- **`src/routes/juros.js` não usa o banco de dados nem o catálogo de modalidades** — funciona de
  forma completamente independente da Fase 2. Isso não é um erro, mas é importante que quem for
  implementar `POST /api/operacoes` não assuma, por engano, que `juros.js` já resolve parte do
  problema — ele resolve um problema mais simples (juros genéricos, sem faixas de score, sem
  cronograma real, sem IOF/CET).
- **Ausência de CORS** — se o front-end vier a rodar em outra origem (porta/domínio diferente),
  as requisições serão bloqueadas pelo navegador até que um middleware de CORS seja adicionado.
  Não é um problema hoje (não há front-end no repositório), mas é um ponto de atenção futuro.
- **Sem testes para as rotas de `juros.js`** — não há como garantir automaticamente que futuras
  alterações não quebrem esse cálculo.

## 30. Melhorias recomendadas (não aplicadas automaticamente)

Estas são recomendações — nenhuma foi aplicada ao código sem autorização, conforme solicitado:

1. **Implementar o tratador de erros central e a classe `ErroDeNegocio`** (T-01 do
   `backlog-api.md`) antes de adicionar novos endpoints — padroniza o formato de erro em toda a
   API, hoje inconsistente entre o que `juros.js` faz (`{ erro: 'string' }`) e o formato-alvo
   documentado (`{ erro: { codigo, mensagem, detalhes } }`).
2. **Adicionar testes automatizados** (`*.test.js`) mesmo para o código já existente
   (`calculaParcela`, `/api/juros/*`), já que o projeto já tem a infraestrutura (`node --test`)
   configurada e não utilizada.
3. **Formalizar a intenção de `teste-exemplo.js`** com um comentário no topo do arquivo
   explicando que é um modelo e não uma rota ativa — evita que uma futura limpeza de "código não
   utilizado" o remova por engano.
4. Ao implementar `POST /api/operacoes`, **reaproveitar diretamente os repositórios já criados e
   testados** (`src/repositorios/operacoes.js`, `modalidades.js`, `faixasJuros.js`) em vez de
   escrever SQL novo — eles já cobrem exatamente as consultas necessárias (Q1–Q9) e já têm 9
   verificações passando em `db/testa-repositorios.mjs`.

---

# RESUMO DA ANÁLISE

- **Arquitetura encontrada:** Express modular simples (`routes` → `lib`/`repositorios` → banco),
  sem framework de DI, sem ORM, sem TypeScript. Consistente com um projeto acadêmico em estágio
  inicial de implementação da API, mas com o **banco de dados completo e testado**.
- **Tecnologias encontradas:** Node.js ≥ 20.6, Express 5, MySQL 8 (8.4.9 nesta máquina), driver
  `mysql2`, ES Modules.
- **Módulos/arquivos de código-fonte:** 2 rotas de negócio ativas (`health`, `juros`) + 1 rota
  modelo não ativa; 1 função de cálculo (`calculaParcela`); 1 conexão de banco (`db.js`); 3
  repositórios (`modalidades`, `faixasJuros`, `operacoes`); 6 arquivos SQL/JS de banco em `db/`.
- **Principais componentes:** o **banco `calculo_juros`** (3 tabelas, 6 modalidades, 30 faixas de
  juros, todas as constraints validadas) é hoje o componente mais completo e testado do projeto —
  mais completo, inclusive, que a própria API HTTP de simulação de crédito, que ainda não foi
  implementada.
- **Principais fluxos confirmados:** `GET /api/health` (com checagem real do banco);
  `POST /api/juros/simples` e `/composto` (cálculo genérico); o fluxo completo de
  `db/testa-repositorios.mjs` contra o banco real (9/9 testes).
- **Pontos positivos da organização:** separação clara de responsabilidades no pouco código que
  existe; disciplina real (não só declarada) de usar placeholders SQL; documentação de
  planejamento (`backlog-api.md`, `backlog-db.md`) excepcionalmente detalhada e usada de fato
  como "contrato" ao construir os arquivos desta fase.
- **Problemas encontrados:** nenhum problema de segurança ou de integridade nas partes
  implementadas. As únicas lacunas são de **escopo ainda não implementado** (API de simulação
  completa), não de qualidade do que já existe.
- **Riscos:** o maior risco não é técnico, é de **expectativa** — é fácil, lendo só
  `docs/backlog-api.md`, achar que a API de simulação (Price/SAC/CET) já existe. Este documento
  existe em parte para deixar claro, a qualquer momento, exatamente onde a fronteira entre
  "implementado" e "planejado" está.
- **Pontos que precisam de atenção:** ausência de testes automatizados para o código HTTP já
  existente; ausência de CORS; `.env` local usa a senha `root` padrão do projeto acadêmico (não
  reproduzida aqui), adequada apenas a ambiente local de desenvolvimento.
- **Melhorias recomendadas:** ver §30.
- **Arquivos que merecem revisão futura:** `src/routes/juros.js` (quando/se for aposentado em
  favor do motor Price/SAC completo) e `src/lib/calculaParcela.js` (mantê-lo isolado do novo
  código de datas, para não reintroduzir os bugs conhecidos).
- **Estrutura atual:** organizada e consistente com o que está implementado; não há necessidade
  de reorganização — apenas de continuar preenchendo as pastas já previstas
  (`src/dados/`, `src/servicos/`, `src/lib/price.js` etc.) conforme `backlog-api.md` avançar.

## Conclusão

A Fase 2 do projeto — construção do banco de dados e das consultas — está **completa e validada
nesta sessão**: MySQL 8.4.9 instalado e rodando, banco `calculo_juros` criado com as 3 tabelas
especificadas, 6 modalidades e 30 faixas de juros carregadas e conferidas, 11 consultas de uso
testadas, a conexão Node.js↔MySQL funcionando com `/api/health` refletindo o estado real do
banco, e os 3 repositórios JavaScript testados com 9/9 verificações passando. A API de simulação
de crédito completa (Price, SAC, IOF, CET, endpoints de modalidades e operações) continua sendo
trabalho futuro, já detalhadamente especificado em `docs/backlog-api.md`, mas **não** parte do
código atual — e este documento foi escrito para que essa distinção nunca fique ambígua.
