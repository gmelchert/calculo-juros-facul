/* ===========================================================================
   App — monta a tela e responde aos cliques.
   ---------------------------------------------------------------------------
   Fluxo, de cima para baixo:
     1. `estado`      o que o painel está mostrando agora (página, filtros, itens)
     2. `tela`        atalhos para os elementos do HTML
     3. carregar...   funções que pedem dados para a Api e guardam no `estado`
     4. desenhar...   funções que pegam o `estado` e escrevem na tela
     5. gaveta        o painel lateral de detalhe
     6. eventos       ligação dos botões/filtros às funções acima
   Regra: quem desenha não busca, quem busca não desenha.
   =========================================================================== */

/* -- 1. ESTADO -------------------------------------------------------------- */

const INTERVALO_MS = 15000; // de quanto em quanto tempo o auto-atualizar roda

const estado = {
  pagina: 1,
  tamanho: 20,
  filtroEstado: '',      // '', 'DEFINIDA' ou 'SIMULADA'
  busca: '',             // filtro de texto, aplicado só nas linhas já carregadas
  resposta: null,        // última resposta de GET /api/operacoes
  modalidades: new Map(),// codigo → nome por extenso
  idsConhecidos: new Set(), // para destacar em verde o que chegou agora
  primeiraCarga: true,
  carregando: false,
  temporizador: null,
};

/* -- 2. TELA ---------------------------------------------------------------- */

const tela = {
  statusApi: document.getElementById('statusApi'),
  autoAtualizar: document.getElementById('autoAtualizar'),
  btnAtualizar: document.getElementById('btnAtualizar'),
  alerta: document.getElementById('alerta'),

  kpiTotal: document.getElementById('kpiTotal'),
  kpiDefinidas: document.getElementById('kpiDefinidas'),
  kpiSimuladas: document.getElementById('kpiSimuladas'),
  kpiValor: document.getElementById('kpiValor'),

  filtroEstado: document.getElementById('filtroEstado'),
  filtroTamanho: document.getElementById('filtroTamanho'),
  filtroBusca: document.getElementById('filtroBusca'),

  corpoTabela: document.getElementById('corpoTabela'),
  resumoPaginacao: document.getElementById('resumoPaginacao'),
  btnAnterior: document.getElementById('btnAnterior'),
  btnProxima: document.getElementById('btnProxima'),
  ultimaAtualizacao: document.getElementById('ultimaAtualizacao'),

  fundoEscuro: document.getElementById('fundoEscuro'),
  gaveta: document.getElementById('gaveta'),
  gavetaTitulo: document.getElementById('gavetaTitulo'),
  gavetaSelos: document.getElementById('gavetaSelos'),
  detalheCorpo: document.getElementById('detalheCorpo'),
  btnFechar: document.getElementById('btnFechar'),
};

const esc = Formata.escapa; // usado o tempo todo; apelido curto

/* -- 3. CARREGAR ------------------------------------------------------------ */

// Carrega tudo o que a tela principal precisa. `silencioso` = atualização
// automática: não troca a tabela por "Carregando…" para não piscar na cara.
async function carrega({ silencioso = false } = {}) {
  if (estado.carregando) return;          // evita duas cargas ao mesmo tempo
  estado.carregando = true;
  tela.btnAtualizar.disabled = true;
  if (!silencioso) marcaStatus('carregando', 'Carregando…');

  try {
    // As quatro chamadas são independentes: vão juntas em vez de uma após a outra.
    const [saude, resposta, definidas, simuladas] = await Promise.all([
      Api.saude().catch(() => null),
      Api.listaOperacoes({
        pagina: estado.pagina, tamanho: estado.tamanho, estado: estado.filtroEstado,
      }),
      Api.contaPorEstado('DEFINIDA'),
      Api.contaPorEstado('SIMULADA'),
    ]);

    estado.resposta = resposta;
    escondeAlerta();
    marcaStatus(
      saude?.status === 'ok' ? 'ok' : 'erro',
      saude ? `API ok · banco ${esc(saude.banco)}` : 'API sem resposta',
    );

    desenhaIndicadores({ definidas, simuladas });
    desenhaTabela();
    desenhaPaginacao();
    tela.ultimaAtualizacao.textContent = `· atualizado às ${Formata.horaAgora()}`;
  } catch (erro) {
    marcaStatus('erro', 'Sem conexão');
    mostraAlerta(erro);
  } finally {
    estado.carregando = false;
    tela.btnAtualizar.disabled = false;
  }
}

