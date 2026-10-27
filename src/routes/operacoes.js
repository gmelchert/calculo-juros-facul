import { Router } from 'express';

import { validaEntrada } from '../servicos/validaEntrada.js';
import { calculaTaxa } from '../servicos/taxa.js';
import { simulaOperacao } from '../servicos/simulacao.js';
import { avaliaDefinicao, erroJaDefinida, ESTADOS } from '../servicos/definicao.js';
import { montaConsolidado } from '../servicos/consolidado.js';

import * as repositorio from '../repositorios/operacoes.js';
import * as repositorioModalidades from '../repositorios/modalidades.js';

import { ErroDeNegocio } from '../lib/erros.js';
import { finOpsApi } from '../lib/api.js';

const router = Router();

const PAGINA_PADRAO = 1;
const TAMANHO_PADRAO = 10;
const TAMANHO_MAXIMO = 100;

// `:id` da URL chega como string. Devolve o inteiro ≥ 1 ou lança o 400 padrão.
// Usado por todas as rotas com :id (detalhe, definição, consolidado).
function leId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', [
      'id deve ser um inteiro maior ou igual a 1',
    ]);
  }
  return id;
}

// Consolidado (T-11): mesma resposta para as duas rotas (por id e por identificador).
async function respondeConsolidado(operacao, res) {
  // Existe, mas ainda não escolheram o sistema: erro próprio, diferente do 404.
  if (operacao.estado !== 'DEFINIDA') {
    throw new ErroDeNegocio(
      422,
      'OPERACAO_NAO_DEFINIDA',
      `Operação ${operacao.id} ainda não tem sistema de amortização definido`,
    );
  }
  // Só para o nome e a modalidade BCB — a FK garante que a modalidade existe.
  const modalidade = await repositorioModalidades.buscarModalidade(operacao.entrada.modalidade);
  res.json(montaConsolidado(operacao, modalidade));
}

// POST /api/operacoes — valida, simula, grava e devolve a operação completa (T-07; T-09: cliente)
router.post('/', async (req, res) => {
  // 1. Validação (confere a modalidade na tabela `modalidades`; valida CPF/CNPJ do cliente):
  //    lança 400 DADOS_INVALIDOS com todos os problemas em `detalhes`.
  const entrada = await validaEntrada(req.body);

  // 2. Identificador precisa ser único (409).
  if (await repositorio.existeIdentificador(entrada.identificador)) {
    throw new ErroDeNegocio(
      409,
      'IDENTIFICADOR_DUPLICADO',
      `Já existe operação com identificador "${entrada.identificador}"`,
    );
  }

  // 3. Taxa pela tabela `faixas_juros`: lança 422 SCORE_INSUFICIENTE na faixa E.
  const taxa = await calculaTaxa(entrada.modalidade, entrada.score);

  // 4. Simulação (função pura): lança 422 CET_NAO_CONVERGE — nada é gravado nesses casos.
  //    Devolve { entrada, cliente, taxa, simulacoes }: o formato que salvar() grava.
  const simulacao = simulaOperacao(entrada, taxa);

  // 5. Grava. Se duas requisições com o mesmo identificador chegarem ao mesmo tempo, a checagem
  //    do passo 2 pode passar nas duas; a UNIQUE KEY do banco barra a segunda (ER_DUP_ENTRY),
  //    e traduzimos para o mesmo 409 em vez de deixar virar 500.
  let id;
  try {
    id = await repositorio.salvar({ identificador: entrada.identificador, ...simulacao });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ErroDeNegocio(
        409,
        'IDENTIFICADOR_DUPLICADO',
        `Já existe operação com identificador "${entrada.identificador}"`,
      );
    }
    throw err;
  }

  // 6. Relê do banco para devolver exatamente o que ficou gravado (com id, criadoEm, estado).
  const operacao = await repositorio.buscarPorId(id);
  res.status(201).json(operacao);
});

