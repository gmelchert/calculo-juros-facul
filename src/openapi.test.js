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
    '/operacoes/{id}',
  ]);
  assert.deepEqual(Object.keys(openapi.paths['/operacoes']).sort(), ['get', 'post']);
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
});

test('OpenAPI: os códigos de erro do schema Erro são os do Anexo B do backlog', () => {
  assert.deepEqual(openapi.components.schemas.Erro.properties.erro.properties.codigo.enum.sort(), [
    'CET_NAO_CONVERGE',
    'DADOS_INVALIDOS',
    'ERRO_INTERNO',
    'IDENTIFICADOR_DUPLICADO',
    'MODALIDADE_NAO_ENCONTRADA',
    'OPERACAO_NAO_ENCONTRADA',
    'SCORE_INSUFICIENTE',
  ]);
});
