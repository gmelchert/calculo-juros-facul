import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculaPrice } from './price.js';
import { geraCronograma } from './cronograma.js';
import { calculaEncargos } from './encargos.js';
import { calculaCet } from './cet.js';
import { arredonda2 } from './util.js';

function cenarioReferencia() {
  const { parcelas } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
  const encargos = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true });
  return { cronograma, encargos };
}

test('CET: cenário de referência dá 33,25% a.a. / 2,42% a.m.', () => {
  const { cronograma, encargos } = cenarioReferencia();
  const valorLiberado = arredonda2(10000 - encargos.total);

  assert.equal(valorLiberado, 9743.91);

  const { cetAnual, cetMensal } = calculaCet({ valorLiberado, cronograma });

  assert.equal(arredonda2(cetAnual * 100), 33.25);
  assert.equal(arredonda2(cetMensal * 100), 2.42);
});

test('CET: sanidade — sem encargos, o CET mensal é igual à taxa de juros', () => {
  const { cronograma } = cenarioReferencia();
  const { cetMensal } = calculaCet({ valorLiberado: 10000, cronograma });

  assert.equal(arredonda2(cetMensal * 100), 2.00);
});

test('CET: fluxo impossível lança CET_NAO_CONVERGE (não trava, não devolve NaN)', () => {
  const { cronograma } = cenarioReferencia();

  assert.throws(
    () => calculaCet({ valorLiberado: 20000, cronograma }),
    (erro) => erro.codigo === 'CET_NAO_CONVERGE' && erro.status === 422,
  );
});