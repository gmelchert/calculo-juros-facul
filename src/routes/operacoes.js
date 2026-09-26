import { Router } from 'express';

import { validaEntrada } from '../servicos/validaEntrada.js';
import { calculaTaxa } from '../servicos/taxa.js';
import { simulaOperacao } from '../servicos/simulacao.js';
import * as repositorio from '../repositorios/operacoes.js';
import { ErroDeNegocio } from '../lib/erros.js';

const router = Router();

const PAGINA_PADRAO = 1;
const TAMANHO_PADRAO = 10;
const TAMANHO_MAXIMO = 100;

// POST /api/operacoes — valida, simula, grava e devolve a operação completa (T-07)
router.post('/', async (req, res) => {
  // 1. Validação (confere a modalidade na tabela `modalidades`):
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

  // 6. Relê do banco para devolver exatamente o que ficou gravado (com id e criadoEm).
  const operacao = await repositorio.buscarPorId(id);
  res.status(201).json(operacao);
});

// GET /api/operacoes?pagina=&tamanho= — listagem paginada, mais recentes primeiro (T-08)
router.get('/', async (req, res) => {
  // Query string chega sempre como string ('2'); Number('') vira 0 e Number('abc') vira NaN,
  // e os dois caem na validação abaixo.
  const pagina = req.query.pagina === undefined ? PAGINA_PADRAO : Number(req.query.pagina);
  const tamanho = req.query.tamanho === undefined ? TAMANHO_PADRAO : Number(req.query.tamanho);

  const erros = [];
  if (!Number.isInteger(pagina) || pagina < 1) {
    erros.push('pagina deve ser um inteiro maior ou igual a 1');
  }
  if (!Number.isInteger(tamanho) || tamanho < 1 || tamanho > TAMANHO_MAXIMO) {
    erros.push(`tamanho deve ser um inteiro entre 1 e ${TAMANHO_MAXIMO}`);
  }
  if (erros.length > 0) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', erros);
  }

  const { itens, total } = await repositorio.listar({ pagina, tamanho });

  // Tabela vazia → totalPaginas 0 (correto, não force 1). Página além do fim → itens [] com 200.
  res.json({ pagina, tamanho, total, totalPaginas: Math.ceil(total / tamanho), itens });
});

// GET /api/operacoes/:id — operação completa, mesmo formato da resposta do POST (T-08)
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há parâmetros inválidos na consulta', [
      'id deve ser um inteiro maior ou igual a 1',
    ]);
  }

  const operacao = await repositorio.buscarPorId(id);
  if (!operacao) {
    throw new ErroDeNegocio(404, 'OPERACAO_NAO_ENCONTRADA', `Operação ${id} não encontrada`);
  }

  res.json(operacao);
});

export default router;
