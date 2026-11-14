# Guia de Estudo do Código: API de Simulação de Crédito (calculo-juros)

> Fonte do PDF `docs/guia-de-estudo-do-codigo.pdf` (13 de novembro de 2026, commit 328e88b (26/10/2026)).

## 1. Visão geral do sistema

### 1.1 O que o sistema faz

O projeto é uma **API HTTP de simulação de crédito**. Não tem tela: quem usa é outro programa (Postman, um front-end, o sistema de outro grupo), mandando e recebendo JSON. A API faz, em ordem:

1. **Recebe um pedido de simulação** (`POST /api/operacoes`) com cliente, valor, modalidade de crédito, score, prazo em meses e data de liberação.
2. **Valida tudo** e, se houver qualquer problema, devolve `400` com a lista completa de erros.
3. **Descobre a taxa de juros** pela modalidade e pela faixa de score (A, B, C, D ou E), lendo a tabela `faixas_juros` no MySQL. Score na faixa E é recusado (`422`).
4. **Simula a operação nos dois sistemas de amortização**, Price e SAC: parcelas, cronograma com datas reais de vencimento, encargos (IOF e tarifa de cadastro), valor liberado, CET (Custo Efetivo Total) e demonstrativo.
5. **Grava a operação** na tabela `operacoes` com estado `SIMULADA` e devolve `201` com tudo calculado.
6. Mais tarde, outro grupo **define o sistema escolhido** (`POST /api/operacoes/:id/definicao` com `PRICE` ou `SAC`). A operação passa a `DEFINIDA` e essa escolha nunca muda.
7. A equipe de contrato lê o **consolidado** (`GET /api/operacoes/:id/consolidado`): um documento com só o sistema escolhido, pronto para virar contrato.

Além disso existem endpoints de apoio: saúde da API (`/api/health`), catálogo de modalidades (`/api/modalidades`), listagem paginada de operações, documentação Swagger (`/api/docs`) e duas rotas antigas de juros simples e compostos (`/api/juros/simples` e `/api/juros/composto`).

### 1.2 Tecnologias

| Tecnologia | Versão | Papel no projeto |
|---|---|---|
| Node.js | 20.6 ou superior (o projeto roda com 22) | Executa o JavaScript no servidor |
| Express | 5.x | Framework HTTP: rotas, middlewares, tratamento de erros |
| mysql2 | 3.x | Driver de acesso ao MySQL, usado no modo `promise` |
| swagger-ui-express | 5.x | Página de documentação interativa em `/api/docs` |
| MySQL | 8 | Banco de dados relacional (3 tabelas) |
| node:test e node:assert | embutidos no Node | Testes automatizados, sem biblioteca externa |

Não há TypeScript, não há ORM (as consultas SQL são escritas à mão nos repositórios) e não há autenticação.

### 1.3 Como rodar

```bash
npm install            # instala as dependências listadas no package.json
cp .env.example .env   # configura DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, PORT, FINOPS_URL
npm run schema         # cria o banco calculo_juros e as 3 tabelas (db/schema.sql)
npm run seed           # carrega 6 modalidades + 30 faixas de juros (db/seed.sql)
npm run dev            # sobe a API com --watch (reinicia ao salvar um arquivo)
```

Com a API no ar: `GET http://localhost:3000/api/health` deve responder `200` e `http://localhost:3000/api/docs` abre o Swagger.

| Script (`npm run ...`) | O que faz |
|---|---|
| `start` | `node --env-file=.env index.js`: sobe a API lendo o `.env` |
| `dev` | Igual ao `start`, mas com `--watch` (reinicia sozinho ao salvar) |
| `test` | `node --test`: roda os 84 testes unitários (não precisa de banco) |
| `verifica` | Teste ponta a ponta de todos os endpoints contra o MySQL real |
| `schema` | Executa `db/schema.sql` (cria banco e tabelas, pode repetir sem erro) |
| `seed` | Executa `db/seed.sql` (carga inicial, pode repetir sem erro) |
| `reset` | Apaga o banco e roda schema + seed do zero (perde as operações gravadas) |

### 1.4 Mapa do repositório

```text
index.js                  ponto de entrada: sobe o servidor na porta PORT
src/app.js                cria o app Express, registra middlewares, rotas e o tratador de erros
src/db.js                 pool de conexões MySQL (mysql2/promise)
src/openapi.js            especificação OpenAPI 3 escrita à mão (alimenta o Swagger)
src/routes/               camada HTTP: uma rota por recurso
  index.js                registro central (health, juros, modalidades, operacoes, docs)
  health.js               GET /api/health
  juros.js                rotas legadas: juros simples, compostos e faixas
  modalidades.js          GET /api/modalidades e /api/modalidades/:codigo
  operacoes.js            POST/GET operações, definição e consolidado
  teste-exemplo.js        arquivo didático, não registrado (serve de modelo)
src/servicos/             orquestração e regras que dependem de dados do banco
  validaEntrada.js        valida o corpo do POST e devolve a entrada normalizada
  taxa.js                 score + modalidade -> faixa e taxa (lê faixas_juros)
  simulacao.js            junta Price, SAC, cronograma, encargos, CET e demonstrativo
  definicao.js            regras da escolha PRICE/SAC (estados SIMULADA/DEFINIDA)
  consolidado.js          monta o documento consolidado da operação definida
  bancoFalso.js           cópia do seed em memória, usada só pelos testes
src/lib/                  funções PURAS de cálculo e utilidades (sem HTTP, sem banco)
  price.js, sac.js        sistemas de amortização
  cronograma.js, datas.js datas de vencimento, dia útil, dias corridos
  encargos.js             IOF diário, IOF adicional e tarifa de cadastro
  cet.js                  Custo Efetivo Total por bisseção
  demonstrativo.js        composição do custo total (art. 7º da Res. CMN 4.881)
  documento.js            validação de CPF e CNPJ (módulo 11)
  erros.js                classe ErroDeNegocio (status HTTP + código)
  util.js                 arredonda2 (2 casas decimais)
  api.js                  cliente HTTP para a API FinOps (fetch)
  calculaParcela.js       função legada usada pelas rotas de juros simples/compostos
src/repositorios/         única camada que fala SQL (tradução snake_case -> camelCase)
  modalidades.js, faixasJuros.js, operacoes.js
src/dados/
  parametros.js           alíquotas de IOF e tarifa de cadastro
  score.js                função legada score -> letra da faixa (rota /api/juros/faixas)
db/                       schema.sql, seed.sql, reset.sql e os scripts Node que os executam
scripts/verifica-endpoints.mjs   teste ponta a ponta (npm run verifica)
docs/                     backlogs, pesquisa de taxas, documentação de apoio
```

## 2. Fundamentos de JavaScript e Node.js usados no projeto

Este capítulo explica, do zero, cada recurso da linguagem que aparece no código. Os exemplos são trechos reais do projeto.

### 2.1 Módulos ES: `import` e `export`

Cada arquivo `.js` é um **módulo**: o que ele define fica privado, a não ser que seja exportado. O `package.json` tem `"type": "module"`, o que diz ao Node para interpretar os arquivos como **ES Modules** (sintaxe `import`/`export`) em vez do formato antigo CommonJS (`require`/`module.exports`).

```js
// src/lib/util.js — exportação NOMEADA (pode haver várias por arquivo)
export function arredonda2(x) { /* ... */ }

// src/servicos/simulacao.js — importa pelo mesmo nome, entre chaves
import { arredonda2 } from '../lib/util.js';

// src/app.js — exportação PADRÃO (uma por arquivo)
export default app;

// index.js — importa o padrão com o nome que quiser, sem chaves
import app from './src/app.js';

// src/routes/operacoes.js — importa TUDO de um módulo em um objeto
import * as repositorio from '../repositorios/operacoes.js';
repositorio.buscarPorId(id);
```

Regras que vale memorizar:

- Em ES Modules o caminho precisa da extensão `.js` e começa com `./` ou `../` quando é um arquivo do projeto. Sem prefixo (`'express'`, `'node:test'`) é um pacote do `node_modules` ou um módulo do próprio Node.
- Os `import` são resolvidos antes de qualquer código rodar (são "içados" para o topo).
- `import * as repositorio` cria um objeto cujas propriedades são as exportações nomeadas. A rota usa isso para deixar claro de onde vem cada função (`repositorio.salvar`, `repositorioModalidades.buscarModalidade`).

### 2.2 Variáveis: `const` e `let`

- `const` cria uma variável que **não pode ser reatribuída**. É o padrão do projeto. Atenção: o conteúdo de um objeto ou array em `const` ainda pode mudar (`parcelas.push(...)` funciona, `parcelas = []` não).
- `let` cria uma variável que pode ser reatribuída. Aparece onde o valor muda em um laço: `let saldo = valor;` em `price.js`, `let lo = 0; let hi = 10;` em `cet.js`.
- `var` não é usado. Ele tem escopo de função (não de bloco) e permite redeclaração, o que gera bugs.

```js
let saldo = valor;                 // vai diminuir a cada parcela
for (let k = 1; k <= prazoMeses; k++) {
  const juros = arredonda2(saldo * taxaMes);   // novo "const" a cada volta do laço
  saldo = arredonda2(saldo - amortizacao);     // reatribuição: só funciona porque é let
}
```

### 2.3 Funções: declaração, arrow function e parâmetros padrão

```js
// Declaração clássica (tem nome, é "içada": pode ser chamada antes da linha onde está)
function leId(valor) { /* ... */ }

// Arrow function guardada em uma constante (forma curta; não é içada)
const ausente = (v) => v === undefined || v === null;

// Arrow function de uma linha devolve a expressão sem precisar de "return"
const componente = (descricao, v) => ({ descricao, valor: v });  // parênteses: devolve um objeto

// Parâmetro padrão: se o chamador não passar, usa o valor da direita
export async function validaEntrada(body, repositorio = repositorioModalidades) { /* ... */ }
```

Diferenças que um professor costuma cobrar:

- Arrow functions **não têm `this` próprio** nem `arguments`; herdam o `this` do lugar onde foram escritas. Em callbacks de array (`.map((f) => ...)`) e em rotas Express isso é o comportamento desejado.
- Uma declaração `function` é içada (hoisting); uma `const f = () => {}` só existe depois da linha em que foi criada.
- O parâmetro padrão `repositorio = repositorioModalidades` é o truque que permite **injeção de dependência**: a API chama `validaEntrada(req.body)` e usa o banco real; os testes chamam `validaEntrada(corpo, repositorioModalidadesFalso)` e usam um banco em memória (ver §4.3).

### 2.4 Template strings

