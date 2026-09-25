import { arredonda2 } from './util.js';

export function calculaSac({ valor, taxaMes, prazoMeses }) {
  // 1. Amortização fixa: o principal dividido igualmente entre as parcelas.
  const amortizacaoBase = arredonda2(valor / prazoMeses);

  const parcelas = [];
  let saldo = valor;

  // 2/3. Percorre cada mês: juros incidem sobre o saldo, amortização é fixa
  //      (exceto na última, que absorve o que sobrou para zerar o saldo).
  for (let k = 1; k <= prazoMeses; k++) {
    const juros = arredonda2(saldo * taxaMes);

    const amortizacao = k < prazoMeses ? amortizacaoBase : saldo;

    const valorParcela = arredonda2(amortizacao + juros);
    saldo = arredonda2(saldo - amortizacao);

    parcelas.push({
      numero: k,
      amortizacao,
      juros,
      valor: valorParcela,
      saldoDevedor: saldo,
    });
  }

  // 4. Totais somados a partir dos valores já arredondados nas parcelas.
  const totalJuros = arredonda2(parcelas.reduce((soma, p) => soma + p.juros, 0));
  const totalPago = arredonda2(parcelas.reduce((soma, p) => soma + p.valor, 0));

  return {
    sistema: 'SAC',
    amortizacaoBase,
    parcelas,
    totalJuros,
    totalPago,
  };
}