// Nomes das modalidades: carregados uma vez só, porque praticamente não mudam.
async function carregaModalidades() {
  try {
    const { itens } = await Api.listaModalidades();
    for (const m of itens) estado.modalidades.set(m.codigo, m.nome);
  } catch {
    // Se falhar, o detalhe mostra só o código da modalidade. Não é motivo
    // para o painel inteiro parar.
  }
}

/* -- 4. DESENHAR ------------------------------------------------------------ */

function marcaStatus(tipo, texto) {
  tela.statusApi.className = `status status--${tipo}`;
  tela.statusApi.textContent = texto;
}

function mostraAlerta(erro) {
  tela.alerta.innerHTML = `
    <div>
      <strong>Não deu para carregar as operações.</strong>
      ${esc(erro.message)}
      <br>Se a API estiver no ar, confira também se o MySQL está ligado.
    </div>`;
  tela.alerta.hidden = false;
}

function escondeAlerta() {
  tela.alerta.hidden = true;
}

function desenhaIndicadores({ definidas, simuladas }) {
  const itens = itensFiltrados();
  const somaPagina = itens.reduce((soma, op) => soma + (Number(op.valor) || 0), 0);

  tela.kpiTotal.textContent = Formata.numero(definidas + simuladas);
  tela.kpiDefinidas.textContent = Formata.numero(definidas);
  tela.kpiSimuladas.textContent = Formata.numero(simuladas);
  tela.kpiValor.textContent = itens.length ? Formata.moedaCurta(somaPagina) : '—';
}

// Aplica o campo "Filtrar nesta página" sobre os itens já baixados.
// É filtro de tela: a API não tem busca por texto, então ele não procura
// em páginas que não estão carregadas — daí o rótulo dizer "nesta página".
function itensFiltrados() {
  const itens = estado.resposta?.itens ?? [];
  const termo = estado.busca.trim().toLowerCase();
  if (!termo) return itens;

  return itens.filter((op) => [
    op.identificador,
    op.cliente?.documento,
    op.modalidade,
    op.estado,
    op.definicao?.sistema,
  ].some((campo) => String(campo ?? '').toLowerCase().includes(termo)));
}

function desenhaTabela() {
  const itens = itensFiltrados();

  if (itens.length === 0) {
    // Três motivos diferentes para a tabela estar vazia — e três recados diferentes,
    // senão a pessoa acha que perdeu dados quando só esqueceu um filtro ligado.
    let vazio;
    if (estado.busca) {
      vazio = `<strong>Nenhuma operação com “${esc(estado.busca)}” nesta página.</strong>
               Limpe o campo de filtro ou veja as outras páginas.`;
    } else if (estado.filtroEstado) {
      vazio = `<strong>Nenhuma operação no estado ${esc(estado.filtroEstado)}.</strong>
               Mude o filtro "Estado" para <em>Todos</em> para ver as demais.`;
    } else {
      vazio = `<strong>Nenhuma operação ainda.</strong>
               Assim que o grupo de decisão mandar um POST /api/operacoes, ela aparece aqui.`;
    }
    tela.corpoTabela.innerHTML = `<tr><td colspan="10" class="vazio">${vazio}</td></tr>`;
    return;
  }

  tela.corpoTabela.innerHTML = itens.map(linhaDaOperacao).join('');

  // Da segunda carga em diante, todo id inédito já foi marcado como novo na
  // linha acima; agora ele passa a ser "conhecido" para não piscar de novo.
  for (const op of itens) estado.idsConhecidos.add(op.id);
  estado.primeiraCarga = false;
}