Strings entre crases (`` ` ``) aceitam interpolação com `${expressão}` e quebras de linha:

```js
console.log(`API rodando em http://localhost:${PORT}`);
erros.push(`identificador deve ter no máximo ${IDENTIFICADOR_MAX} caracteres`);
const apiUrl = `${process.env.FINOPS_URL}/${endpoint}`;
```

O projeto também monta SQL com template strings, mas **nunca** coloca dados do usuário dentro delas (só nomes fixos de colunas); os dados vão por placeholders `?` (ver §5.6).

### 2.5 Desestruturação

Desestruturar é "desmontar" um objeto ou array em variáveis com uma única instrução.

```js
// Objeto: cria as variáveis capital, taxa e periodos a partir das propriedades de mesmo nome
const { capital, taxa, periodos } = req.body ?? {};

// Com renomeação (sistema: _sistema) e com "rest" (...resumo = tudo o que sobrou)
const { sistema: _sistema, encargos, valorLiberado, cet, demonstrativo, cronograma, ...resumo } = simulacao;

// Array: pega posições. mysql2 devolve [linhas, campos]; só queremos as linhas
const [linhas] = await pool.query('SELECT ...');

// Aninhada: [[{ total }]] = primeiro elemento do array de linhas, depois a propriedade total
const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM operacoes');

// Em parâmetros de função: a função recebe UM objeto e já o desmonta
export function calculaPrice({ valor, taxaMes, prazoMeses }) { /* ... */ }

// Com valor padrão quando a propriedade não existe
export function abreConexao({ comBanco = true } = {}) { /* ... */ }
```

O `= {}` no final de `abreConexao` cobre o caso de chamar `abreConexao()` sem argumento nenhum: sem ele, desestruturar `undefined` lançaria erro.

### 2.6 Spread e rest (`...`)

O mesmo símbolo tem dois papéis:

- **Spread** (espalhar): copia os elementos de um array ou as propriedades de um objeto para dentro de outro.
- **Rest** (o resto): em desestruturação ou parâmetros, junta "tudo o que sobrou".

```js
// Spread em objeto: cópia rasa da parcela + dois campos novos (a parcela original não muda)
return { ...parcela, vencimento, diasCorridos };

// Spread em array: concatena as faixas de cada modalidade em um único array
export const FAIXAS_SEED = [...faixasDe('CREDITO_PESSOAL', {...}), ...faixasDe('CONSIGNADO_INSS', {...})];

// Spread para passar argumentos: parametros = ['VEICULOS', 'B'] vira dois argumentos separados
erros.push(...resultadoCliente.erros);

// Rest em desestruturação: separa "parcelas" e guarda o restante em "resumo"
const { parcelas, ...resumo } = resultado;   // resumo = { sistema, parcelaFixa, totalJuros, totalPago }

// Spread com sobrescrita: o que vem DEPOIS vence
function corpoValido(sobrescreve = {}) {
  return { identificador: 'OP-2026-0001', valor: 10000, ...sobrescreve };
}
```

A cópia feita por spread é **rasa**: objetos aninhados continuam sendo os mesmos. Para cópia profunda o projeto usa `structuredClone` (§2.11).

### 2.7 Os operadores `??` e `?.`

- `a ?? b` (coalescência nula) devolve `a`, a não ser que `a` seja `null` ou `undefined`; nesse caso devolve `b`. É diferente de `||`, que também troca `0`, `''` e `false`.
- `obj?.prop` (encadeamento opcional) devolve `undefined` em vez de lançar erro quando `obj` é `null` ou `undefined`.

```js
const PORT = Number(process.env.PORT ?? 3000);     // PORT não definida -> 3000
const dados = body ?? {};                          // corpo ausente -> objeto vazio
const sistema = req.body?.sistema;                 // req.body pode ser undefined
`já está definida como ${operacao.definicao?.sistema}`
const [taxaMes, taxaAno] = taxas[faixa] ?? [null, null];
```

Por que `??` e não `||` para a porta? Com `||`, a porta `0` seria trocada por 3000. Com `??`, só a ausência do valor é tratada.

### 2.8 Tipos, `typeof`, conversões e `NaN`

JavaScript tem tipos primitivos (`number`, `string`, `boolean`, `undefined`, `null`, `bigint`, `symbol`) e objetos (arrays, funções, datas também são objetos). O operador `typeof` devolve o nome do tipo como texto.

```js
typeof 10          // 'number'
typeof 'PF'        // 'string'
typeof true        // 'boolean'
typeof undefined   // 'undefined'
typeof null        // 'object'   <- pegadinha histórica da linguagem
typeof []          // 'object'   <- por isso existe Array.isArray
typeof (() => 1)   // 'function'
```

O projeto valida tipos antes de calcular, porque JSON permite mandar `"valor": "mil"`:

```js
if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) { /* erro */ }
if (!Number.isInteger(score) || score < 0 || score > 1000) { /* erro */ }
if (typeof cliente !== 'object' || Array.isArray(cliente)) { /* erro */ }
```

- `Number.isFinite(x)` é `true` só para números reais finitos: barra `NaN`, `Infinity` e strings. `Number.isInteger(x)` ainda exige que não tenha parte decimal (`650.5` falha).
- `NaN` ("not a number") é o resultado de contas impossíveis. `NaN !== NaN`; por isso se usa `Number.isNaN`.
- Conversão explícita: `Number('2')` é `2`, `Number('')` é `0` e `Number('abc')` é `NaN`. A query string chega **sempre como texto**, então a rota faz `Number(req.query.pagina)` e depois valida com `Number.isInteger`.
- `String(x)` converte para texto; `Boolean(x)` para verdadeiro/falso.
- Comparação: use sempre `===` e `!==` (estritos, sem conversão automática). O projeto nunca usa `==`.
- `10_000_000` é apenas `10000000` com separadores visuais (permitido desde o ES2021).

### 2.9 Ponto flutuante e `arredonda2`

Números em JavaScript são `double` de 64 bits. Nem todo decimal tem representação exata:

```js
0.1 + 0.2            // 0.30000000000000004
Math.round(1.005 * 100) / 100   // 1    (esperava-se 1.01: 1.005 é guardado como 1.00499999...)
```

Por isso toda conta em reais passa por uma única função:

```js
// src/lib/util.js
export function arredonda2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
```

`Number.EPSILON` é a menor diferença representável entre 1 e o próximo número (cerca de 2,2 × 10⁻¹⁶). Somá-lo antes de multiplicar por 100 empurra casos como 1.005 para o lado certo. A regra do projeto é arredondar **cada parcela** a 2 casas e somar os totais a partir dos valores já arredondados, para o extrato fechar centavo a centavo.

Outros detalhes numéricos usados:

- `**` é o operador de potência: `(1 + taxaMes) ** -prazoMeses`.
- `toFixed(2)` devolve **string** (`'945.60'`); por isso a rota legada faz `Number((montante - capital).toFixed(2))` e `calculaParcela.js` usa o `+` unário (`+parcela.toFixed(2)`) para voltar a número.
- `Math.min`, `Math.max`, `Math.ceil` (teto, usado em `totalPaginas`), `Math.round`.

### 2.10 Arrays: `map`, `filter`, `find`, `reduce`, `every`, `includes` e `for...of`

Métodos de array recebem uma função (callback) e a aplicam a cada elemento. Nenhum deles altera o array original (exceto `push`).

```js
// map: transforma cada elemento e devolve um array NOVO do mesmo tamanho
return linhas.map(linhaParaFaixa);
return parcelas.map((parcela) => ({ ...parcela, vencimento, diasCorridos }));

// filter: mantém só os elementos em que o callback devolve true
MODALIDADES_SEED.filter((m) => m.ativo);

// find: devolve o PRIMEIRO elemento que satisfaz (ou undefined)
const faixa = faixas.find((f) => score >= f.scoreMin && score <= f.scoreMax);

// reduce: acumula um valor único; o 0 é o valor inicial do acumulador
const totalJuros = arredonda2(parcelas.reduce((soma, p) => soma + p.juros, 0));

// every: true se TODOS satisfazem; some: true se ALGUM satisfaz
[capital, taxa, periodos].every((v) => typeof v === 'number' && Number.isFinite(v));
digitos.every((d) => d === digitos[0]);

// includes: o array contém o valor?
if (!SISTEMAS.includes(sistema)) { /* 400 */ }

// for...of: percorre os VALORES (for...in percorreria as chaves, não é usado)
for (const parcela of cronograma) { somaDiario += parcela.amortizacao * IOF_ALIQUOTA_DIARIA * dias; }

// for clássico quando se precisa do índice ou do contador
for (let k = 1; k <= prazoMeses; k++) { /* ... */ }

// Outros usados: push (acrescenta no fim), slice (fatia, sem alterar), join (vira texto),
// split (texto vira array), Array.isArray, length
```

Um truque recorrente: `for (const calculaParcelas of [calculaPrice, calculaSac])` em `simulacao.js` percorre um **array de funções** e chama cada uma. Funções em JavaScript são valores como qualquer outro (funções de primeira classe).

### 2.11 Objetos, `Object.keys`, `Object.hasOwn`, JSON e `structuredClone`

```js
// Literal de objeto; "shorthand": { valor } é o mesmo que { valor: valor }
return { sistema: 'PRICE', parcelaFixa, parcelas, totalJuros, totalPago };

// Chave calculada: o nome da propriedade vem de uma variável
simulacoes[resultado.sistema] = { ... };     // simulacoes.PRICE e simulacoes.SAC

// Object.keys: array com os nomes das propriedades
export const TIPOS_PESSOA = Object.keys(TIPOS);  // ['PF', 'PJ']

// Object.hasOwn: a propriedade existe NO PRÓPRIO objeto (não herdada do protótipo)?
Object.hasOwn(TIPOS, tipoPessoa)   // 'constructor' e 'toString' dão false; "in" daria true

// JSON: objeto -> texto (para gravar na coluna JSON) e texto -> objeto
JSON.stringify({ cliente, entrada, taxa, simulacoes });
JSON.parse(linha.resultado);

// Cópia PROFUNDA (os testes usam para provar que a função não alterou a entrada)
const copia = structuredClone(entrada);
```

Por que `Object.hasOwn` e não `TIPOS[tipoPessoa]`? Todo objeto herda propriedades como `constructor` e `toString`. Se alguém mandasse `"tipoPessoa": "constructor"`, `TIPOS['constructor']` existiria (é uma função herdada) e passaria a validação. `Object.hasOwn` olha só as chaves próprias `PF` e `PJ`.

### 2.12 Strings e expressões regulares

```js
identificador.trim()                 // remove espaços das pontas
String(mes).padStart(2, '0')         // '7' -> '07'
'2026-10-30'.split('-')              // ['2026', '10', '30']
data.toISOString().slice(0, 10)      // '2026-10-30T00:00:00.000Z' -> '2026-10-30'
texto.replace(/[.\-/ ]/g, '')        // tira ponto, hífen, barra e espaço (g = todas as ocorrências)
'A'.repeat(60)                       // 60 letras A
```

Expressões regulares (regex) descrevem padrões de texto. As do projeto:

| Regex | Significado | Onde |
|---|---|---|
| `/^\d{4}-\d{2}-\d{2}$/` | exatamente 4 dígitos, hífen, 2 dígitos, hífen, 2 dígitos | `ehDataValida` |
| `/^[0-9]{11}$/` | exatamente 11 dígitos | `ehCpfValido` |
| `/^[0-9]{14}$/` | exatamente 14 dígitos | `ehCnpjValido` |
| `/^[0-9]+$/` | um ou mais dígitos, nada além disso | `limpaDocumento` |
| `/[.\-/ ]/g` | qualquer um dos 4 caracteres de máscara, todas as ocorrências | `limpaDocumento` |

`^` e `$` ancoram no início e no fim (sem eles, `'x2026-10-30y'` passaria). `\d` é dígito, `{n}` é "exatamente n vezes", `+` é "uma ou mais". `.test(texto)` devolve `true`/`false`.

### 2.13 Datas (`Date`)

O objeto `Date` guarda um instante em milissegundos desde 1º de janeiro de 1970 (UTC). Armadilhas que o projeto enfrenta de propósito:

- **Mês começa em 0**: janeiro é `0`, dezembro é `11`. Por isso `Date.UTC(ano, mes - 1, dia)`.
- **Dia da semana**: `getUTCDay()` devolve 0 para domingo e 6 para sábado.
- **Fuso horário**: `toISOString()` sempre devolve a data em UTC. No Brasil (UTC−3), às 22h de hoje já é "amanhã" em UTC. Por isso `hojeIso()` em `validaEntrada.js` monta a data com `getFullYear`/`getMonth`/`getDate` (horário local), enquanto `datas.js` trabalha **só em UTC** (`Date.UTC`, `getUTC...`) para não sofrer com horário de verão.
- **Transbordo automático**: `Date.UTC(2026, 12, 1)` (mês 12 não existe) vira `2027-01-01`. O projeto usa isso a favor em `adicionaMeses`.
- **Dia 0** é "o último dia do mês anterior": `new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()` dá quantos dias tem o mês `mes`.

```js
// src/lib/datas.js
function paraData(iso) {                 // 'AAAA-MM-DD' -> Date (meia-noite UTC)
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}
export function adicionaMeses(iso, meses) {
  const base = paraData(iso);
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;              // pode passar de 11: Date.UTC ajusta
  const dia = base.getUTCDate();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return paraIso(new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes))));
}
export function diasEntre(isoInicio, isoFim) {
  return Math.round((paraData(isoFim) - paraData(isoInicio)) / DIA_EM_MS);  // Date - Date = ms
}
```

Subtrair duas datas devolve a diferença em milissegundos; dividir por `24 * 60 * 60 * 1000` dá dias.

### 2.14 Classes, herança de `Error` e `instanceof`

```js
// src/lib/erros.js
export class ErroDeNegocio extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);          // chama o construtor de Error: define .message e .stack
    this.status = status;     // ex.: 404, 400, 422
    this.codigo = codigo;     // ex.: 'MODALIDADE_NAO_ENCONTRADA'
    this.detalhes = detalhes; // opcional: lista de strings
  }
}

// uso
throw new ErroDeNegocio(404, 'OPERACAO_NAO_ENCONTRADA', `Operação ${id} não encontrada`);

// no tratador de erros do app.js
if (err instanceof ErroDeNegocio) { /* resposta no formato padrão com err.status */ }
```

- `class` define um molde; `new` cria uma instância; `constructor` roda na criação; `this` é a instância.
- `extends Error` faz a classe **herdar** de `Error`: ganha `message`, `stack` e pode ser lançada com `throw`. Em uma subclasse, `super(...)` tem de ser chamado antes de usar `this`.
- `instanceof` pergunta "este objeto foi criado a partir desta classe (ou de uma filha)?". É assim que o tratador distingue erro de negócio (esperado, vira 400/404/409/422) de bug (inesperado, vira 500).
- `throw` interrompe a função na hora e sobe pela pilha de chamadas até achar um `catch`.

### 2.15 Código assíncrono: `Promise`, `async`/`await`, `try`/`catch`/`finally`

Consultar o banco ou chamar outra API demora. Node não fica parado esperando: a função devolve uma **Promise** ("promessa" de um valor futuro) e o programa segue. `await` pausa **só aquela função** até a promessa resolver, sem travar o servidor.

```js
// async marca a função como assíncrona: ela SEMPRE devolve uma Promise
export async function buscarModalidade(codigo) {
  const [linhas] = await pool.query('SELECT ... WHERE codigo = ?', [codigo]);  // espera o MySQL
  return linhas.length === 0 ? undefined : linhaParaModalidade(linhas[0]);
}

