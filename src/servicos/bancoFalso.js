// "Banco falso" para os testes dos serviços rodarem sem MySQL (npm test não precisa de .env).
//
// As linhas abaixo são as MESMAS do db/seed.sql. Se o seed mudar, atualize aqui — quem garante
// que os dois batem é o teste ponta a ponta contra o banco real (ver docs/backlog-api.md, T-07).
//
// Só os arquivos *.test.js importam este módulo. A API usa os repositórios reais de
// src/repositorios/, que devolvem objetos com exatamente este formato (camelCase).

function modalidade(codigo, nome, tetoTaxaMes, prazoMinMeses, prazoMaxMeses, ativo = true) {
  return {
    codigo,
    nome,
    modalidadeBcb: `${nome} - Prefixado`,
    publico: 'PF',
    regimeIndexacao: 'PREFIXADO',
    tetoTaxaMes,
    taxaReferenciaBcbMes: null,
    prazoMinMeses,
    prazoMaxMeses,
    descricao: null,
    ativo,
  };
}

export const MODALIDADES_SEED = [
  modalidade('CONSIGNADO_INSS', 'Crédito pessoal consignado INSS', 1.85, 6, 84),
  modalidade('CONSIGNADO_PRIVADO', 'Crédito pessoal consignado privado', 4.50, 6, 48),
  modalidade('CONSIGNADO_PUBLICO', 'Crédito pessoal consignado público', 2.50, 6, 96),
  modalidade('CREDITO_PESSOAL', 'Crédito pessoal não consignado', 12.00, 3, 48),
  modalidade('OUTROS_BENS', 'Aquisição de outros bens', 5.00, 3, 36),
  modalidade('VEICULOS', 'Aquisição de veículos', 3.00, 12, 60),
  // Não existe no seed: só para testar a recusa de modalidade inativa.
  modalidade('MODALIDADE_INATIVA', 'Modalidade desativada', 5.00, 3, 12, false),
];

const LIMITES = { A: [800, 1000], B: [600, 799], C: [400, 599], D: [200, 399], E: [0, 199] };
const DESCRICOES = {
  A: 'Risco muito baixo',
  B: 'Risco baixo',
  C: 'Risco médio',
  D: 'Risco alto',
  E: 'Recusado: score abaixo do mínimo',
};

// taxas: { A: [taxaMes, taxaAno], B: [...], C: [...], D: [...] } — E fica sem taxa (recusa).
function faixasDe(modalidadeCodigo, taxas) {
  return ['A', 'B', 'C', 'D', 'E'].map((faixa) => {
    const [taxaMes, taxaAno] = taxas[faixa] ?? [null, null];
    return {
      modalidadeCodigo,
      faixa,
      scoreMin: LIMITES[faixa][0],
      scoreMax: LIMITES[faixa][1],
      taxaMes,
      taxaAno,
      descricao: DESCRICOES[faixa],
      permiteContratacao: taxaMes !== null,
    };
  });
}

export const FAIXAS_SEED = [
  ...faixasDe('CREDITO_PESSOAL', { A: [4.50, 69.59], B: [5.00, 79.59], C: [5.50, 90.12], D: [6.50, 112.91] }),
  ...faixasDe('CONSIGNADO_INSS', { A: [1.60, 20.98], B: [1.85, 24.60], C: [1.85, 24.60], D: [1.85, 24.60] }),
  ...faixasDe('CONSIGNADO_PUBLICO', { A: [1.60, 20.98], B: [2.10, 28.32], C: [2.50, 34.49], D: [2.50, 34.49] }),
  ...faixasDe('CONSIGNADO_PRIVADO', { A: [2.80, 39.29], B: [3.30, 47.64], C: [3.80, 56.45], D: [4.50, 69.59] }),
  ...faixasDe('VEICULOS', { A: [1.50, 19.56], B: [2.00, 26.82], C: [2.50, 34.49], D: [3.00, 42.58] }),
  ...faixasDe('OUTROS_BENS', { A: [2.20, 29.84], B: [2.70, 37.67], C: [3.20, 45.93], D: [4.20, 63.84] }),
  ...faixasDe('MODALIDADE_INATIVA', { A: [5.00, 79.59], B: [5.00, 79.59], C: [5.00, 79.59], D: [5.00, 79.59] }),
];

// Mesmas assinaturas e mesmo comportamento de src/repositorios/modalidades.js
export const repositorioModalidadesFalso = {
  async listarModalidades() {
    return MODALIDADES_SEED.filter((m) => m.ativo);
  },
  async buscarModalidade(codigo) {
    return MODALIDADES_SEED.find((m) => m.codigo === codigo);
  },
};

// Mesmas assinaturas e mesmo comportamento de src/repositorios/faixasJuros.js
export const repositorioFaixasFalso = {
  async listarFaixas(modalidadeCodigo, faixa) {
    if (!modalidadeCodigo) return FAIXAS_SEED;
    return FAIXAS_SEED.filter(
      (f) => f.modalidadeCodigo === modalidadeCodigo && (!faixa || f.faixa === faixa),
    );
  },
  async buscarFaixaPorScore(modalidadeCodigo, score) {
    return FAIXAS_SEED.find(
      (f) => f.modalidadeCodigo === modalidadeCodigo && score >= f.scoreMin && score <= f.scoreMax,
    );
  },
};
