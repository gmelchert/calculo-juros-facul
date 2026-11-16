import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openapi } from './openapi.js';

test('OpenAPI: documento é serializável em JSON e declara a versão 3', () => {
  const copia = JSON.parse(JSON.stringify(openapi));
  assert.match(copia.openapi, /^3\.0\./);
  assert.equal(copia.servers[0].url, '/api');
});

test('OpenAPI: todos os endpoints da API estão documentados (e nenhum a mais)', () => {
  assert.deepEqual(Object.keys(openapi.paths).sort(), [
    '/health',
    '/juros/composto',
    '/juros/faixas',
    '/juros/simples',
    '/modalidades',
    '/modalidades/{codigo}',
    '/operacoes',
    '/operacoes/por-identificador/{identificador}/consolidado',
    '/operacoes/{id}',
    '/operacoes/{id}/consolidado',
    '/operacoes/{id}/definicao',
    '/operacoes/{id}/finops',
  ]);
  assert.deepEqual(Object.keys(openapi.paths['/operacoes']).sort(), ['get', 'post']);
  assert.deepEqual(Object.keys(openapi.paths['/operacoes/{id}/definicao']), ['post']);
  assert.deepEqual(Object.keys(openapi.paths['/operacoes/{id}/consolidado']), ['get']);
  assert.deepEqual(Object.keys(openapi.paths['/operacoes/{id}/finops']), ['post']);
});

