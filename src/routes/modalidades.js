import { Router } from 'express';

import { listarModalidades, buscarModalidade } from '../repositorios/modalidades.js';
import { listarFaixas } from '../repositorios/faixasJuros.js';
import { ErroDeNegocio } from '../lib/erros.js';

const router = Router();

// GET /api/modalidades — lista as modalidades ATIVAS da tabela `modalidades` (ordem de código)
router.get('/', async (req, res) => {
  const itens = await listarModalidades();
  res.json({ total: itens.length, itens });
});

// GET /api/modalidades/:codigo — uma modalidade com a tabela de taxas por faixa de score.
// ":codigo" é um parâmetro de rota: vem em req.params.
router.get('/:codigo', async (req, res) => {
  const modalidade = await buscarModalidade(req.params.codigo);
  if (!modalidade) {
    throw new ErroDeNegocio(404, 'MODALIDADE_NAO_ENCONTRADA',
      `Modalidade "${req.params.codigo}" não existe`);
  }
  const faixas = await listarFaixas(modalidade.codigo); // A → E, com taxaMes/taxaAno de cada faixa
  res.json({ ...modalidade, faixas });
});

export default router;
