import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculaSac } from './sac.js';
import { arredonda2 } from './util.js';

test('SAC: 10.000 a 2% a.m. em 12 meses (cenário de referência)', () => {
  const r = calculaSac({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });

  assert.equal(r.sistema, 'SAC');
  assert.equal(r.amortizacaoBase, 833.33);
  assert.equal(r.parcelas.length, 12);

  // 1ª parcela
  assert.equal(r.parcelas[0].amortizacao, 833.33);
  assert.equal(r.parcelas[0].juros, 200.00);
  assert.equal(r.parcelas[0].valor, 1033.33);
  assert.equal(r.parcelas[0].saldoDevedor, 9166.67);

  // última parcela zera o saldo e absorve os centavos
  assert.equal(r.parcelas[11].amortizacao, 833.37);
  assert.equal(r.parcelas[11].valor, 850.04);
  assert.equal(r.parcelas[11].saldoDevedor, 0);

  assert.equal(r.totalJuros, 1300.00);
  assert.equal(r.totalPago, 11300.00);
});

test('SAC: parcelas estritamente decrescentes', () => {
  const r = calculaSac({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });

  for (let i = 1; i < r.parcelas.length; i++) {
    assert.ok(r.parcelas[i].valor < r.parcelas[i - 1].valor);
  }
});

test('SAC: soma das amortizações fecha o saldo em zero', () => {
  const r = calculaSac({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });

  const somaAmortizacoes = arredonda2(
    r.parcelas.reduce((soma, p) => soma + p.amortizacao, 0),
  );

  assert.equal(somaAmortizacoes, 10000);
});
