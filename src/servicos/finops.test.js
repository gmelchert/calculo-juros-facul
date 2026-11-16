import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  configuracaoFinops, registraOperacao, registraOperacaoDefinida, ErroFinops, STATUS_FINOPS,
} from './finops.js';
import { simulaOperacao } from './simulacao.js';
import { validaEntrada } from './validaEntrada.js';
import { calculaTaxa } from './taxa.js';
import { repositorioModalidadesFalso, repositorioFaixasFalso } from './bancoFalso.js';

// ---------- apoio ----------

const CONFIG = { url: 'http://finops.teste:8083', timeoutMs: 1000, habilitado: true };

// Resposta HTTP falsa, no formato que registraOperacao lê (status + text()).
function resposta(status, corpo) {
  return { status, text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) };
}

// fetch falso: devolve `resposta` (ou lança `erro`) e guarda a chamada em `chamadas`.
function fetchFalso({ resposta: r, erro } = {}) {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
    if (erro) throw erro;
    return r;
  };
  return { fetch, chamadas };
}

const CONFIRMACAO = { id: 7, numeroOperacao: 'OP-2026-0001', status: 'ATIVA', criadoEm: '2026-11-15T22:45:20Z' };

// Operação DEFINIDA como sai de buscarPorId (cenário A.5, PRICE), com `finops` na situação pedida.
async function operacaoDefinida(finops = { status: 'PENDENTE', id: null, erro: null, tentativaEm: null }) {
  const entrada = await validaEntrada({
    identificador: 'OP-2026-0001', cliente: { tipoPessoa: 'PF', documento: '529.982.247-25' },
    valor: 10000, modalidade: 'CONSIGNADO_INSS', score: 650, prazoMeses: 12,
    dataLiberacao: '2026-10-30', primeiroRelacionamento: true,
  }, repositorioModalidadesFalso);
  const taxa = await calculaTaxa(entrada.modalidade, entrada.score, repositorioFaixasFalso);
  return {
    id: 1, identificador: 'OP-2026-0001', criadoEm: '2026-10-08 14:03:22', estado: 'DEFINIDA',
    definicao: { sistema: 'PRICE', definidoEm: '2026-10-08 15:12:40' }, finops,
    ...simulaOperacao(entrada, taxa),
  };
}

// Repositório falso: só guarda o que registraTentativaFinops recebeu.
function repositorioFalso() {
  const tentativas = [];
  return { tentativas, registraTentativaFinops: async (t) => { tentativas.push(t); return true; } };
}

// ---------- configuracaoFinops ----------

test('configuracaoFinops: lê FINOPS_URL (sem barra no fim) e FINOPS_TIMEOUT_MS; vazio desliga', () => {
  assert.deepEqual(configuracaoFinops({ FINOPS_URL: 'http://localhost:8083/', FINOPS_TIMEOUT_MS: '2500' }),
    { url: 'http://localhost:8083', timeoutMs: 2500, habilitado: true });
  assert.deepEqual(configuracaoFinops({ FINOPS_URL: '  ' }), { url: '', timeoutMs: 5000, habilitado: false });
  assert.deepEqual(configuracaoFinops({}), { url: '', timeoutMs: 5000, habilitado: false });
  // timeout inválido cai no padrão
  assert.equal(configuracaoFinops({ FINOPS_URL: 'http://x', FINOPS_TIMEOUT_MS: 'abc' }).timeoutMs, 5000);
  assert.equal(configuracaoFinops({ FINOPS_URL: 'http://x', FINOPS_TIMEOUT_MS: '-1' }).timeoutMs, 5000);
});

test('STATUS_FINOPS expõe os três estados do registro', () => {
  assert.deepEqual(STATUS_FINOPS, ['PENDENTE', 'REGISTRADA', 'FALHOU']);
});

// ---------- registraOperacao (cliente HTTP) ----------

