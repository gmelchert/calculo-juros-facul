import { arredonda2 } from './util.js';

// Monta o demonstrativo do art. 7º da Res. CMN 4.881/2020: o valor em R$ de cada
// componente do custo total e o seu percentual sobre o total devido.
//
// valor: principal (ex.: 10000)
// totalJuros: soma dos juros das parcelas (saída da T-02/T-03)
// encargos: saída da T-05 (calculaEncargos) — usa .iof.total e .tarifaCadastro
// cronograma: saída da T-04 — usa .valor de cada parcela para o somatório
export function montaDemonstrativo({ valor, totalJuros, encargos, cronograma }) {
  const somatorioParcelas = arredonda2(
    cronograma.reduce((soma, parcela) => soma + parcela.valor, 0),
  );
  const totalDevido = arredonda2(somatorioParcelas + encargos.total);

  const componente = (descricao, v) => ({
    descricao,
    valor: v,
    percentualSobreTotalDevido: arredonda2((v / totalDevido) * 100),
  });

  const componentes = [
    componente('Principal (valor do crédito)', valor),
    componente('Juros', totalJuros),
    componente('IOF', encargos.iof.total),
    componente('Tarifa de cadastro', encargos.tarifaCadastro),
  ];

  return {
    componentes,
    somatorioParcelas,
    totalDevido,
  };
}