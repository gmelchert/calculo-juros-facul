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
//   - Os exemplos são o cenário A.5 do docs/backlog-api.md. O exemplo da operação completa é
//     CALCULADO pelo próprio código (simulaOperacao), então nunca fica diferente do que a API devolve.
import { simulaOperacao } from './servicos/simulacao.js';

// ---------------------------------------------------------------------------------------------
// Exemplos (cenário A.5: consignado INSS, score 650, R$ 10.000 em 12x, liberação em 2026-10-30)
// ---------------------------------------------------------------------------------------------
const EXEMPLO_PEDIDO = {
  identificador: 'OP-2026-0001',
  valor: 10000,
  modalidade: 'CONSIGNADO_INSS',
  score: 650,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  primeiroRelacionamento: true,
};

const EXEMPLO_TAXA = {
  faixaRisco: 'B',
  descricaoFaixa: 'Risco baixo',
  taxaBaseMes: 1.6,
  tetoTaxaMes: 1.85,
  taxaFinalMes: 1.85,
  taxaFinalAno: 24.6,
  tetoAplicado: true,
};

const EXEMPLO_OPERACAO = {
  id: 1,
  identificador: EXEMPLO_PEDIDO.identificador,
  criadoEm: '2026-09-25 14:03:22',
  ...simulaOperacao(
    { ...EXEMPLO_PEDIDO, modalidade: { codigo: EXEMPLO_PEDIDO.modalidade } },
    EXEMPLO_TAXA,
  ),
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
  modalidade: 'CONSIGNADO_INSS',
  valor: 10000,
  score: 650,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  faixaRisco: 'B',
  taxaFinalMes: 1.85,
  cetPriceAno: EXEMPLO_OPERACAO.simulacoes.PRICE.cet.anualPercentual,
  cetSacAno: EXEMPLO_OPERACAO.simulacoes.SAC.cet.anualPercentual,
  criadoEm: '2026-09-25 14:03:22',
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

// ---------------------------------------------------------------------------------------------
// A especificação
// ---------------------------------------------------------------------------------------------
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'API de Simulação de Crédito',
    version: '1.0.0',
    description: `
API acadêmica que recebe um pedido de crédito (valor, modalidade, score do cliente, prazo) e devolve
a simulação completa: parcelas pelos sistemas **Price** e **SAC** com datas reais de vencimento,
**IOF** e **tarifa de cadastro**, e o **CET** (Custo Efetivo Total) com o demonstrativo da
Resolução CMN 4.881/2020. Cada simulação é gravada no MySQL e pode ser consultada depois.

### Convenções
- **Taxas em porcentagem**: \`1.85\` significa 1,85% ao mês (efetiva, capitalização composta).
- **Dinheiro** sempre com 2 casas decimais; a última parcela absorve a diferença de centavos.
- **Encargos pagos antecipadamente**: IOF e tarifa são descontados do valor liberado, não financiados.
- **Vencimentos**: mesmo dia da liberação, mês a mês; dia inexistente → último dia do mês;
  sábado/domingo → segunda-feira. Feriados são ignorados.
- **Score** de 0 a 1000 em 5 faixas (A 800–1000, B 600–799, C 400–599, D 200–399, E 0–199).
  Faixa E = pedido recusado.
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
          500: respostaErro('Erro inesperado', 'ERRO_INTERNO', 'Erro interno do servidor'),
        },
      },
    },

    '/operacoes': {
      post: {
        tags: ['Operações'],
        summary: 'Simula e grava uma operação de crédito',
        description: `
Fluxo: valida o corpo (todos os problemas de uma vez) → confere se o identificador é inédito →
descobre a taxa pela modalidade e pelo score (tabela \`faixas_juros\`) → simula **Price e SAC** com
cronograma, IOF, tarifa, CET e demonstrativo → grava → devolve a operação como ficou gravada.

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
            'valor deve ser um número maior que zero',
            'prazoMeses deve estar entre 6 e 84 para CONSIGNADO_INSS',
          ]),
          409: respostaErro('Já existe operação com esse identificador', 'IDENTIFICADOR_DUPLICADO', 'Já existe operação com identificador "OP-2026-0001"'),
          422: respostaErro('Pedido recusado: score na faixa E, ou CET sem solução', 'SCORE_INSUFICIENTE', 'Score abaixo do mínimo para contratação'),
          500: respostaErro('Erro inesperado', 'ERRO_INTERNO', 'Erro interno do servidor'),
        },
      },
      get: {
        tags: ['Operações'],
        summary: 'Lista as operações gravadas, paginadas',
        description: 'Resumo de cada operação (sem cronograma), da mais recente para a mais antiga. Página além do fim devolve `itens: []` com 200.',
        operationId: 'listarOperacoes',
        parameters: [
          { name: 'pagina', in: 'query', required: false, description: 'Número da página (a partir de 1)', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'tamanho', in: 'query', required: false, description: 'Itens por página', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
        ],
        responses: {
          200: respostaJson('Página de resultados', ref('PaginaOperacoes'), { pagina: 1, tamanho: 10, total: 1, totalPaginas: 1, itens: [EXEMPLO_RESUMO] }),
          400: respostaErro('`pagina` ou `tamanho` inválidos', 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', ['tamanho deve ser um inteiro entre 1 e 100']),
          500: respostaErro('Erro inesperado', 'ERRO_INTERNO', 'Erro interno do servidor'),
        },
      },
    },

    '/operacoes/{id}': {
      get: {
        tags: ['Operações'],
        summary: 'Uma operação completa, no mesmo formato da resposta do POST',
        operationId: 'buscarOperacao',
        parameters: [{
          name: 'id', in: 'path', required: true,
          description: 'Id numérico devolvido pelo POST',
          schema: { type: 'integer', minimum: 1, example: 1 },
        }],
        responses: {
          200: respostaJson('Operação encontrada', ref('Operacao'), EXEMPLO_OPERACAO),
          400: respostaErro('`id` não é inteiro positivo', 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', ['id deve ser um inteiro maior ou igual a 1']),
          404: respostaErro('Não existe operação com esse id', 'OPERACAO_NAO_ENCONTRADA', 'Operação 999999 não encontrada'),
          500: respostaErro('Erro inesperado', 'ERRO_INTERNO', 'Erro interno do servidor'),
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
                  'IDENTIFICADOR_DUPLICADO', 'SCORE_INSUFICIENTE', 'CET_NAO_CONVERGE', 'ERRO_INTERNO',
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
          publico: { type: 'string', example: 'PF' },
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

      NovaOperacao: {
        type: 'object',
        description: 'Corpo do POST /operacoes.',
        required: ['identificador', 'valor', 'modalidade', 'score', 'prazoMeses'],
        properties: {
          identificador: { type: 'string', minLength: 1, maxLength: 60, description: 'Identificação do pedido, única na base', example: 'OP-2026-0001' },
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
        description: 'A entrada como foi gravada, já normalizada (data preenchida, padrões aplicados).',
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
        description: 'Um item do cronograma de amortização.',
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
              adicional: dinheiro('0,38% sobre o valor do crédito, uma vez', 38),
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

      Operacao: {
        type: 'object',
        description: 'Operação completa, como gravada. É a resposta do POST e do GET /operacoes/{id}.',
        properties: {
          id: { type: 'integer', example: 1 },
          identificador: { type: 'string', example: 'OP-2026-0001' },
          criadoEm: { type: 'string', description: 'Data/hora da gravação (AAAA-MM-DD HH:MM:SS, horário do servidor de banco)', example: '2026-09-25 14:03:22' },
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
          modalidade: { type: 'string', example: 'CONSIGNADO_INSS' },
          valor: { type: 'number', example: 10000 },
          score: { type: 'integer', example: 650 },
          prazoMeses: { type: 'integer', example: 12 },
          dataLiberacao: { type: 'string', format: 'date', example: '2026-10-30' },
          faixaRisco: { type: 'string', example: 'B' },
          taxaFinalMes: percentual('Taxa usada', 1.85),
          cetPriceAno: percentual('CET anual no Price', 30.89),
          cetSacAno: percentual('CET anual no SAC', 30.96),
          criadoEm: { type: 'string', example: '2026-09-25 14:03:22' },
        },
      },

      PaginaOperacoes: {
        type: 'object',
        properties: {
          pagina: { type: 'integer', example: 1 },
          tamanho: { type: 'integer', example: 10 },
          total: { type: 'integer', description: 'Total de operações gravadas', example: 23 },
          totalPaginas: { type: 'integer', description: 'ceil(total / tamanho); 0 com a tabela vazia', example: 3 },
          itens: { type: 'array', items: ref('ResumoOperacao') },
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
