import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculaPrice } from './price.js';
import { geraCronograma } from './cronograma.js';
import { calculaEncargos } from './encargos.js';
import { montaDemonstrativo } from './demonstrativo.js';
import { arredonda2 } from './util.js';

test('Demonstrativo: cenário de referência bate com o Anexo A.4', () => {
  const { parcelas, totalJuros } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
  const encargos = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true });

  const demo = montaDemonstrativo({ valor: 10000, totalJuros, encargos, cronograma });

  assert.equal(demo.somatorioParcelas, 11347.15);
  assert.equal(demo.totalDevido, 11603.24);

  const [principal, juros, iof, tarifa] = demo.componentes;
  assert.equal(principal.valor, 10000.00);
  assert.equal(principal.percentualSobreTotalDevido, 86.18);
  assert.equal(juros.valor, 1347.15);
  assert.equal(juros.percentualSobreTotalDevido, 11.61);
  assert.equal(iof.valor, 206.09);
  assert.equal(iof.percentualSobreTotalDevido, 1.78);
  assert.equal(tarifa.valor, 50.00);
  assert.equal(tarifa.percentualSobreTotalDevido, 0.43);
});

test('Demonstrativo: os 4 componentes somados fecham exatamente o total devido', () => {
  const { parcelas, totalJuros } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
  const encargos = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true });

  const demo = montaDemonstrativo({ valor: 10000, totalJuros, encargos, cronograma });

  const somaComponentes = arredonda2(demo.componentes.reduce((soma, c) => soma + c.valor, 0));
  assert.equal(somaComponentes, demo.totalDevido);
});
