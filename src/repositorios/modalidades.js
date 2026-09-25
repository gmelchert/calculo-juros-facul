import { pool } from '../db.js';

// Traduz uma linha do banco (snake_case) para o objeto que a API usa (camelCase).
function linhaParaModalidade(linha) {
  return {
    codigo: linha.codigo,
    nome: linha.nome,
    modalidadeBcb: linha.modalidade_bcb,
    publico: linha.publico,
    regimeIndexacao: linha.regime_indexacao,
    tetoTaxaMes: linha.teto_taxa_mes,
    taxaReferenciaBcbMes: linha.taxa_referencia_bcb_mes,
    prazoMinMeses: linha.prazo_min_meses,
    prazoMaxMeses: linha.prazo_max_meses,
    descricao: linha.descricao,
    ativo: linha.ativo === 1,
  };
}

const COLUNAS = `codigo, nome, modalidade_bcb, publico, regime_indexacao, teto_taxa_mes,
                 taxa_referencia_bcb_mes, prazo_min_meses, prazo_max_meses, descricao, ativo`;

// Lista as modalidades ativas, em ordem de código. (Q1)
export async function listarModalidades() {
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS} FROM modalidades WHERE ativo = TRUE ORDER BY codigo`);
  return linhas.map(linhaParaModalidade);
}

// Uma modalidade pelo código, ou undefined se não existir. (Q2)
export async function buscarModalidade(codigo) {
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS} FROM modalidades WHERE codigo = ?`, [codigo]);
  return linhas.length === 0 ? undefined : linhaParaModalidade(linhas[0]);
}
