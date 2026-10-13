import { test } from 'node:test';
import assert from 'node:assert/strict';

import { montaConsolidado } from './consolidado.js';
import { simulaOperacao } from './simulacao.js';
import { validaEntrada } from './validaEntrada.js';
import { calculaTaxa } from './taxa.js';
import { repositorioModalidadesFalso, repositorioFaixasFalso } from './bancoFalso.js';

// Operação como sairia de buscarPorId: A.5 (PF) simulada pelo código + colunas de estado montadas na mão.
async function operacaoA5({ sistema, cliente = { tipoPessoa: 'PF', documento: '529.982.247-25' } }) {
  const entrada = await validaEntrada({
    identificador: 'OP-2026-0001', cliente, valor: 10000, modalidade: 'CONSIGNADO_INSS',
    score: 650, prazoMeses: 12, dataLiberacao: '2026-10-30', primeiroRelacionamento: true,
  }, repositorioModalidadesFalso);
  const taxa = await calculaTaxa(entrada.modalidade, entrada.score, repositorioFaixasFalso);
  const operacao = {
    id: 1,
    identificador: 'OP-2026-0001',
    criadoEm: '2026-10-08 14:03:22',
    estado: sistema ? 'DEFINIDA' : 'SIMULADA',
    definicao: sistema ? { sistema, definidoEm: '2026-10-08 15:12:40' } : null,
    ...simulaOperacao(entrada, taxa),
  };
  const modalidade = await repositorioModalidadesFalso.buscarModalidade('CONSIGNADO_INSS');
  return { operacao, modalidade };
}

test('consolidado (A.5, PRICE): documento autocontido com os valores de referência e só o sistema escolhido', async () => {
  const { operacao, modalidade } = await operacaoA5({ sistema: 'PRICE' });
  const c = montaConsolidado(operacao, modalidade);

  assert.deepEqual(c.operacao, {
    id: 1, identificador: 'OP-2026-0001', estado: 'DEFINIDA',
    criadoEm: '2026-10-08 14:03:22', definidoEm: '2026-10-08 15:12:40',
  });
  assert.deepEqual(c.cliente, { tipoPessoa: 'PF', documento: '52998224725' });
  assert.deepEqual(c.produto, {
    codigo: 'CONSIGNADO_INSS',
    nome: 'Crédito pessoal consignado INSS',
    modalidadeBcb: 'Crédito pessoal consignado INSS - Prefixado',
  });
  assert.deepEqual(c.condicoes, { valor: 10000, prazoMeses: 12, dataLiberacao: '2026-10-30', primeiroRelacionamento: true });
  assert.deepEqual(c.taxa, { faixaRisco: 'B', taxaFinalMes: 1.85, taxaFinalAno: 24.6, tetoAplicado: true });
  assert.equal(c.sistema, 'PRICE');
  assert.deepEqual(c.resumo, { parcelaFixa: 936.91, totalJuros: 1242.88, totalPago: 11242.88 });
  assert.deepEqual(c.encargos, { iof: { diario: 167.65, adicional: 38, total: 205.65 }, tarifaCadastro: 50, total: 255.65 });
  assert.equal(c.valorLiberado, 9744.35);
  assert.deepEqual(c.cet, { anualPercentual: 30.89, mensalPercentual: 2.27 });
  assert.equal(c.demonstrativo.componentes.length, 4);
  assert.equal(c.demonstrativo.totalDevido, 11498.53);

  // calendário = cronograma da simulação escolhida, sem alteração (decisão D1)
  assert.equal(c.calendario.length, 12);
  assert.deepEqual(c.calendario, operacao.simulacoes.PRICE.cronograma);
  assert.equal(c.calendario[0].vencimento, '2026-11-30');
  assert.equal(c.calendario[11].valor, 936.87);

  // nada do SAC e nada das chaves internas
  assert.equal(JSON.stringify(c).includes('SAC'), false);
  assert.equal('simulacoes' in c, false);
  assert.equal('amortizacaoBase' in c.resumo, false);
  assert.deepEqual(Object.keys(c), [
    'operacao', 'cliente', 'produto', 'condicoes', 'taxa', 'sistema', 'resumo',
    'encargos', 'valorLiberado', 'cet', 'demonstrativo', 'calendario',
  ]);
});

test('consolidado (A.5, SAC): resumo traz amortizacaoBase e os totais do SAC', async () => {
  const { operacao, modalidade } = await operacaoA5({ sistema: 'SAC' });
  const c = montaConsolidado(operacao, modalidade);

  assert.equal(c.sistema, 'SAC');
  assert.deepEqual(c.resumo, { amortizacaoBase: 833.33, totalJuros: 1202.5, totalPago: 11202.5 });
  assert.equal(c.encargos.total, 250.22);
  assert.equal(c.valorLiberado, 9749.78);
  assert.deepEqual(c.cet, { anualPercentual: 30.96, mensalPercentual: 2.27 });
  assert.equal(c.demonstrativo.totalDevido, 11452.72);
  assert.deepEqual(c.calendario, operacao.simulacoes.SAC.cronograma);
  assert.equal(c.calendario[0].valor, 1018.33);
  assert.equal(c.calendario[11].valor, 848.79);
  assert.equal(JSON.stringify(c).includes('PRICE'), false);
});

test('consolidado (A.5, PJ, PRICE): encargos e CET de PJ (§7.4 dos requisitos)', async () => {
  const { operacao, modalidade } = await operacaoA5({
    sistema: 'PRICE', cliente: { tipoPessoa: 'PJ', documento: '11.222.333/0001-81' },
  });
  const c = montaConsolidado(operacao, modalidade);

  assert.deepEqual(c.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  assert.equal(c.encargos.iof.adicional, 95);
  assert.equal(c.encargos.total, 312.65);
  assert.equal(c.valorLiberado, 9687.35);
  assert.deepEqual(c.cet, { anualPercentual: 32.38, mensalPercentual: 2.37 });
  assert.equal(c.demonstrativo.totalDevido, 11555.53);
  assert.deepEqual(c.resumo, { parcelaFixa: 936.91, totalJuros: 1242.88, totalPago: 11242.88 });
});

test('consolidado: é puro — duas chamadas dão o mesmo documento e a operação não muda; o calendário é cópia', async () => {
  const { operacao, modalidade } = await operacaoA5({ sistema: 'PRICE' });
  const antes = structuredClone(operacao);

  const a = montaConsolidado(operacao, modalidade);
  const b = montaConsolidado(operacao, modalidade);

  assert.deepEqual(a, b);
  assert.deepEqual(operacao, antes);
  a.calendario[0].valor = 0; // mexer no documento não mexe na operação
  assert.equal(operacao.simulacoes.PRICE.cronograma[0].valor, 936.91);
});

test('consolidado: operação SIMULADA é bug de quem chamou → Error comum (a rota responde 422 antes)', async () => {
  const { operacao, modalidade } = await operacaoA5({ sistema: null });
  assert.throws(() => montaConsolidado(operacao, modalidade), { message: /não está DEFINIDA/ });
});
