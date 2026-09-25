import { arredonda2 } from './util.js';
import { PARAMETROS } from '../dados/parametros.js';

const { IOF_ALIQUOTA_DIARIA, IOF_ALIQUOTA_ADICIONAL, IOF_DIAS_MAXIMO, TARIFA_CADASTRO } = PARAMETROS;

// Calcula os encargos (IOF + tarifa de cadastro) de uma operação de crédito.
//
// valor: principal do empréstimo (ex.: 10000)
// cronograma: saída da T-04 (geraCronograma) — cada parcela precisa ter
//             `amortizacao` e `diasCorridos`
// primeiroRelacionamento: boolean — só cobra tarifa de cadastro se true
export function calculaEncargos({ valor, cronograma, primeiroRelacionamento }) {
  // IOF diário: soma, parcela a parcela, o IOF sobre a amortização daquele mês,
  // proporcional aos dias corridos até o vencimento (limitados a 365 dias).
  // Não arredondamos dentro do laço — só o total, para não divergir centavos.
  let somaDiario = 0;
  for (const parcela of cronograma) {
    const diasConsiderados = Math.min(parcela.diasCorridos, IOF_DIAS_MAXIMO);
    somaDiario += parcela.amortizacao * IOF_ALIQUOTA_DIARIA * diasConsiderados;
  }
  const iofDiario = arredonda2(somaDiario);

  // IOF adicional: 0,38% sobre o valor total do crédito, uma única vez.
  const iofAdicional = arredonda2(valor * IOF_ALIQUOTA_ADICIONAL);

  const iofTotal = arredonda2(iofDiario + iofAdicional);

  // Tarifa de cadastro só pode ser cobrada no primeiro relacionamento (Tema 620/STJ).
  const tarifaCadastro = primeiroRelacionamento ? TARIFA_CADASTRO : 0;

  const total = arredonda2(iofTotal + tarifaCadastro);

  return {
    iof: {
      diario: iofDiario,
      adicional: iofAdicional,
      total: iofTotal,
    },
    tarifaCadastro,
    total,
  };
}