// GET /api/operacoes?pagina=&tamanho=&estado= — listagem paginada, mais recentes primeiro (T-08; T-12: estado)
router.get('/', async (req, res) => {
  // Query string chega sempre como string ('2'); Number('') vira 0 e Number('abc') vira NaN,
  // e os dois caem na validação abaixo.
  const pagina = req.query.pagina === undefined ? PAGINA_PADRAO : Number(req.query.pagina);
  const tamanho = req.query.tamanho === undefined ? TAMANHO_PADRAO : Number(req.query.tamanho);
  // `estado` é opcional: ausente = sem filtro. Se vier repetido (?estado=A&estado=B) vira
  // 'A,B' e cai na validação.
  const estado = req.query.estado === undefined ? undefined : String(req.query.estado);

  const erros = [];
  if (!Number.isInteger(pagina) || pagina < 1) {
    erros.push('pagina deve ser um inteiro maior ou igual a 1');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > TAMANHO_MAXIMO) {
    erros.push(`tamanho deve ser um inteiro entre 1 e ${TAMANHO_MAXIMO}`);
  }
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    erros.push(`estado deve ser ${ESTADOS.join(' ou ')}`);
  }
  if (erros.length > 0) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', erros);
  }

  const { itens, total } = await repositorio.listar({ pagina, tamanho, estado });

  // Tabela vazia → totalPaginas 0 (correto, não force 1). Página além do fim → itens [] com 200.
  res.json({ pagina, tamanho, total, totalPaginas: Math.ceil(total / tamanho), itens });
});

// GET /api/operacoes/por-identificador/:identificador/consolidado — consolidado pela chave de
// negócio (T-11). Registrada ANTES de /:id por clareza; não colide com ela porque tem 3 segmentos.
// O identificador vai URL-encoded (espaço → %20, barra → %2F); o Express decodifica.
router.get('/por-identificador/:identificador/consolidado', async (req, res) => {
  const operacao = await repositorio.buscarPorIdentificador(req.params.identificador);
  if (!operacao) {
    throw new ErroDeNegocio(
      404,
      'OPERACAO_NAO_ENCONTRADA',
      `Operação com identificador "${req.params.identificador}" não encontrada`,
    );
  }
  await respondeConsolidado(operacao, res);
});

// GET /api/operacoes/:id/consolidado — consolidado pelo id numérico (T-11)
router.get('/:id/consolidado', async (req, res) => {
  const id = leId(req.params.id);
  const operacao = await repositorio.buscarPorId(id);
  if (!operacao) {
    throw new ErroDeNegocio(404, 'OPERACAO_NAO_ENCONTRADA', `Operação ${id} não encontrada`);
  }
  await respondeConsolidado(operacao, res);
});

// POST /api/operacoes/:id/definicao — o outro grupo escolhe PRICE ou SAC (T-10)
router.post('/:id/definicao', async (req, res) => {
  // 1. id inválido → 400; operação inexistente → 404 (antes de olhar o corpo, como no GET /:id).
  const id = leId(req.params.id);
  const operacao = await repositorio.buscarPorId(id);
  if (!operacao) {
    throw new ErroDeNegocio(404, 'OPERACAO_NAO_ENCONTRADA', `Operação ${id} não encontrada`);
  }

  // 2. Regras puras: sistema fora de {PRICE, SAC} → 400; já definida → 409.
  const sistema = req.body?.sistema;
  avaliaDefinicao(operacao, sistema);

  // 3. Grava. O UPDATE só afeta a linha se ela AINDA estiver SIMULADA: se outra requisição
  //    definiu entre o passo 1 e este, affectedRows é 0 e respondemos o mesmo 409 (corrida).
  const definiu = await repositorio.definir({ id, sistema });
  if (!definiu) {
    throw erroJaDefinida(await repositorio.buscarPorId(id));
  }

  // 4. Relê para devolver a operação completa já DEFINIDA (estado, definicao, simulacoes).

  finOpsApi.post('/operacoes', repositorio.buscarPorId(id));

  res.json(await repositorio.buscarPorId(id));
});

// GET /api/operacoes/:id — operação completa, mesmo formato da resposta do POST (T-08)
router.get('/:id', async (req, res) => {
  const id = leId(req.params.id);

  const operacao = await repositorio.buscarPorId(id);
  if (!operacao) {
    throw new ErroDeNegocio(404, 'OPERACAO_NAO_ENCONTRADA', `Operação ${id} não encontrada`);
  }

  res.json(operacao);
});

export default router;
