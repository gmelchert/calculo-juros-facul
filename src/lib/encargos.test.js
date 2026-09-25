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

test('Encargos (Price): primeiro relacionamento cobra tarifa de cadastro', () => {
  const cronograma = cronogramaPriceReferencia();
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true });

  assert.equal(r.iof.diario, 168.09);
  assert.equal(r.iof.adicional, 38.00);
  assert.equal(r.iof.total, 206.09);
  assert.equal(r.tarifaCadastro, 50.00);
  assert.equal(r.total, 256.09);
});

test('Encargos (Price): sem primeiro relacionamento não cobra tarifa', () => {
  const cronograma = cronogramaPriceReferencia();
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: false });

  assert.equal(r.tarifaCadastro, 0);
  assert.equal(r.total, 206.09);
});

test('Encargos (SAC): IOF é menor que no Price para o mesmo cenário', () => {
  const { parcelas } = calculaSac({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });
  const r = calculaEncargos({ valor: 10000, cronograma, primeiroRelacionamento: true });

  assert.equal(r.iof.diario, 162.22);
  assert.equal(r.iof.total, 200.22);
  assert.equal(r.total, 250.22);
  assert.ok(r.iof.diario < 168.09);
});

test('Encargos: respeita o limite de 365 dias no IOF diário', () => {
  const cronograma = [{ numero: 1, amortizacao: 1000, juros: 0, valor: 1000, saldoDevedor: 0, diasCorridos: 1000 }];
  const r = calculaEncargos({ valor: 1000, cronograma, primeiroRelacionamento: false });

  assert.equal(r.iof.diario, 29.93);
});