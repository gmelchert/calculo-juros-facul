// Monta o documento CONSOLIDADO de uma operação DEFINIDA (T-11): é o que a equipe de contrato
// consome para gerar o contrato. Só o sistema escolhido, tudo em um objeto autocontido.
//
// Função PURA e sem recálculo (decisão D1/RNF-02): não importa nada de src/lib/ de cálculo.
// Tudo vem da operação como está gravada (`resultado`, que nunca recebe UPDATE) e do nome da
// modalidade. Chamadas repetidas devolvem o mesmo documento.
//
// operacao: saída de buscarPorId / buscarPorIdentificador, com estado 'DEFINIDA'.
// modalidade: linha de `modalidades` (buscarModalidade) — só para nome e modalidadeBcb.
export function montaConsolidado(operacao, modalidade) {
  if (operacao.estado !== 'DEFINIDA' || !operacao.definicao) {
    // A rota já respondeu 422 antes de chegar aqui; se chegou, é bug.
    throw new Error(`montaConsolidado: operação ${operacao.id} não está DEFINIDA`);
  }

  const { sistema, definidoEm } = operacao.definicao;
  const simulacao = operacao.simulacoes[sistema];

  // `resumo` = o que sobra da simulação escolhida tirando o que vira campo próprio:
  // Price → { parcelaFixa, totalJuros, totalPago }; SAC → { amortizacaoBase, totalJuros, totalPago }.
  const {
    sistema: _sistema, encargos, valorLiberado, cet, demonstrativo, cronograma, ...resumo
  } = simulacao;

  const { entrada, taxa, cliente } = operacao;

  return {
    operacao: {
      id: operacao.id,
      identificador: operacao.identificador,
      estado: operacao.estado,
      criadoEm: operacao.criadoEm,
      definidoEm,
    },
    cliente: { tipoPessoa: cliente.tipoPessoa, documento: cliente.documento },
    produto: {
      codigo: entrada.modalidade,
      nome: modalidade.nome,
      modalidadeBcb: modalidade.modalidadeBcb,
    },
    condicoes: {
      valor: entrada.valor,
      prazoMeses: entrada.prazoMeses,
      dataLiberacao: entrada.dataLiberacao,
      primeiroRelacionamento: entrada.primeiroRelacionamento,
    },
    taxa: {
      faixaRisco: taxa.faixaRisco,
      taxaFinalMes: taxa.taxaFinalMes,
      taxaFinalAno: taxa.taxaFinalAno,
      tetoAplicado: taxa.tetoAplicado,
    },
    sistema,
    resumo,
    encargos,
    valorLiberado,
    cet,
    demonstrativo,
    // "calendário" é o nome que a equipe de contrato usa para o cronograma (decisão D9).
    calendario: cronograma.map((parcela) => ({ ...parcela })),
  };
}