// Quem chama também precisa de await (ou .then) para obter o valor, não a Promise
const modalidade = await buscarModalidade(req.params.codigo);
```

Regras:

- `await` só pode ser usado dentro de `async function` ou no nível mais alto de um módulo ES (**top-level await**, usado em `db/schema.js`: `try { await rodaSchema(); } catch (erro) { ... }`).
- **Esquecer o `await`** é o erro mais comum: a variável recebe uma `Promise` em vez do resultado. O projeto tem um exemplo real disso na integração FinOps (§10.1).
- Se a Promise é rejeitada (erro), `await` **lança** o erro, que pode ser capturado com `try/catch`.
- `finally` roda sempre, com ou sem erro: `db/scriptSql.js` e os scripts de banco usam `finally { await conexao.end(); }` para fechar a conexão.
- `Promise.all([p1, p2])` espera várias promessas em paralelo (usado em um teste de `taxa.test.js`).
- `new Promise((ok) => { ... ok(valor) })` cria uma promessa à mão; o script de verificação faz isso para esperar o `app.listen`.

```js
// src/routes/health.js: try/catch ao redor do await
try {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', banco: 'ok' });
} catch (err) {
  res.status(503).json({ status: 'erro', banco: 'erro' });
}
```

No Express 5, uma rota `async` que lança (ou cuja Promise é rejeitada) encaminha o erro automaticamente ao tratador de erros. Por isso as rotas de `operacoes.js` podem simplesmente fazer `throw new ErroDeNegocio(...)` sem `try/catch`.

### 2.16 Funções puras, imutabilidade e closures

Uma **função pura** devolve sempre a mesma saída para a mesma entrada e não altera nada fora dela (sem banco, sem HTTP, sem `Date.now()`, sem mexer nos argumentos). Todas as funções de `src/lib/` e `simulaOperacao`, `avaliaDefinicao` e `montaConsolidado` são puras. Vantagens: fáceis de testar (sem MySQL), previsíveis e reutilizáveis.

Para não alterar a entrada o projeto **cria cópias** em vez de modificar: `{ ...parcela, vencimento }` em vez de `parcela.vencimento = ...`; `cronograma.map((parcela) => ({ ...parcela }))` no consolidado. Os testes provam isso comparando com `structuredClone` feito antes da chamada.

**Closure** é uma função que "lembra" as variáveis do escopo onde foi criada. Em `cet.js`:

```js
export function calculaCet({ valorLiberado, cronograma }) {
  const f = (cet) => {                    // f enxerga cronograma e valorLiberado
    const valorPresente = cronograma.reduce((soma, parcela) =>
      soma + parcela.valor / (1 + cet) ** (parcela.diasCorridos / 365), 0);
    return valorPresente - valorLiberado;
  };
  // ... f(meio) é chamada várias vezes na bisseção
}
```

Outro exemplo é `finOpsApi(endpoint)` em `api.js`: devolve um objeto com funções `get` e `post` que lembram `apiUrl` e `headers` (padrão *factory*).

### 2.17 Node.js: `process.env`, flags, `node:test`, `import.meta.url`, `fetch`

- `process.env.NOME` lê uma variável de ambiente. Os scripts rodam com `node --env-file=.env`, que carrega o arquivo `.env` (chave=valor por linha) nessas variáveis. O `.env` está no `.gitignore` (tem senha); o `.env.example` mostra as chaves esperadas.
- `node --watch` reinicia o processo quando um arquivo muda (equivalente ao nodemon).
- `node --test` encontra arquivos `*.test.js` e executa. `import { test } from 'node:test'` e `import assert from 'node:assert/strict'` vêm embutidos; o prefixo `node:` marca módulos nativos.
- `process.exitCode = 1` faz o processo terminar com erro (útil para CI) sem matar o script na hora.
- `import.meta.url` é a URL do arquivo atual; `new URL('./schema.sql', import.meta.url)` monta um caminho relativo ao arquivo, e não à pasta de onde o comando foi rodado.
- `readFile` de `node:fs/promises` lê arquivos devolvendo Promise.
- `fetch` e `Headers` existem globalmente no Node 18+ (não precisa instalar nada) e são usados em `api.js` e no script de verificação.
- `console.log` e `console.error` escrevem na saída padrão e na saída de erro.

## 3. Express e HTTP

### 3.1 HTTP e REST em duas frases

HTTP é o protocolo de pedido e resposta da web. Um **pedido** tem método (`GET`, `POST`, ...), caminho (`/api/operacoes/1`), cabeçalhos (`Content-Type: application/json`) e, opcionalmente, um corpo. A **resposta** tem um código de status (`200`, `404`...), cabeçalhos e corpo. REST é o estilo de organizar a API em **recursos** (operações, modalidades) identificados por URL e manipulados pelos métodos: `GET` lê, `POST` cria ou executa uma ação. Toda troca aqui é em JSON.

### 3.2 `app.js`: middlewares e montagem

```js
const app = express();
app.use(express.json());                          // 1. corpo JSON -> req.body
app.use(express.urlencoded({ extended: true }));  // 2. corpo de formulário -> req.body
app.use('/api', rotas);                           // 3. todas as rotas sob /api
app.use((err, req, res, next) => { /* ... */ });  // 4. tratador de erros (4 parâmetros)
```

Um **middleware** é uma função `(req, res, next)` pela qual o pedido passa, **na ordem em que foi registrada**. `express.json()` lê o corpo e o transforma em objeto em `req.body`; se o JSON estiver malformado, ele lança um erro com `type === 'entity.parse.failed'`, que o tratador traduz para `400 DADOS_INVALIDOS`. Sem esse middleware, `req.body` seria `undefined`.

`app.listen(PORT, callback)` em `index.js` abre a porta e começa a atender.

### 3.3 `Router`: rotas em arquivos separados

`Router()` é um "mini app" que agrupa rotas. Cada arquivo em `src/routes/` cria o seu, define as rotas com caminhos **relativos** e exporta. `routes/index.js` monta cada um sob um prefixo:

```js
router.use('/health', healthRoutes);        // GET /api/health
router.use('/modalidades', modalidadesRoutes); // GET /api/modalidades, /api/modalidades/:codigo
router.use('/operacoes', operacoesRoutes);  // POST /api/operacoes, GET /api/operacoes/:id ...
```

Dentro de `operacoes.js`, `router.get('/:id', ...)` vira `GET /api/operacoes/:id` porque o prefixo `/api` veio de `app.js` e `/operacoes` de `index.js`.

### 3.4 De onde vêm os dados: `req.params`, `req.query`, `req.body`

| Fonte | Exemplo de URL/pedido | Como ler | Tipo |
|---|---|---|---|
| Parâmetro de rota | `GET /api/operacoes/15` com rota `/:id` | `req.params.id` | sempre **string** (`'15'`) |
| Query string | `GET /api/operacoes?pagina=2&tamanho=5` | `req.query.pagina` | sempre **string** (`'2'`) |
| Corpo JSON | `POST` com `{ "valor": 10000 }` | `req.body.valor` | o tipo do JSON (número, texto, objeto) |

Como `params` e `query` são texto, as rotas convertem e validam: `leId(req.params.id)` faz `Number(valor)` e exige inteiro ≥ 1; a listagem faz `Number(req.query.pagina)`. Parâmetro repetido (`?estado=A&estado=B`) chega como array, que `String(...)` transforma em `'A,B'` e a validação rejeita.

### 3.5 Respostas e códigos de status

`res.json(obj)` serializa para JSON, define `Content-Type: application/json` e envia com status 200. `res.status(201).json(obj)` muda o status antes. `return res.status(400).json(...)` nas rotas legadas usa o `return` só para encerrar a função.

| Código | Significado | Onde o projeto usa |
|---|---|---|
| 200 OK | deu certo | todos os `GET`, definição |
| 201 Created | recurso criado | `POST /api/operacoes` |
| 400 Bad Request | pedido malformado ou campos inválidos | `DADOS_INVALIDOS`, JSON inválido |
| 404 Not Found | recurso não existe | operação ou modalidade inexistente |
| 409 Conflict | conflito com o estado atual | identificador duplicado, operação já definida |
| 422 Unprocessable Entity | pedido bem formado, mas a regra de negócio recusa | score insuficiente, CET não converge, consolidado de operação não definida |
| 500 Internal Server Error | bug ou falha inesperada | qualquer erro que não seja `ErroDeNegocio` |
| 503 Service Unavailable | serviço indisponível | `/api/health` quando o MySQL não responde |

A diferença entre 400 e 422 é a que mais cai em prova: 400 é "não entendi o pedido" (tipo errado, campo faltando); 422 é "entendi, mas não posso atender" (score na faixa E é um inteiro válido, só não dá crédito).

### 3.6 Tratamento de erros: `ErroDeNegocio` + tratador de 4 parâmetros

Formato padrão de toda resposta de erro:

```json
{ "erro": { "codigo": "DADOS_INVALIDOS", "mensagem": "Há campos inválidos na requisição",
            "detalhes": ["valor deve ser um número maior que zero"] } }
```

O tratador em `app.js` é reconhecido pelo Express **porque tem exatamente 4 parâmetros** `(err, req, res, next)`. Ele faz três coisas: se `err instanceof ErroDeNegocio`, responde com o status e o código do erro; se for JSON malformado, 400; qualquer outra coisa é registrada com `console.error` e vira 500 genérico (sem vazar detalhes internos ao cliente).

No Express 5, erros lançados em rotas `async` chegam ao tratador sozinhos. No Express 4 isso não acontecia: era preciso `try/catch` em cada rota ou `next(err)`. É um dos motivos de o projeto usar a versão 5.

### 3.7 Ordem das rotas e codificação de URL

O Express testa as rotas **na ordem de registro** e usa a primeira que casa. Em `operacoes.js`, `GET /por-identificador/:identificador/consolidado` é registrada antes de `GET /:id/consolidado`; elas não colidem porque a primeira tem três segmentos e a segunda dois, mas registrar a mais específica antes é a prática segura. Já `GET /:id` fica por último, porque casaria com qualquer segmento único.

Identificadores com espaço ou barra precisam ir **URL-encoded** (`OP 1` vira `OP%201`, `/` vira `%2F`); o Express decodifica antes de preencher `req.params`.

### 3.8 Swagger / OpenAPI

`src/openapi.js` descreve todos os endpoints no padrão **OpenAPI 3** (caminhos, parâmetros, esquemas dos objetos em `components.schemas`, exemplos). `swagger-ui-express` transforma essa descrição em uma página interativa em `/api/docs`, onde dá para disparar os pedidos; `/api/docs.json` devolve a especificação crua para importar no Postman. Os exemplos de operação e consolidado são **calculados pelo próprio código** (`simulaOperacao`, `montaConsolidado`), então nunca ficam diferentes do que a API devolve. O teste `openapi.test.js` confere que toda `$ref` aponta para um esquema existente.


## 4. Arquitetura em camadas

### 4.1 As camadas e a regra de dependência

```text
 cliente HTTP (Postman, front-end, outro grupo)
        |
        v
 [ src/routes ]        fala HTTP: lê req, valida parâmetros de URL, escolhe status, chama serviços
        |
        v
 [ src/servicos ]      orquestra o caso de uso; conhece as regras que precisam do banco
        |            \
        v             v
 [ src/lib ]        [ src/repositorios ]   lib: cálculo puro      repositórios: único lugar com SQL
        |                   |
        v                   v
 [ src/dados ]         [ src/db.js ]  ->  MySQL
