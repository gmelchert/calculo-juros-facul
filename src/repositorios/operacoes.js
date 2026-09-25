import { pool } from '../db.js';

// Devolve true se já existe operação com esse identificador. (Q6)
export async function existeIdentificador(identificador) {
  const [linhas] = await pool.query(
    'SELECT id FROM operacoes WHERE identificador = ? LIMIT 1', [identificador]);
  return linhas.length > 0;
}

// Grava a operação e devolve o id gerado. `entrada`, `taxa` e `simulacoes` vêm da API (T-07).
export async function salvar({ identificador, entrada, taxa, simulacoes }) {
  const [resultado] = await pool.query(
    `INSERT INTO operacoes
       (identificador, modalidade_codigo, valor, score, prazo_meses, data_liberacao,
        primeiro_relacionamento, faixa_risco, taxa_final_mes, cet_price_ano, cet_sac_ano, resultado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      identificador, entrada.modalidade, entrada.valor, entrada.score, entrada.prazoMeses,
      entrada.dataLiberacao, entrada.primeiroRelacionamento ? 1 : 0,
      taxa.faixaRisco, taxa.taxaFinalMes,
      simulacoes.PRICE.cet.anualPercentual, simulacoes.SAC.cet.anualPercentual,
      JSON.stringify({ entrada, taxa, simulacoes }),
    ],
  );
  return resultado.insertId;
}

// Busca uma operação completa pelo id (ou undefined). (Q7)
export async function buscarPorId(id) {
  const [linhas] = await pool.query(
    'SELECT id, identificador, criado_em, resultado FROM operacoes WHERE id = ?', [id]);
  if (linhas.length === 0) return undefined;
  const linha = linhas[0];
  // mysql2 já converte a coluna JSON em objeto; se em algum ambiente vier como texto, use JSON.parse.
  const resultado = typeof linha.resultado === 'string' ? JSON.parse(linha.resultado) : linha.resultado;
  return { id: linha.id, identificador: linha.identificador, criadoEm: linha.criado_em, ...resultado };
}

// Lista um resumo das operações, mais recentes primeiro, e o total para paginação. (Q8 + Q9)
export async function listar({ pagina, tamanho }) {
  const offset = (pagina - 1) * tamanho;
  const [linhas] = await pool.query(
    `SELECT id, identificador, modalidade_codigo, valor, score, prazo_meses, data_liberacao,
            faixa_risco, taxa_final_mes, cet_price_ano, cet_sac_ano, criado_em
       FROM operacoes
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [tamanho, offset], // precisam ser NÚMEROS, não strings
  );
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM operacoes');
  const itens = linhas.map((l) => ({
    id: l.id,
    identificador: l.identificador,
    modalidade: l.modalidade_codigo,   // a API chama de "modalidade" (contrato da T-08)
    valor: l.valor,
    score: l.score,
    prazoMeses: l.prazo_meses,
    dataLiberacao: l.data_liberacao,
    faixaRisco: l.faixa_risco,
    taxaFinalMes: l.taxa_final_mes,
    cetPriceAno: l.cet_price_ano,
    cetSacAno: l.cet_sac_ano,
    criadoEm: l.criado_em,
  }));
  return { itens, total };
}
