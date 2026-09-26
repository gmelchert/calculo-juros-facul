import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validaEntrada } from './validaEntrada.js';
import { repositorioModalidadesFalso } from './bancoFalso.js';

// Corpo do contrato da T-07 (cenário ponta a ponta, Anexo A.5).
function corpoValido(sobrescreve = {}) {
  return {
    identificador: 'OP-2026-0001',
    valor: 10000,
    modalidade: 'CONSIGNADO_INSS',
    score: 650,
    prazoMeses: 12,
    dataLiberacao: '2026-10-30',
    ...sobrescreve,
  };
}

const valida = (body, repositorio = repositorioModalidadesFalso) => validaEntrada(body, repositorio);

// Atalho: executa e devolve o ErroDeNegocio lançado (falha o teste se não lançar).
async function capturaErro(body, repositorio) {
  try {
    await valida(body, repositorio);
  } catch (erro) {
    return erro;
  }
  assert.fail('deveria ter lançado ErroDeNegocio');
}

test('validaEntrada: corpo válido devolve entrada normalizada (modalidade vira a linha do banco)', async () => {
  const e = await valida(corpoValido());

  assert.equal(e.identificador, 'OP-2026-0001');
  assert.equal(e.valor, 10000);
  assert.equal(e.modalidade.codigo, 'CONSIGNADO_INSS'); // objeto do repositório, não a string
  assert.equal(e.modalidade.tetoTaxaMes, 1.85);
  assert.equal(e.modalidade.prazoMinMeses, 6);
  assert.equal(e.modalidade.ativo, true);
  assert.equal(e.score, 650);
  assert.equal(e.prazoMeses, 12);
  assert.equal(e.dataLiberacao, '2026-10-30');
  assert.equal(e.primeiroRelacionamento, false); // ausente → false
});

test('validaEntrada: sem dataLiberacao usa a data de hoje (AAAA-MM-DD)', async () => {
  const e = await valida(corpoValido({ dataLiberacao: undefined }));

  assert.match(e.dataLiberacao, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Number(e.dataLiberacao.slice(0, 4)), new Date().getFullYear());
});

test('validaEntrada: corpo {} lança 400 DADOS_INVALIDOS com 5 mensagens e não consulta o banco', async () => {
  const repositorioQueNaoPodeSerChamado = {
    buscarModalidade: async () => { throw new Error('não deveria consultar o banco sem modalidade'); },
  };
  const erro = await capturaErro({}, repositorioQueNaoPodeSerChamado);

  assert.equal(erro.status, 400);
  assert.equal(erro.codigo, 'DADOS_INVALIDOS');
  assert.equal(erro.detalhes.length, 5);

  const texto = erro.detalhes.join(' | ');
  for (const campo of ['identificador', 'valor', 'modalidade', 'score', 'prazoMeses']) {
    assert.ok(texto.includes(campo), `detalhes deveria citar "${campo}": ${texto}`);
  }
});

test('validaEntrada: corpo undefined (requisição sem JSON) também dá 400 com 5 mensagens', async () => {
  const erro = await capturaErro(undefined);

  assert.equal(erro.status, 400);
  assert.equal(erro.detalhes.length, 5);
});

test('validaEntrada: prazo 3 em CONSIGNADO_INSS lança 400 citando "entre 6 e 84"', async () => {
  const erro = await capturaErro(corpoValido({ prazoMeses: 3 }));

  assert.equal(erro.status, 400);
  assert.equal(erro.detalhes.length, 1);
  assert.match(erro.detalhes[0], /prazoMeses/);
  assert.match(erro.detalhes[0], /entre 6 e 84/);
  assert.match(erro.detalhes[0], /CONSIGNADO_INSS/);
});

test('validaEntrada: modalidade inexistente no banco não checa faixa de prazo, mas ainda exige prazo inteiro ≥ 1', async () => {
  const erro = await capturaErro(corpoValido({ modalidade: 'NAO_EXISTE', prazoMeses: 0 }));

  assert.equal(erro.detalhes.length, 2);
  assert.match(erro.detalhes[0], /modalidade "NAO_EXISTE" não existe/);
  assert.match(erro.detalhes[1], /prazoMeses/);
});

test('validaEntrada: modalidade inativa é recusada (e o prazo dela não é checado)', async () => {
  const erro = await capturaErro(corpoValido({ modalidade: 'MODALIDADE_INATIVA', prazoMeses: 99 }));

  assert.equal(erro.detalhes.length, 1);
  assert.match(erro.detalhes[0], /não está ativa/);
});

test('validaEntrada: acumula TODOS os problemas, não só o primeiro', async () => {
  const erro = await capturaErro({
    identificador: '',
    valor: -5,
    modalidade: 'VEICULOS',
    score: 1001,
    prazoMeses: 6, // VEICULOS exige 12 a 60
    dataLiberacao: '2026-02-30',
    primeiroRelacionamento: 'sim',
  });

  assert.equal(erro.detalhes.length, 6);
});

test('validaEntrada: limites de valor (0, negativo, > 10 milhões, string)', async () => {
  for (const valor of [0, -1, 'mil', null, Infinity]) {
    const erro = await capturaErro(corpoValido({ valor }));
    assert.equal(erro.detalhes.length, 1, `valor ${valor}`);
    assert.match(erro.detalhes[0], /valor/);
  }

  assert.equal((await valida(corpoValido({ valor: 10_000_000 }))).valor, 10_000_000);
  assert.match((await capturaErro(corpoValido({ valor: 10_000_000.01 }))).detalhes[0], /máximo/);
});

test('validaEntrada: score precisa ser inteiro entre 0 e 1000 (0 e 1000 valem)', async () => {
  assert.equal((await valida(corpoValido({ score: 0 }))).score, 0);
  assert.equal((await valida(corpoValido({ score: 1000 }))).score, 1000);

  for (const score of [-1, 1001, 650.5, '650']) {
    const erro = await capturaErro(corpoValido({ score }));
    assert.match(erro.detalhes[0], /score/, `score ${score}`);
  }
});

test('validaEntrada: identificador com 60 caracteres passa, com 61 não; espaços nas pontas são removidos', async () => {
  assert.equal((await valida(corpoValido({ identificador: 'A'.repeat(60) }))).identificador.length, 60);
  assert.match((await capturaErro(corpoValido({ identificador: 'A'.repeat(61) }))).detalhes[0], /60/);
  assert.match((await capturaErro(corpoValido({ identificador: '   ' }))).detalhes[0], /identificador/);
  assert.equal((await valida(corpoValido({ identificador: '  OP-1  ' }))).identificador, 'OP-1');
});

test('validaEntrada: primeiroRelacionamento true é preservado; null conta como ausente', async () => {
  assert.equal((await valida(corpoValido({ primeiroRelacionamento: true }))).primeiroRelacionamento, true);
  assert.equal((await valida(corpoValido({ primeiroRelacionamento: null }))).primeiroRelacionamento, false);
  assert.match((await capturaErro(corpoValido({ primeiroRelacionamento: 1 }))).detalhes[0], /primeiroRelacionamento/);
});