test('registraOperacao: POST {url}/operacoes com o consolidado em JSON e timeout; 201 → criada', async () => {
  const { fetch, chamadas } = fetchFalso({ resposta: resposta(201, CONFIRMACAO) });
  const consolidado = { operacao: { identificador: 'OP-2026-0001', estado: 'DEFINIDA' }, sistema: 'PRICE' };

  const r = await registraOperacao(consolidado, { config: CONFIG, fetch });

  assert.deepEqual(r, { criada: true, ...CONFIRMACAO });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'http://finops.teste:8083/operacoes');
  assert.equal(chamadas[0].opcoes.method, 'POST');
  assert.equal(chamadas[0].opcoes.headers['content-type'], 'application/json');
  assert.deepEqual(chamadas[0].corpo, consolidado); // o payload vai como está, sem adaptação
  assert.ok(chamadas[0].opcoes.signal instanceof AbortSignal);
});

test('registraOperacao: 200 (identificador já registrado lá) também é sucesso, com criada=false', async () => {
  const { fetch } = fetchFalso({ resposta: resposta(200, CONFIRMACAO) });
  const r = await registraOperacao({}, { config: CONFIG, fetch });
  assert.equal(r.criada, false);
  assert.equal(r.id, 7);
  assert.equal(r.numeroOperacao, 'OP-2026-0001');
});

test('registraOperacao: 400 → ErroFinops RECUSADO com a mensagem do FinOps', async () => {
  const { fetch } = fetchFalso({ resposta: resposta(400, { erro: 'operacao.identificador deve estar no formato OP-AAAA-NNNN' }) });
  await assert.rejects(registraOperacao({}, { config: CONFIG, fetch }), (erro) => {
    assert.ok(erro instanceof ErroFinops);
    assert.equal(erro.tipo, 'RECUSADO');
    assert.equal(erro.status, 400);
    assert.equal(erro.message, 'FinOps respondeu 400: operacao.identificador deve estar no formato OP-AAAA-NNNN');
    return true;
  });
});

test('registraOperacao: status inesperado (500 sem JSON, 404 de rota) → ErroFinops INESPERADO', async () => {
  const { fetch: f500 } = fetchFalso({ resposta: resposta(500, 'Internal Server Error') });
  await assert.rejects(registraOperacao({}, { config: CONFIG, fetch: f500 }), (erro) => {
    assert.equal(erro.tipo, 'INESPERADO');
    assert.equal(erro.status, 500);
    assert.match(erro.message, /500.*resposta inesperada/);
    return true;
  });
  const { fetch: f404 } = fetchFalso({ resposta: resposta(404, { erro: 'rota não encontrada' }) });
  await assert.rejects(registraOperacao({}, { config: CONFIG, fetch: f404 }), { tipo: 'INESPERADO', message: /404: rota não encontrada/ });
});

test('registraOperacao: conexão recusada e timeout → ErroFinops COMUNICACAO (reenviar é seguro)', async () => {
  const causa = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8083'), { code: 'ECONNREFUSED' });
  const recusada = new TypeError('fetch failed', { cause: causa });
  const { fetch: f1 } = fetchFalso({ erro: recusada });
  await assert.rejects(registraOperacao({}, { config: CONFIG, fetch: f1 }), (erro) => {
    assert.ok(erro instanceof ErroFinops);
    assert.equal(erro.tipo, 'COMUNICACAO');
    assert.equal(erro.status, undefined);
    assert.match(erro.message, /sem resposta do FinOps em http:\/\/finops\.teste:8083\/operacoes \(ECONNREFUSED/);
    assert.equal(erro.cause, recusada);
    return true;
  });

  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const { fetch: f2 } = fetchFalso({ erro: timeout });
  await assert.rejects(registraOperacao({}, { config: CONFIG, fetch: f2 }), { tipo: 'COMUNICACAO', message: /tempo de resposta esgotado/ });
});

test('registraOperacao: chamar com a integração desligada é bug de quem chamou (Error comum, não ErroFinops)', async () => {
  const { fetch, chamadas } = fetchFalso({ resposta: resposta(201, CONFIRMACAO) });
  await assert.rejects(registraOperacao({}, { config: { ...CONFIG, habilitado: false }, fetch }), (erro) => {
    assert.ok(!(erro instanceof ErroFinops));
    assert.match(erro.message, /FINOPS_URL/);
    return true;
  });
  assert.equal(chamadas.length, 0);
});

// ---------- registraOperacaoDefinida (orquestração) ----------

test('registraOperacaoDefinida: monta o consolidado da operação, envia e grava REGISTRADA com o id do FinOps', async () => {
  const operacao = await operacaoDefinida();
  const repositorio = repositorioFalso();
  const enviados = [];
  const registra = async (payload, { config }) => { enviados.push({ payload, config }); return { criada: true, ...CONFIRMACAO }; };

  const r = await registraOperacaoDefinida(operacao, {
    config: CONFIG, repositorio, modalidades: repositorioModalidadesFalso, registra,
  });

  assert.deepEqual(r, { status: 'REGISTRADA', id: 7, erro: null, tipo: 'CRIADA' });
  assert.deepEqual(repositorio.tentativas, [{ id: 1, status: 'REGISTRADA', finopsId: 7, erro: null }]);

  // o payload é exatamente o consolidado (o mesmo de GET /operacoes/:id/consolidado)
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].config, CONFIG);
  const p = enviados[0].payload;
  assert.deepEqual(Object.keys(p), [
    'operacao', 'cliente', 'produto', 'condicoes', 'taxa', 'sistema', 'resumo',
    'encargos', 'valorLiberado', 'cet', 'demonstrativo', 'calendario',
  ]);
  assert.deepEqual(p.operacao, {
    id: 1, identificador: 'OP-2026-0001', estado: 'DEFINIDA', criadoEm: '2026-10-08 14:03:22', definidoEm: '2026-10-08 15:12:40',
  });
  assert.equal(p.produto.nome, 'Crédito pessoal consignado INSS');
  assert.equal(p.sistema, 'PRICE');
  assert.deepEqual(p.resumo, { parcelaFixa: 936.91, totalJuros: 1242.88, totalPago: 11242.88 });
  assert.equal(p.valorLiberado, 9744.35);
  assert.equal(p.calendario.length, 12);
  assert.equal('finops' in p, false); // a situação do registro não vai no payload
});