```

Regra: uma camada só chama a camada de baixo. `lib/` não importa nada de `routes/` nem de `repositorios/`; `repositorios/` não sabe o que é HTTP; `routes/` não escreve SQL. Isso permite trocar o banco, testar o cálculo sem MySQL e ler cada arquivo sabendo o que esperar dele.

| Camada | Pode importar | Nunca importa | Exemplo |
|---|---|---|---|
| routes | servicos, repositorios, lib/erros | db.js diretamente | `operacoes.js` |
| servicos | lib, repositorios | express | `simulacao.js` |
| lib | util, dados, erros | express, mysql2, repositorios | `price.js` |
| repositorios | db.js | express, lib de cálculo | `operacoes.js` |

### 4.2 Por que o cálculo fica em funções puras

`calculaPrice`, `calculaSac`, `geraCronograma`, `calculaEncargos`, `calculaCet`, `montaDemonstrativo` e `simulaOperacao` recebem objetos simples e devolvem objetos simples. Consequências:

- `npm test` roda em meio segundo e sem `.env`, porque nada ali abre conexão.
- A mesma função serve para a API, para os exemplos do Swagger e para o consolidado.
- Um bug de cálculo é reproduzido com uma chamada direta, sem subir servidor.

### 4.3 Injeção de dependência e o banco falso

Os serviços que precisam do banco (`validaEntrada`, `calculaTaxa`) recebem o repositório como **parâmetro com valor padrão**:

```js
export async function calculaTaxa(modalidade, score, repositorio = repositorioFaixas) {
  const faixas = await repositorio.listarFaixas(modalidade.codigo);
  // ...
}
```

Em produção ninguém passa o terceiro argumento, e o módulo real (que faz SQL) é usado. Nos testes, passa-se `repositorioFaixasFalso` de `bancoFalso.js`: um objeto com **as mesmas funções e o mesmo formato de retorno**, mas que lê arrays em memória copiados do `seed.sql`. Isso é injeção de dependência feita sem framework. O teste "Taxa: consulta o banco uma única vez" usa um **espião** (um repositório falso que anota as chamadas em um array) para provar que `calculaTaxa` faz só uma consulta.

### 4.4 Repositórios: a tradução `snake_case` → `camelCase`

O banco usa `teto_taxa_mes`, a API usa `tetoTaxaMes`. Cada repositório tem uma função `linhaParaX` que faz essa tradução e alguns ajustes de tipo (`ativo: linha.ativo === 1`, porque `BOOLEAN` no MySQL é `TINYINT(1)`; `permiteContratacao: linha.taxa_mes !== null`). Nenhum outro arquivo conhece nomes de colunas; se o banco mudar, muda-se um lugar.

### 4.5 Decisões de desenho que explicam o código

1. **A taxa mora no banco.** `faixas_juros` já guarda a taxa final de cada faixa (`min(base + spread, teto)`, calculada no seed). A API só escolhe a linha; para mudar uma taxa, muda-se o seed, não o código.
2. **Porcentagem vira decimal uma única vez.** Tudo em `taxa.js` fica em % (`1.85`). A divisão por 100 acontece só em `simulaOperacao` (`taxa.taxaFinalMes / 100`). Dividir duas vezes daria juros 100 vezes menores.
3. **A coluna `resultado` nunca recebe `UPDATE`.** As duas simulações são gravadas no `INSERT` como JSON e ficam congeladas. Definir o sistema só muda `estado`, `sistema_definido` e `definido_em`. Assim o consolidado é reproduzível: não recalcula nada, só lê.
4. **Cliente fora de `entrada`.** Na resposta da API `cliente` é campo de primeiro nível (`{ id, identificador, estado, definicao, cliente, entrada, taxa, simulacoes }`).
5. **Sem ferramenta de migrations.** `CREATE TABLE IF NOT EXISTS` não altera tabela existente; se o banco for antigo, `npm run schema` avisa e o caminho oficial é `npm run reset`.
6. **Erro de quem?** Entrada errada do cliente da API vira `ErroDeNegocio` (4xx). Seed incompleto ou `tipoPessoa` inválido chegando a `calculaEncargos` é bug interno e lança `Error` comum (500), porque a validação já deveria ter barrado.

## 5. Banco de dados

### 5.1 Conexão: `src/db.js`

```js
export const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 10,
  decimalNumbers: true,   // DECIMAL vem como número JS, não como string '1.85'
  dateStrings: true,      // DATE/DATETIME vêm como texto 'AAAA-MM-DD', sem conversão de fuso
});
```

Um **pool** mantém até 10 conexões abertas e as reutiliza; abrir uma conexão por pedido seria lento. `pool.query(sql, parametros)` devolve `[linhas, campos]`. Os scripts de `db/` usam `createConnection` próprio com `multipleStatements: true`, porque os arquivos `.sql` têm vários comandos separados por `;`.

### 5.2 Tabela `modalidades` (catálogo de produtos)

| Coluna | Tipo | Observação |
|---|---|---|
| `codigo` | VARCHAR(40), **PK** | ex.: `CONSIGNADO_INSS`; é o valor que a API recebe em `modalidade` |
| `nome`, `modalidade_bcb` | VARCHAR | nome amigável e nome na série do Banco Central |
| `publico`, `regime_indexacao` | CHAR(2), VARCHAR(20) | `PF`, `PREFIXADO` (fixos nesta versão) |
| `teto_taxa_mes` | DECIMAL(6,2) | taxa máxima da modalidade (% a.m.) |
| `taxa_referencia_bcb_mes` | DECIMAL(6,2) | mediana do BCB, só para comparação |
| `prazo_min_meses`, `prazo_max_meses` | SMALLINT | faixa de prazo aceita na validação |
| `ativo` | BOOLEAN | modalidade inativa é recusada no POST |

Seis modalidades no seed: `CREDITO_PESSOAL` (teto 12,00; 3 a 48 meses), `CONSIGNADO_INSS` (1,85; 6 a 84), `CONSIGNADO_PUBLICO` (2,50; 6 a 96), `CONSIGNADO_PRIVADO` (4,50; 6 a 48), `VEICULOS` (3,00; 12 a 60), `OUTROS_BENS` (5,00; 3 a 36).

### 5.3 Tabela `faixas_juros` (taxa por faixa de score)

Uma linha por (modalidade, faixa): 6 × 5 = 30 linhas. `UNIQUE KEY (modalidade_codigo, faixa)` impede duplicata; `FOREIGN KEY` garante que a modalidade existe; `CHECK` garante que a faixa E tem `taxa_mes NULL` e as demais têm taxa. `taxa_ano = ((1 + taxa_mes/100)^12 − 1) × 100`.

### 5.4 Tabela `operacoes`

Cada `POST /api/operacoes` grava uma linha. Colunas "planas" (para listar e filtrar sem abrir JSON): `identificador`, `tipo_pessoa`, `documento`, `modalidade_codigo`, `valor` (DECIMAL(15,2)), `score`, `prazo_meses`, `data_liberacao`, `primeiro_relacionamento`, `faixa_risco`, `taxa_final_mes`, `cet_price_ano`, `cet_sac_ano`. Coluna `resultado` (tipo **JSON**) com `{ cliente, entrada, taxa, simulacoes }` completo. Colunas de estado: `estado` (`SIMULADA`/`DEFINIDA`), `sistema_definido`, `definido_em`.

Restrições que o banco impõe por conta própria:

- `UNIQUE KEY (identificador)`: dois identificadores iguais são impossíveis, mesmo em pedidos simultâneos.
- `CHECK (valor > 0)`, `CHECK (score <= 1000)`, `tipo_pessoa IN ('PF','PJ')`, documento só dígitos com 11 ou 14 caracteres conforme o tipo.
- `CHECK` de consistência: `SIMULADA` exige `sistema_definido` e `definido_em` nulos; `DEFINIDA` exige os dois preenchidos.
- Índice em `estado` para o filtro `?estado=` da listagem.

Por que **DECIMAL** para dinheiro e não FLOAT? `DECIMAL(15,2)` guarda exatamente duas casas; `FLOAT` sofre do mesmo problema de 0,1 + 0,2 do JavaScript.

### 5.5 Seed e scripts

`seed.sql` usa `INSERT ... AS novo ON DUPLICATE KEY UPDATE ...`: se a chave já existe, atualiza em vez de falhar. Por isso `npm run seed` pode rodar quantas vezes quiser (**idempotente**). `schema.js` executa o `schema.sql`, lista as tabelas e consulta `INFORMATION_SCHEMA.COLUMNS` para avisar se `operacoes` está na versão antiga. `reset.js` encadeia `reset.sql` (DROP DATABASE) → `schema.sql` → `seed.sql`.

### 5.6 Placeholders `?` e SQL injection

```js
await pool.query('SELECT id FROM operacoes WHERE identificador = ? LIMIT 1', [identificador]);
```

O `?` é substituído pelo driver com o valor **escapado**. Se o código concatenasse texto (`` `... WHERE identificador = '${identificador}'` ``), um cliente malicioso mandaria `'; DROP TABLE operacoes; --` e o comando seria executado. Regra do projeto: dados do usuário vão sempre em placeholders; na string só entram nomes fixos de colunas. Detalhe do `mysql2`: `LIMIT ? OFFSET ?` exige **números** (`'10'` como string quebra), por isso a rota converte antes.

### 5.7 Concorrência: duas defesas contra condição de corrida

1. **Identificador duplicado.** A rota checa `existeIdentificador` (passo 2) e grava (passo 5). Se dois pedidos iguais chegarem ao mesmo tempo, os dois passam na checagem. A `UNIQUE KEY` barra o segundo `INSERT` com `ER_DUP_ENTRY`, e a rota traduz esse código para o mesmo `409 IDENTIFICADOR_DUPLICADO`, em vez de 500.
2. **Definição dupla.** `definir` executa `UPDATE ... WHERE id = ? AND estado = 'SIMULADA'`. O próprio banco decide quem vence: a segunda requisição afeta 0 linhas (`affectedRows === 0`), e a rota responde `409 AMORTIZACAO_JA_DEFINIDA`. É um *update condicional* (controle de concorrência otimista) sem precisar de transação ou lock explícito.

### 5.8 Paginação

`listar({ pagina, tamanho, estado })` faz duas consultas: `SELECT ... ORDER BY id DESC LIMIT ? OFFSET ?` com `offset = (pagina − 1) × tamanho`, e `SELECT COUNT(*)` com o mesmo filtro. A rota devolve `{ pagina, tamanho, total, totalPaginas: Math.ceil(total / tamanho), itens }`. Tabela vazia dá `totalPaginas 0`; página além do fim dá `itens []` com 200 (não é erro). Padrões: página 1, tamanho 10, máximo 100.

## 6. Regras de negócio

### 6.1 Validação da entrada (`validaEntrada.js`)

A validação **não para no primeiro erro**: acumula todas as mensagens em um array e lança um único `400 DADOS_INVALIDOS` com a lista em `detalhes`. Corpo `{}` gera exatamente 6 mensagens (identificador, cliente, valor, modalidade, score, prazoMeses).

| Campo | Regra | Obrigatório |
|---|---|---|
| `identificador` | texto, 1 a 60 caracteres (espaços das pontas removidos); único no banco (409 se repetido) | sim |
| `cliente` | objeto `{ tipoPessoa, documento }`; ver §6.2 | sim |
| `valor` | número finito, > 0 e ≤ 10.000.000 | sim |
| `modalidade` | código existente **e ativo** na tabela `modalidades` | sim |
| `score` | inteiro de 0 a 1000 (0 e 1000 valem) | sim |
| `prazoMeses` | inteiro ≥ 1 e dentro de `[prazoMin, prazoMax]` da modalidade | sim |
| `dataLiberacao` | `AAAA-MM-DD` e data real (30/02 é recusado); ausente = hoje (fuso local) | não |
| `primeiroRelacionamento` | `true`/`false`; ausente ou `null` = `false` | não |

A função devolve a entrada **normalizada**: documento só com dígitos, identificador sem espaços nas pontas, e `modalidade` substituída pela **linha inteira** da tabela (objeto com `tetoTaxaMes`, `prazoMinMeses`...), porque as etapas seguintes precisam desses dados. Se a modalidade não existe, a checagem de faixa de prazo é pulada (não faz sentido), mas "inteiro ≥ 1" continua sendo exigido.

### 6.2 Cliente: PF/PJ e validação de CPF e CNPJ (`documento.js`)

`tipoPessoa` só aceita `PF` (exige CPF, 11 dígitos) ou `PJ` (exige CNPJ, 14 dígitos). Máscara aceita: ponto, hífen, barra e espaço; qualquer outro caractere (letras do CNPJ alfanumérico, por exemplo) invalida. O documento é gravado **só com dígitos**. PJ pode usar qualquer modalidade do catálogo e paga IOF adicional maior (§6.9).

**Dígitos verificadores (módulo 11)**: `soma = Σ dígito × peso; resto = soma % 11; DV = 0 se resto < 2, senão 11 − resto`.

- CPF: 9 dígitos + 2 DVs. Pesos do 1º DV: 10, 9, ..., 2 sobre os 9 dígitos. Pesos do 2º DV: 11, 10, ..., 2 sobre os 10 dígitos (os 9 + o 1º DV).
- CNPJ: 12 dígitos + 2 DVs. Pesos do 1º DV: 5 4 3 2 9 8 7 6 5 4 3 2. Pesos do 2º DV: 6 5 4 3 2 9 8 7 6 5 4 3 2.
- Documento com **todos os dígitos iguais** (`111.111.111-11`) passa no módulo 11, mas é rejeitado por regra própria (`todosIguais`).

Exemplo conferido com o CPF de teste `529.982.247-25`:

```text
1º DV: 5×10 + 2×9 + 9×8 + 9×7 + 8×6 + 2×5 + 2×4 + 4×3 + 7×2 = 295
       295 % 11 = 9  ->  11 − 9 = 2   (confere: o 10º dígito é 2)
2º DV: 5×11 + 2×10 + 9×9 + 9×8 + 8×7 + 2×6 + 2×5 + 4×4 + 7×3 + 2×2 = 347
       347 % 11 = 6  ->  11 − 6 = 5   (confere: o 11º dígito é 5)
```

```js
function digitoVerificador(digitos, pesos) {
  const soma = digitos.reduce((acumulado, digito, i) => acumulado + digito * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
```

