// Especificação OpenAPI 3 da API — é o que o Swagger UI mostra em /api/docs
// (a versão crua, em JSON, fica em /api/docs.json).
//
// É escrita à mão, em um único lugar, para o contrato da API ficar explícito e revisável no PR.
// Quando mudar um endpoint, mude aqui também: campo novo, código de erro novo, regra nova.
// O script `npm run verifica` confere que a página sobe e que todos os endpoints estão listados.
//
// Convenções do arquivo:
//   - `components.schemas` descreve os objetos (Modalidade, Operacao...) uma vez; os endpoints
//     apontam para eles com `$ref`.
//   - Os exemplos são o cenário A.5 do docs/backlog-api.md. O exemplo da operação completa e o do
//     consolidado são CALCULADOS pelo próprio código (simulaOperacao, montaConsolidado), então
//     nunca ficam diferentes do que a API devolve.
import { simulaOperacao } from './servicos/simulacao.js';
import { montaConsolidado } from './servicos/consolidado.js';

// ---------------------------------------------------------------------------------------------
// Exemplos (cenário A.5: consignado INSS, score 650, R$ 10.000 em 12x, liberação em 2026-10-30,
// cliente PF de teste CPF 529.982.247-25)
// ---------------------------------------------------------------------------------------------
const EXEMPLO_PEDIDO = {
  identificador: 'OP-2026-0001',
  cliente: { tipoPessoa: 'PF', documento: '529.982.247-25' },
  valor: 10000,
  modalidade: 'CONSIGNADO_INSS',
  score: 650,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  primeiroRelacionamento: true,
};

// Como o cliente fica gravado e é devolvido: documento só com dígitos.
const EXEMPLO_CLIENTE = { tipoPessoa: 'PF', documento: '52998224725' };

const EXEMPLO_TAXA = {
  faixaRisco: 'B',
  descricaoFaixa: 'Risco baixo',
  taxaBaseMes: 1.6,
  tetoTaxaMes: 1.85,
  taxaFinalMes: 1.85,
  taxaFinalAno: 24.6,
  tetoAplicado: true,
};

const EXEMPLO_MODALIDADE = {
  codigo: 'CONSIGNADO_INSS',
  nome: 'Crédito pessoal consignado INSS',
  modalidadeBcb: 'Crédito pessoal consignado INSS - Prefixado',
  publico: 'PF',
  regimeIndexacao: 'PREFIXADO',
  tetoTaxaMes: 1.85,
  taxaReferenciaBcbMes: 1.83,
  prazoMinMeses: 6,
  prazoMaxMeses: 84,
  descricao: 'Parcelas descontadas diretamente do benefício do INSS. Teto regulatório CNPS (provisório).',
  ativo: true,
};

const EXEMPLO_OPERACAO = {
  id: 1,
  identificador: EXEMPLO_PEDIDO.identificador,
  criadoEm: '2026-10-08 14:03:22',
  estado: 'SIMULADA',
  definicao: null,
  ...simulaOperacao(
    { ...EXEMPLO_PEDIDO, modalidade: { codigo: EXEMPLO_PEDIDO.modalidade }, cliente: EXEMPLO_CLIENTE },
    EXEMPLO_TAXA,
  ),
};

const EXEMPLO_DEFINICAO = { sistema: 'PRICE', definidoEm: '2026-10-08 15:12:40' };

const EXEMPLO_OPERACAO_DEFINIDA = {
  ...EXEMPLO_OPERACAO,
  estado: 'DEFINIDA',
  definicao: EXEMPLO_DEFINICAO,
};

const EXEMPLO_CONSOLIDADO = montaConsolidado(EXEMPLO_OPERACAO_DEFINIDA, EXEMPLO_MODALIDADE);

const EXEMPLO_FAIXAS = [
  { faixa: 'A', scoreMin: 800, scoreMax: 1000, taxaMes: 1.6, taxaAno: 20.98, descricao: 'Risco muito baixo' },
  { faixa: 'B', scoreMin: 600, scoreMax: 799, taxaMes: 1.85, taxaAno: 24.6, descricao: 'Risco baixo' },
  { faixa: 'C', scoreMin: 400, scoreMax: 599, taxaMes: 1.85, taxaAno: 24.6, descricao: 'Risco médio' },
  { faixa: 'D', scoreMin: 200, scoreMax: 399, taxaMes: 1.85, taxaAno: 24.6, descricao: 'Risco alto' },
  { faixa: 'E', scoreMin: 0, scoreMax: 199, taxaMes: null, taxaAno: null, descricao: 'Recusado: score abaixo do mínimo' },
].map((f) => ({ modalidadeCodigo: 'CONSIGNADO_INSS', ...f, permiteContratacao: f.taxaMes !== null }));

const EXEMPLO_RESUMO = {
  id: 1,
  identificador: 'OP-2026-0001',
  estado: 'DEFINIDA',
  definicao: EXEMPLO_DEFINICAO,
  cliente: EXEMPLO_CLIENTE,
  modalidade: 'CONSIGNADO_INSS',
  valor: 10000,
  score: 650,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  faixaRisco: 'B',
  taxaFinalMes: 1.85,
  cetPriceAno: EXEMPLO_OPERACAO.simulacoes.PRICE.cet.anualPercentual,
  cetSacAno: EXEMPLO_OPERACAO.simulacoes.SAC.cet.anualPercentual,
  criadoEm: '2026-10-08 14:03:22',
};

