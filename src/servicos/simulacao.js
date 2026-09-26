import { calculaPrice } from '../lib/price.js';
import { calculaSac } from '../lib/sac.js';
import { geraCronograma } from '../lib/cronograma.js';
import { calculaEncargos } from '../lib/encargos.js';
import { calculaCet } from '../lib/cet.js';
import { montaDemonstrativo } from '../lib/demonstrativo.js';
import { arredonda2 } from '../lib/util.js';

// Junta as peças da T-02 a T-06. É uma função PURA: recebe a entrada já validada
// (saída de validaEntrada) e a taxa já resolvida no banco (saída de calculaTaxa) e devolve
// o resultado no formato que o repositório grava ({ entrada, taxa, simulacoes }).
// Não sabe o que é HTTP nem banco — por isso os testes dela rodam sem MySQL.
//
// Pode lançar ErroDeNegocio 422 CET_NAO_CONVERGE (calculaCet).
export function simulaOperacao(entrada, taxa) {
  const { valor, modalidade, score, prazoMeses, dataLiberacao, primeiroRelacionamento } = entrada;

  // 1. ÚNICO lugar do projeto onde a taxa deixa de ser % e vira decimal (1.85 → 0.0185).
  const taxaMes = taxa.taxaFinalMes / 100;

  // 2. Mesma sequência para os dois sistemas de amortização.
  const simulacoes = {};
  for (const calculaParcelas of [calculaPrice, calculaSac]) {
    const resultado = calculaParcelas({ valor, taxaMes, prazoMeses });
    const cronograma = geraCronograma({ parcelas: resultado.parcelas, dataLiberacao });
    const encargos = calculaEncargos({ valor, cronograma, primeiroRelacionamento });
    const valorLiberado = arredonda2(valor - encargos.total); // encargos pagos antecipadamente
    const cet = calculaCet({ valorLiberado, cronograma });
    const demonstrativo = montaDemonstrativo({
      valor, totalJuros: resultado.totalJuros, encargos, cronograma,
    });

    // `parcelas` sai do objeto: o cronograma é a mesma lista, já com vencimento e diasCorridos.
    const { parcelas, ...resumo } = resultado;

    simulacoes[resultado.sistema] = {
      ...resumo, // sistema, parcelaFixa (Price) ou amortizacaoBase (SAC), totalJuros, totalPago
      encargos,
      valorLiberado,
      cet: {
        anualPercentual: arredonda2(cet.cetAnual * 100),
        mensalPercentual: arredonda2(cet.cetMensal * 100),
      },
      demonstrativo,
      cronograma,
    };
  }

  // 3. `entrada.modalidade` volta a ser a STRING do código: é o que o repositório grava.
  return {
    entrada: {
      valor,
      modalidade: modalidade.codigo,
      score,
      prazoMeses,
      dataLiberacao,
      primeiroRelacionamento,
    },
    taxa,
    simulacoes,
  };
}