function linhaDaOperacao(op) {
  // CET do sistema escolhido. Enquanto SIMULADA não há escolha, então
  // mostramos os dois valores para a pessoa comparar.
  const sistema = op.definicao?.sistema;
  const cet = sistema === 'PRICE' ? op.cetPriceAno
    : sistema === 'SAC' ? op.cetSacAno
      : null;

  const celulaCet = cet !== null
    ? `${Formata.percentual(cet)}<span class="sub">${esc(sistema)}</span>`
    : `<span class="fraco">${Formata.percentual(op.cetPriceAno)} / ${Formata.percentual(op.cetSacAno)}</span>
       <span class="sub">PRICE / SAC</span>`;

  const seloSistema = sistema
    ? ` <span class="selo selo--azul">${esc(sistema)}</span>`
    : '';

  const finops = op.finops
    ? `<span class="selo ${Formata.corFinops(op.finops.status)}">${esc(op.finops.status)}</span>`
    : '<span class="fraco">—</span>';

  // Só destaca em verde quando a operação apareceu DEPOIS da primeira carga.
  const nova = !estado.primeiraCarga && !estado.idsConhecidos.has(op.id) ? ' linha--nova' : '';

  return `
    <tr class="${nova}" data-id="${esc(op.id)}" tabindex="0"
        title="Clique para ver o detalhe da operação ${esc(op.identificador)}">
      <td class="mono">${esc(op.identificador)}<span class="sub">#${esc(op.id)}</span></td>
      <td>${esc(Formata.documento(op.cliente?.documento, op.cliente?.tipoPessoa))}
          <span class="sub">${esc(op.cliente?.tipoPessoa ?? '')}</span></td>
      <td>${esc(Formata.modalidade(op.modalidade))}
          <span class="sub">faixa ${esc(Formata.ou(op.faixaRisco))}</span></td>
      <td class="num">${Formata.moeda(op.valor)}</td>
      <td class="num">${esc(op.prazoMeses)}x<span class="sub">score ${esc(op.score)}</span></td>
      <td class="num">${Formata.percentual(op.taxaFinalMes)}</td>
      <td class="num">${celulaCet}</td>
      <td><span class="selo ${Formata.corEstado(op.estado)}">${esc(op.estado)}</span>${seloSistema}</td>
      <td>${finops}</td>
      <td class="fraco">${esc(Formata.dataHora(op.criadoEm))}</td>
    </tr>`;
}

function desenhaPaginacao() {
  const r = estado.resposta;
  if (!r) return;

  const primeiro = r.total === 0 ? 0 : (r.pagina - 1) * r.tamanho + 1;
  const ultimo = Math.min(r.pagina * r.tamanho, r.total);
  const filtro = estado.filtroEstado ? ` (filtro: ${estado.filtroEstado})` : '';

  tela.resumoPaginacao.textContent = r.total === 0
    ? `Nenhuma operação${filtro}`
    : `Mostrando ${primeiro}–${ultimo} de ${Formata.numero(r.total)}${filtro} · página ${r.pagina} de ${r.totalPaginas}`;

  tela.btnAnterior.disabled = r.pagina <= 1;
  tela.btnProxima.disabled = r.pagina >= r.totalPaginas;
}

/* -- 5. GAVETA DE DETALHE --------------------------------------------------- */

async function abreDetalhe(id) {
  tela.fundoEscuro.hidden = false;
  tela.gaveta.hidden = false;
  tela.gavetaTitulo.textContent = `Operação #${id}`;
  tela.gavetaSelos.innerHTML = '';
  tela.detalheCorpo.innerHTML = '<p class="carregando">Carregando detalhe…</p>';
  tela.btnFechar.focus();

  try {
    const op = await Api.detalheOperacao(id);
    desenhaDetalhe(op);
  } catch (erro) {
    tela.detalheCorpo.innerHTML = `<div class="alerta">${esc(erro.message)}</div>`;
  }
}

function fechaDetalhe() {
  tela.gaveta.hidden = true;
  tela.fundoEscuro.hidden = true;
}

function desenhaDetalhe(op) {
  const sistemaEscolhido = op.definicao?.sistema ?? 'PRICE';

  tela.gavetaTitulo.textContent = op.identificador;
  tela.gavetaSelos.innerHTML = `
    <span class="selo ${Formata.corEstado(op.estado)}">${esc(op.estado)}</span>
    ${op.definicao ? `<span class="selo selo--azul">${esc(op.definicao.sistema)}</span>` : ''}
    ${op.finops ? `<span class="selo ${Formata.corFinops(op.finops.status)}">FinOps: ${esc(op.finops.status)}</span>` : ''}
    <span class="selo">#${esc(op.id)}</span>`;

  tela.detalheCorpo.innerHTML = [
    blocoCliente(op),
    blocoCondicoes(op),
    blocoTaxa(op),
    blocoDecisao(op),   // só aparece nas operações criadas a partir da T-14
    blocoFinops(op),
    blocoSimulacao(op, sistemaEscolhido),
  ].filter(Boolean).join('');

  ligaAbasDeSimulacao(op);
}

