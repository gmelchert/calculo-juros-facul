import { test } from 'node:test';
import assert from 'node:assert/strict';

import { simulaOperacao } from './simulacao.js';
import { validaEntrada } from './validaEntrada.js';
import { calculaTaxa } from './taxa.js';
import { arredonda2 } from '../lib/util.js';
import { repositorioModalidadesFalso, repositorioFaixasFalso } from './bancoFalso.js';

// Cenário ponta a ponta do Anexo A.5: INSS, score 650, 10.000 em 12x, liberação 2026-10-30.
// Passa pelos três serviços, na mesma ordem da rota, mas com o banco falso.
async function cenarioA5(sobrescreve = {}) {
  const entrada = await validaEntrada({
    identificador: 'OP-2026-0001',
    valor: 10000,
    modalidade: 'CONSIGNADO_INSS',
    score: 650,
    prazoMeses: 12,
    dataLiberacao: '2026-10-30',
    primeiroRelacionamento: true,
    ...sobrescreve,
  }, repositorioModalidadesFalso);
  const taxa = await calculaTaxa(entrada.modalidade, entrada.score, repositorioFaixasFalso);
  return { entrada, taxa, resultado: simulaOperacao(entrada, taxa) };
}

test('Simulação A.5: taxa, Price e SAC batem com os valores de referência', async () => {
  const { resultado: r } = await cenarioA5();

  // taxa (vem da tabela faixas_juros e passa intacta para a resposta)
  assert.equal(r.taxa.faixaRisco, 'B');
  assert.equal(r.taxa.taxaFinalMes, 1.85);
  assert.equal(r.taxa.tetoAplicado, true);

  // PRICE
  const price = r.simulacoes.PRICE;
  assert.equal(price.sistema, 'PRICE');
  assert.equal(price.parcelaFixa, 936.91);
  assert.equal(price.totalJuros, 1242.88);
  assert.equal(price.totalPago, 11242.88);
  assert.deepEqual(price.encargos, {
    iof: { diario: 167.65, adicional: 38.00, total: 205.65 },
    tarifaCadastro: 50.00,
    total: 255.65,
  });
  assert.equal(price.valorLiberado, 9744.35);
  assert.equal(price.cet.anualPercentual, 30.89);
  assert.equal(price.cet.mensalPercentual, 2.27);
  assert.equal(price.demonstrativo.somatorioParcelas, 11242.88);
  assert.equal(price.demonstrativo.totalDevido, 11498.53);

  // SAC
  const sac = r.simulacoes.SAC;
  assert.equal(sac.sistema, 'SAC');
  assert.equal(sac.amortizacaoBase, 833.33);
  assert.equal(sac.totalJuros, 1202.50);
  assert.equal(sac.totalPago, 11202.50);
  assert.equal(sac.encargos.iof.diario, 162.22);
  assert.equal(sac.encargos.total, 250.22);
  assert.equal(sac.valorLiberado, 9749.78);
  assert.equal(sac.cet.anualPercentual, 30.96);
  assert.equal(sac.cet.mensalPercentual, 2.27);
  assert.equal(sac.demonstrativo.totalDevido, 11452.72);
});

test('Simulação A.5: cronograma tem 12 parcelas com datas reais; `parcelas` não aparece na saída', async () => {
  const { PRICE, SAC } = (await cenarioA5()).resultado.simulacoes;

  assert.equal(PRICE.cronograma.length, 12);
  assert.equal(SAC.cronograma.length, 12);
  assert.equal(PRICE.cronograma[0].vencimento, '2026-11-30');
  assert.equal(PRICE.cronograma[0].diasCorridos, 31);
  assert.equal(PRICE.cronograma[0].valor, 936.91);
  assert.equal(PRICE.cronograma[11].vencimento, '2027-11-01'); // sábado → segunda
  assert.equal(PRICE.cronograma[11].valor, 936.87);
  assert.equal(PRICE.cronograma[11].saldoDevedor, 0);
  assert.equal(SAC.cronograma[0].valor, 1018.33);
  assert.equal(SAC.cronograma[11].valor, 848.79);

  assert.equal('parcelas' in PRICE, false);
  assert.equal('parcelas' in SAC, false);
});

test('Simulação: `entrada` devolve o CÓDIGO da modalidade (string) e `taxa` passa intacta — formato que salvar() grava', async () => {
  const { taxa, resultado: r } = await cenarioA5();

  assert.deepEqual(r.entrada, {
    valor: 10000,
    modalidade: 'CONSIGNADO_INSS',
    score: 650,
    prazoMeses: 12,
    dataLiberacao: '2026-10-30',
    primeiroRelacionamento: true,
  });
  assert.equal(r.taxa, taxa);
  // Campos que salvar() lê diretamente:
  assert.equal(typeof r.taxa.faixaRisco, 'string');
  assert.equal(typeof r.taxa.taxaFinalMes, 'number');
  assert.equal(typeof r.simulacoes.PRICE.cet.anualPercentual, 'number');
  assert.equal(typeof r.simulacoes.SAC.cet.anualPercentual, 'number');
});

test('Simulação: sem primeiro relacionamento não há tarifa de cadastro e o CET cai', async () => {
  const com = (await cenarioA5({ primeiroRelacionamento: true })).resultado.simulacoes.PRICE;
  const sem = (await cenarioA5({ primeiroRelacionamento: false })).resultado.simulacoes.PRICE;

  assert.equal(sem.encargos.tarifaCadastro, 0);
  assert.equal(sem.encargos.total, 205.65);
  assert.equal(sem.valorLiberado, arredonda2(10000 - 205.65));
  assert.ok(sem.cet.anualPercentual < com.cet.anualPercentual);
});

test('Simulação: CREDITO_PESSOAL com score 720 usa 5,00% a.m. da tabela (segundo exemplo do A.5)', async () => {
  const { resultado: r } = await cenarioA5({ modalidade: 'CREDITO_PESSOAL', score: 720 });

  assert.equal(r.taxa.taxaFinalMes, 5.00);
  assert.equal(r.taxa.tetoAplicado, false);
  // Sanidade: juros do 1º mês = 10.000 × 5% (a conversão % → decimal aconteceu uma única vez)
  assert.equal(r.simulacoes.PRICE.cronograma[0].juros, 500.00);
  assert.equal(r.simulacoes.SAC.cronograma[0].juros, 500.00);
});

test('Simulação: é função pura — mesma entrada, mesma saída; não altera a entrada', async () => {
  const { entrada, taxa } = await cenarioA5();
  const copia = structuredClone(entrada);

  const a = simulaOperacao(entrada, taxa);
  const b = simulaOperacao(entrada, taxa);

  assert.deepEqual(a, b);
  assert.deepEqual(entrada, copia);
});