// ---------------------------------------------------------------------------------------------
// Atalhos para não repetir a mesma estrutura em todo endpoint
// ---------------------------------------------------------------------------------------------
const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });

const respostaJson = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, ...(example !== undefined && { example }) } },
});

const respostaErro = (description, codigo, mensagem, detalhes) =>
  respostaJson(description, ref('Erro'), {
    erro: { codigo, mensagem, ...(detalhes && { detalhes }) },
  });

const dinheiro = (description, example) => ({
  type: 'number', description: `${description} (R$, 2 casas decimais)`, example,
});
const percentual = (description, example) => ({
  type: 'number', description: `${description} (em %, 2 casas decimais)`, example,
});

const parametroId = {
  name: 'id', in: 'path', required: true,
  description: 'Id numérico devolvido pelo POST',
  schema: { type: 'integer', minimum: 1, example: 1 },
};

const ERRO_ID = respostaErro('`id` não é inteiro positivo', 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', ['id deve ser um inteiro maior ou igual a 1']);
const ERRO_404 = respostaErro('Não existe operação com esse id', 'OPERACAO_NAO_ENCONTRADA', 'Operação 999999 não encontrada');
const ERRO_500 = respostaErro('Erro inesperado', 'ERRO_INTERNO', 'Erro interno do servidor');
const ERRO_NAO_DEFINIDA = respostaErro('A operação existe mas ainda está SIMULADA: falta escolher o sistema', 'OPERACAO_NAO_DEFINIDA', 'Operação 1 ainda não tem sistema de amortização definido');

// ---------------------------------------------------------------------------------------------
// A especificação
// ---------------------------------------------------------------------------------------------
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API de Simulação de Crédito',
    version: '1.1.0',
    description: `
API acadêmica que recebe um pedido de crédito (cliente, valor, modalidade, score, prazo) e devolve
a simulação completa: parcelas pelos sistemas **Price** e **SAC** com datas reais de vencimento,
**IOF** e **tarifa de cadastro**, e o **CET** (Custo Efetivo Total) com o demonstrativo da
Resolução CMN 4.881/2020. Cada simulação é gravada no MySQL e pode ser consultada depois.

Depois da simulação, **outro grupo escolhe o sistema de amortização** (\`POST /operacoes/{id}/definicao\`):
a operação passa de \`SIMULADA\` para \`DEFINIDA\` e a escolha não muda mais. A **equipe de contrato**
lê então o **consolidado** (\`GET /operacoes/{id}/consolidado\` ou por identificador): um único
documento com cliente, produto, taxa, encargos, CET, demonstrativo e o calendário do sistema escolhido.

### Convenções
- **Taxas em porcentagem**: \`1.85\` significa 1,85% ao mês (efetiva, capitalização composta).
- **Dinheiro** sempre com 2 casas decimais; a última parcela absorve a diferença de centavos.
- **Encargos pagos antecipadamente**: IOF e tarifa são descontados do valor liberado, não financiados.
- **IOF adicional por tipo de pessoa**: 0,38% (PF) ou 0,95% (PJ) sobre o valor do crédito.
- **Vencimentos**: mesmo dia da liberação, mês a mês; dia inexistente → último dia do mês;
  sábado/domingo → segunda-feira. Feriados são ignorados.
- **Score** de 0 a 1000 em 5 faixas (A 800–1000, B 600–799, C 400–599, D 200–399, E 0–199).
  Faixa E = pedido recusado.
- **Cliente**: \`tipoPessoa\` PF ou PJ e \`documento\` CPF/CNPJ (máscara opcional na entrada;
  devolvido só com dígitos). O calendário gravado nunca é recalculado.
- **Catálogo e taxas vêm do banco** (tabelas \`modalidades\` e \`faixas_juros\`).

### Formato de erro
Toda resposta de erro tem o mesmo formato: \`{ "erro": { "codigo", "mensagem", "detalhes"? } }\`.
Os códigos possíveis estão no schema **Erro**. Os endpoints legados de \`/juros\` são a exceção
(anteriores a esta convenção).

Sem autenticação e sem limite de requisições: projeto acadêmico.
`.trim(),
  },
  servers: [{ url: '/api', description: 'Este servidor' }],
  tags: [
    { name: 'Saúde', description: 'Disponibilidade da API e do banco' },
    { name: 'Modalidades', description: 'Catálogo das modalidades de crédito e suas taxas por faixa de score' },
    { name: 'Operações', description: 'Simular, gravar e consultar operações de crédito' },
    { name: 'Definição e contrato', description: 'Escolha do sistema de amortização (outro grupo) e consolidado para a equipe de contrato' },
    { name: 'Juros (legado)', description: 'Rotas do esqueleto inicial do projeto. Mantidas por compatibilidade; não use em código novo.' },
  ],

  paths: {
    '/health': {
      get: {
        tags: ['Saúde'],
        summary: 'Verifica se a API e o banco respondem',
        operationId: 'health',
        responses: {
          200: respostaJson('API e banco ok', ref('Saude'), { status: 'ok', mensagem: 'API está ok', banco: 'ok' }),
          503: respostaJson('API ok, banco fora', ref('Saude'), { status: 'erro', mensagem: 'API está ok, mas o banco não respondeu', banco: 'erro' }),
        },
      },
    },

    '/modalidades': {
      get: {
        tags: ['Modalidades'],
        summary: 'Lista as modalidades ativas',
        description: 'Lê a tabela `modalidades` (só `ativo = true`), em ordem de código.',
        operationId: 'listarModalidades',
        responses: {
          200: respostaJson('Lista completa', ref('ListaModalidades'), { total: 1, itens: [EXEMPLO_MODALIDADE] }),
          500: respostaErro('Erro inesperado (ex.: banco fora)', 'ERRO_INTERNO', 'Erro interno do servidor'),
        },
      },
    },

    '/modalidades/{codigo}': {
      get: {
        tags: ['Modalidades'],
        summary: 'Uma modalidade com a tabela de taxas por faixa de score',
        description: 'Além dos dados da modalidade, devolve as 5 faixas (A a E) de `faixas_juros`, com a taxa mensal e anual de cada uma. A faixa E não tem taxa: score nessa faixa é recusado.',
        operationId: 'buscarModalidade',
        parameters: [{
          name: 'codigo', in: 'path', required: true,
          description: 'Código da modalidade (ver a lista em GET /modalidades)',
          schema: { type: 'string', example: 'CONSIGNADO_INSS' },
        }],
        responses: {
          200: respostaJson('Modalidade encontrada', ref('ModalidadeComFaixas'), { ...EXEMPLO_MODALIDADE, faixas: EXEMPLO_FAIXAS }),
          404: respostaErro('Código não existe', 'MODALIDADE_NAO_ENCONTRADA', 'Modalidade "NAO_EXISTE" não existe'),
          500: ERRO_500,
        },
      },
    },

    '/operacoes': {
      post: {
        tags: ['Operações'],
        summary: 'Simula e grava uma operação de crédito',
        description: `
Fluxo: valida o corpo (todos os problemas de uma vez, inclusive CPF/CNPJ do cliente) → confere se o
identificador é inédito → descobre a taxa pela modalidade e pelo score (tabela \`faixas_juros\`) →
simula **Price e SAC** com cronograma, IOF, tarifa, CET e demonstrativo → grava → devolve a operação
como ficou gravada, em estado \`SIMULADA\`.

O \`cliente\` é obrigatório: \`tipoPessoa\` PF ou PJ e \`documento\` CPF (PF) ou CNPJ (PJ) válido.
PJ paga IOF adicional de 0,95% (PF: 0,38%); parcelas e cronograma não mudam.

Operações recusadas (422) **não** são gravadas.
`.trim(),
        operationId: 'criarOperacao',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('NovaOperacao'), example: EXEMPLO_PEDIDO } },
        },
        responses: {
          201: respostaJson('Operação simulada e gravada', ref('Operacao'), EXEMPLO_OPERACAO),
          400: respostaErro('Corpo inválido — `detalhes` lista cada problema', 'DADOS_INVALIDOS', 'Há campos inválidos na requisição', [
            'cliente.documento deve ser um CPF válido (11 dígitos)',
            'valor deve ser um número maior que zero',
            'prazoMeses deve estar entre 6 e 84 para CONSIGNADO_INSS',
          ]),
          409: respostaErro('Já existe operação com esse identificador', 'IDENTIFICADOR_DUPLICADO', 'Já existe operação com identificador "OP-2026-0001"'),
          422: respostaErro('Pedido recusado: score na faixa E, ou CET sem solução', 'SCORE_INSUFICIENTE', 'Score abaixo do mínimo para contratação'),
          500: ERRO_500,
        },
      },
      get: {
        tags: ['Operações'],
        summary: 'Lista as operações gravadas, paginadas',
        description: 'Resumo de cada operação (sem cronograma), da mais recente para a mais antiga. Página além do fim devolve `itens: []` com 200. Com `estado`, filtra (e `total` respeita o filtro) — a equipe de contrato usa `estado=DEFINIDA` para achar o que está pronto.',
        operationId: 'listarOperacoes',
        parameters: [
          { name: 'pagina', in: 'query', required: false, description: 'Número da página (a partir de 1)', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'tamanho', in: 'query', required: false, description: 'Itens por página', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          { name: 'estado', in: 'query', required: false, description: 'Filtra por estado da operação; ausente lista todas', schema: { type: 'string', enum: ['SIMULADA', 'DEFINIDA'] } },
        ],
        responses: {
          200: respostaJson('Página de resultados', ref('PaginaOperacoes'), { pagina: 1, tamanho: 10, total: 1, totalPaginas: 1, itens: [EXEMPLO_RESUMO] }),
          400: respostaErro('`pagina`, `tamanho` ou `estado` inválidos', 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', ['tamanho deve ser um inteiro entre 1 e 100', 'estado deve ser SIMULADA ou DEFINIDA']),
          500: ERRO_500,
        },
      },
    },

    '/operacoes/{id}': {
      get: {
        tags: ['Operações'],
        summary: 'Uma operação completa, no mesmo formato da resposta do POST',
        description: 'Devolve as **duas** simulações (Price e SAC) sempre — comparar continua útil depois da definição. `estado` e `definicao` dizem se e como o sistema foi escolhido.',
        operationId: 'buscarOperacao',
        parameters: [parametroId],
        responses: {
          200: respostaJson('Operação encontrada', ref('Operacao'), EXEMPLO_OPERACAO),
          400: ERRO_ID,
          404: ERRO_404,
          500: ERRO_500,
        },
      },
    },

    '/operacoes/{id}/definicao': {
      post: {
        tags: ['Definição e contrato'],
        summary: 'Define o sistema de amortização (PRICE ou SAC) de uma operação simulada',
        description: `
Chamado pelo **grupo dono da operação**. Muda o estado de \`SIMULADA\` para \`DEFINIDA\`, grava o
sistema escolhido e a data/hora, e devolve a operação completa. O calendário definitivo é
\`simulacoes.<sistema>.cronograma\`, exatamente como foi simulado — nada é recalculado.

A definição é **única e imutável**: uma segunda chamada, com qualquer sistema, responde 409.
Para mudar de ideia, crie outra operação (outro identificador). Se duas definições chegarem ao
mesmo tempo, só uma vence; a outra recebe o mesmo 409.
`.trim(),
        operationId: 'definirSistema',
        parameters: [parametroId],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('NovaDefinicao'), example: { sistema: 'PRICE' } } },
        },
        responses: {
          200: respostaJson('Operação definida', ref('Operacao'), EXEMPLO_OPERACAO_DEFINIDA),
          400: respostaErro('`id` inválido, ou `sistema` fora de PRICE/SAC', 'DADOS_INVALIDOS', 'Há campos inválidos na requisição', ['sistema deve ser PRICE ou SAC']),
          404: ERRO_404,
          409: respostaErro('A operação já foi definida (a mensagem diz com qual sistema)', 'AMORTIZACAO_JA_DEFINIDA', 'Operação 1 já está definida como PRICE'),
          500: ERRO_500,
        },
      },
    },

    '/operacoes/{id}/consolidado': {
      get: {
        tags: ['Definição e contrato'],
        summary: 'Consolidado de uma operação definida, para gerar o contrato (por id)',
        description: `
Documento **autocontido** para a equipe de contrato: identificação, cliente (documento completo,
só dígitos), produto com nome, condições, taxa, o sistema escolhido com seu resumo, encargos, valor
liberado, CET com o demonstrativo completo (art. 7º da Res. 4.881) e o **calendário** de parcelas.
Não devolve a simulação não escolhida. Chamadas repetidas devolvem o mesmo conteúdo: nada é
recalculado na leitura.
`.trim(),
        operationId: 'consolidadoPorId',
        parameters: [parametroId],
        responses: {
          200: respostaJson('Consolidado da operação', ref('Consolidado'), EXEMPLO_CONSOLIDADO),
          400: ERRO_ID,
          404: ERRO_404,
          422: ERRO_NAO_DEFINIDA,
          500: ERRO_500,
        },
      },
    },

    '/operacoes/por-identificador/{identificador}/consolidado': {
      get: {
        tags: ['Definição e contrato'],
        summary: 'Consolidado de uma operação definida, para gerar o contrato (por identificador)',
        description: 'Mesmo documento de `GET /operacoes/{id}/consolidado`, localizado pelo `identificador` enviado no POST (ex.: `OP-2026-0001`). O identificador vai **URL-encoded** no caminho (espaço → `%20`, barra → `%2F`). A comparação não diferencia maiúsculas de minúsculas, como a unicidade do identificador.',
        operationId: 'consolidadoPorIdentificador',
        parameters: [{
          name: 'identificador', in: 'path', required: true,
          description: 'Identificador da operação, URL-encoded',
          schema: { type: 'string', minLength: 1, maxLength: 60, example: 'OP-2026-0001' },
        }],
        responses: {
          200: respostaJson('Consolidado da operação', ref('Consolidado'), EXEMPLO_CONSOLIDADO),
          404: respostaErro('Não existe operação com esse identificador', 'OPERACAO_NAO_ENCONTRADA', 'Operação com identificador "NAO-EXISTE" não encontrada'),
          422: ERRO_NAO_DEFINIDA,
          500: ERRO_500,
        },
      },
    },

    '/juros/simples': {
      post: {
        tags: ['Juros (legado)'],
        deprecated: true,
        summary: 'Montante a juros simples e parcelas iguais',
        description: 'Cálculo genérico do esqueleto inicial: `montante = capital × (1 + i × periodos)`. Não usa modalidade, score, IOF nem CET. Vencimentos contados a partir de hoje.',
        operationId: 'jurosSimples',
        requestBody: { required: true, content: { 'application/json': { schema: ref('JurosEntrada'), example: { capital: 1000, taxa: 2, periodos: 12 } } } },
        responses: {
          200: respostaJson('Resultado', ref('JurosResposta'), {
            tipo: 'simples', capital: 1000, taxa: 2, periodos: 12, juros: 240, montante: 1240,
            parcelas: [{ valor: 103.33, vencimento: '2026-09-25' }, { valor: 103.33, vencimento: '2026-10-25' }],
          }),
          400: respostaJson('Campos não numéricos (formato de erro antigo)', ref('ErroLegado'), { erro: 'Campos "capital", "taxa" e "periodos" devem ser números' }),
        },
      },
    },

    '/juros/composto': {
      post: {
        tags: ['Juros (legado)'],
        deprecated: true,
        summary: 'Montante a juros compostos e parcelas iguais',
        description: 'Cálculo genérico do esqueleto inicial: `montante = capital × (1 + i)^periodos`. Não usa modalidade, score, IOF nem CET.',
        operationId: 'jurosComposto',
        requestBody: { required: true, content: { 'application/json': { schema: ref('JurosEntrada'), example: { capital: 1000, taxa: 2, periodos: 12 } } } },
        responses: {
          200: respostaJson('Resultado', ref('JurosResposta'), {
            tipo: 'composto', capital: 1000, taxa: 2, periodos: 12, juros: 268.24, montante: 1268.24,
            parcelas: [{ valor: 105.69, vencimento: '2026-09-25' }, { valor: 105.69, vencimento: '2026-10-25' }],
          }),
          400: respostaJson('Campos não numéricos (formato de erro antigo)', ref('ErroLegado'), { erro: 'Campos "capital", "taxa" e "periodos" devem ser números' }),
        },
      },
    },

    '/juros/faixas': {
      get: {
        tags: ['Juros (legado)'],
        deprecated: true,
        summary: 'Faixa de juros de uma modalidade para um score',
        description: 'Com `modalidadeCodigo` e `score`, devolve a linha da faixa em que o score cai. Sem `modalidadeCodigo`, devolve todas as faixas de todas as modalidades. Prefira `GET /modalidades/{codigo}`, que devolve as 5 faixas de uma vez.',
        operationId: 'jurosFaixas',
        parameters: [
          { name: 'modalidadeCodigo', in: 'query', required: false, schema: { type: 'string', example: 'VEICULOS' } },
          { name: 'score', in: 'query', required: false, description: 'Score 0–1000; ausente conta como 0 (faixa E)', schema: { type: 'integer', minimum: 0, maximum: 1000, example: 750 } },
        ],
        responses: {
          200: respostaJson('Faixas encontradas', { type: 'array', items: ref('Faixa') }, [{
            modalidadeCodigo: 'VEICULOS', faixa: 'B', scoreMin: 600, scoreMax: 799, taxaMes: 2, taxaAno: 26.82, descricao: 'Risco baixo', permiteContratacao: true,
          }]),
        },
      },
    },
  },

  components: {
    schemas: {
      Erro: {
        type: 'object',
        description: 'Formato padrão de erro de toda a API (exceto rotas legadas de /juros).',
        required: ['erro'],
        properties: {
          erro: {
            type: 'object',
            required: ['codigo', 'mensagem'],
            properties: {
              codigo: {
                type: 'string',
                description: 'Código estável para o cliente tratar; a mensagem pode mudar, o código não.',
                enum: [
                  'DADOS_INVALIDOS', 'MODALIDADE_NAO_ENCONTRADA', 'OPERACAO_NAO_ENCONTRADA',
                  'IDENTIFICADOR_DUPLICADO', 'SCORE_INSUFICIENTE', 'CET_NAO_CONVERGE',
                  'AMORTIZACAO_JA_DEFINIDA', 'OPERACAO_NAO_DEFINIDA', 'ERRO_INTERNO',
                ],
              },
              mensagem: { type: 'string', example: 'Há campos inválidos na requisição' },
              detalhes: {
                type: 'array', items: { type: 'string' },
                description: 'Opcional. Em DADOS_INVALIDOS, lista TODOS os problemas encontrados, não só o primeiro.',
              },
            },
          },
        },
      },

      ErroLegado: {
        type: 'object',
        description: 'Formato de erro das rotas legadas de /juros (anterior ao padrão).',
        properties: { erro: { type: 'string' } },
      },

      Saude: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'erro'] },
          mensagem: { type: 'string' },
          banco: { type: 'string', enum: ['ok', 'erro'] },
        },
      },

      Modalidade: {
        type: 'object',
        description: 'Uma linha da tabela `modalidades`. Taxas em % ao mês.',
        properties: {
          codigo: { type: 'string', description: 'Identificador usado no POST /operacoes', example: 'CONSIGNADO_INSS' },
          nome: { type: 'string', example: 'Crédito pessoal consignado INSS' },
          modalidadeBcb: { type: 'string', description: 'Nome da modalidade na série de taxas do Banco Central', example: 'Crédito pessoal consignado INSS - Prefixado' },
          publico: { type: 'string', description: 'Público da série do BCB (informativo; PJ pode usar qualquer modalidade do catálogo)', example: 'PF' },
          regimeIndexacao: { type: 'string', example: 'PREFIXADO' },
          tetoTaxaMes: percentual('Taxa máxima permitida ao mês (regulatória ou de política)', 1.85),
          taxaReferenciaBcbMes: { ...percentual('Mediana da série do BCB; já inclui IOF, só para comparação', 1.83), nullable: true },
          prazoMinMeses: { type: 'integer', example: 6 },
          prazoMaxMeses: { type: 'integer', example: 84 },
          descricao: { type: 'string', nullable: true },
          ativo: { type: 'boolean', description: 'Só modalidades ativas aceitam operações', example: true },
        },
      },

      ListaModalidades: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 6 },
          itens: { type: 'array', items: ref('Modalidade') },
        },
      },

      Faixa: {
        type: 'object',
        description: 'Uma linha da tabela `faixas_juros`: a taxa de uma faixa de score em uma modalidade. A taxa já é a final (teto aplicado).',
        properties: {
          modalidadeCodigo: { type: 'string', example: 'CONSIGNADO_INSS' },
          faixa: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], example: 'B' },
          scoreMin: { type: 'integer', example: 600 },
          scoreMax: { type: 'integer', example: 799 },
          taxaMes: { ...percentual('Taxa efetiva mensal; null na faixa E', 1.85), nullable: true },
          taxaAno: { ...percentual('Taxa anual equivalente, composta; null na faixa E', 24.6), nullable: true },
          descricao: { type: 'string', example: 'Risco baixo' },
          permiteContratacao: { type: 'boolean', description: 'false só na faixa E', example: true },
        },
      },

      ModalidadeComFaixas: {
        // allOf = "tudo de Modalidade" + os campos abaixo
        allOf: [
          ref('Modalidade'),
          { type: 'object', properties: { faixas: { type: 'array', description: 'As 5 faixas, de A a E', items: ref('Faixa') } } },
        ],
      },

      Cliente: {
        type: 'object',
        description: 'Quem contrata. Na entrada o documento pode vir com máscara (`.`, `-`, `/`, espaço); na saída vem só com dígitos. CPF e CNPJ são validados pelos dígitos verificadores (módulo 11). Só dígitos: CNPJ alfanumérico não é aceito nesta versão.',
        required: ['tipoPessoa', 'documento'],
        properties: {
          tipoPessoa: { type: 'string', enum: ['PF', 'PJ'], description: 'PF = pessoa física (CPF); PJ = pessoa jurídica (CNPJ). Define a alíquota do IOF adicional.', example: 'PF' },
          documento: { type: 'string', description: 'CPF (11 dígitos) quando PF; CNPJ (14 dígitos) quando PJ', example: '52998224725' },
        },
      },

      NovaOperacao: {
        type: 'object',
        description: 'Corpo do POST /operacoes.',
        required: ['identificador', 'cliente', 'valor', 'modalidade', 'score', 'prazoMeses'],
        properties: {
          identificador: { type: 'string', minLength: 1, maxLength: 60, description: 'Identificação do pedido, única na base (sem diferenciar maiúsculas)', example: 'OP-2026-0001' },
          cliente: ref('Cliente'),
          valor: { type: 'number', exclusiveMinimum: true, minimum: 0, maximum: 10000000, description: 'Valor solicitado (R$)', example: 10000 },
          modalidade: { type: 'string', description: 'Código de uma modalidade ativa (GET /modalidades)', example: 'CONSIGNADO_INSS' },
          score: { type: 'integer', minimum: 0, maximum: 1000, description: 'Score do cliente; 0–199 (faixa E) é recusado', example: 650 },
          prazoMeses: { type: 'integer', minimum: 1, description: 'Deve estar entre prazoMinMeses e prazoMaxMeses da modalidade', example: 12 },
          dataLiberacao: { type: 'string', format: 'date', description: 'AAAA-MM-DD. Opcional: padrão é a data de hoje. Envie sempre nos testes, para o resultado ser reproduzível.', example: '2026-10-30' },
          primeiroRelacionamento: { type: 'boolean', default: false, description: 'true cobra a tarifa de cadastro (só permitida no primeiro relacionamento — Tema 620/STJ)' },
        },
      },

      Entrada: {
        type: 'object',
        description: 'A entrada como foi gravada, já normalizada (data preenchida, padrões aplicados). O cliente fica fora, em `cliente`.',
        properties: {
          valor: { type: 'number', example: 10000 },
          modalidade: { type: 'string', example: 'CONSIGNADO_INSS' },
          score: { type: 'integer', example: 650 },
          prazoMeses: { type: 'integer', example: 12 },
          dataLiberacao: { type: 'string', format: 'date', example: '2026-10-30' },
          primeiroRelacionamento: { type: 'boolean', example: true },
        },
      },

      Taxa: {
        type: 'object',
        description: 'Como a taxa foi definida: faixa de score do cliente e linha correspondente em `faixas_juros`. Tudo em % ao mês, salvo taxaFinalAno.',
        properties: {
          faixaRisco: { type: 'string', enum: ['A', 'B', 'C', 'D'], example: 'B' },
          descricaoFaixa: { type: 'string', example: 'Risco baixo' },
          taxaBaseMes: percentual('Taxa da faixa A da modalidade (ponto de partida, sem spread)', 1.6),
          tetoTaxaMes: percentual('Teto da modalidade', 1.85),
          taxaFinalMes: percentual('Taxa usada na simulação', 1.85),
          taxaFinalAno: percentual('Equivalente anual composta da taxa final', 24.6),
          tetoAplicado: { type: 'boolean', description: 'true quando a taxa da faixa está achatada no teto da modalidade', example: true },
        },
      },

      Parcela: {
        type: 'object',
        description: 'Um item do cronograma de amortização (no consolidado, do "calendário").',
        properties: {
          numero: { type: 'integer', example: 1 },
          amortizacao: dinheiro('Parte que reduz a dívida', 751.91),
          juros: dinheiro('Juros do mês sobre o saldo devedor', 185),
          valor: dinheiro('Amortização + juros', 936.91),
          saldoDevedor: dinheiro('Saldo após pagar a parcela (0 na última)', 9248.09),
          vencimento: { type: 'string', format: 'date', description: 'Já ajustado para dia útil', example: '2026-11-30' },
          diasCorridos: { type: 'integer', description: 'Dias da liberação até o vencimento', example: 31 },
        },
      },

      Encargos: {
        type: 'object',
        description: 'IOF (Decreto 6.306/2007) e tarifa de cadastro, descontados do valor liberado.',
        properties: {
          iof: {
            type: 'object',
            properties: {
              diario: dinheiro('0,0082% ao dia sobre cada amortização, até 365 dias', 167.65),
              adicional: dinheiro('0,38% (PF) ou 0,95% (PJ) sobre o valor do crédito, uma vez', 38),
              total: dinheiro('diario + adicional', 205.65),
            },
          },
          tarifaCadastro: dinheiro('R$ 50,00 se primeiroRelacionamento, senão 0', 50),
          total: dinheiro('iof.total + tarifaCadastro', 255.65),
        },
      },

      Cet: {
        type: 'object',
        description: 'Custo Efetivo Total (Res. CMN 4.881/2020): taxa que iguala o valor liberado ao valor presente das parcelas, com dias corridos / 365.',
        properties: {
          anualPercentual: percentual('CET ao ano', 30.89),
          mensalPercentual: percentual('CET ao mês, equivalente', 2.27),
        },
      },

      Demonstrativo: {
        type: 'object',
        description: 'Demonstrativo do art. 7º da Res. 4.881: cada componente do custo e seu peso no total devido.',
        properties: {
          componentes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                descricao: { type: 'string', example: 'Juros' },
                valor: dinheiro('Valor do componente', 1242.88),
                percentualSobreTotalDevido: percentual('Peso no total devido', 10.81),
              },
            },
          },
          somatorioParcelas: dinheiro('Soma de todas as parcelas', 11242.88),
          totalDevido: dinheiro('Parcelas + encargos', 11498.53),
        },
      },

      SimulacaoBase: {
        type: 'object',
        properties: {
          totalJuros: dinheiro('Soma dos juros de todas as parcelas', 1242.88),
          totalPago: dinheiro('Soma de todas as parcelas', 11242.88),
          encargos: ref('Encargos'),
          valorLiberado: dinheiro('O que o cliente recebe: valor − encargos.total', 9744.35),
          cet: ref('Cet'),
          demonstrativo: ref('Demonstrativo'),
          cronograma: { type: 'array', description: 'Uma Parcela por mês, de 1 a prazoMeses', items: ref('Parcela') },
        },
      },

      SimulacaoPrice: {
        description: 'Sistema Price: parcelas fixas, amortização crescente.',
        allOf: [
          { type: 'object', properties: { sistema: { type: 'string', enum: ['PRICE'] }, parcelaFixa: dinheiro('Valor da parcela (a última pode variar centavos)', 936.91) } },
          ref('SimulacaoBase'),
        ],
      },

      SimulacaoSac: {
        description: 'Sistema SAC: amortização constante, parcelas decrescentes.',
        allOf: [
          { type: 'object', properties: { sistema: { type: 'string', enum: ['SAC'] }, amortizacaoBase: dinheiro('Amortização de cada parcela (a última absorve a diferença)', 833.33) } },
          ref('SimulacaoBase'),
        ],
      },

      Definicao: {
        type: 'object',
        description: 'Escolha do sistema de amortização. `null` enquanto a operação está SIMULADA.',
        properties: {
          sistema: { type: 'string', enum: ['PRICE', 'SAC'], example: 'PRICE' },
          definidoEm: { type: 'string', description: 'Data/hora da definição (AAAA-MM-DD HH:MM:SS, horário do servidor de banco)', example: '2026-10-08 15:12:40' },
        },
      },

      NovaDefinicao: {
        type: 'object',
        description: 'Corpo do POST /operacoes/{id}/definicao.',
        required: ['sistema'],
        properties: {
          sistema: { type: 'string', enum: ['PRICE', 'SAC'], description: 'Sistema de amortização escolhido (maiúsculo, exato)', example: 'PRICE' },
        },
      },

      Operacao: {
        type: 'object',
        description: 'Operação completa, como gravada. É a resposta do POST, do GET /operacoes/{id} e do POST /operacoes/{id}/definicao. Traz sempre as duas simulações; `estado` e `definicao` dizem qual vale.',
        properties: {
          id: { type: 'integer', example: 1 },
          identificador: { type: 'string', example: 'OP-2026-0001' },
          criadoEm: { type: 'string', description: 'Data/hora da gravação (AAAA-MM-DD HH:MM:SS, horário do servidor de banco)', example: '2026-10-08 14:03:22' },
          estado: { type: 'string', enum: ['SIMULADA', 'DEFINIDA'], description: 'SIMULADA ao nascer; DEFINIDA depois da escolha do sistema', example: 'SIMULADA' },
          definicao: { ...ref('Definicao'), nullable: true },
          cliente: ref('Cliente'),
          entrada: ref('Entrada'),
          taxa: ref('Taxa'),
          simulacoes: {
            type: 'object',
            properties: { PRICE: ref('SimulacaoPrice'), SAC: ref('SimulacaoSac') },
          },
        },
      },

      ResumoOperacao: {
        type: 'object',
        description: 'Item da listagem: só as colunas "planas" da tabela, sem cronograma.',
        properties: {
          id: { type: 'integer', example: 1 },
          identificador: { type: 'string', example: 'OP-2026-0001' },
          estado: { type: 'string', enum: ['SIMULADA', 'DEFINIDA'], example: 'DEFINIDA' },
          definicao: { ...ref('Definicao'), nullable: true },
          cliente: ref('Cliente'),
          modalidade: { type: 'string', example: 'CONSIGNADO_INSS' },
          valor: { type: 'number', example: 10000 },
          score: { type: 'integer', example: 650 },
          prazoMeses: { type: 'integer', example: 12 },
          dataLiberacao: { type: 'string', format: 'date', example: '2026-10-30' },
          faixaRisco: { type: 'string', example: 'B' },
          taxaFinalMes: percentual('Taxa usada', 1.85),
          cetPriceAno: percentual('CET anual no Price', 30.89),
          cetSacAno: percentual('CET anual no SAC', 30.96),
          criadoEm: { type: 'string', example: '2026-10-08 14:03:22' },
        },
      },

      PaginaOperacoes: {
        type: 'object',
        properties: {
          pagina: { type: 'integer', example: 1 },
          tamanho: { type: 'integer', example: 10 },
          total: { type: 'integer', description: 'Total de operações (respeitando o filtro `estado`, se houver)', example: 23 },
          totalPaginas: { type: 'integer', description: 'ceil(total / tamanho); 0 com a tabela vazia', example: 3 },
          itens: { type: 'array', items: ref('ResumoOperacao') },
        },
      },

      Consolidado: {
        type: 'object',
        description: 'Documento para a equipe de contrato: tudo o que foi definido, em um só lugar, só do sistema escolhido. Nenhum valor é recalculado na leitura.',
        properties: {
          operacao: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              identificador: { type: 'string', example: 'OP-2026-0001' },
              estado: { type: 'string', enum: ['DEFINIDA'], example: 'DEFINIDA' },
              criadoEm: { type: 'string', example: '2026-10-08 14:03:22' },
              definidoEm: { type: 'string', example: '2026-10-08 15:12:40' },
            },
          },
          cliente: ref('Cliente'),
          produto: {
            type: 'object',
            properties: {
              codigo: { type: 'string', example: 'CONSIGNADO_INSS' },
              nome: { type: 'string', example: 'Crédito pessoal consignado INSS' },
              modalidadeBcb: { type: 'string', example: 'Crédito pessoal consignado INSS - Prefixado' },
            },
          },
          condicoes: {
            type: 'object',
            properties: {
              valor: { type: 'number', example: 10000 },
              prazoMeses: { type: 'integer', example: 12 },
              dataLiberacao: { type: 'string', format: 'date', example: '2026-10-30' },
              primeiroRelacionamento: { type: 'boolean', example: true },
            },
          },
          taxa: {
            type: 'object',
            properties: {
              faixaRisco: { type: 'string', example: 'B' },
              taxaFinalMes: percentual('Taxa efetiva mensal do contrato', 1.85),
              taxaFinalAno: percentual('Equivalente anual composta', 24.6),
              tetoAplicado: { type: 'boolean', example: true },
            },
          },
          sistema: { type: 'string', enum: ['PRICE', 'SAC'], example: 'PRICE' },
          resumo: {
            type: 'object',
            description: 'Price: parcelaFixa, totalJuros, totalPago. SAC: amortizacaoBase, totalJuros, totalPago.',
            properties: {
              parcelaFixa: dinheiro('Só no Price: valor da parcela', 936.91),
              amortizacaoBase: dinheiro('Só no SAC: amortização de cada parcela', 833.33),
              totalJuros: dinheiro('Soma dos juros', 1242.88),
              totalPago: dinheiro('Soma das parcelas', 11242.88),
            },
          },
          encargos: ref('Encargos'),
          valorLiberado: dinheiro('O que o cliente recebe: valor − encargos.total', 9744.35),
          cet: ref('Cet'),
          demonstrativo: ref('Demonstrativo'),
          calendario: { type: 'array', description: 'Calendário de parcelas do sistema escolhido (= cronograma da simulação, sem alteração)', items: ref('Parcela') },
        },
      },

      JurosEntrada: {
        type: 'object',
        required: ['capital', 'taxa', 'periodos'],
        properties: {
          capital: { type: 'number', example: 1000 },
          taxa: { type: 'number', description: 'Taxa por período, em %', example: 2 },
          periodos: { type: 'integer', example: 12 },
        },
      },

      JurosResposta: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['simples', 'composto'] },
          capital: { type: 'number' },
          taxa: { type: 'number' },
          periodos: { type: 'integer' },
          juros: { type: 'number', description: 'montante − capital' },
          montante: { type: 'number' },
          parcelas: {
            type: 'array',
            description: 'montante / periodos, com vencimentos mensais a partir de hoje',
            items: { type: 'object', properties: { valor: { type: 'number' }, vencimento: { type: 'string', format: 'date' } } },
          },
        },
      },
    },
  },
};
