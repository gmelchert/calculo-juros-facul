import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { notificaDefinicao } from './integracoes.js';

// Operação mínima: o serviço não olha o conteúdo, só repassa. Usamos o identificador nos logs.
const OPERACAO = { id: 1, identificador: 'OP-2026-0001', estado: 'DEFINIDA', definicao: { sistema: 'PRICE' } };

// FinOps ligado sem tocar no process.env: o envio de verdade é o `registraFinops` injetado
// (registraOperacaoDefinida, que tem os seus próprios testes em finops.test.js).
const FINOPS_LIGADO = { url: 'http://localhost:8083', timeoutMs: 5000, habilitado: true };
const REGISTRADA = { status: 'REGISTRADA', id: 42, erro: null, tipo: 'CRIADA' };

function respostaJson(status, corpo) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  delete process.env.FINOPS_URL;
  delete process.env.DOCUMENTOS_URL;
  mock.method(console, 'log', () => {}); // deixa a saída do teste limpa
  mock.method(console, 'error', () => {});
});

afterEach(() => mock.restoreAll());

test('sem URL no .env não chama ninguém', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => respostaJson(201, {}));
  const registraFinops = mock.fn(async () => REGISTRADA);

  assert.deepEqual(await notificaDefinicao(OPERACAO, { registraFinops }), []);

  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(registraFinops.mock.callCount(), 0);
});

test('Documentos: POST do JSON da operação em /api/documentos/juros', async () => {
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000/'; // a barra do fim não pode duplicar
  const fetch = mock.method(globalThis, 'fetch', async () => respostaJson(201, { documento_id: 'abc' }));

  const [r] = await notificaDefinicao(OPERACAO);

  assert.deepEqual(r, { destino: 'Documentos', ok: true, resposta: { documento_id: 'abc' } });
  const [url, opcoes] = fetch.mock.calls[0].arguments;
  assert.equal(url, 'http://127.0.0.1:8000/api/documentos/juros');
  assert.equal(opcoes.method, 'POST');
  assert.equal(opcoes.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(opcoes.body), OPERACAO); // vai o texto JSON, não um arquivo
});

test('FinOps: vai pelo registraOperacaoDefinida (consolidado + finops_*), nunca pelo JSON cru da operação', async () => {
  // Se alguém voltar a mandar a operação crua por fetch, o FinOps responde 400
  // "operacao.identificador não pode ser vazio" — aqui isso vira falha de teste.
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('o FinOps não pode receber a operação crua'); });
  const registraFinops = mock.fn(async () => REGISTRADA);

  const r = await notificaDefinicao(OPERACAO, { finops: FINOPS_LIGADO, registraFinops });

  assert.deepEqual(r, [{ destino: 'FinOps', ok: true, resposta: { id: 42, status: 'REGISTRADA', tipo: 'CRIADA' } }]);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(registraFinops.mock.callCount(), 1);
  const [operacao, deps] = registraFinops.mock.calls[0].arguments;
  assert.equal(operacao, OPERACAO);
  assert.equal(deps.config, FINOPS_LIGADO); // a mesma configuração que decidiu enviar
});

test('FinOps e Documentos configurados: envia para os dois, cada um no seu formato', async () => {
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000';
  const fetch = mock.method(globalThis, 'fetch', async () => respostaJson(201, { documento_id: 'abc' }));
  const registraFinops = mock.fn(async () => REGISTRADA);

  const r = await notificaDefinicao(OPERACAO, { finops: FINOPS_LIGADO, registraFinops });

  assert.deepEqual(r.map((x) => [x.destino, x.ok]), [['FinOps', true], ['Documentos', true]]);
  assert.deepEqual(fetch.mock.calls.map((c) => c.arguments[0]), ['http://127.0.0.1:8000/api/documentos/juros']);
  assert.equal(registraFinops.mock.callCount(), 1);
});

test('FinOps recusou ou não respondeu (registraOperacaoDefinida devolve FALHOU, sem lançar) → ok:false com o motivo', async () => {
  const registraFinops = async () => ({
    status: 'FALHOU', id: null, tipo: 'RECUSADO',
    erro: 'FinOps respondeu 400: operacao.identificador não pode ser vazio',
  });

  const [r] = await notificaDefinicao(OPERACAO, { finops: FINOPS_LIGADO, registraFinops });

  assert.equal(r.destino, 'FinOps');
  assert.equal(r.ok, false);
  assert.match(r.erro, /respondeu 400/);
});

test('resposta 400 do outro grupo vira ok:false com a mensagem, sem lançar erro', async () => {
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000';
  mock.method(globalThis, 'fetch', async () => respostaJson(400, { detail: 'JSON inválido' }));

  const [r] = await notificaDefinicao(OPERACAO);

  assert.equal(r.ok, false);
  assert.match(r.erro, /respondeu 400/);
  assert.match(r.erro, /JSON inválido/);
});

test('API do outro grupo fora do ar: não lança erro e um destino não atrapalha o outro', async () => {
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000';
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); }); // o que o Node lança sem conexão
  const registraFinops = async () => REGISTRADA;

  const r = await notificaDefinicao(OPERACAO, { finops: FINOPS_LIGADO, registraFinops });

  assert.deepEqual(r.map((x) => [x.destino, x.ok]), [['FinOps', true], ['Documentos', false]]);
});

test('bug ou banco fora dentro do envio ao FinOps também não derruba a resposta: vira ok:false no log', async () => {
  const registraFinops = async () => { throw new TypeError('Cannot read properties of undefined'); };

  const [r] = await notificaDefinicao(OPERACAO, { finops: FINOPS_LIGADO, registraFinops });

  assert.deepEqual(r, { destino: 'FinOps', ok: false, erro: 'Cannot read properties of undefined' });
});
