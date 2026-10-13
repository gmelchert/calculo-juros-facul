import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculaPrice } from './price.js';
import { calculaSac } from './sac.js';
import { geraCronograma } from './cronograma.js';
import { calculaEncargos } from './encargos.js';

function cronogramaPriceReferencia() {
  const { parcelas } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  return geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
}

test('Encargos (Price, PF): primeiro relacionamento cobra tarifa de cadastro', () => {
  const cronograma = cronogramaPriceReferencia();
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true, tipoPessoa: 'PF' });

  assert.equal(r.iof.diario, 168.09);
  assert.equal(r.iof.adicional, 38.00);
  assert.equal(r.iof.total, 206.09);
  assert.equal(r.tarifaCadastro, 50.00);
  assert.equal(r.total, 256.09);
});

test('Encargos (Price, PF): sem primeiro relacionamento não cobra tarifa', () => {
  const cronograma = cronogramaPriceReferencia();
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: false, tipoPessoa: 'PF' });

  assert.equal(r.tarifaCadastro, 0);
  assert.equal(r.total, 206.09);
});

test('Encargos (SAC, PF): IOF é menor que no Price para o mesmo cenário', () => {
  const { parcelas } = calculaSac({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true, tipoPessoa: 'PF' });

  assert.equal(r.iof.diario, 162.22);
  assert.equal(r.iof.total, 200.22);
  assert.equal(r.total, 250.22);
  assert.ok(r.iof.diario < 168.09);
});

test('Encargos: respeita o limite de 365 dias no IOF diário', () => {
  const cronograma = [{ numero: 1, amortizacao: 1000, juros: 0, valor: 1000, saldoDevedor: 0, diasCorridos: 1000 }];
  const r = calculaEncargos({ valor: 1000, cronograma, primeiroRelacionamento: false, tipoPessoa: 'PF' });

  assert.equal(r.iof.diario, 29.93);
});

// T-09 (08/10/2026): PJ paga IOF adicional de 0,95% (RN06). O diário é o mesmo.
test('Encargos (PJ): IOF adicional é 0,95% do valor; diário e tarifa não mudam', () => {
  const cronograma = cronogramaPriceReferencia();
  const pf = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true, tipoPessoa: 'PF' });
  const pj = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true, tipoPessoa: 'PJ' });

  assert.equal(pj.iof.diario, pf.iof.diario);          // 168.09 nos dois
  assert.equal(pj.iof.adicional, 95.00);               // 10.000 × 0,95%
  assert.equal(pj.iof.total, 263.09);                  // 168.09 + 95.00
  assert.equal(pj.tarifaCadastro, 50.00);
  assert.equal(pj.total, 313.09);
});

test('Encargos: tipoPessoa ausente ou inválido é bug → lança Error comum (não ErroDeNegocio)', () => {
  const cronograma = cronogramaPriceReferencia();
  for (const tipoPessoa of [undefined, 'pf', 'PESSOA', 'constructor']) {
    assert.throws(
      () => calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: false, tipoPessoa }),
      { name: 'Error', message: /tipoPessoa inválido/ },
      `tipoPessoa ${tipoPessoa}`,
    );
  }
});