test('OpenAPI: toda $ref aponta para um schema que existe', () => {
  const schemas = Object.keys(openapi.components.schemas);
  const refs = JSON.stringify(openapi).match(/#\/components\/schemas\/[A-Za-z]+/g);
  const faltando = refs
    .map((r) => r.replace('#/components/schemas/', ''))
    .filter((nome) => !schemas.includes(nome));
  assert.deepEqual([...new Set(faltando)], []);
});

test('OpenAPI: o exemplo da operação é calculado pelo código e bate com o cenário A.5', () => {
  const exemplo = openapi.paths['/operacoes'].post.responses[201].content['application/json'].example;

  assert.equal(exemplo.taxa.taxaFinalMes, 1.85);
  assert.equal(exemplo.simulacoes.PRICE.parcelaFixa, 936.91);
  assert.equal(exemplo.simulacoes.PRICE.valorLiberado, 9744.35);
  assert.equal(exemplo.simulacoes.PRICE.cet.anualPercentual, 30.89);
  assert.equal(exemplo.simulacoes.SAC.cet.anualPercentual, 30.96);
  assert.equal(exemplo.simulacoes.PRICE.cronograma.length, 12);
  assert.equal(exemplo.entrada.modalidade, 'CONSIGNADO_INSS');
  // T-09: cliente só com dígitos. T-14: nasce DEFINIDA; T-13: o FinOps já respondeu quando sai o 201.
  assert.deepEqual(exemplo.cliente, { tipoPessoa: 'PF', documento: '52998224725' });
  assert.equal(exemplo.estado, 'DEFINIDA');
  assert.equal(exemplo.definicao.sistema, 'PRICE');
  assert.equal(exemplo.definicao.definidoEm, exemplo.criadoEm); // definida no mesmo POST
  assert.equal(exemplo.finops.status, 'REGISTRADA');
  assert.equal(exemplo.finops.tentativaEm, exemplo.criadoEm); // enviada no mesmo request
  assert.equal('cliente' in exemplo.entrada, false);
  // T-14: auditoria do grupo de decisão volta junto com a operação
  assert.equal(exemplo.decisao, 'APROVADO');
  assert.equal(exemplo.probabilidadeDefault, 0.0412);
  assert.equal(exemplo.contextoScore.modelo, 'SCORE_PF v1.1.0');
});

test('OpenAPI: o pedido exige amortizacao e documenta os campos de auditoria da decisão (T-14)', () => {
  const schema = openapi.components.schemas.NovaOperacao;
  assert.ok(schema.required.includes('amortizacao'), 'amortizacao deveria ser obrigatória');
  assert.deepEqual(schema.properties.amortizacao.enum, ['PRICE', 'SAC']);
  for (const campo of ['decisao', 'probabilidadeDefault', 'contextoScore']) {
    assert.ok(campo in schema.properties, `NovaOperacao deveria documentar ${campo}`);
    assert.equal(schema.required.includes(campo), false, `${campo} é opcional`);
  }
  // o exemplo do pedido é o payload real do grupo de decisão
  const pedido = openapi.paths['/operacoes'].post.requestBody.content['application/json'].example;
  assert.equal(pedido.amortizacao, 'PRICE');
  assert.equal(pedido.decisao, 'APROVADO');

  // 422 do POST passa a citar a recusa por decisão não aprovada
  assert.equal(
    openapi.paths['/operacoes'].post.responses[422].content['application/json'].example.erro.codigo,
    'DECISAO_NAO_APROVADA',
  );
});

test('OpenAPI: o exemplo da definição é a mesma operação em estado DEFINIDA, já REGISTRADA no FinOps', () => {
  const exemplo = openapi.paths['/operacoes/{id}/definicao'].post.responses[200].content['application/json'].example;
  assert.equal(exemplo.estado, 'DEFINIDA');
  assert.deepEqual(exemplo.definicao, { sistema: 'PRICE', definidoEm: '2026-10-08 15:12:40' });
  assert.equal(exemplo.finops.status, 'REGISTRADA');
  assert.equal(typeof exemplo.finops.id, 'number');
  assert.equal(exemplo.simulacoes.PRICE.cronograma.length, 12);
});

test('OpenAPI: o reenvio ao FinOps devolve a mesma operação e documenta os erros 503 e 502 (T-13)', () => {
  const rota = openapi.paths['/operacoes/{id}/finops'].post;
  assert.deepEqual(Object.keys(rota.responses).sort(), ['200', '400', '404', '422', '502', '503']);
  assert.equal(rota.responses[200].content['application/json'].example.finops.status, 'REGISTRADA');
  assert.equal(rota.responses[503].content['application/json'].example.erro.codigo, 'FINOPS_INDISPONIVEL');
  assert.equal(rota.responses[502].content['application/json'].example.erro.codigo, 'FINOPS_RECUSOU');
  // o schema Finops lista os três estados
  assert.deepEqual(openapi.components.schemas.Finops.properties.status.enum, ['PENDENTE', 'REGISTRADA', 'FALHOU']);
});

test('OpenAPI: o pedido documenta o formato do identificador e os centavos do valor exigidos pelo FinOps', () => {
  const pedido = openapi.components.schemas.NovaOperacao.properties;
  assert.equal(pedido.identificador.pattern, '^OP-\\d{4}-\\d{4,}$');
  assert.equal(pedido.identificador.maxLength, 20);
  assert.equal(pedido.valor.multipleOf, 0.01);
});

test('OpenAPI: o exemplo do consolidado é calculado pelo código (montaConsolidado) e só tem o sistema escolhido', () => {
  const porId = openapi.paths['/operacoes/{id}/consolidado'].get.responses[200].content['application/json'].example;
  const porIdentificador = openapi.paths['/operacoes/por-identificador/{identificador}/consolidado'].get.responses[200].content['application/json'].example;

  assert.deepEqual(porId, porIdentificador);
  assert.equal(porId.sistema, 'PRICE');
  assert.deepEqual(porId.resumo, { parcelaFixa: 936.91, totalJuros: 1242.88, totalPago: 11242.88 });
  assert.equal(porId.cet.anualPercentual, 30.89);
  assert.equal(porId.calendario.length, 12);
  assert.equal(porId.produto.nome, 'Crédito pessoal consignado INSS');
  assert.equal(JSON.stringify(porId).includes('SAC'), false);
});

test('OpenAPI: os códigos de erro do schema Erro são os do Anexo B do backlog', () => {
  assert.deepEqual(openapi.components.schemas.Erro.properties.erro.properties.codigo.enum.sort(), [
    'AMORTIZACAO_JA_DEFINIDA',
    'CET_NAO_CONVERGE',
    'DADOS_INVALIDOS',
    'DECISAO_NAO_APROVADA',
    'ERRO_INTERNO',
    'FINOPS_INDISPONIVEL',
    'FINOPS_RECUSOU',
    'IDENTIFICADOR_DUPLICADO',
    'MODALIDADE_NAO_ENCONTRADA',
    'OPERACAO_NAO_DEFINIDA',
    'OPERACAO_NAO_ENCONTRADA',
    'SCORE_INSUFICIENTE',
  ]);
});
