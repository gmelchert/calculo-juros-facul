// Parâmetros de encargos e tributos usados no cálculo de IOF e tarifa de cadastro.
// Fontes: IOF — Decreto 6.306/2007, art. 7º (diário) e art. 7º-A (adicional), com as alíquotas
//         dos Decretos 12.466/2025 e 12.499/2025 (mantidos pelo STF em 07/2025). Confiança MÉDIA
//         (docs/research_tabela-juros-brasil_20260831.md, §8): conferir o texto consolidado no
//         Planalto antes de apresentar como definitivo.
//         Tarifa de cadastro — Res. CMN 3.919/2010, art. 1º, e Tema 620 do STJ
//         (só pode ser cobrada no primeiro relacionamento com o cliente).
// Valores PROVISÓRIOS definidos pela equipe — mudam por decreto/resolução, por isso
// ficam isolados aqui e não espalhados dentro de src/lib/.
export const PARAMETROS = {
  IOF_ALIQUOTA_DIARIA: 0.000082, // 0,0082% ao dia (PF e PJ), sobre a amortização de cada parcela
  // IOF adicional: uma única vez, sobre o valor total do crédito. Depende do tipo de pessoa (RN06).
  // Desde 08/10/2026 (T-09): PJ é aceito e paga 0,95%. Para voltar a uma alíquota única, mude só aqui.
  IOF_ALIQUOTA_ADICIONAL: { PF: 0.0038, PJ: 0.0095 }, // 0,38% pessoa física / 0,95% pessoa jurídica
  IOF_DIAS_MAXIMO: 365, // dias corridos além disso não geram IOF diário adicional
  TARIFA_CADASTRO: 50.00, // R$ — cobrada só se for o primeiro relacionamento do cliente
};
