import { pool } from '../db.js';

// Repositório da tabela `operacoes`. Única camada que sabe os nomes das colunas (snake_case);
// tudo que sai daqui está em camelCase, no formato que a API devolve.
//
// Regra de ouro (decisão D1 do docs/design-definicao-cliente-contrato.md): a coluna `resultado`
// é gravada UMA vez, no INSERT, e NUNCA recebe UPDATE. É ela que guarda as duas simulações, e o
// calendário definitivo de uma operação DEFINIDA é `resultado.simulacoes[sistema_definido].cronograma`.

// Colunas usadas para montar a operação completa (POST, GET /:id, definição, consolidado).
const COLUNAS_COMPLETAS = 'id, identificador, criado_em, estado, sistema_definido, definido_em, resultado';

// Colunas "planas" da listagem (sem o JSON, para a resposta ficar leve).
const COLUNAS_RESUMO = `id, identificador, tipo_pessoa, documento, modalidade_codigo, valor, score, prazo_meses,
       data_liberacao, faixa_risco, taxa_final_mes, cet_price_ano, cet_sac_ano,
       estado, sistema_definido, definido_em, criado_em`;

// `definicao` é null enquanto a operação está SIMULADA; depois traz o sistema e quando foi definida.
// Única regra de montagem, usada pelo detalhe e pela listagem.
function montaDefinicao(linha) {
  return linha.sistema_definido
    ? { sistema: linha.sistema_definido, definidoEm: linha.definido_em }
    : null;
}

// Linha completa → operação no formato da API: { id, identificador, criadoEm, estado, definicao,
// cliente, entrada, taxa, simulacoes } (os quatro últimos vêm do JSON `resultado`).
function linhaParaOperacao(linha) {
  // mysql2 já converte a coluna JSON em objeto; se em algum ambiente vier como texto, use JSON.parse.
  const resultado = typeof linha.resultado === 'string' ? JSON.parse(linha.resultado) : linha.resultado;
  return {
    id: linha.id,
    identificador: linha.identificador,
    criadoEm: linha.criado_em,
    estado: linha.estado,
    definicao: montaDefinicao(linha),
    ...resultado,
  };
}

// Devolve true se já existe operação com esse identificador. (Q6)
export async function existeIdentificador(identificador) {
  const [linhas] = await pool.query(
    'SELECT id FROM operacoes WHERE identificador = ? LIMIT 1', [identificador]);
  return linhas.length > 0;
}

// Grava a operação e devolve o id gerado. `cliente`, `entrada`, `taxa` e `simulacoes` vêm da
// simulação (T-07/T-09). `cliente.documento` já chega só com dígitos (validaEntrada).
// `estado` fica no DEFAULT da tabela ('SIMULADA').
export async function salvar({ identificador, cliente, entrada, taxa, simulacoes }) {
  const [resultado] = await pool.query(
    `INSERT INTO operacoes
       (identificador, tipo_pessoa, documento, modalidade_codigo, valor, score, prazo_meses,
        data_liberacao, primeiro_relacionamento, faixa_risco, taxa_final_mes,
        cet_price_ano, cet_sac_ano, resultado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      identificador, cliente.tipoPessoa, cliente.documento,
      entrada.modalidade, entrada.valor, entrada.score, entrada.prazoMeses,
      entrada.dataLiberacao, entrada.primeiroRelacionamento ? 1 : 0,
      taxa.faixaRisco, taxa.taxaFinalMes,
      simulacoes.PRICE.cet.anualPercentual, simulacoes.SAC.cet.anualPercentual,
      JSON.stringify({ cliente, entrada, taxa, simulacoes }),
    ],
  );
  return resultado.insertId;
}

// Busca uma operação completa pelo id (ou undefined). (Q7)
export async function buscarPorId(id) {
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS_COMPLETAS} FROM operacoes WHERE id = ?`, [id]);
  return linhas.length === 0 ? undefined : linhaParaOperacao(linhas[0]);
}

// Busca uma operação completa pelo identificador (ou undefined). (Q11)
// A comparação segue a collation da tabela (utf8mb4_unicode_ci): não diferencia maiúsculas,
// coerente com a UNIQUE KEY, que também não diferencia.
export async function buscarPorIdentificador(identificador) {
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS_COMPLETAS} FROM operacoes WHERE identificador = ?`, [identificador]);
  return linhas.length === 0 ? undefined : linhaParaOperacao(linhas[0]);
}

// Define o sistema de amortização de uma operação ainda SIMULADA. (Q10)
// Devolve true se mudou de estado. Devolve false se a operação não existe OU já estava DEFINIDA:
// o `AND estado = 'SIMULADA'` faz o banco decidir quem vence quando duas definições chegam ao
// mesmo tempo (mesma ideia da corrida do identificador na T-07). Não toca em `resultado`.
export async function definir({ id, sistema }) {
  const [resultado] = await pool.query(
    `UPDATE operacoes
        SET estado = 'DEFINIDA', sistema_definido = ?, definido_em = NOW()
      WHERE id = ? AND estado = 'SIMULADA'`,
    [sistema, id],
  );
  return resultado.affectedRows === 1;
}

// Lista um resumo das operações, mais recentes primeiro, e o total para paginação. (Q8 + Q9 + Q12)
// `estado` é opcional: undefined lista tudo; 'SIMULADA' ou 'DEFINIDA' filtra (o total respeita o filtro).
export async function listar({ pagina, tamanho, estado }) {
  const offset = (pagina - 1) * tamanho;
  const where = estado === undefined ? '' : 'WHERE estado = ?';
  const filtro = estado === undefined ? [] : [estado];

  const [linhas] = await pool.query(
    `SELECT ${COLUNAS_RESUMO}
       FROM operacoes
       ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [...filtro, tamanho, offset], // LIMIT/OFFSET precisam ser NÚMEROS, não strings
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM operacoes ${where}`, filtro);

  const itens = linhas.map((l) => ({
    id: l.id,
    identificador: l.identificador,
    estado: l.estado,
    definicao: montaDefinicao(l),
    cliente: { tipoPessoa: l.tipo_pessoa, documento: l.documento },
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