Mensagens: cliente ausente ou de tipo errado gera **uma** mensagem; `{}` gera **duas** (tipo e documento), para o cliente da API corrigir tudo de uma vez. CNPJ de teste válido: `11.222.333/0001-81`.

### 6.3 Score → faixa → taxa (`taxa.js`)

| Faixa | Score | Spread sobre a taxa base | Descrição |
|---|---|---|---|
| A | 800 a 1000 | +0,00 | Risco muito baixo |
| B | 600 a 799 | +0,50 | Risco baixo |
| C | 400 a 599 | +1,00 | Risco médio |
| D | 200 a 399 | +2,00 | Risco alto |
| E | 0 a 199 | recusa | `422 SCORE_INSUFICIENTE` |

Taxa final da faixa = `min(taxaBase + spread, tetoDaModalidade)`. Esse cálculo foi feito **no seed**; a API apenas lê `taxa_mes` da linha certa. A taxa base é a da faixa A (spread zero). `tetoAplicado: true` quando a faixa está "achatada" no teto.

Exemplos do seed: `CONSIGNADO_INSS` tem base 1,60 e teto 1,85, então B, C e D ficam todas em 1,85 (score 650 → faixa B → 1,60 + 0,50 = 2,10 → teto → **1,85%**, `tetoAplicado: true`). `CREDITO_PESSOAL` tem base 4,50 e teto 12,00: score 720 → B → **5,00%**, teto não atua.

Fronteiras: 800 é A, 799 é B, 400 é C, 399 é D, 200 é D, 199 é E (recusa). Score válido sem faixa no banco é seed incompleto: `Error` comum, vira 500.

### 6.4 Juros simples e compostos (rota legada `/api/juros`)

Recebem `{ capital, taxa, periodos }` (taxa em %). Com `i = taxa / 100`:

- **Simples**: `M = C × (1 + i × n)`. Juros incidem sempre sobre o capital inicial. Ex.: 1.000 a 2% por 12 períodos → `1000 × (1 + 0,24) = 1.240,00`.
- **Composto**: `M = C × (1 + i)^n`. Juros incidem sobre o montante acumulado ("juros sobre juros"). Ex.: `1000 × 1,02¹² = 1.268,24`.

As duas rotas devolvem `juros = M − C` e dividem o montante em `periodos` parcelas iguais com `calculaParcela` (função legada que usa a data de hoje e `toISOString`, ou seja, UTC). Não têm relação com o fluxo de operações.

### 6.5 Taxa mensal, anual equivalente e decimal

Taxa anual equivalente a uma mensal composta: `(1 + i_mês)^12 − 1`. Ex.: 1,85% a.m. → `1,0185¹² − 1 = 24,60% a.a.`; 2% a.m. → 26,82% a.a. Não é `12 × 1,85`. Para fazer contas, a taxa percentual vira decimal dividindo por 100, **uma única vez**, em `simulaOperacao`.

### 6.6 Sistema Price (`price.js`): parcela constante

Fórmula da parcela (PMT): `P = V × i / (1 − (1 + i)^−n)`, com `V` = valor, `i` = taxa mensal decimal, `n` = prazo. Exemplo de referência (10.000, 2% a.m., 12 meses): `P = 10000 × 0,02 / (1 − 1,02^−12) = 945,60`.

A cada mês: `juros = saldo × i`; `amortização = P − juros`; `saldo = saldo − amortização`. Como a parcela é fixa, os juros **caem** e a amortização **sobe** ao longo do tempo. Na última parcela a amortização é forçada a ser o saldo restante, para a dívida zerar exatamente apesar dos arredondamentos. Por isso a 12ª parcela do exemplo é 945,55 (e não 945,60).

| nº | amortização | juros | parcela | saldo devedor |
|---:|---:|---:|---:|---:|
| 1 | 745,60 | 200,00 | 945,60 | 9.254,40 |
| 2 | 760,51 | 185,09 | 945,60 | 8.493,89 |
| 6 | 823,20 | 122,40 | 945,60 | 5.296,67 |
| 11 | 908,88 | 36,72 | 945,60 | 927,01 |
| 12 | 927,01 | 18,54 | **945,55** | 0,00 |

Totais: `totalJuros 1.347,15`, `totalPago 11.347,15` (somados a partir das parcelas já arredondadas).

```js
const parcelaFixa = arredonda2((valor * taxaMes) / (1 - (1 + taxaMes) ** -prazoMeses));
for (let k = 1; k <= prazoMeses; k++) {
  const juros = arredonda2(saldo * taxaMes);
  const amortizacao = k < prazoMeses ? arredonda2(parcelaFixa - juros) : saldo;  // última zera
  const valorParcela = arredonda2(amortizacao + juros);
  saldo = arredonda2(saldo - amortizacao);
  parcelas.push({ numero: k, amortizacao, juros, valor: valorParcela, saldoDevedor: saldo });
}
```

### 6.7 Sistema SAC (`sac.js`): amortização constante

`amortização = V / n` (833,33 no exemplo); `juros = saldo × i`; `parcela = amortização + juros`. Como o saldo cai a cada mês, os juros caem e a **parcela é decrescente**. A última amortização absorve os centavos (833,37) para zerar o saldo.

| nº | amortização | juros | parcela | saldo devedor |
|---:|---:|---:|---:|---:|
| 1 | 833,33 | 200,00 | 1.033,33 | 9.166,67 |
| 2 | 833,33 | 183,33 | 1.016,66 | 8.333,34 |
| 6 | 833,33 | 116,67 | 950,00 | 5.000,02 |
| 11 | 833,33 | 33,33 | 866,66 | 833,37 |
| 12 | **833,37** | 16,67 | 850,04 | 0,00 |

Totais: `totalJuros 1.300,00`, `totalPago 11.300,00`. Comparação com o Price no mesmo cenário: o SAC paga **menos juros no total** (1.300 contra 1.347,15) porque amortiza mais cedo, mas as primeiras parcelas são maiores (1.033,33 contra 945,60).

### 6.8 Cronograma com datas reais (`cronograma.js`, `datas.js`)

Para cada parcela `k`:

1. **Aniversário**: `dataLiberacao + k meses`, mantendo o dia; se o dia não existir no mês (30/02), usa o último dia do mês.
2. **Dia útil**: sábado ou domingo avança para a segunda-feira seguinte (feriados **não** são tratados).
3. **Dias corridos**: diferença em dias entre a liberação e o vencimento ajustado.

Liberação em 2026-10-30 (sexta), 12 meses:

| nº | aniversário | vencimento | dias | observação |
|---:|---|---|---:|---|
| 1 | 2026-11-30 | 2026-11-30 | 31 | segunda, não muda |
| 3 | 2027-01-30 | **2027-02-01** | 94 | sábado → segunda |
| 4 | 2027-02-30 (não existe) | **2027-03-01** | 122 | vira 28/02, domingo → segunda |
| 7 | 2027-05-30 | **2027-05-31** | 213 | domingo → segunda |
| 12 | 2027-10-30 | **2027-11-01** | 367 | sábado → segunda; passa de 365 dias |

O cronograma é a lista de parcelas **acrescida** de `vencimento` e `diasCorridos`; na resposta da API a chave `parcelas` não aparece, só `cronograma`.

### 6.9 Encargos: IOF e tarifa de cadastro (`encargos.js`, `parametros.js`)

| Encargo | Regra | Parâmetro |
|---|---|---|
| IOF diário | para cada parcela: `amortização × 0,000082 × min(diasCorridos, 365)`; soma-se tudo e arredonda só o total | `IOF_ALIQUOTA_DIARIA = 0.000082` (0,0082% ao dia), `IOF_DIAS_MAXIMO = 365` |
| IOF adicional | uma vez, sobre o valor total: **0,38% PF** ou **0,95% PJ** | `IOF_ALIQUOTA_ADICIONAL = { PF: 0.0038, PJ: 0.0095 }` |
| Tarifa de cadastro | R$ 50,00, cobrada **só** se `primeiroRelacionamento === true` (Tema 620 do STJ) | `TARIFA_CADASTRO = 50.00` |

`encargos.total = iof.diario + iof.adicional + tarifaCadastro`. Fontes legais citadas no código: Decreto 6.306/2007 (art. 7º e 7º-A) com as alíquotas dos Decretos 12.466/2025 e 12.499/2025; Res. CMN 3.919/2010 para a tarifa. Os valores são marcados como provisórios e ficam isolados em `parametros.js` justamente porque mudam por decreto.

O IOF diário depende do cronograma, por isso é **diferente** entre Price e SAC para a mesma operação (SAC amortiza mais cedo → menos dias × amortização → IOF menor). O limite de 365 dias faz a 12ª parcela (367 dias) contar só 365. Exemplo (10.000, 2%, 12x, PF, primeiro relacionamento): Price IOF diário 168,09 + adicional 38,00 = 206,09 + tarifa 50 = **256,09**; SAC 162,22 + 38,00 + 50 = **250,22**. O mesmo cenário com PJ troca só o adicional: 95,00.

### 6.10 Valor liberado e CET (`cet.js`)

**Valor liberado** = `valor − encargos.total`: os encargos são descontados na hora da liberação (o cliente recebe menos do que o valor contratado, mas paga parcelas sobre o valor cheio).

**CET (Custo Efetivo Total)** é a taxa anual que iguala o valor liberado ao valor presente de todas as parcelas, pela equação da Res. CMN 4.881/2020, art. 4º:

```text
FC0 = Σ  FCj / (1 + CET) ^ ((dj − d0) / 365)
      FC0 = valor liberado    FCj = parcela j    (dj − d0) = dias corridos até a parcela j
```

O CET aparece no expoente, então **não há fórmula fechada**; o código resolve por **bisseção**: define `f(cet) = valorPresente(cet) − valorLiberado`, começa com `lo = 0` (0% a.a.) e `hi = 10` (1000% a.a.), exige `f(lo) > 0 e f(hi) < 0` (senão lança `422 CET_NAO_CONVERGE`), e repete até 200 vezes: calcula o meio; se `f(meio) > 0` a raiz está à direita (`lo = meio`), senão à esquerda (`hi = meio`); para quando `hi − lo ≤ 1e-10`. `cetMensal = (1 + cetAnual)^(1/12) − 1`.

Checagem de sanidade (coberta por teste): sem encargos, o CET mensal é igual à taxa de juros (2,00%). Com encargos, no cenário de referência: **33,25% a.a. / 2,42% a.m.** No cenário A.5 (taxa 1,85%): Price 30,89% / 2,27%; SAC 30,96% / 2,27%. O CET é maior que a taxa de juros porque incorpora IOF e tarifa. Sem primeiro relacionamento (sem tarifa) o CET cai.

### 6.11 Demonstrativo (`demonstrativo.js`)

Art. 7º da Res. CMN 4.881: lista os componentes do custo e o percentual de cada um sobre o total devido. `somatorioParcelas` = soma das parcelas do cronograma; `totalDevido = somatorioParcelas + encargos.total`; componentes: Principal, Juros, IOF, Tarifa de cadastro, cada um com `percentualSobreTotalDevido = valor / totalDevido × 100`. No cenário de referência (Price, 2%): total devido 11.603,24 = Principal 10.000 (86,18%) + Juros 1.347,15 (11,61%) + IOF 206,09 (1,78%) + Tarifa 50 (0,43%).

### 6.12 Ciclo de vida da operação, definição e consolidado

```text
POST /api/operacoes  ->  SIMULADA  --POST /:id/definicao {PRICE|SAC}-->  DEFINIDA  (imutável)
                           |                                               |
                           |  GET /:id/consolidado -> 422 OPERACAO_NAO_DEFINIDA   GET /:id/consolidado -> 200
```

- Toda operação nasce `SIMULADA` com as duas simulações gravadas.
- `avaliaDefinicao(operacao, sistema)`: sistema fora de `['PRICE', 'SAC']` → 400 (vence o 409, mesmo se já definida); operação não `SIMULADA` → `409 AMORTIZACAO_JA_DEFINIDA`. O `UPDATE` condicional resolve a corrida (§5.7).
- `montaConsolidado(operacao, modalidade)`: função pura que **não recalcula nada**. Pega `simulacoes[sistema]` e monta `{ operacao, cliente, produto, condicoes, taxa, sistema, resumo, encargos, valorLiberado, cet, demonstrativo, calendario }`. `resumo` é `{ parcelaFixa, totalJuros, totalPago }` no Price ou `{ amortizacaoBase, totalJuros, totalPago }` no SAC; `calendario` é o nome que a equipe de contrato usa para o cronograma. O JSON do consolidado nunca contém o outro sistema.
- O consolidado pode ser lido por `id` ou pela chave de negócio `identificador` (comparação sem diferenciar maiúsculas, pela collation `utf8mb4_unicode_ci`).

### 6.13 Cenário de referência A.5 (o "gabarito" dos testes)

Entrada: `CONSIGNADO_INSS`, score 650, R$ 10.000 em 12 meses, liberação 2026-10-30, primeiro relacionamento, cliente PF `529.982.247-25`. Taxa: faixa B, 1,85% a.m. (teto), 24,60% a.a.

