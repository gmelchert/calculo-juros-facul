import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculaTaxa } from './taxa.js';
import { ErroDeNegocio } from '../lib/erros.js';
import { MODALIDADES_SEED, repositorioFaixasFalso } from './bancoFalso.js';

const modalidade = (codigo) => MODALIDADES_SEED.find((m) => m.codigo === codigo);
const taxa = (codigo, score) => calculaTaxa(modalidade(codigo), score, repositorioFaixasFalso);

test('Taxa: INSS + score 650 → faixa B com a taxa da tabela (1,85 = teto; base 1,60)', async () => {
  const t = await taxa('CONSIGNADO_INSS', 650);

  assert.deepEqual(t, {
    faixaRisco: 'B',
    descricaoFaixa: 'Risco baixo',
    taxaBaseMes: 1.60,
    tetoTaxaMes: 1.85,
    taxaFinalMes: 1.85,
    taxaFinalAno: 24.60,
    tetoAplicado: true,
  });
});

test('Taxa: CREDITO_PESSOAL + score 720 → faixa B, 5,00% a.m. (teto 12,00 não atua)', async () => {
  const t = await taxa('CREDITO_PESSOAL', 720);

  assert.equal(t.faixaRisco, 'B');
  assert.equal(t.taxaBaseMes, 4.50);
  assert.equal(t.taxaFinalMes, 5.00);
  assert.equal(t.taxaFinalAno, 79.59);
  assert.equal(t.tetoAplicado, false);
});

test('Taxa: limites das faixas (800 → A, 799 → B, 400 → C, 399 → D, 200 → D)', async () => {
  assert.equal((await taxa('CREDITO_PESSOAL', 1000)).faixaRisco, 'A');
  assert.equal((await taxa('CREDITO_PESSOAL', 800)).faixaRisco, 'A');
  assert.equal((await taxa('CREDITO_PESSOAL', 800)).taxaFinalMes, 4.50);
  assert.equal((await taxa('CREDITO_PESSOAL', 799)).faixaRisco, 'B');
  assert.equal((await taxa('CREDITO_PESSOAL', 400)).faixaRisco, 'C');
  assert.equal((await taxa('CREDITO_PESSOAL', 400)).taxaFinalMes, 5.50);
  assert.equal((await taxa('CREDITO_PESSOAL', 399)).faixaRisco, 'D');
  assert.equal((await taxa('CREDITO_PESSOAL', 200)).taxaFinalMes, 6.50);
});

test('Taxa: CONSIGNADO_PUBLICO — B abaixo do teto, C e D achatadas no teto 2,50', async () => {
  assert.deepEqual(
    await Promise.all([650, 450, 250].map((s) => taxa('CONSIGNADO_PUBLICO', s))).then((ts) =>
      ts.map((t) => [t.taxaFinalMes, t.tetoAplicado]),
    ),
    [[2.10, false], [2.50, true], [2.50, true]],
  );
});

test('Taxa: score 150 (faixa E) lança 422 SCORE_INSUFICIENTE em qualquer modalidade ativa', async () => {
  for (const m of MODALIDADES_SEED.filter((x) => x.ativo)) {
    await assert.rejects(
      calculaTaxa(m, 150, repositorioFaixasFalso),
      (erro) => erro.codigo === 'SCORE_INSUFICIENTE' && erro.status === 422,
      `modalidade ${m.codigo} deveria recusar score 150`,
    );
  }
});

test('Taxa: score 199 recusa e score 200 aceita (fronteira da faixa E)', async () => {
  await assert.rejects(taxa('VEICULOS', 199), (erro) => erro.codigo === 'SCORE_INSUFICIENTE');
  assert.equal((await taxa('VEICULOS', 200)).faixaRisco, 'D');
});

test('Taxa: banco sem faixa para o score → erro comum (vira 500), não ErroDeNegocio', async () => {
  const repositorioVazio = { listarFaixas: async () => [] };

  await assert.rejects(
    calculaTaxa(modalidade('VEICULOS'), 650, repositorioVazio),
    (erro) => !(erro instanceof ErroDeNegocio) && /seed/.test(erro.message),
  );
});

test('Taxa: consulta o banco uma única vez, pela modalidade certa', async () => {
  const chamadas = [];
  const repositorioEspiao = {
    listarFaixas: async (codigo, faixa) => {
      chamadas.push([codigo, faixa]);
      return repositorioFaixasFalso.listarFaixas(codigo, faixa);
    },
  };

  await calculaTaxa(modalidade('OUTROS_BENS'), 500, repositorioEspiao);

  assert.deepEqual(chamadas, [['OUTROS_BENS', undefined]]);
});
