import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculaPrice } from './price.js';
import { geraCronograma } from './cronograma.js';

test('geraCronograma: cronograma de referência (Anexo A.3)', () => {
  const { parcelas } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });

  assert.equal(cronograma.length, 12);

  // parcela 1: segunda-feira normal
  assert.equal(cronograma[0].vencimento, '2026-11-30');
  assert.equal(cronograma[0].diasCorridos, 31);

  // parcela 3: 30/01/2027 é sábado → segunda 01/02/2027
  assert.equal(cronograma[2].vencimento, '2027-02-01');
  assert.equal(cronograma[2].diasCorridos, 94);

  // parcela 4: 30/02 não existe → 28/02, que é domingo → segunda 01/03/2027
  assert.equal(cronograma[3].vencimento, '2027-03-01');
  assert.equal(cronograma[3].diasCorridos, 122);

  // parcela 12: 30/10/2027 é sábado → segunda 01/11/2027 (367 dias, > 365)
  assert.equal(cronograma[11].vencimento, '2027-11-01');
  assert.equal(cronograma[11].diasCorridos, 367);
});

test('geraCronograma: preserva os campos originais da parcela', () => {
  const { parcelas } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  const cronograma = geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });

  assert.equal(cronograma[0].valor, 945.60);
});

test('geraCronograma: não modifica o array de entrada', () => {
  const { parcelas } = calculaPrice({ valor: 10000, taxaMes: 0.02, prazoMeses: 12 });
  geraCronograma({ parcelas, dataLiberacao: '2026-10-30' });

  assert.equal(parcelas[0].vencimento, undefined);
});
