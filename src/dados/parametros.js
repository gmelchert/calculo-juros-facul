// Parâmetros de encargos e tributos usados no cálculo de IOF e tarifa de cadastro.
// Fontes: IOF (PF) — Decreto 6.306/2007, art. 7º (diário) e art. 7º-A (adicional).
//         Tarifa de cadastro — Res. CMN 3.919/2010, art. 1º, e Tema 620 do STJ
//         (só pode ser cobrada no primeiro relacionamento com o cliente).
// Valores PROVISÓRIOS definidos pela equipe — mudam por decreto/resolução, por isso
// ficam isolados aqui e não espalhados dentro de src/lib/.
export const PARAMETROS = {
  IOF_ALIQUOTA_DIARIA: 0.000082, // 0,0082% ao dia (PF), sobre a amortização de cada parcela
  IOF_ALIQUOTA_ADICIONAL: 0.0038, // 0,38% uma única vez, sobre o valor total do crédito
  IOF_DIAS_MAXIMO: 365, // dias corridos além disso não geram IOF diário adicional
  TARIFA_CADASTRO: 50.00, // R$ — cobrada só se for o primeiro relacionamento do cliente
};