// Transforma [['Rótulo', 'valor em HTML'], ...] na lista de dados da gaveta.
// Cada par fica dentro de um <div class="dado"> porque é esse <div> que vira
// a célula do grid (ver o comentário em .dados no estilo.css). Pares com valor
// vazio somem em vez de virar uma linha "—" sem utilidade.
function listaDeDados(pares) {
  const itens = pares
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(([rotulo, valor]) => `<div class="dado"><dt>${esc(rotulo)}</dt><dd>${valor}</dd></div>`)
    .join('');
  return `<dl class="dados">${itens}</dl>`;
}

// Monta um bloco branco com título e uma lista de "rótulo / valor".
function bloco(titulo, pares, extra = '') {
  return `
    <section class="bloco">
      <h3 class="bloco__titulo">${esc(titulo)}</h3>
      ${listaDeDados(pares)}
      ${extra}
    </section>`;
}

function blocoCliente(op) {
  return bloco('Cliente', [
    ['Tipo de pessoa', esc(op.cliente?.tipoPessoa === 'PJ' ? 'PJ — pessoa jurídica' : 'PF — pessoa física')],
    [op.cliente?.tipoPessoa === 'PJ' ? 'CNPJ' : 'CPF',
      `<span class="mono">${esc(Formata.documento(op.cliente?.documento, op.cliente?.tipoPessoa))}</span>`],
    ['Criada em', esc(Formata.dataHora(op.criadoEm))],
    ['Definida em', op.definicao ? esc(Formata.dataHora(op.definicao.definidoEm)) : '—'],
  ]);
}

function blocoCondicoes(op) {
  const e = op.entrada ?? {};
  const nome = estado.modalidades.get(e.modalidade);
  return bloco('Condições da operação', [
    ['Modalidade', `${esc(Formata.ou(nome, Formata.modalidade(e.modalidade)))}
                    <span class="sub mono">${esc(e.modalidade)}</span>`],
    ['Valor solicitado', Formata.moeda(e.valor)],
    ['Prazo', `${esc(e.prazoMeses)} meses`],
    ['Data de liberação', esc(Formata.data(e.dataLiberacao))],
    ['Score', Formata.numero(e.score)],
    ['Primeiro relacionamento', e.primeiroRelacionamento ? 'Sim' : 'Não'],
  ]);
}

function blocoTaxa(op) {
  const t = op.taxa ?? {};
  return bloco('Taxa aplicada', [
    ['Faixa de risco', `${esc(t.faixaRisco)}
                        <span class="sub">${esc(Formata.ou(t.descricaoFaixa, ''))}</span>`],
    ['Taxa base (mês)', Formata.percentual(t.taxaBaseMes)],
    ['Teto da modalidade', Formata.percentual(t.tetoTaxaMes)],
    ['Taxa final (mês)', Formata.percentual(t.taxaFinalMes)],
    ['Taxa final (ano)', Formata.percentual(t.taxaFinalAno)],
    ['Teto aplicado', t.tetoAplicado
      ? '<span class="selo selo--ambar">Sim — a taxa foi limitada</span>'
      : 'Não'],
  ]);
}

// Dados que o GRUPO DE DECISÃO mandou junto no POST (T-14). Operações criadas
// antes dessa mudança não têm esses campos — por isso o bloco some.
function blocoDecisao(op) {
  const temAlgo = op.decisao || op.probabilidadeDefault !== null && op.probabilidadeDefault !== undefined
    || op.contextoScore;
  if (!temAlgo) return '';

  const pares = [
    ['Decisão', `<span class="selo ${op.decisao === 'APROVADO' ? 'selo--verde' : 'selo--ambar'}">${esc(op.decisao)}</span>`],
    ['Probabilidade de default', typeof op.probabilidadeDefault === 'number'
      ? Formata.percentual(op.probabilidadeDefault * 100) : null],
  ];

  // `contextoScore` é um objeto livre do outro grupo: mostramos como veio.
  // ATENÇÃO: se houver um `faixaRisco` aqui, ele é a escala DELES (EXCELENTE,
  // BOM...), diferente da nossa faixa A–D do bloco "Taxa aplicada".
  if (op.contextoScore && typeof op.contextoScore === 'object') {
    for (const [chave, valor] of Object.entries(op.contextoScore)) {
      if (valor === null || typeof valor === 'object') continue;
      pares.push([`contextoScore.${chave}`, `<span class="mono">${esc(valor)}</span>`]);
    }
  }

  return bloco('Decisão de crédito (recebida do outro grupo)', pares);
}

