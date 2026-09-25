import { ErroDeNegocio } from './erros.js';

// Calcula o CET (Custo Efetivo Total) pela equação da Res. CMN 4.881/2020, art. 4º:
//   FC0 = soma( FCj / (1 + CET) ^ ((dj - d0) / 365) )
// Não há fórmula fechada (o CET aparece no expoente), então resolvemos por bisseção
// no intervalo [0%, 1000% a.a.], que cobre qualquer crédito real.
//
// valorLiberado: FC0 — o que o cliente efetivamente recebeu (valor - encargos.total)
// cronograma: saída da T-04 — cada parcela precisa ter `valor` (FCj) e `diasCorridos`
//
// Retorna { cetAnual, cetMensal } em decimais, SEM arredondar — quem apresenta
// o resultado (T-07) decide o arredondamento.
export function calculaCet({ valorLiberado, cronograma }) {
  // f(cet): valor presente das parcelas menos o valor liberado.
  // f(0) é positivo quando o fluxo é "razoável" (soma das parcelas > valor liberado)
  // e f decresce conforme cet aumenta, então a raiz de f(cet) = 0 é o CET.
  const f = (cet) => {
    const valorPresente = cronograma.reduce((soma, parcela) => {
      return soma + parcela.valor / (1 + cet) ** (parcela.diasCorridos / 365);
    }, 0);
    return valorPresente - valorLiberado;
  };

  let lo = 0; // 0% ao ano
  let hi = 10; // 1000% ao ano

  if (!(f(lo) > 0 && f(hi) < 0)) {
    throw new ErroDeNegocio(
      422,
      'CET_NAO_CONVERGE',
      'Não foi possível calcular o CET para este fluxo de pagamentos',
    );
  }

  for (let iteracao = 0; iteracao < 200 && hi - lo > 1e-10; iteracao++) {
    const meio = (lo + hi) / 2;
    if (f(meio) > 0) lo = meio; // raiz está à direita
    else hi = meio; // raiz está à esquerda
  }

  const cetAnual = (lo + hi) / 2;
  const cetMensal = (1 + cetAnual) ** (1 / 12) - 1;

  return { cetAnual, cetMensal };
}