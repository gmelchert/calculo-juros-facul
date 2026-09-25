import { pool } from '../db.js';

// Traduz uma linha do banco (snake_case) para o objeto que a API usa (camelCase).
function linhaParaFaixa(linha) {
  return linha;
}

const COLUNAS = `faixa, score_min, score_max, taxa_mes, taxa_ano, descricao`;

// Todas as faixas de uma modalidade, da melhor (A) para a pior (E). (Q3)
export async function listarFaixas(modalidadeCodigo, faixa) {
  let linhas;

  if (modalidadeCodigo) {
    const [resultados] = await pool.query(
      `SELECT * FROM faixas_juros WHERE modalidade_codigo = ? AND faixa = ? ORDER BY score_min DESC`,
      [modalidadeCodigo, faixa],
    );
    linhas = resultados;
  } else {
    const [resultados] = await pool.query(
      `SELECT * FROM faixas_juros ORDER BY modalidade_codigo, score_min DESC`,
    );
    linhas = resultados;
  }

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