| | PRICE | SAC |
|---|---:|---:|
| parcelaFixa / amortizacaoBase | 936,91 | 833,33 |
| 1ª parcela (juros 185,00) | 936,91 | 1.018,33 |
| 12ª parcela | 936,87 | 848,79 |
| totalJuros | 1.242,88 | 1.202,50 |
| totalPago | 11.242,88 | 11.202,50 |
| IOF diário / adicional / total | 167,65 / 38,00 / 205,65 | 162,22 / 38,00 / 200,22 |
| Tarifa de cadastro | 50,00 | 50,00 |
| Encargos total | 255,65 | 250,22 |
| valorLiberado | 9.744,35 | 9.749,78 |
| CET a.a. / a.m. | 30,89% / 2,27% | 30,96% / 2,27% |
| totalDevido | 11.498,53 | 11.452,72 |

Mesmo cenário com cliente PJ (`11.222.333/0001-81`): parcelas e cronograma idênticos; IOF adicional 95,00; encargos 312,65 (Price) e 307,22 (SAC); CET 32,38% (Price) e 32,49% (SAC).

## 7. Fluxo ponta a ponta de `POST /api/operacoes`

Pedido:

```json
{
  "identificador": "OP-2026-0001",
  "cliente": { "tipoPessoa": "PF", "documento": "529.982.247-25" },
  "valor": 10000, "modalidade": "CONSIGNADO_INSS", "score": 650, "prazoMeses": 12,
  "dataLiberacao": "2026-10-30", "primeiroRelacionamento": true
}
```

O que acontece, na ordem do código da rota:

1. `express.json()` transforma o corpo em `req.body`. JSON inválido → 400 antes de a rota rodar.
2. `validaEntrada(req.body)` confere os 8 campos, consulta `modalidades` e devolve a entrada normalizada (modalidade como objeto, documento só dígitos). Erros → `400 DADOS_INVALIDOS` com `detalhes`.
3. `existeIdentificador` → `409 IDENTIFICADOR_DUPLICADO` se já houver.
4. `calculaTaxa(modalidade, score)` lê as 5 faixas da modalidade, acha a do score. Faixa E → `422 SCORE_INSUFICIENTE`.
5. `simulaOperacao(entrada, taxa)` (pura): converte a taxa para decimal e, para Price e depois SAC, roda `calculaX → geraCronograma → calculaEncargos → valorLiberado → calculaCet → montaDemonstrativo`. Possível `422 CET_NAO_CONVERGE`. Nada foi gravado até aqui.
6. `repositorio.salvar(...)` faz o `INSERT` com as colunas planas e o JSON `resultado`. `ER_DUP_ENTRY` na corrida → 409.
7. `buscarPorId(id)` relê o que ficou gravado e a rota responde `201` com `{ id, identificador, criadoEm, estado: 'SIMULADA', definicao: null, cliente, entrada, taxa, simulacoes: { PRICE, SAC } }`.

Resposta (resumida):

```json
{
  "id": 1, "identificador": "OP-2026-0001", "criadoEm": "2026-10-30 14:03:22",
  "estado": "SIMULADA", "definicao": null,
  "cliente": { "tipoPessoa": "PF", "documento": "52998224725" },
  "entrada": { "valor": 10000, "modalidade": "CONSIGNADO_INSS", "score": 650, "prazoMeses": 12,
               "dataLiberacao": "2026-10-30", "primeiroRelacionamento": true },
  "taxa": { "faixaRisco": "B", "descricaoFaixa": "Risco baixo", "taxaBaseMes": 1.6, "tetoTaxaMes": 1.85,
            "taxaFinalMes": 1.85, "taxaFinalAno": 24.6, "tetoAplicado": true },
  "simulacoes": {
    "PRICE": { "sistema": "PRICE", "parcelaFixa": 936.91, "totalJuros": 1242.88, "totalPago": 11242.88,
               "encargos": { "iof": { "diario": 167.65, "adicional": 38, "total": 205.65 },
                             "tarifaCadastro": 50, "total": 255.65 },
               "valorLiberado": 9744.35, "cet": { "anualPercentual": 30.89, "mensalPercentual": 2.27 },
               "demonstrativo": { "componentes": [ "..." ], "somatorioParcelas": 11242.88, "totalDevido": 11498.53 },
               "cronograma": [ { "numero": 1, "amortizacao": 751.91, "juros": 185, "valor": 936.91,
                                 "saldoDevedor": 9248.09, "vencimento": "2026-11-30", "diasCorridos": 31 }, "..." ] },
    "SAC": { "sistema": "SAC", "amortizacaoBase": 833.33, "...": "..." }
  }
}
```

## 8. Catálogo de endpoints e erros

| Método e caminho | O que faz | Sucesso | Erros possíveis |
|---|---|---|---|
| `GET /api/health` | testa a API e o banco (`SELECT 1`) | 200 | 503 banco fora |
| `GET /api/modalidades` | lista modalidades ativas, `{ total, itens }` | 200 | |
| `GET /api/modalidades/:codigo` | uma modalidade + suas 5 faixas | 200 | 404 `MODALIDADE_NAO_ENCONTRADA` |
| `POST /api/operacoes` | valida, simula, grava | 201 | 400, 409 duplicado, 422 score, 422 CET |
| `GET /api/operacoes?pagina&tamanho&estado` | listagem paginada, mais recentes primeiro | 200 | 400 parâmetros inválidos |
| `GET /api/operacoes/:id` | operação completa | 200 | 400 id inválido, 404 |
| `POST /api/operacoes/:id/definicao` | `{ "sistema": "PRICE" \| "SAC" }` | 200 | 400, 404, 409 `AMORTIZACAO_JA_DEFINIDA` |
| `GET /api/operacoes/:id/consolidado` | documento para o contrato | 200 | 400, 404, 422 `OPERACAO_NAO_DEFINIDA` |
| `GET /api/operacoes/por-identificador/:identificador/consolidado` | idem, pela chave de negócio | 200 | 404, 422 |
| `POST /api/juros/simples`, `/composto` | legado: montante e parcelas iguais | 200 | 400 (formato antigo `{ erro: 'texto' }`) |
| `GET /api/juros/faixas?modalidadeCodigo&score` | legado: faixa de uma modalidade pelo score | 200 | |
| `GET /api/docs`, `/api/docs.json` | Swagger UI e especificação | 200 | |

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | `DADOS_INVALIDOS` | corpo, id ou query inválidos; `detalhes` lista cada problema; JSON malformado |
| 404 | `MODALIDADE_NAO_ENCONTRADA` | código de modalidade inexistente |
| 404 | `OPERACAO_NAO_ENCONTRADA` | id ou identificador inexistente |
| 409 | `IDENTIFICADOR_DUPLICADO` | identificador já gravado (inclusive na corrida) |
| 409 | `AMORTIZACAO_JA_DEFINIDA` | definir operação que já está `DEFINIDA` |
| 422 | `SCORE_INSUFICIENTE` | score na faixa E (0 a 199) |
| 422 | `CET_NAO_CONVERGE` | fluxo sem raiz em [0%, 1000%] |
| 422 | `OPERACAO_NAO_DEFINIDA` | consolidado de operação ainda `SIMULADA` |
| 500 | `ERRO_INTERNO` | qualquer erro que não seja `ErroDeNegocio` |


## 9. Testes

### 9.1 `node:test` e `node:assert/strict`

Os testes usam só o que vem com o Node. Um arquivo de teste é um módulo normal que importa `test` e `assert`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculaPrice } from './price.js';