function blocoFinops(op) {
  if (!op.finops) return '';
  return bloco('Registro no FinOps', [
    ['Status', `<span class="selo ${Formata.corFinops(op.finops.status)}">${esc(op.finops.status)}</span>`],
    ['Id no FinOps', op.finops.id ? `<span class="mono">${esc(op.finops.id)}</span>` : '—'],
    ['Última tentativa', op.finops.tentativaEm ? esc(Formata.dataHora(op.finops.tentativaEm)) : '—'],
    ['Erro', op.finops.erro ? `<span class="fraco">${esc(op.finops.erro)}</span>` : '—'],
  ]);
}

// As duas simulações vêm sempre gravadas; as abas trocam qual está à mostra.
function blocoSimulacao(op, sistemaEscolhido) {
  const abas = ['PRICE', 'SAC'].map((s) => `
    <button type="button" class="aba" role="tab" data-sistema="${s}"
            aria-selected="${s === sistemaEscolhido}">
      ${s}${op.definicao?.sistema === s ? ' · escolhido' : ''}
    </button>`).join('');

  return `
    <section class="bloco">
      <h3 class="bloco__titulo">Simulação</h3>
      <div class="abas" role="tablist">${abas}</div>
      <div id="conteudoSimulacao">${conteudoSimulacao(op, sistemaEscolhido)}</div>
    </section>`;
}

function conteudoSimulacao(op, sistema) {
  const s = op.simulacoes?.[sistema];
  if (!s) return '<p class="fraco">Simulação não disponível.</p>';

  const pares = [
    sistema === 'PRICE'
      ? ['Parcela fixa', Formata.moeda(s.parcelaFixa)]
      : ['Amortização por parcela', Formata.moeda(s.amortizacaoBase)],
    ['Total de juros', Formata.moeda(s.totalJuros)],
    ['Total pago', Formata.moeda(s.totalPago)],
    ['Valor liberado', `${Formata.moeda(s.valorLiberado)}<span class="sub">já descontados os encargos</span>`],
    ['CET ao mês', Formata.percentual(s.cet?.mensalPercentual)],
    ['CET ao ano', Formata.percentual(s.cet?.anualPercentual)],
    ['IOF diário', Formata.moeda(s.encargos?.iof?.diario)],
    ['IOF adicional', Formata.moeda(s.encargos?.iof?.adicional)],
    ['Tarifa de cadastro', Formata.moeda(s.encargos?.tarifaCadastro)],
    ['Total de encargos', Formata.moeda(s.encargos?.total)],
  ];

  return `${listaDeDados(pares)}
          ${tabelaDemonstrativo(s.demonstrativo)}
          ${tabelaCronograma(s.cronograma)}`;
}

function tabelaDemonstrativo(demonstrativo) {
  if (!demonstrativo?.componentes) return '';
  const linhas = demonstrativo.componentes.map((c) => `
    <tr>
      <td>${esc(c.descricao)}</td>
      <td class="num">${Formata.moeda(c.valor)}</td>
      <td class="num fraco">${Formata.percentual(c.percentualSobreTotalDevido)}</td>
    </tr>`).join('');

  return `
    <details class="cronograma">
      <summary>Composição do total devido (${Formata.moeda(demonstrativo.totalDevido)})</summary>
      <table class="tabela tabela--interna">
        <thead><tr><th>Componente</th><th class="num">Valor</th><th class="num">% do total</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </details>`;
}

