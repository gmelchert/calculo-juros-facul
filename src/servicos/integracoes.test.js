import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { notificaDefinicao } from './integracoes.js';

// Operação mínima: o serviço não olha o conteúdo, só repassa. Usamos o identificador nos logs.
const OPERACAO = { id: 1, identificador: 'OP-TESTE', estado: 'DEFINIDA', definicao: { sistema: 'PRICE' } };

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
  assert.deepEqual(await notificaDefinicao(OPERACAO), []);
  assert.equal(fetch.mock.callCount(), 0);
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

test('FinOps e Documentos configurados: envia para os dois', async () => {
  process.env.FINOPS_URL = 'http://localhost:8083';
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000';
  const fetch = mock.method(globalThis, 'fetch', async () => respostaJson(201, {}));

  const r = await notificaDefinicao(OPERACAO);

  assert.deepEqual(r.map((x) => [x.destino, x.ok]), [['FinOps', true], ['Documentos', true]]);
  assert.deepEqual(fetch.mock.calls.map((c) => c.arguments[0]).sort(), [
    'http://127.0.0.1:8000/api/documentos/juros',
    'http://localhost:8083/operacoes',
  ]);
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
  process.env.FINOPS_URL = 'http://localhost:8083';
  process.env.DOCUMENTOS_URL = 'http://127.0.0.1:8000';
  mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('8083')) throw new TypeError('fetch failed'); // o que o Node lança sem conexão
    return respostaJson(201, { documento_id: 'abc' });
  });

  const r = await notificaDefinicao(OPERACAO);

  assert.deepEqual(r.map((x) => [x.destino, x.ok]), [['FinOps', false], ['Documentos', true]]);
});
