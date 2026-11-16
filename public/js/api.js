/* ===========================================================================
   Api — único lugar do painel que fala com o servidor.
   ---------------------------------------------------------------------------
   Nenhuma outra parte do código chama `fetch` direto. Vantagem: se a URL da
   API mudar, ou se o formato de erro mudar, se arruma só aqui.
   =========================================================================== */

const Api = {

  // De onde vêm os dados.
  //  - painel servido pelo Express (http://localhost:3000/)  → '/api', mesma origem
  //  - arquivo aberto com duplo clique (file:///.../index.html) → localhost:3000
  // O segundo caso funciona porque a API libera CORS para qualquer origem (src/app.js).
  base: location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api',

  // Faz a requisição e devolve o JSON já convertido em objeto.
  // Erro vira SEMPRE um `Error` com mensagem em português pronta para a tela.
  async busca(caminho) {
    let resposta;
    try {
      resposta = await fetch(this.base + caminho, { headers: { Accept: 'application/json' } });
    } catch {
      // Caiu aqui = nem chegou no servidor (API desligada, porta errada, sem rede).
      throw new Error('Não foi possível falar com a API. Ela está no ar? (npm start)');
    }

    // A API responde erro no formato { erro: { codigo, mensagem, detalhes } }.
    // Mas um 404 do próprio Express pode vir em HTML, então o parse fica protegido.
    let corpo = null;
    try { corpo = await resposta.json(); } catch { /* resposta sem JSON */ }

    if (!resposta.ok) {
      const mensagem = corpo?.erro?.mensagem ?? `A API respondeu ${resposta.status}.`;
      const detalhes = corpo?.erro?.detalhes;
      const erro = new Error(
        Array.isArray(detalhes) && detalhes.length > 0
          ? `${mensagem} (${detalhes.join('; ')})`
          : mensagem,
      );
      erro.status = resposta.status;
      erro.codigo = corpo?.erro?.codigo;
      throw erro;
    }

    return corpo;
  },

  // GET /api/health — usado pela bolinha de status do topo.
  saude() {
    return this.busca('/health');
  },

  // GET /api/operacoes?pagina=&tamanho=&estado=
  // Devolve { pagina, tamanho, total, totalPaginas, itens }.
  listaOperacoes({ pagina = 1, tamanho = 20, estado = '' } = {}) {
    const parametros = new URLSearchParams({ pagina, tamanho });
    if (estado) parametros.set('estado', estado);
    return this.busca(`/operacoes?${parametros}`);
  },

  // Só a contagem de um estado: pede 1 item e lê o campo `total`, que a API
  // calcula sobre o banco inteiro (COUNT com o mesmo filtro), não sobre a página.
  async contaPorEstado(estado) {
    const { total } = await this.listaOperacoes({ pagina: 1, tamanho: 1, estado });
    return total;
  },

  // GET /api/operacoes/:id — operação completa (entrada, taxa, as duas simulações).
  detalheOperacao(id) {
    return this.busca(`/operacoes/${encodeURIComponent(id)}`);
  },

  // GET /api/modalidades — usado só para mostrar o nome por extenso no detalhe.
  listaModalidades() {
    return this.busca('/modalidades');
  },
};