test('registraOperacaoDefinida: as contas do payload fecham do jeito que o FinOps confere (ao centavo, em PRICE e SAC)', async () => {
  const centavos = (x) => Math.round(x * 100);
  for (const sistema of ['PRICE', 'SAC']) {
    const operacao = { ...(await operacaoDefinida()), definicao: { sistema, definidoEm: '2026-10-08 15:12:40' } };
    let payload;
    await registraOperacaoDefinida(operacao, {
      config: CONFIG, repositorio: repositorioFalso(), modalidades: repositorioModalidadesFalso,
      registra: async (p) => { payload = p; return { criada: true, ...CONFIRMACAO }; },
    });

    // regras de service/validacao.go e service/calendario.go do FinOps
    assert.equal(payload.calendario.length, payload.condicoes.prazoMeses);
    let saldo = centavos(payload.condicoes.valor);
    let somaJuros = 0;
    let somaValor = 0;
    let anterior = payload.condicoes.dataLiberacao;
    payload.calendario.forEach((parcela, i) => {
      assert.equal(parcela.numero, i + 1);
      assert.ok(parcela.vencimento > anterior, `${sistema} parcela ${parcela.numero}: vencimento não cresce`);
      anterior = parcela.vencimento;
      for (const campo of ['amortizacao', 'juros', 'valor', 'saldoDevedor']) {
        assert.equal(centavos(parcela[campo]) / 100, parcela[campo], `${sistema} parcela ${parcela.numero}: ${campo} com fração de centavo`);
      }
      assert.equal(centavos(parcela.valor), centavos(parcela.amortizacao) + centavos(parcela.juros));
      saldo -= centavos(parcela.amortizacao);
      assert.equal(centavos(parcela.saldoDevedor), saldo, `${sistema} parcela ${parcela.numero}: saldo não encadeia`);
      somaJuros += centavos(parcela.juros);
      somaValor += centavos(parcela.valor);
    });
    assert.equal(saldo, 0);
    assert.equal(centavos(payload.resumo.totalJuros), somaJuros);
    assert.equal(centavos(payload.resumo.totalPago), somaValor);
    const { iof, tarifaCadastro, total } = payload.encargos;
    assert.equal(centavos(iof.total), centavos(iof.diario) + centavos(iof.adicional));
    assert.equal(centavos(total), centavos(iof.total) + centavos(tarifaCadastro));
    assert.equal(centavos(payload.valorLiberado), centavos(payload.condicoes.valor) - centavos(total));
    assert.match(payload.operacao.identificador, /^OP-\d{4}-\d{4,}$/);
    assert.match(payload.operacao.definidoEm, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  }
});

test('registraOperacaoDefinida: reenvio que o FinOps responde 200 também fica REGISTRADA (tipo JA_EXISTIA)', async () => {
  const repositorio = repositorioFalso();
  const r = await registraOperacaoDefinida(await operacaoDefinida({ status: 'FALHOU', id: null, erro: 'x', tentativaEm: 'y' }), {
    config: CONFIG, repositorio, modalidades: repositorioModalidadesFalso,
    registra: async () => ({ criada: false, ...CONFIRMACAO }),
  });
  assert.deepEqual(r, { status: 'REGISTRADA', id: 7, erro: null, tipo: 'JA_EXISTIA' });
  assert.equal(repositorio.tentativas[0].status, 'REGISTRADA');
});

test('registraOperacaoDefinida: ErroFinops → grava FALHOU com o motivo (até 255 chars), avisa no log e NÃO lança', async () => {
  const repositorio = repositorioFalso();
  const avisos = [];
  const r = await registraOperacaoDefinida(await operacaoDefinida(), {
    config: CONFIG, repositorio, modalidades: repositorioModalidadesFalso,
    registra: async () => { throw new ErroFinops(`FinOps respondeu 400: ${'x'.repeat(300)}`, { tipo: 'RECUSADO', status: 400 }); },
    avisa: (m) => avisos.push(m),
  });

  assert.equal(r.status, 'FALHOU');
  assert.equal(r.tipo, 'RECUSADO');
  assert.equal(r.id, null);
  assert.equal(r.erro.length, 255);
  assert.match(r.erro, /^FinOps respondeu 400: x+$/);
  assert.deepEqual(repositorio.tentativas, [{ id: 1, status: 'FALHOU', finopsId: null, erro: r.erro }]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /\[finops\] operação 1 \(OP-2026-0001\) não registrada/);
});

test('registraOperacaoDefinida: falha de comunicação preserva o id de um registro anterior', async () => {
  const repositorio = repositorioFalso();
  const r = await registraOperacaoDefinida(await operacaoDefinida({ status: 'REGISTRADA', id: 7, erro: null, tentativaEm: 'y' }), {
    config: CONFIG, repositorio, modalidades: repositorioModalidadesFalso,
    registra: async () => { throw new ErroFinops('sem resposta', { tipo: 'COMUNICACAO' }); },
    avisa: () => {},
  });
  assert.deepEqual(r, { status: 'FALHOU', id: 7, erro: 'sem resposta', tipo: 'COMUNICACAO' });
  assert.equal(repositorio.tentativas[0].finopsId, null); // COALESCE no repositório mantém o 7
});

test('registraOperacaoDefinida: erro que não é ErroFinops (bug, banco fora) sobe para virar 500', async () => {
  await assert.rejects(registraOperacaoDefinida(await operacaoDefinida(), {
    config: CONFIG, repositorio: repositorioFalso(), modalidades: repositorioModalidadesFalso,
    registra: async () => { throw new TypeError('Cannot read properties of undefined'); },
  }), TypeError);
});

test('registraOperacaoDefinida: integração desligada → não envia, não grava, devolve a situação atual com tipo DESLIGADO', async () => {
  const repositorio = repositorioFalso();
  let chamou = false;
  const finops = { status: 'PENDENTE', id: null, erro: null, tentativaEm: null };
  const r = await registraOperacaoDefinida(await operacaoDefinida(finops), {
    config: { url: '', timeoutMs: 5000, habilitado: false }, repositorio, modalidades: repositorioModalidadesFalso,
    registra: async () => { chamou = true; },
  });
  assert.deepEqual(r, { ...finops, tipo: 'DESLIGADO' });
  assert.equal(chamou, false);
  assert.deepEqual(repositorio.tentativas, []);
});

test('registraOperacaoDefinida: operação SIMULADA é bug de quem chamou → Error comum', async () => {
  const simulada = { ...(await operacaoDefinida()), estado: 'SIMULADA', definicao: null, finops: null };
  await assert.rejects(registraOperacaoDefinida(simulada, { config: CONFIG }), { message: /não está DEFINIDA/ });
});