function tabelaCronograma(cronograma) {
  if (!Array.isArray(cronograma) || cronograma.length === 0) return '';

  const soma = (campo) => cronograma.reduce((t, p) => t + (Number(p[campo]) || 0), 0);

  const linhas = cronograma.map((p) => `
    <tr>
      <td class="num">${esc(p.numero)}</td>
      <td>${esc(Formata.data(p.vencimento))}</td>
      <td class="num fraco">${esc(p.diasCorridos)}</td>
      <td class="num">${Formata.moeda(p.valor)}</td>
      <td class="num">${Formata.moeda(p.juros)}</td>
      <td class="num">${Formata.moeda(p.amortizacao)}</td>
      <td class="num fraco">${Formata.moeda(p.saldoDevedor)}</td>
    </tr>`).join('');

  return `
    <details class="cronograma">
      <summary>Cronograma de ${cronograma.length} parcelas</summary>
      <table class="tabela tabela--interna">
        <thead>
          <tr>
            <th class="num">Nº</th><th>Vencimento</th><th class="num">Dias</th>
            <th class="num">Parcela</th><th class="num">Juros</th>
            <th class="num">Amortização</th><th class="num">Saldo devedor</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
        <tfoot>
          <tr>
            <th colspan="3">Totais</th>
            <th class="num">${Formata.moeda(soma('valor'))}</th>
            <th class="num">${Formata.moeda(soma('juros'))}</th>
            <th class="num">${Formata.moeda(soma('amortizacao'))}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>
    </details>`;
}

// As abas só trocam o pedaço de baixo; o resto da gaveta continua como está.
function ligaAbasDeSimulacao(op) {
  const abas = tela.detalheCorpo.querySelectorAll('.aba');
  for (const aba of abas) {
    aba.addEventListener('click', () => {
      for (const outra of abas) outra.setAttribute('aria-selected', String(outra === aba));
      document.getElementById('conteudoSimulacao').innerHTML =
        conteudoSimulacao(op, aba.dataset.sistema);
    });
  }
}

/* -- 6. EVENTOS ------------------------------------------------------------- */

tela.btnAtualizar.addEventListener('click', () => carrega());

tela.filtroEstado.addEventListener('change', () => {
  estado.filtroEstado = tela.filtroEstado.value;
  estado.pagina = 1;              // trocar de filtro volta para a primeira página
  carrega();
});

tela.filtroTamanho.addEventListener('change', () => {
  estado.tamanho = Number(tela.filtroTamanho.value);
  estado.pagina = 1;
  carrega();
});

// Busca não chama a API: filtra o que já está na tela, então redesenha na hora.
tela.filtroBusca.addEventListener('input', () => {
  estado.busca = tela.filtroBusca.value;
  desenhaTabela();
});

tela.btnAnterior.addEventListener('click', () => {
  if (estado.pagina > 1) { estado.pagina -= 1; carrega(); }
});

tela.btnProxima.addEventListener('click', () => {
  if (estado.pagina < (estado.resposta?.totalPaginas ?? 1)) { estado.pagina += 1; carrega(); }
});

// Um único ouvinte no <tbody> cobre todas as linhas, inclusive as que ainda
// nem foram desenhadas (delegação de evento). Sem isso seria preciso religar
// o clique a cada atualização.
tela.corpoTabela.addEventListener('click', (evento) => {
  const linha = evento.target.closest('tr[data-id]');
  if (linha) abreDetalhe(linha.dataset.id);
});

tela.corpoTabela.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter' && evento.key !== ' ') return;
  const linha = evento.target.closest('tr[data-id]');
  if (linha) { evento.preventDefault(); abreDetalhe(linha.dataset.id); }
});

tela.btnFechar.addEventListener('click', fechaDetalhe);
tela.fundoEscuro.addEventListener('click', fechaDetalhe);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechaDetalhe(); });

// Auto-atualizar: liga/desliga o relógio conforme a caixinha do topo.
function ajustaTemporizador() {
  clearInterval(estado.temporizador);
  if (tela.autoAtualizar.checked) {
    estado.temporizador = setInterval(() => {
      // Aba em segundo plano não precisa ficar batendo na API.
      if (!document.hidden) carrega({ silencioso: true });
    }, INTERVALO_MS);
  }
}
tela.autoAtualizar.addEventListener('change', ajustaTemporizador);

// Voltou para a aba do painel: atualiza na hora, sem esperar o próximo ciclo.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && tela.autoAtualizar.checked) carrega({ silencioso: true });
});

/* -- PARTIDA ---------------------------------------------------------------- */

carregaModalidades();
carrega();
ajustaTemporizador();
