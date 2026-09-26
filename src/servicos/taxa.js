import * as repositorioFaixas from '../repositorios/faixasJuros.js';
import { ErroDeNegocio } from '../lib/erros.js';

// Score → faixa → taxa, lendo a tabela faixas_juros (fonte única das taxas desde 25/09/2026).
//
// A tabela já guarda a taxa FINAL de cada faixa: min(taxaBase + spread, teto), calculada pela
// equipe de banco no seed (docs/backlog-db.md, P-03). Aqui a API só escolhe a linha certa;
// não soma spread nem aplica teto. Para mudar uma taxa, muda-se o seed, não o código.
//
// modalidade: linha de `modalidades` vinda do repositório (precisa de codigo e tetoTaxaMes).
// score: inteiro 0..1000 (já validado pela validaEntrada).
// repositorio: só os testes passam um "banco falso"; na API é o módulo real.
//
// Tudo aqui fica em PORCENTAGEM (1.85 = 1,85% a.m.). A conversão para decimal
// acontece uma única vez, em simulaOperacao — não divida por 100 aqui.
export async function calculaTaxa(modalidade, score, repositorio = repositorioFaixas) {
  // Uma consulta traz as 5 faixas da modalidade: a do score e a A (que dá a taxa base).
  const faixas = await repositorio.listarFaixas(modalidade.codigo);

  const faixa = faixas.find((f) => score >= f.scoreMin && score <= f.scoreMax);
  if (!faixa) {
    // Score válido sem faixa no banco = seed incompleto. Não é culpa do cliente → vira 500.
    throw new Error(
      `faixas_juros não cobre o score ${score} para ${modalidade.codigo} (rode npm run seed)`,
    );
  }

  // Faixa E: taxa_mes NULL no banco = recusa.
  if (!faixa.permiteContratacao) {
    throw new ErroDeNegocio(422, 'SCORE_INSUFICIENTE', 'Score abaixo do mínimo para contratação');
  }

  // Faixa A tem spread zero, então a taxa dela é a taxa base da modalidade.
  const faixaA = faixas.find((f) => f.faixa === 'A');

  return {
    faixaRisco: faixa.faixa,
    descricaoFaixa: faixa.descricao,
    taxaBaseMes: faixaA ? faixaA.taxaMes : null,
    tetoTaxaMes: modalidade.tetoTaxaMes,
    taxaFinalMes: faixa.taxaMes,
    taxaFinalAno: faixa.taxaAno,
    tetoAplicado: faixa.taxaMes >= modalidade.tetoTaxaMes, // a faixa está "achatada" no teto
  };
}
