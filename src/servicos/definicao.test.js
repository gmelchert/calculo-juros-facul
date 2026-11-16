import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  avaliaDefinicao, erroJaDefinida, exigeDecisaoAprovada, SISTEMAS, ESTADOS, DECISAO_APROVADA,
} from './definicao.js';
import { ErroDeNegocio } from '../lib/erros.js';

const simulada = { id: 1, estado: 'SIMULADA', definicao: null };
const definidaPrice = { id: 1, estado: 'DEFINIDA', definicao: { sistema: 'PRICE', definidoEm: '2026-10-08 15:12:40' } };

test('definicao: constantes expõem os dois sistemas e os dois estados', () => {
  assert.deepEqual(SISTEMAS, ['PRICE', 'SAC']);
  assert.deepEqual(ESTADOS, ['SIMULADA', 'DEFINIDA']);
});

test('avaliaDefinicao: operação SIMULADA aceita PRICE e SAC (não lança)', () => {
  assert.doesNotThrow(() => avaliaDefinicao(simulada, 'PRICE'));
  assert.doesNotThrow(() => avaliaDefinicao(simulada, 'SAC'));
});

test('avaliaDefinicao: sistema fora do enum → 400 DADOS_INVALIDOS com a mensagem em detalhes', () => {
  for (const sistema of ['price', 'PRICEE', '', undefined, null, 1, ['PRICE']]) {
    assert.throws(() => avaliaDefinicao(simulada, sistema), (erro) => {
      assert.ok(erro instanceof ErroDeNegocio);
      assert.equal(erro.status, 400);
      assert.equal(erro.codigo, 'DADOS_INVALIDOS');
      assert.deepEqual(erro.detalhes, ['sistema deve ser PRICE ou SAC']);
      return true;
    }, `sistema ${JSON.stringify(sistema)}`);
  }
});

test('avaliaDefinicao: operação já DEFINIDA → 409 AMORTIZACAO_JA_DEFINIDA citando o sistema atual (qualquer sistema pedido)', () => {
  for (const sistema of ['PRICE', 'SAC']) {
    assert.throws(() => avaliaDefinicao(definidaPrice, sistema), (erro) => {
      assert.equal(erro.status, 409);
      assert.equal(erro.codigo, 'AMORTIZACAO_JA_DEFINIDA');
      assert.equal(erro.message, 'Operação 1 já está definida como PRICE');
      return true;
    });
  }
});

test('avaliaDefinicao: sistema inválido em operação já definida → 400 vence o 409 (ordem do contrato)', () => {
  assert.throws(() => avaliaDefinicao(definidaPrice, 'price'), { status: 400 });
});

test('erroJaDefinida: monta o mesmo 409 usado pela rota na corrida', () => {
  const erro = erroJaDefinida(definidaPrice);
  assert.equal(erro.status, 409);
  assert.equal(erro.codigo, 'AMORTIZACAO_JA_DEFINIDA');
  assert.match(erro.message, /PRICE/);
});

// ---------- exigeDecisaoAprovada (T-14) ----------
test('exigeDecisaoAprovada: APROVADO passa; ausente (null/undefined) também passa', () => {
  assert.equal(DECISAO_APROVADA, 'APROVADO');
  assert.doesNotThrow(() => exigeDecisaoAprovada('APROVADO'));
  // Compatibilidade: quem ainda não manda o campo continua criando operação.
  assert.doesNotThrow(() => exigeDecisaoAprovada(null));
  assert.doesNotThrow(() => exigeDecisaoAprovada(undefined));
});

test('exigeDecisaoAprovada: qualquer outra decisão → 422 DECISAO_NAO_APROVADA citando o que veio', () => {
  for (const decisao of ['REPROVADO', 'NEGADO', 'PENDENTE', 'EM_ANALISE']) {
    assert.throws(() => exigeDecisaoAprovada(decisao), (erro) => {
      assert.ok(erro instanceof ErroDeNegocio);
      assert.equal(erro.status, 422);
      assert.equal(erro.codigo, 'DECISAO_NAO_APROVADA');
      assert.ok(erro.message.includes(decisao), erro.message);
      assert.ok(erro.message.includes('APROVADO'), erro.message);
      return true;
    }, `decisao ${decisao}`);
  }
});