test('Price: 1 parcela = principal + juros de um mês', () => {
  const r = calculaPrice({ valor: 1000, taxaMes: 0.05, prazoMeses: 1 });
  assert.equal(r.parcelas[0].valor, 1050.00);
  assert.equal(r.parcelas[0].saldoDevedor, 0);
});
```

- `assert.equal(a, b)` compara com `===` (modo *strict*); `assert.deepEqual` compara objetos e arrays campo a campo; `assert.ok(x)` exige verdadeiro; `assert.match(texto, regex)`.
- `assert.throws(() => fn(), validador)` exige que a função **lance**; `await assert.rejects(promise, validador)` é a versão para funções `async`; `assert.doesNotThrow` o contrário.
- `test('nome', async () => { ... })` aceita função assíncrona.
- `npm test` executa `node --test`, que procura `*.test.js` em todo o projeto. São **84 testes** em 13 arquivos, todos sem banco.

### 9.2 Banco falso, dublês e espiões

`src/servicos/bancoFalso.js` recria em memória as 6 modalidades e as 30 faixas do seed (mais uma `MODALIDADE_INATIVA` só para testar a recusa) e expõe `repositorioModalidadesFalso` e `repositorioFaixasFalso` com as mesmas funções dos repositórios reais. É um **dublê de teste** (test double, tipo *fake*). O teste "corpo `{}` não consulta o banco" injeta um repositório que lança erro se for chamado, provando que a validação não faz consulta quando `modalidade` está ausente. O teste de "uma única consulta" injeta um **espião** que anota as chamadas. Se o seed real mudar, o banco falso tem de mudar junto; quem pega divergência é o teste ponta a ponta.

### 9.3 O que cada arquivo de teste cobre

| Arquivo | Cobre |
|---|---|
| `lib/price.test.js`, `lib/sac.test.js` | tabelas A.1 e A.2, última parcela, SAC decrescente, soma das amortizações = valor |
| `lib/datas.test.js`, `lib/cronograma.test.js` | 30/02 → 28/02, fim de semana → segunda, dias corridos, A.3, não altera a entrada |
| `lib/encargos.test.js` | IOF e tarifa (A.4), limite de 365 dias, PJ 0,95%, `tipoPessoa` inválido é `Error` comum |
| `lib/cet.test.js` | 33,25% / 2,42%, sanidade sem encargos, `CET_NAO_CONVERGE` |
| `lib/demonstrativo.test.js` | componentes e percentuais; soma fecha o total devido |
| `lib/documento.test.js` | máscara, DVs de CPF e CNPJ, todos iguais, mensagens de `validaCliente` |
| `servicos/validaEntrada.test.js` | cada regra da §6.1, acúmulo de erros, normalização |
| `servicos/taxa.test.js` | faixas e fronteiras, teto, faixa E, seed incompleto, uma consulta só |
| `servicos/simulacao.test.js` | cenário A.5 PF e PJ, formato de saída, pureza |
| `servicos/definicao.test.js`, `servicos/consolidado.test.js` | 400 antes de 409, 409 já definida, consolidado puro e sem o outro sistema |
| `openapi.test.js` | toda `$ref` da especificação existe |

### 9.4 Teste ponta a ponta (`npm run verifica`)

`scripts/verifica-endpoints.mjs` sobe o app em uma porta efêmera (`app.listen(0)`), usa `fetch` para chamar cada endpoint contra o **MySQL real**, confere status e corpo (inclusive os valores de A.5), e ao final apaga as operações que criou (identificadores `OP-E2E-<timestamp>-*`). Termina com código 1 se algum cenário falhar. É o passo recomendado antes de abrir um PR.

## 10. Integração FinOps e pontos de atenção no código

### 10.1 `src/lib/api.js` e a chamada na definição

```js
export function finOpsApi(endpoint) {
  const apiUrl = `${process.env.FINOPS_URL}/${endpoint}`;
  const headers = new Headers();
  headers.append('Content-Type', 'application/json');
  headers.append('Accept', 'application/json');
  return {
    get: async () => (await fetch(apiUrl, { method: 'GET', headers })).json(),
    post: async (body) => (await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) })).json(),
  };
}
```

`finOpsApi` é uma **função fábrica**: recebe o nome do endpoint e devolve um objeto com `get` e `post`, que usam o `fetch` global do Node. A URL base vem da variável `FINOPS_URL` do `.env`.

**Como está hoje na rota `POST /api/operacoes/:id/definicao`** (commit mais recente, "Dintegração finops", de 26/10/2026):

```js
finOpsApi.post('/operacoes', repositorio.buscarPorId(id));
res.json(await repositorio.buscarPorId(id));
```

Há três problemas, úteis para discutir em aula:

1. `finOpsApi` é a função fábrica, não o objeto que ela devolve. `finOpsApi.post` é `undefined`, e chamar `undefined` lança `TypeError: finOpsApi.post is not a function`. No Express 5 esse erro vai ao tratador e a resposta é **500 ERRO_INTERNO**, embora o `UPDATE` já tenha sido feito: a operação fica `DEFINIDA` no banco, mas o cliente recebe erro. Os 84 testes unitários não pegam isso porque não exercitam a rota; o teste ponta a ponta pegaria.
2. `repositorio.buscarPorId(id)` é passado **sem `await`**: o corpo seria uma `Promise`, e `JSON.stringify` de uma Promise é `{}`.
3. A chamada não é aguardada e não tem `try/catch`: falha de rede derrubaria a resposta.

Forma correta de usar a fábrica (a URL já acrescenta a barra):

```js
const operacao = await repositorio.buscarPorId(id);
try {
  await finOpsApi('operacoes').post(operacao);
} catch (err) {
  console.error('FinOps indisponível:', err.message);  // não impede a resposta ao cliente
}
res.json(operacao);
```

### 10.2 Outros pontos que um leitor atento nota

- `src/dados/score.js` (`faixas_score`) repete em código os limites de faixa que já estão na tabela `faixas_juros`. Só a rota legada `/api/juros/faixas` usa; o fluxo principal usa a tabela.
- `calculaParcela.js` (legado) gera datas com `new Date()` local e as formata com `toISOString()` (UTC): à noite no Brasil pode gerar o dia seguinte. O cronograma oficial (`datas.js`) evita isso trabalhando só em UTC.
- O ajuste de dia útil considera apenas sábado e domingo; **feriados** não são tratados.
- Não há autenticação, CORS nem limite de requisições. A API confia em qualquer cliente que a alcance.
- As rotas de `/api/juros` usam um formato de erro antigo (`{ erro: 'texto' }`), diferente do padrão `{ erro: { codigo, mensagem, detalhes } }`.
- `hojeIso()` usa o fuso **do servidor**: se o servidor rodar em UTC, "hoje" pode diferir do "hoje" do cliente no Brasil.

## 11. Perguntas e respostas de prova

### 11.1 JavaScript e Node.js

**O que significa `"type": "module"` no `package.json`?** Que os arquivos `.js` são ES Modules: usam `import`/`export` em vez de `require`/`module.exports`, suportam top-level `await` e exigem extensão nos caminhos relativos.

**Qual a diferença entre `export default` e `export` nomeado?** Um módulo tem no máximo um `default` (importado sem chaves e com qualquer nome) e quantos nomeados quiser (importados entre chaves com o mesmo nome). `app.js` exporta `default app`; `util.js` exporta `arredonda2` nomeado.

**Por que o projeto usa `const` quase sempre?** Porque impede reatribuição acidental e comunica intenção. `let` só aparece onde o valor muda de verdade (`saldo`, `lo`, `hi`, `somaDiario`). `var` tem escopo de função e é evitado.

**`const parcelas = []` e depois `parcelas.push(...)`: isso não viola o `const`?** Não. `const` protege a **ligação** entre nome e valor, não o conteúdo do objeto. `parcelas = outroArray` seria erro; `push` muda o conteúdo do mesmo array.

**O que é uma arrow function e em que ela difere de `function`?** Sintaxe curta `(a) => a * 2`; não tem `this` próprio nem `arguments`; não é içada. Usada em callbacks (`.map`, `.reduce`) e em rotas.

**O que faz `const { capital, taxa, periodos } = req.body ?? {}`?** Desestrutura o corpo em três variáveis. O `?? {}` garante que, se `req.body` for `undefined`, desestrutura-se um objeto vazio (as três ficam `undefined`) em vez de lançar erro.

**Diferença entre `??` e `||`?** `||` troca qualquer valor "falsy" (`0`, `''`, `false`, `null`, `undefined`); `??` troca só `null` e `undefined`. `Number(process.env.PORT ?? 3000)` preserva uma porta `0`.

**O que faz `?.`?** Acessa a propriedade só se o objeto existir; caso contrário devolve `undefined` sem lançar. `req.body?.sistema`.

**Para que servem os três pontos em `{ ...parcela, vencimento }` e em `const { parcelas, ...resumo } = resultado`?** O primeiro é *spread*: copia as propriedades de `parcela` em um objeto novo e acrescenta `vencimento`. O segundo é *rest*: tira `parcelas` e guarda todas as outras propriedades em `resumo`.

**A cópia por spread é profunda?** Não, é rasa. Objetos aninhados continuam compartilhados. Para cópia profunda os testes usam `structuredClone`.

**Por que `typeof null` é `'object'` e como o código lida com isso?** É um defeito histórico da linguagem. Por isso `validaCliente` testa `cliente === null` explicitamente e `Array.isArray` para distinguir arrays.

**Qual a diferença entre `Number.isInteger`, `Number.isFinite` e `isNaN`?** `isFinite` aceita qualquer número real finito (barra `NaN`, `Infinity` e strings); `isInteger` ainda exige sem parte decimal; `Number.isNaN` testa especificamente `NaN` (que não é igual a si mesmo).

**O que acontece com `Number('')`, `Number('abc')` e `Number('2')`?** `0`, `NaN` e `2`. Por isso a listagem valida com `Number.isInteger` depois de converter a query string.

**Por que `0.1 + 0.2 !== 0.3` e como o projeto evita problemas de centavos?** Números são binários de ponto flutuante e não representam exatamente certos decimais. O projeto arredonda cada valor com `arredonda2` (que soma `Number.EPSILON` antes de `Math.round(x * 100) / 100`) e soma totais a partir dos valores já arredondados; a última parcela absorve a diferença.

**O que `toFixed(2)` devolve?** Uma **string**. Por isso aparece `Number((montante - capital).toFixed(2))` e `+parcela.toFixed(2)`.

**O que é `**`?** Operador de exponenciação: `(1 + taxaMes) ** -prazoMeses` é `(1+i)^−n`.

**Explique `reduce`.** Percorre o array acumulando um valor: `parcelas.reduce((soma, p) => soma + p.juros, 0)` começa em 0 e soma os juros de cada parcela. `map` transforma, `filter` seleciona, `find` acha o primeiro, `every` testa todos, `includes` testa pertinência.

**Por que `for (const calculaParcelas of [calculaPrice, calculaSac])` funciona?** Funções são valores; o array contém duas funções e o laço chama cada uma com os mesmos argumentos.

**`for...of` ou `for...in`?** `for...of` percorre valores (arrays); `for...in` percorre chaves (e também propriedades herdadas), por isso não é usado.

**Por que `Object.hasOwn(TIPOS, tipoPessoa)` e não `tipoPessoa in TIPOS`?** `in` enxerga propriedades herdadas do protótipo (`constructor`, `toString`); `hasOwn` só as próprias. Evita aceitar `"tipoPessoa": "constructor"`.

**Para que serve `JSON.stringify` e `JSON.parse` no projeto?** `stringify` converte o objeto `{ cliente, entrada, taxa, simulacoes }` em texto para gravar na coluna JSON e para enviar corpo HTTP; `parse` faz o inverso (o mysql2 já devolve a coluna JSON como objeto, mas o repositório trata o caso de vir texto).

**Por que o mês em `Date.UTC(ano, mes - 1, dia)` tem `- 1`?** Meses em `Date` vão de 0 (janeiro) a 11 (dezembro).

**Como `adicionaMeses('2026-10-30', 4)` chega em `2027-02-28`?** Mês 9 + 4 = 13 (transborda para fevereiro de 2027); `Date.UTC(2026, 14, 0)` dá o último dia de fevereiro (28); `Math.min(30, 28) = 28`.

**Por que `datas.js` trabalha em UTC e `hojeIso` em horário local?** `toISOString` é sempre UTC, então uma data local à noite no Brasil viraria "amanhã". Cálculos de calendário são feitos em UTC para serem determinísticos; a data de hoje é montada com `getFullYear/getMonth/getDate` para refletir o dia local.

**Como se sabe se uma data é sábado ou domingo?** `getUTCDay()` devolve 0 (domingo) a 6 (sábado); `proximoDiaUtil` avança um dia (`+ 86 400 000 ms`) enquanto for 0 ou 6.

**O que é uma classe que `extends Error`? Por que chamar `super(mensagem)`?** Uma classe filha de `Error`, que pode ser lançada com `throw` e ganha `message` e `stack`. `super` chama o construtor da classe-mãe e é obrigatório antes de usar `this` na subclasse.

**O que `instanceof` faz no tratador de erros?** Testa se o erro foi criado por `ErroDeNegocio` (ou subclasse). Se sim, responde com o status do erro; se não, é inesperado e vira 500.

**O que é uma Promise e o que `async`/`await` fazem?** Promise é um objeto que representa um valor futuro (ou um erro futuro). `async` faz a função devolver uma Promise; `await` pausa a função até a Promise resolver e devolve o valor (ou lança o erro), sem bloquear o servidor.

**O que acontece se esquecer o `await`?** A variável recebe a Promise em vez do valor. É exatamente o erro de `finOpsApi.post('/operacoes', repositorio.buscarPorId(id))` (§10.1).

**Por que as rotas de `operacoes.js` não têm `try/catch`?** No Express 5, erros lançados em rotas `async` são encaminhados ao tratador de erros automaticamente. O único `try/catch` é o que traduz `ER_DUP_ENTRY` para 409.

**Para que serve `finally`?** Rodar sempre, com ou sem erro: os scripts de banco fecham a conexão em `finally { await conexao.end(); }`.

**O que é top-level `await`?** `await` fora de função, permitido em ES Modules. `db/schema.js` faz `try { await rodaSchema(); } catch (erro) { mostraErro(...) }` no nível do módulo.

**O que é uma função pura e quais são as do projeto?** Mesma entrada → mesma saída, sem efeitos colaterais. `calculaPrice`, `calculaSac`, `geraCronograma`, `calculaEncargos`, `calculaCet`, `montaDemonstrativo`, `simulaOperacao`, `avaliaDefinicao`, `montaConsolidado`, as funções de `documento.js` e de `datas.js`.

**O que é closure? Onde aparece?** Função que captura variáveis do escopo onde nasceu. `f` em `calculaCet` captura `cronograma` e `valorLiberado`; `get`/`post` em `finOpsApi` capturam `apiUrl` e `headers`.

**O que é `process.env` e como o `.env` é lido?** `process.env` são as variáveis de ambiente do processo. A flag `--env-file=.env` do Node carrega o arquivo antes de rodar; não é usada biblioteca `dotenv`.

**O que faz `node --watch`?** Reinicia o processo quando um arquivo muda, sem precisar de nodemon.

**Para que serve `import.meta.url`?** Dá a URL do próprio arquivo; `new URL('./seed.sql', import.meta.url)` acha o SQL ao lado do script, independentemente da pasta onde o comando foi executado.

**O que é `10_000_000`?** O número 10000000 com separadores visuais (sintaxe permitida desde o ES2021).

**Parâmetro padrão `repositorio = repositorioModalidades`: para que serve?** Injeção de dependência: a API usa o banco real sem passar nada; os testes passam o banco falso.

### 11.2 Express e HTTP

**O que é um middleware?** Função `(req, res, next)` que processa o pedido antes das rotas. `express.json()` converte o corpo JSON em `req.body`; `express.urlencoded` faz o mesmo para formulários.

**Por que o tratador de erros tem 4 parâmetros?** O Express identifica um middleware de erro pela quantidade de parâmetros `(err, req, res, next)`. Com 3, seria tratado como middleware comum e nunca receberia o erro.

**Para que serve `Router`?** Agrupar rotas em arquivos separados com caminhos relativos, montados em `index.js` sob um prefixo. Facilita organização e permite acrescentar recurso sem mexer nos outros.

**De onde vêm `req.params`, `req.query` e `req.body`, e que tipo têm?** Da URL (`/:id`), da query string (`?pagina=2`) e do corpo. Os dois primeiros são sempre strings; o corpo tem os tipos do JSON.

**Como a rota garante que `:id` é válido?** `leId` faz `Number(valor)`, exige `Number.isInteger` e `≥ 1`; senão lança 400.

**Por que `POST /api/operacoes` responde 201 e não 200?** 201 Created indica que um recurso novo foi criado.

**Qual a diferença entre 400 e 422?** 400: pedido malformado ou campos inválidos. 422: pedido correto que a regra de negócio recusa (score insuficiente, CET impossível, consolidado de operação não definida).

**Quando a API usa 409?** Conflito com o estado atual: identificador já existente e operação já definida.

**O que é 503 em `/api/health`?** Serviço indisponível: a API está no ar, mas o banco não respondeu ao `SELECT 1`.

**Por que `/por-identificador/:identificador/consolidado` é registrada antes de `/:id/consolidado`?** Rotas são testadas na ordem. Aqui não colidem (3 segmentos contra 2), mas registrar a mais específica primeiro é a prática segura; `GET /:id` fica por último porque casa com qualquer segmento.

**O que acontece se o cliente mandar JSON inválido?** `express.json()` lança erro com `type 'entity.parse.failed'`; o tratador responde 400 `DADOS_INVALIDOS` no formato padrão.

**O que é Swagger/OpenAPI e onde está?** OpenAPI é um padrão de descrição de APIs; `src/openapi.js` tem a especificação e `swagger-ui-express` a exibe em `/api/docs`.

**Como se cria um endpoint novo?** Criar arquivo em `src/routes/`, usar `Router()`, exportar `default`, registrar em `routes/index.js` com `router.use('/caminho', rotas)` e descrever em `openapi.js`.

**Por que o Express 5 e não o 4?** Entre outros motivos, o 5 encaminha erros de rotas `async` ao tratador automaticamente.

### 11.3 Arquitetura e banco

**Quais são as camadas e por que separar?** routes (HTTP) → servicos (orquestração) → lib (cálculo puro) e repositorios (SQL) → db. Cada camada testável isolada, SQL em um lugar só, cálculo sem dependências.

**O que é um repositório?** Módulo que encapsula o acesso a uma tabela: SQL com placeholders e tradução `snake_case` → `camelCase`. É a única camada que conhece nomes de colunas.

**Por que `ativo: linha.ativo === 1`?** `BOOLEAN` no MySQL é `TINYINT(1)`: vem 0/1, e a API quer `true`/`false`.

**O que é um pool de conexões?** Conjunto de conexões reaproveitadas (até 10). Evita abrir e fechar conexão a cada pedido.

**Para que servem `decimalNumbers: true` e `dateStrings: true`?** Colunas `DECIMAL` chegam como número (não string); datas chegam como texto `AAAA-MM-DD` sem conversão de fuso.

**O que é SQL injection e como o projeto evita?** Injetar SQL pelo dado do usuário. Evitado com placeholders `?` (o driver escapa); nunca se concatena dado do usuário na string.

**Por que `LIMIT ? OFFSET ?` recebe números e não strings?** O mysql2 exige números nessas posições; a rota converte a query string com `Number`.

**Como funciona a paginação?** `offset = (pagina − 1) × tamanho`; `LIMIT tamanho OFFSET offset`; segunda consulta `COUNT(*)`; `totalPaginas = Math.ceil(total / tamanho)`.

**Por que `DECIMAL` e não `FLOAT` para valores monetários?** `DECIMAL(15,2)` é exato nas duas casas; `FLOAT` tem o mesmo problema de representação binária.

**O que a `UNIQUE KEY` em `identificador` resolve que o código não resolve sozinho?** A condição de corrida: dois pedidos simultâneos passam na checagem `existeIdentificador`, mas só um `INSERT` vence; o outro recebe `ER_DUP_ENTRY`, traduzido para 409.

**Como a definição dupla é evitada?** `UPDATE ... WHERE id = ? AND estado = 'SIMULADA'`: se outra requisição já definiu, afeta 0 linhas e a rota responde 409. É um update condicional (concorrência otimista).

**Por que a coluna `resultado` nunca recebe `UPDATE`?** Para o consolidado ser reproduzível e auditável: o que foi simulado é o que vai para o contrato. Só `estado`, `sistema_definido` e `definido_em` mudam.

**O seed pode rodar duas vezes?** Sim: `INSERT ... ON DUPLICATE KEY UPDATE` atualiza em vez de falhar (idempotente).

**Por que não há migrations?** Decisão do time: `CREATE TABLE IF NOT EXISTS` não altera tabela existente; `schema.js` detecta colunas faltando e manda rodar `npm run reset` (apaga e recria).

**Que `CHECK`s o banco impõe?** valor > 0, score ≤ 1000, tipo_pessoa em PF/PJ, documento só dígitos com 11 ou 14 conforme o tipo, estado em SIMULADA/DEFINIDA e coerência entre estado e colunas de definição; em `faixas_juros`, faixa E sem taxa e demais com taxa.

**Por que as taxas ficam no banco e não em código?** Para mudar taxa sem deploy e para o banco ser a fonte única (modalidades, faixas e teto). O código só escolhe a linha pelo score.

**O que é o "banco falso"?** Arrays em memória com os mesmos dados do seed e funções com a mesma assinatura dos repositórios, usados pelos testes para rodar sem MySQL.

### 11.4 Regras de negócio e matemática financeira

**Quais campos o `POST /api/operacoes` exige e quais são opcionais?** Obrigatórios: identificador, cliente, valor, modalidade, score, prazoMeses. Opcionais: dataLiberacao (hoje) e primeiroRelacionamento (false).

**Por que a validação não para no primeiro erro?** Para o cliente da API corrigir tudo de uma vez: todos os problemas voltam em `detalhes`.

**Como é validado um CPF?** Tira máscara, exige 11 dígitos, rejeita todos iguais, calcula os dois DVs pelo módulo 11 (pesos 10..2 e 11..2) e compara com os dois últimos dígitos.

**Como é validado um CNPJ?** Mesma ideia com 14 dígitos e pesos 5 4 3 2 9 8 7 6 5 4 3 2 e 6 5 4 3 2 9 8 7 6 5 4 3 2.

**Por que `111.111.111-11` é inválido se passa no módulo 11?** Regra extra: documentos com todos os dígitos iguais são rejeitados.

**Como o score vira taxa?** Score → faixa (A 800–1000, B 600–799, C 400–599, D 200–399, E 0–199) → linha de `faixas_juros` da modalidade → `taxa_mes`. A taxa da tabela já é `min(base + spread, teto)`, com spreads 0 / 0,5 / 1 / 2.

**O que é o teto e o que significa `tetoAplicado`?** Taxa máxima da modalidade; `tetoAplicado` é `true` quando `base + spread` ultrapassaria o teto e a faixa ficou travada nele (ex.: INSS faixas B, C e D em 1,85).

**O que acontece com score 150?** Faixa E → `422 SCORE_INSUFICIENTE`, nada é gravado.

**Diferença entre juros simples e compostos?** Simples: `M = C(1 + i·n)`, juros sobre o capital. Compostos: `M = C(1 + i)^n`, juros sobre o saldo acumulado. 1.000 a 2% por 12: 1.240,00 contra 1.268,24.

**Como converter taxa mensal em anual?** `(1 + i)^12 − 1`: 1,85% a.m. → 24,60% a.a. Não se multiplica por 12.

**Qual a fórmula da parcela Price?** `P = V·i / (1 − (1+i)^−n)`. Para 10.000, 2%, 12: 945,60.

**No Price, o que muda de uma parcela para outra?** A parcela é fixa; os juros (saldo × i) caem e a amortização (P − juros) sobe.

**E no SAC?** Amortização fixa (V / n); juros caem; a parcela cai. Primeira parcela 1.033,33; última 850,04.

**Qual sistema paga menos juros no total e por quê?** O SAC (1.300 contra 1.347,15 no exemplo), porque amortiza mais cedo e o saldo sobre o qual os juros incidem cai mais rápido. Em troca, as parcelas iniciais do SAC são maiores.

**Por que a última parcela do Price é 945,55 e não 945,60?** Arredondamentos a 2 casas em cada mês acumulam uma diferença de centavos; a última amortização é forçada a ser o saldo restante para a dívida fechar em zero exato.

**Como a data de vencimento é calculada?** Liberação + k meses (dia preservado; 30/02 vira 28/02), depois sábado/domingo avança para segunda; `diasCorridos` é a diferença em dias até a data ajustada. Feriados não são considerados.

**O que é IOF diário e como é calculado?** 0,0082% ao dia sobre a amortização de cada parcela, por `min(diasCorridos, 365)` dias, somado em todas as parcelas e arredondado só no total.

**O que é IOF adicional?** 0,38% (PF) ou 0,95% (PJ) sobre o valor total, uma única vez.

**Quando a tarifa de cadastro é cobrada?** Só no primeiro relacionamento (R$ 50), conforme o Tema 620 do STJ.

**Por que o IOF do SAC é menor que o do Price no mesmo cenário?** Porque no SAC a amortização é maior nas primeiras parcelas, que têm menos dias corridos; o IOF diário multiplica amortização por dias.

**O que é valor liberado?** `valor − encargos.total`: o que o cliente recebe de fato, já descontados IOF e tarifa.

**O que é CET?** Custo Efetivo Total: a taxa anual que iguala o valor liberado ao valor presente das parcelas, considerando todos os encargos (Res. CMN 4.881/2020). É sempre maior ou igual à taxa de juros.

**Por que o CET é calculado por bisseção?** Porque a taxa aparece no expoente da equação e não há fórmula fechada. A bisseção parte de [0%, 1000%], testa o ponto médio e fica com a metade onde a função muda de sinal, até a largura ser menor que 1e-10 (no máximo 200 iterações).

**O que garante que a bisseção vai funcionar?** `f(0) > 0` (soma das parcelas maior que o valor liberado) e `f(10) < 0`. Se não valer, lança `422 CET_NAO_CONVERGE`; o código nunca devolve `NaN` nem trava.

**Qual checagem de sanidade do CET existe?** Sem encargos, o CET mensal é exatamente a taxa de juros (2,00%). Com encargos sobe para 2,42% no cenário de referência.

**Como o CET anual vira mensal?** `(1 + CETanual)^(1/12) − 1`.

**O que é o demonstrativo?** Composição do total devido: Principal, Juros, IOF e Tarifa, cada um com percentual sobre o total devido (somatório das parcelas + encargos).

**O PJ paga parcelas diferentes do PF?** Não. Só o IOF adicional muda (0,95%), o que altera encargos, valor liberado, CET e total devido; cronograma e parcelas são idênticos.

**Quais os estados de uma operação?** `SIMULADA` (nasce assim, com as duas simulações) e `DEFINIDA` (após escolher PRICE ou SAC; imutável).

**O que acontece ao definir uma operação já definida?** `409 AMORTIZACAO_JA_DEFINIDA`, citando o sistema já escolhido. Sistema inválido dá 400 mesmo nesse caso (400 vence 409).

**O que é o consolidado e por que não recalcula?** Documento com só o sistema escolhido, montado a partir do JSON gravado. Não recalcular garante que o contrato reflita exatamente a simulação aprovada.

**Por que o cronograma se chama `calendario` no consolidado?** É o nome usado pela equipe de contrato (decisão de contrato entre os grupos).

**Como listar só as operações prontas para contrato?** `GET /api/operacoes?estado=DEFINIDA`.

### 11.5 Testes

**Que ferramenta de teste é usada?** `node:test` e `node:assert/strict`, embutidos no Node; `npm test` roda `node --test`.

**Os testes precisam do MySQL?** Os 84 unitários não (usam funções puras e o banco falso). Só `npm run verifica` precisa.

**Qual a diferença entre `assert.equal` e `assert.deepEqual`?** `equal` compara com `===` (primitivos ou mesma referência); `deepEqual` compara conteúdo de objetos e arrays.

**Como se testa que uma função lança erro?** `assert.throws(() => fn(), validador)` para síncronas; `await assert.rejects(promise, validador)` para assíncronas. O validador pode checar `erro.codigo` e `erro.status`.

**Como se prova que uma função é pura nos testes?** Chamando duas vezes e comparando com `deepEqual`, e comparando a entrada com um `structuredClone` feito antes.

**O que é um espião no teste de `calculaTaxa`?** Um repositório falso que grava os argumentos de cada chamada em um array, permitindo afirmar que houve exatamente uma consulta com `['OUTROS_BENS', undefined]`.

**O que o teste ponta a ponta faz de diferente?** Sobe o app de verdade, chama os endpoints por HTTP com `fetch` contra o MySQL real e limpa o que criou.

## 12. Glossário

| Termo | Significado |
|---|---|
| Amortização | Parte da parcela que reduz o saldo devedor (o resto é juros) |
| API REST | Interface HTTP organizada em recursos, manipulados por métodos e respondendo JSON |
| Bisseção | Método numérico que acha a raiz de uma função dividindo o intervalo ao meio repetidamente |
| CET | Custo Efetivo Total: taxa anual que inclui juros, IOF e tarifas |
| Closure | Função que captura variáveis do escopo em que foi criada |
| Condição de corrida | Resultado errado quando duas operações simultâneas interferem uma na outra |
| Desestruturação | Extrair propriedades de objeto ou posições de array em variáveis |
| Dublê de teste (fake, stub, spy) | Objeto que substitui uma dependência real nos testes |
| ES Modules | Sistema de módulos padrão do JavaScript (`import`/`export`) |
| Faixa de risco | Letra A a E atribuída pelo score; define spread e aceitação |
| Função pura | Sem efeitos colaterais; mesma entrada, mesma saída |
| Idempotente | Pode ser executado várias vezes com o mesmo resultado (seed, schema) |
| Injeção de dependência | Passar a dependência (repositório) de fora, em vez de criá-la dentro |
| IOF | Imposto sobre Operações Financeiras: parte diária e parte adicional |
| Middleware | Função pela qual todo pedido passa antes da rota |
| Módulo 11 | Algoritmo dos dígitos verificadores de CPF e CNPJ |
| Placeholder `?` | Marcador de parâmetro em SQL, substituído com escape pelo driver |
| Pool | Conjunto de conexões de banco reutilizadas |
| Price | Sistema de amortização com parcela constante (Tabela Price) |
| Promise | Objeto que representa um valor futuro; base de `async`/`await` |
| Repositório | Camada que isola o SQL de uma tabela |
| SAC | Sistema de Amortização Constante: amortização fixa, parcela decrescente |
| Score | Pontuação de crédito do cliente, 0 a 1000 |
| Seed | Carga inicial de dados do banco |
| Spread | Acréscimo à taxa base conforme o risco da faixa |
| Teto | Taxa máxima permitida para a modalidade |
| UTC | Tempo Universal Coordenado, referência de fuso usada nos cálculos de data |
| Valor liberado | Valor contratado menos os encargos descontados na liberação |
