import { adicionaMeses, proximoDiaUtil, diasEntre } from './datas.js';

export function geraCronograma({ parcelas, dataLiberacao }) {
  return parcelas.map((parcela) => {
    // 1. data "de aniversário": liberação + numero da parcela em meses
    const aniversario = adicionaMeses(dataLiberacao, parcela.numero);

    // 2. ajusta para dia útil (sábado/domingo → segunda)
    const vencimento = proximoDiaUtil(aniversario);

    // 3. conta os dias corridos da liberação até a data ajustada
    const diasCorridos = diasEntre(dataLiberacao, vencimento);

    // 4. devolve uma cópia da parcela com vencimento e diasCorridos
    return { ...parcela, vencimento, diasCorridos };
  });
}
