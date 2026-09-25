import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adicionaMeses, proximoDiaUtil, diasEntre, ehDataValida } from './datas.js';

test('adicionaMeses: 30/02 não existe → vira 28/02', () => {
  assert.equal(adicionaMeses('2026-10-30', 4), '2027-02-28');
});

test('adicionaMeses: 31/01 + 1 mês → 28/02 (fevereiro não tem dia 31)', () => {
  assert.equal(adicionaMeses('2026-01-31', 1), '2026-02-28');
});

test('proximoDiaUtil: sábado avança para segunda', () => {
  assert.equal(proximoDiaUtil('2027-01-30'), '2027-02-01');
});

test('proximoDiaUtil: dia de semana não muda', () => {
  assert.equal(proximoDiaUtil('2027-03-30'), '2027-03-30');
});

test('diasEntre: conta os dias corridos entre duas datas', () => {
  assert.equal(diasEntre('2026-10-30', '2026-11-30'), 31);
});

test('ehDataValida: rejeita data que não existe (30 de fevereiro)', () => {
  assert.equal(ehDataValida('2026-02-30'), false);
});

test('ehDataValida: aceita data real', () => {
  assert.equal(ehDataValida('2026-02-28'), true);
});
