import { pool } from '../db.js';

// Traduz uma linha do banco (snake_case) para o objeto que a API usa (camelCase).
function linhaParaFaixa(linha) {
  return {
    modalidadeCodigo: linha.modalidade_codigo,
    faixa: linha.faixa,
    scoreMin: linha.score_min,
    scoreMax: linha.score_max,
    taxaMes: linha.taxa_mes, // null na faixa E (recusa)
    taxaAno: linha.taxa_ano,
    descricao: linha.descricao,
    permiteContratacao: linha.taxa_mes !== null,
  };
}

const COLUNAS = `modalidade_codigo, faixa, score_min, score_max, taxa_mes, taxa_ano, descricao`;

// Faixas de juros, da melhor (A) para a pior (E). (Q3)
//   listarFaixas()                 → todas (as 30, de todas as modalidades)
//   listarFaixas('VEICULOS')       → as 5 da modalidade
//   listarFaixas('VEICULOS', 'B')  → só a faixa B da modalidade (uso da rota legada /api/juros/faixas)
// A letra da faixa só filtra quando a modalidade também foi informada.
export async function listarFaixas(modalidadeCodigo, faixa) {
  const condicoes = [];
  const parametros = [];
  if (modalidadeCodigo) {
    condicoes.push('modalidade_codigo = ?');
    parametros.push(modalidadeCodigo);
    if (faixa) {
      condicoes.push('faixa = ?');
      parametros.push(faixa);
    }
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const [linhas] = await pool.query(
    `SELECT ${COLUNAS} FROM faixas_juros ${where} ORDER BY modalidade_codigo, score_min DESC`,
    parametros, // sempre via "?": nunca concatenar dados do usuário na string SQL
  );
  return linhas.map(linhaParaFaixa);
}

// A faixa (e a taxa) para uma modalidade e um score. (Q4)
// Devolve undefined se a modalidade não existir ou o score estiver fora de 0..1000.
export async function buscarFaixaPorScore(modalidadeCodigo, score) {
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS} FROM faixas_juros
      WHERE modalidade_codigo = ? AND ? BETWEEN score_min AND score_max`,
    [modalidadeCodigo, score],
  );
  return linhas.length === 0 ? undefined : linhaParaFaixa(linhas[0]);
}
