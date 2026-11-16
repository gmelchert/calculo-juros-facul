import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validaEntrada } from './validaEntrada.js';
import { repositorioModalidadesFalso } from './bancoFalso.js';

// Corpo do contrato da T-07 (cenário ponta a ponta, Anexo A.5) + cliente PF de teste (T-09)
// + `amortizacao`, obrigatória desde a T-14 (vem do grupo de decisão).
function corpoValido(sobrescreve = {}) {
  return {
    identificador: 'OP-2026-0001',
    cliente: { tipoPessoa: 'PF', documento: '529.982.247-25' },
    valor: 10000,
    modalidade: 'CONSIGNADO_INSS',
    score: 650,
    prazoMeses: 12,
    dataLiberacao: '2026-10-30',
    amortizacao: 'PRICE',
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
  assert.deepEqual(e.cliente, { tipoPessoa: 'PF', documento: '52998224725' }); // só dígitos
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

test('validaEntrada: corpo {} lança 400 DADOS_INVALIDOS com 7 mensagens e não consulta o banco', async () => {
  const repositorioQueNaoPodeSerChamado = {
    buscarModalidade: async () => { throw new Error('não deveria consultar o banco sem modalidade'); },
  };
  const erro = await capturaErro({}, repositorioQueNaoPodeSerChamado);

  assert.equal(erro.status, 400);
  assert.equal(erro.codigo, 'DADOS_INVALIDOS');
  assert.equal(erro.detalhes.length, 7); // 6 campos da T-07/T-09 + amortizacao (T-14)

  const texto = erro.detalhes.join(' | ');
  for (const campo of ['identificador', 'cliente', 'valor', 'modalidade', 'score', 'prazoMeses', 'amortizacao']) {
    assert.ok(texto.includes(campo), `detalhes deveria citar "${campo}": ${texto}`);
  }
});

test('validaEntrada: corpo undefined (requisição sem JSON) também dá 400 com 7 mensagens', async () => {
  const erro = await capturaErro(undefined);

  assert.equal(erro.status, 400);
  assert.equal(erro.detalhes.length, 7);
});

// ---------- cliente (T-09) ----------
test('validaEntrada: cliente PJ com CNPJ válido é aceito em qualquer modalidade (Q3)', async () => {
  const e = await valida(corpoValido({ cliente: { tipoPessoa: 'PJ', documento: '11.222.333/0001-81' } }));

  assert.deepEqual(e.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  assert.equal(e.modalidade.codigo, 'CONSIGNADO_INSS');
});

test('validaEntrada: cliente ausente → 1 mensagem; cliente {} → 2 mensagens (tipo e documento)', async () => {
  const semCliente = await capturaErro(corpoValido({ cliente: undefined }));
  assert.equal(semCliente.detalhes.length, 1);
  assert.match(semCliente.detalhes[0], /cliente é obrigatório/);

  const clienteVazio = await capturaErro(corpoValido({ cliente: {} }));
  assert.equal(clienteVazio.detalhes.length, 2);
  assert.match(clienteVazio.detalhes[0], /cliente\.tipoPessoa/);
  assert.match(clienteVazio.detalhes[1], /cliente\.documento/);
});

test('validaEntrada: CPF com DV errado, CNPJ em PF e CPF em PJ são recusados com a mensagem do documento', async () => {
  const casos = [
    { tipoPessoa: 'PF', documento: '529.982.247-26' },
    { tipoPessoa: 'PF', documento: '11222333000181' },
    { tipoPessoa: 'PJ', documento: '52998224725' },
    { tipoPessoa: 'PF', documento: '111.111.111-11' },
  ];
  for (const cliente of casos) {
    const erro = await capturaErro(corpoValido({ cliente }));
    assert.equal(erro.detalhes.length, 1, JSON.stringify(cliente));
    assert.match(erro.detalhes[0], /cliente\.documento/);
  }
});

test('validaEntrada: as mensagens do cliente entram na mesma lista dos outros campos', async () => {
  const erro = await capturaErro(corpoValido({ cliente: { tipoPessoa: 'pf', documento: '123' }, valor: 0 }));

  assert.equal(erro.detalhes.length, 3); // tipoPessoa, documento, valor
  assert.match(erro.detalhes[0], /tipoPessoa/);
  assert.match(erro.detalhes[1], /documento/);
  assert.match(erro.detalhes[2], /valor/);
});

// ---------- demais campos (T-07) ----------
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
    cliente: { tipoPessoa: 'PJ', documento: '11.222.333/0001-82' }, // DV errado
    valor: -5,
    modalidade: 'VEICULOS',
    score: 1001,
    prazoMeses: 6, // VEICULOS exige 12 a 60
    dataLiberacao: '2026-02-30',
    primeiroRelacionamento: 'sim',
    // amortizacao ausente de propósito: entra como oitava mensagem
  });

  assert.equal(erro.detalhes.length, 8);
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

test('validaEntrada: valor aceita centavos mas recusa fração de centavo (o FinOps recusa 3 casas) — T-13', async () => {
  assert.equal((await valida(corpoValido({ valor: 1234.56 }))).valor, 1234.56);
  assert.equal((await valida(corpoValido({ valor: 0.07 }))).valor, 0.07); // 0.07 * 100 não é inteiro em ponto flutuante
  for (const valor of [10000.001, 1234.567, 0.005]) {
    const erro = await capturaErro(corpoValido({ valor }));
    assert.equal(erro.detalhes.length, 1, `valor ${valor}`);
    assert.equal(erro.detalhes[0], 'valor deve ter no máximo 2 casas decimais');
  }
});

test('validaEntrada: score precisa ser inteiro entre 0 e 1000 (0 e 1000 valem)', async () => {
  assert.equal((await valida(corpoValido({ score: 0 }))).score, 0);
  assert.equal((await valida(corpoValido({ score: 1000 }))).score, 1000);

  for (const score of [-1, 1001, 650.5, '650']) {
    const erro = await capturaErro(corpoValido({ score }));
    assert.match(erro.detalhes[0], /score/, `score ${score}`);
  }
});

test('validaEntrada: identificador no formato OP-AAAA-NNNN da esteira (T-13); espaços nas pontas são removidos', async () => {
  // formato do FinOps: OP-, 4 dígitos, -, 4 dígitos ou mais — até 20 caracteres no total (coluna deles)
  for (const identificador of ['OP-2026-0001', 'OP-2026-123456', 'OP-9999-123456789012']) {
    assert.equal((await valida(corpoValido({ identificador }))).identificador, identificador);
  }
  assert.equal((await valida(corpoValido({ identificador: '  OP-2026-0001  ' }))).identificador, 'OP-2026-0001');

  const recusados = [
    '', '   ', 'OP-1', 'op-2026-0001', 'OP-2026-001', 'OP-26-0001', 'OP-2026-0001-A', 'OP 2026 0001',
    'OP-2026-000 1', 'A'.repeat(60), 'OP-9999-1234567890123' /* 21 chars */, 123, null, undefined,
  ];
  for (const identificador of recusados) {
    const erro = await capturaErro(corpoValido({ identificador }));
    assert.equal(erro.detalhes.length, 1, `identificador ${JSON.stringify(identificador)}`);
    assert.match(erro.detalhes[0], /^identificador .*OP-AAAA-NNNN.*20 caracteres$/);
  }
});

test('validaEntrada: primeiroRelacionamento true é preservado; null conta como ausente', async () => {
  assert.equal((await valida(corpoValido({ primeiroRelacionamento: true }))).primeiroRelacionamento, true);
  assert.equal((await valida(corpoValido({ primeiroRelacionamento: null }))).primeiroRelacionamento, false);
  assert.match((await capturaErro(corpoValido({ primeiroRelacionamento: 1 }))).detalhes[0], /primeiroRelacionamento/);
});

// ---------- campos do grupo de decisão (T-14) ----------
test('validaEntrada: amortizacao é obrigatória e aceita só PRICE ou SAC (espaços e minúsculas toleradas)', async () => {
  assert.equal((await valida(corpoValido({ amortizacao: 'SAC' }))).amortizacao, 'SAC');
  assert.equal((await valida(corpoValido({ amortizacao: 'PRICE' }))).amortizacao, 'PRICE');
  assert.equal((await valida(corpoValido({ amortizacao: '  sac  ' }))).amortizacao, 'SAC');

  for (const amortizacao of [undefined, null, '', 'LINEAR', 'price ou sac', 123, ['SAC'], { sistema: 'SAC' }]) {
    const erro = await capturaErro(corpoValido({ amortizacao }));
    assert.equal(erro.status, 400, `amortizacao ${JSON.stringify(amortizacao)}`);
    assert.equal(erro.detalhes.length, 1, `amortizacao ${JSON.stringify(amortizacao)}`);
    assert.equal(erro.detalhes[0], 'amortizacao é obrigatória e deve ser PRICE ou SAC');
  }
});

test('validaEntrada: decisao é normalizada para maiúscula; ausente vira null; texto vazio é 400', async () => {
  assert.equal((await valida(corpoValido({ decisao: 'APROVADO' }))).decisao, 'APROVADO');
  assert.equal((await valida(corpoValido({ decisao: ' aprovado ' }))).decisao, 'APROVADO');
  // O valor em si não é julgado aqui: REPROVADO passa pela validação e cai no 422 da rota.
  assert.equal((await valida(corpoValido({ decisao: 'REPROVADO' }))).decisao, 'REPROVADO');
  assert.equal((await valida(corpoValido())).decisao, null); // campo não enviado
  assert.equal((await valida(corpoValido({ decisao: null }))).decisao, null);

  for (const decisao of ['', '   ', 42, {}, []]) {
    const erro = await capturaErro(corpoValido({ decisao }));
    assert.equal(erro.detalhes.length, 1, `decisao ${JSON.stringify(decisao)}`);
    assert.match(erro.detalhes[0], /^decisao deve ser um texto não vazio/);
  }
});

test('validaEntrada: probabilidadeDefault é número entre 0 e 1 (0 e 1 valem); ausente vira null', async () => {
  assert.equal((await valida(corpoValido({ probabilidadeDefault: 0.0128 }))).probabilidadeDefault, 0.0128);
  assert.equal((await valida(corpoValido({ probabilidadeDefault: 0 }))).probabilidadeDefault, 0);
  assert.equal((await valida(corpoValido({ probabilidadeDefault: 1 }))).probabilidadeDefault, 1);
  assert.equal((await valida(corpoValido())).probabilidadeDefault, null);

  for (const p of [-0.1, 1.01, 12.8, '0.0128', NaN, Infinity]) {
    const erro = await capturaErro(corpoValido({ probabilidadeDefault: p }));
    assert.equal(erro.detalhes.length, 1, `probabilidadeDefault ${p}`);
    assert.equal(erro.detalhes[0], 'probabilidadeDefault deve ser um número entre 0 e 1');
  }
});

test('validaEntrada: contextoScore é guardado como veio (objeto); ausente vira null', async () => {
  const contextoScore = {
    scoreFinal: 872,
    faixaRisco: 'EXCELENTE', // escala do grupo de decisão, NÃO a nossa faixa A/B/C/D
    probabilidadeDefault: 0.0128,
    modelo: 'SCORE_PF v1.1.0',
    motivo: 'Score 872 atende ao mínimo para aprovação automática.',
  };
  const e = await valida(corpoValido({ contextoScore }));
  assert.deepEqual(e.contextoScore, contextoScore); // nada é recalculado nem descartado

  assert.equal((await valida(corpoValido())).contextoScore, null);

  for (const c of ['texto', 42, [1, 2]]) {
    const erro = await capturaErro(corpoValido({ contextoScore: c }));
    assert.equal(erro.detalhes.length, 1, `contextoScore ${JSON.stringify(c)}`);
    assert.equal(erro.detalhes[0], 'contextoScore deve ser um objeto');
  }
});

test('validaEntrada: o payload real do grupo de decisão passa inteiro (T-14)', async () => {
  const e = await valida({
    identificador: 'OP-2026-000123',
    cliente: { tipoPessoa: 'PF', documento: '12345678909' },
    decisao: 'APROVADO',
    valor: 10000,
    modalidade: 'CREDITO_PESSOAL',
    score: 872,
    probabilidadeDefault: 0.0128,
    prazoMeses: 24,
    dataLiberacao: '2026-11-14',
    primeiroRelacionamento: false,
    amortizacao: 'SAC',
    contextoScore: {
      scoreFinal: 872,
      faixaRisco: 'EXCELENTE',
      probabilidadeDefault: 0.0128,
      modelo: 'SCORE_PF v1.1.0',
      motivo: 'Score 872 atende ao mínimo para aprovação automática.',
    },
  });

  assert.equal(e.identificador, 'OP-2026-000123'); // 6 dígitos na sequência: o regex aceita \d{4,}
  assert.equal(e.amortizacao, 'SAC');
  assert.equal(e.decisao, 'APROVADO');
  assert.equal(e.probabilidadeDefault, 0.0128);
  assert.equal(e.contextoScore.modelo, 'SCORE_PF v1.1.0');
  assert.equal(e.modalidade.codigo, 'CREDITO_PESSOAL');
  assert.equal(e.prazoMeses, 24);
  assert.equal(e.primeiroRelacionamento, false);
});
