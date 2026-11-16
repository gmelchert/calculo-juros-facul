// Verificação ponta a ponta de TODOS os endpoints contra o MySQL local (npm run verifica).
// Sobe o app numa porta efêmera, roda os cenários do docs/backlog-api.md (T-01, T-07, T-08, a
// rota legada /api/juros), os de docs/design-definicao-cliente-contrato.md §5.7 (T-09 a T-12) e os
// da integração com o FinOps (T-13, docs/integracao-finops.md), e apaga as operações que criou
// (identificador OP-9999-<10 dígitos do timestamp><2 dígitos>, o formato que o FinOps exige).
// Precisa do .env, do MySQL ligado e de npm run schema + npm run seed (ou npm run reset) já executados.
// Com FINOPS_URL apontando para um FinOps no ar, os cenários da T-13 conferem o registro lá também
// (as operações de teste FICAM gravadas no FinOps: ele não tem DELETE). Sem FinOps, conferem o
// comportamento de falha/pendência.
// Sai com código 1 se algum cenário falhar — serve de checagem antes de abrir um PR.
import assert from 'node:assert/strict';

// Caminhos relativos a este arquivo: funciona de qualquer pasta (npm run verifica).
const { default: app } = await import(new URL('../src/app.js', import.meta.url));
const { pool } = await import(new URL('../src/db.js', import.meta.url));
const { configuracaoFinops } = await import(new URL('../src/servicos/finops.js', import.meta.url));

const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
const base = `http://127.0.0.1:${servidor.address().port}/api`;
// OP-9999-<10 dígitos> (18 chars) + 2 dígitos por operação = 20 chars, o máximo do FinOps.
const PREFIXO = `OP-9999-${String(Date.now()).slice(-10)}`;
const ident = (n) => `${PREFIXO}${String(n).padStart(2, '0')}`;
const resultados = [];

// FinOps (T-13): está configurado? está no ar? Os cenários se adaptam.
const finops = configuracaoFinops();
const finopsOnline = finops.habilitado
  && await fetch(`${finops.url}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
console.log(finops.habilitado
  ? `FinOps em ${finops.url}: ${finopsOnline ? 'NO AR — cenários conferem o registro lá' : 'FORA DO AR — cenários conferem a falha'}`
  : 'FinOps: FINOPS_URL vazia — cenários conferem o PENDENTE');

function registra(nome, ok, info = '') {
  resultados.push({ nome, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nome}${info ? '  → ' + info : ''}`);
}

async function chama(metodo, caminho, corpo, bruto = false) {
  const opts = { method: metodo, headers: {} };
  if (corpo !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = bruto ? corpo : JSON.stringify(corpo);
  }
  const resp = await fetch(base + caminho, opts);
  const texto = await resp.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: resp.status, json };
}

async function cenario(nome, fn) {
  try {
    const info = await fn();
    registra(nome, true, info);
  } catch (e) {
    registra(nome, false, e.message.split('\n')[0]);
  }
}

const CLIENTE_PF = { tipoPessoa: 'PF', documento: '529.982.247-25' };
const CLIENTE_PJ = { tipoPessoa: 'PJ', documento: '11.222.333/0001-81' };

// Auditoria que o grupo de decisão manda junto (T-14). Guardada como veio; não entra na conta.
const CONTEXTO_SCORE = {
  scoreFinal: 650,
  faixaRisco: 'BOM', // escala DELES; a nossa é taxa.faixaRisco = 'B'
  probabilidadeDefault: 0.0412,
  modelo: 'SCORE_PF v1.1.0',
  motivo: 'Score 650 atende ao mínimo para aprovação automática.',
};

const corpoA5 = {
  identificador: ident(1),
  cliente: CLIENTE_PF,
  decisao: 'APROVADO',
  valor: 10000,
  modalidade: 'CONSIGNADO_INSS',
  score: 650,
  probabilidadeDefault: 0.0412,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  primeiroRelacionamento: true,
  amortizacao: 'PRICE', // T-14: obrigatória; a operação já nasce DEFINIDA com este sistema
  contextoScore: CONTEXTO_SCORE,
};

const CAMINHOS_ESPERADOS = [
  '/health', '/juros/composto', '/juros/faixas', '/juros/simples',
  '/modalidades', '/modalidades/{codigo}', '/operacoes',
  '/operacoes/por-identificador/{identificador}/consolidado',
  '/operacoes/{id}', '/operacoes/{id}/consolidado', '/operacoes/{id}/definicao', '/operacoes/{id}/finops',
];

let criada;

// ---------- health ----------
await cenario('GET /health com banco', async () => {
  const r = await chama('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.banco, 'ok');
});

// ---------- documentação (Swagger) ----------
await cenario('GET /docs.json → especificação OpenAPI 3 com todos os endpoints da API', async () => {
  const r = await chama('GET', '/docs.json');
  assert.equal(r.status, 200);
  assert.match(r.json.openapi, /^3\./);
  assert.deepEqual(Object.keys(r.json.paths).sort(), CAMINHOS_ESPERADOS);
  // o exemplo da operação é calculado pelo código: tem de bater com o A.5
  const exemplo = r.json.paths['/operacoes'].post.responses['201'].content['application/json'].example;
  assert.equal(exemplo.simulacoes.PRICE.cet.anualPercentual, 30.89);
  assert.equal(exemplo.cliente.documento, '52998224725');
  return `${Object.keys(r.json.paths).length} caminhos, ${Object.keys(r.json.components.schemas).length} schemas`;
});

await cenario('GET /docs/ → página do Swagger UI (e /docs sem barra redireciona ou responde)', async () => {
  const comBarra = await fetch(base + '/docs/');
  const html = await comBarra.text();
  assert.equal(comBarra.status, 200);
  assert.match(html, /swagger-ui/i);
  const semBarra = await fetch(base + '/docs', { redirect: 'manual' });
  assert.ok([200, 301, 302].includes(semBarra.status), `status ${semBarra.status}`);
  return `sem barra: ${semBarra.status}`;
});

// ---------- T-01 (agora do banco) ----------
await cenario('GET /modalidades → 6 ativas da tabela, em ordem de código, formato do repositório', async () => {
  const r = await chama('GET', '/modalidades');
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 6);
  assert.equal(r.json.itens.length, 6);
  assert.deepEqual(r.json.itens.map((m) => m.codigo),
    ['CONSIGNADO_INSS', 'CONSIGNADO_PRIVADO', 'CONSIGNADO_PUBLICO', 'CREDITO_PESSOAL', 'OUTROS_BENS', 'VEICULOS']);
  const inss = r.json.itens[0];
  assert.equal(inss.tetoTaxaMes, 1.85);
  assert.equal(inss.taxaReferenciaBcbMes, 1.83);
  assert.equal(inss.prazoMinMeses, 6);
  assert.equal(inss.prazoMaxMeses, 84);
  assert.equal(inss.ativo, true);
  assert.equal('taxaBaseMes' in inss, false);
  return JSON.stringify(Object.keys(inss));
});

await cenario('GET /modalidades/CONSIGNADO_INSS → modalidade + 5 faixas (A→E) da tabela faixas_juros', async () => {
  const r = await chama('GET', '/modalidades/CONSIGNADO_INSS');
  assert.equal(r.status, 200);
  assert.equal(r.json.codigo, 'CONSIGNADO_INSS');
  assert.equal(r.json.tetoTaxaMes, 1.85);
  assert.equal(r.json.faixas.length, 5);
  assert.deepEqual(r.json.faixas.map((f) => f.faixa), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(r.json.faixas[0], {
    modalidadeCodigo: 'CONSIGNADO_INSS', faixa: 'A', scoreMin: 800, scoreMax: 1000,
    taxaMes: 1.6, taxaAno: 20.98, descricao: 'Risco muito baixo', permiteContratacao: true,
  });
  assert.equal(r.json.faixas[4].taxaMes, null);
  assert.equal(r.json.faixas[4].permiteContratacao, false);
  return `faixas: ${r.json.faixas.map((f) => `${f.faixa}=${f.taxaMes}`).join(' ')}`;
});

await cenario('GET /modalidades/NAO_EXISTE → 404 MODALIDADE_NAO_ENCONTRADA', async () => {
  const r = await chama('GET', '/modalidades/NAO_EXISTE');
  assert.equal(r.status, 404);
  assert.equal(r.json.erro.codigo, 'MODALIDADE_NAO_ENCONTRADA');
});

// ---------- T-07 (+ T-09: cliente, T-14: nasce DEFINIDA) ----------
await cenario('POST feliz (A.5, PF) → 201 já DEFINIDA em PRICE, com valores de referência e cliente só com dígitos', async () => {
  const r = await chama('POST', '/operacoes', corpoA5);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  criada = r.json;
  assert.ok(Number.isInteger(criada.id) && criada.id >= 1);
  assert.equal(criada.identificador, corpoA5.identificador);
  assert.match(String(criada.criadoEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // T-14: a amortizacao do grupo de decisão já define a operação no próprio POST.
  assert.equal(criada.estado, 'DEFINIDA');
  assert.equal(criada.definicao.sistema, 'PRICE');
  assert.match(String(criada.definicao.definidoEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // O registro no FinOps nasce PENDENTE: o envio é feito depois de gravar e não muda o 201.
  assert.deepEqual(criada.finops, { status: 'PENDENTE', id: null, erro: null, tentativaEm: null });
  // T-14: auditoria do grupo de decisão volta como veio
  assert.equal(criada.decisao, 'APROVADO');
  assert.equal(criada.probabilidadeDefault, 0.0412);
  assert.deepEqual(criada.contextoScore, CONTEXTO_SCORE);
  assert.deepEqual(criada.cliente, { tipoPessoa: 'PF', documento: '52998224725' });
  assert.deepEqual(criada.entrada, {
    valor: 10000, modalidade: 'CONSIGNADO_INSS', score: 650, prazoMeses: 12,
    dataLiberacao: '2026-10-30', primeiroRelacionamento: true,
  });
  assert.deepEqual(criada.taxa, {
    faixaRisco: 'B', descricaoFaixa: 'Risco baixo', taxaBaseMes: 1.6, tetoTaxaMes: 1.85,
    taxaFinalMes: 1.85, taxaFinalAno: 24.6, tetoAplicado: true,
  });
  assert.equal(criada.simulacoes.PRICE.parcelaFixa, 936.91);
  assert.equal(criada.simulacoes.PRICE.encargos.iof.adicional, 38);
  assert.equal(criada.simulacoes.PRICE.encargos.total, 255.65);
  assert.equal(criada.simulacoes.PRICE.valorLiberado, 9744.35);
  assert.equal(criada.simulacoes.PRICE.cet.anualPercentual, 30.89);
  assert.equal(criada.simulacoes.SAC.totalJuros, 1202.50);
  assert.equal(criada.simulacoes.SAC.cet.anualPercentual, 30.96);
  assert.equal(criada.simulacoes.PRICE.cronograma.length, 12);
  assert.equal(criada.simulacoes.PRICE.cronograma[0].vencimento, '2026-11-30');
  assert.equal('parcelas' in criada.simulacoes.PRICE, false);
  return `id=${criada.id} taxa=${JSON.stringify(criada.taxa)}`;
});

await cenario('linha gravada no banco com colunas planas corretas (inclusive cliente e estado)', async () => {
  const [[l]] = await pool.query(
    `SELECT tipo_pessoa, documento, modalidade_codigo, valor, score, prazo_meses, data_liberacao,
            primeiro_relacionamento, faixa_risco, taxa_final_mes, cet_price_ano, cet_sac_ano,
            estado, sistema_definido, definido_em, finops_status, finops_id
       FROM operacoes WHERE identificador = ?`,
    [corpoA5.identificador],
  );
  assert.ok(l, 'linha não encontrada');
  assert.equal(l.finops_status, 'PENDENTE'); // T-14: DEFINIDA desde o INSERT → CHECK exige status
  assert.equal(l.finops_id, null);
  assert.equal(l.tipo_pessoa, 'PF');
  assert.equal(l.documento, '52998224725');
  assert.equal(l.modalidade_codigo, 'CONSIGNADO_INSS');
  assert.equal(l.valor, 10000);
  assert.equal(l.faixa_risco, 'B');
  assert.equal(l.taxa_final_mes, 1.85);
  assert.equal(l.cet_price_ano, 30.89);
  assert.equal(l.cet_sac_ano, 30.96);
  assert.equal(l.estado, 'DEFINIDA');
  assert.equal(l.sistema_definido, 'PRICE');
  assert.ok(l.definido_em, 'definido_em deveria estar preenchido no próprio INSERT');
});

await cenario('resultado gravado guarda a auditoria da decisão no JSON (T-14)', async () => {
  const [[l]] = await pool.query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(resultado, '$.decisao')) decisao,
            JSON_EXTRACT(resultado, '$.probabilidadeDefault') prob,
            JSON_UNQUOTE(JSON_EXTRACT(resultado, '$.contextoScore.modelo')) modelo
       FROM operacoes WHERE identificador = ?`,
    [corpoA5.identificador],
  );
  assert.equal(l.decisao, 'APROVADO');
  assert.equal(Number(l.prob), 0.0412);
  assert.equal(l.modelo, 'SCORE_PF v1.1.0');
});

await cenario('POST repetido → 409 IDENTIFICADOR_DUPLICADO', async () => {
  const r = await chama('POST', '/operacoes', corpoA5);
  assert.equal(r.status, 409);
  assert.equal(r.json.erro.codigo, 'IDENTIFICADOR_DUPLICADO');
});

await cenario('POST {} → 400 DADOS_INVALIDOS com 7 detalhes (identificador, cliente, valor, modalidade, score, prazoMeses, amortizacao)', async () => {
  const r = await chama('POST', '/operacoes', {});
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.codigo, 'DADOS_INVALIDOS');
  assert.equal(r.json.erro.detalhes.length, 7, JSON.stringify(r.json.erro.detalhes));
  assert.match(r.json.erro.detalhes[1], /cliente é obrigatório/);
  assert.match(r.json.erro.detalhes.join(' | '), /amortizacao é obrigatória/);
});

await cenario('POST sem corpo/JSON → 400 com 7 detalhes', async () => {
  const resp = await fetch(base + '/operacoes', { method: 'POST' });
  const json = await resp.json();
  assert.equal(resp.status, 400);
  assert.equal(json.erro.detalhes.length, 7);
});

// ---------- T-14: amortizacao e decisão do grupo de decisão ----------
await cenario('POST sem amortizacao → 400 com UMA mensagem; valor fora de PRICE/SAC também', async () => {
  const { amortizacao, ...semAmortizacao } = corpoA5;
  const a = await chama('POST', '/operacoes', { ...semAmortizacao, identificador: ident(30) });
  assert.equal(a.status, 400, JSON.stringify(a.json));
  assert.deepEqual(a.json.erro.detalhes, ['amortizacao é obrigatória e deve ser PRICE ou SAC']);

  for (const invalida of ['LINEAR', '', 123, null]) {
    const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(30), amortizacao: invalida });
    assert.equal(r.status, 400, `amortizacao ${JSON.stringify(invalida)}: ${JSON.stringify(r.json)}`);
    assert.deepEqual(r.json.erro.detalhes, ['amortizacao é obrigatória e deve ser PRICE ou SAC']);
  }
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [ident(30)]);
  assert.equal(linhas.length, 0, 'operação sem amortizacao válida foi gravada!');
});

await cenario('POST amortizacao " sac " → 201 normalizado para SAC (espaços e minúsculas toleradas)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(31), amortizacao: ' sac ' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.estado, 'DEFINIDA');
  assert.equal(r.json.definicao.sistema, 'SAC');
  // o consolidado passa a usar o SAC, sem nenhum passo extra
  const c = await chama('GET', `/operacoes/${r.json.id}/consolidado`);
  assert.equal(c.status, 200, JSON.stringify(c.json));
  assert.equal(c.json.sistema, 'SAC');
});

await cenario('POST decisao != APROVADO → 422 DECISAO_NAO_APROVADA e NADA gravado', async () => {
  for (const decisao of ['REPROVADO', 'NEGADO', 'EM_ANALISE']) {
    const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(32), decisao });
    assert.equal(r.status, 422, `decisao ${decisao}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.erro.codigo, 'DECISAO_NAO_APROVADA');
    assert.match(r.json.erro.mensagem, new RegExp(decisao));
  }
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [ident(32)]);
  assert.equal(linhas.length, 0, 'operação não aprovada foi gravada!');
});

await cenario('POST sem os campos de auditoria → 201 com decisao/probabilidadeDefault/contextoScore null', async () => {
  const { decisao, probabilidadeDefault, contextoScore, ...semAuditoria } = corpoA5;
  const r = await chama('POST', '/operacoes', { ...semAuditoria, identificador: ident(33) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.decisao, null);
  assert.equal(r.json.probabilidadeDefault, null);
  assert.equal(r.json.contextoScore, null);
  assert.equal(r.json.estado, 'DEFINIDA'); // amortizacao continua sendo o que define
});

await cenario('POST com auditoria malformada → 400 (probabilidadeDefault fora de 0..1, contextoScore não objeto)', async () => {
  const a = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(34), probabilidadeDefault: 12.8 });
  assert.equal(a.status, 400, JSON.stringify(a.json));
  assert.deepEqual(a.json.erro.detalhes, ['probabilidadeDefault deve ser um número entre 0 e 1']);
  const b = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(34), contextoScore: 'EXCELENTE' });
  assert.equal(b.status, 400, JSON.stringify(b.json));
  assert.deepEqual(b.json.erro.detalhes, ['contextoScore deve ser um objeto']);
});

await cenario('POST payload do grupo de decisão (CREDITO_PESSOAL, score 872, SAC, 24x) → 201 DEFINIDA em SAC', async () => {
  const r = await chama('POST', '/operacoes', {
    identificador: ident(35),
    cliente: CLIENTE_PF,
    decisao: 'APROVADO',
    valor: 10000,
    modalidade: 'CREDITO_PESSOAL',
    score: 872,
    probabilidadeDefault: 0.0128,
    prazoMeses: 24,
    dataLiberacao: '2026-11-14',
    primeiroRelacionamento: false,
    amortizacao: 'SAC',
    contextoScore: {
      scoreFinal: 872, faixaRisco: 'EXCELENTE', probabilidadeDefault: 0.0128,
      modelo: 'SCORE_PF v1.1.0', motivo: 'Score 872 atende ao mínimo para aprovação automática.',
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.estado, 'DEFINIDA');
  assert.equal(r.json.definicao.sistema, 'SAC');
  assert.equal(r.json.taxa.faixaRisco, 'A'); // score 872 → faixa A (a nossa escala)
  assert.equal(r.json.contextoScore.faixaRisco, 'EXCELENTE'); // a escala deles, preservada
  assert.equal(r.json.simulacoes.SAC.cronograma.length, 24);
  assert.equal(r.json.entrada.primeiroRelacionamento, false);
  return `faixa nossa=${r.json.taxa.faixaRisco} / deles=${r.json.contextoScore.faixaRisco}`;
});

await cenario('POST JSON malformado → 400 DADOS_INVALIDOS (não 500)', async () => {
  const r = await chama('POST', '/operacoes', '{"valor": 10000,}', true);
  assert.equal(r.status, 400, JSON.stringify(r.json));
  assert.equal(r.json.erro.codigo, 'DADOS_INVALIDOS');
});

await cenario('POST identificador fora do formato OP-AAAA-NNNN (ou com mais de 20 chars) → 400 (T-13: o FinOps o recusaria)', async () => {
  for (const identificador of ['OP-E2E-1', 'op-2026-0001', 'OP 2026 0001', `${PREFIXO}-A B/C`, `${PREFIXO}999` /* 21 chars */]) {
    const r = await chama('POST', '/operacoes', { ...corpoA5, identificador });
    assert.equal(r.status, 400, `${identificador}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.erro.detalhes.length, 1);
    assert.match(r.json.erro.detalhes[0], /OP-AAAA-NNNN/);
  }
});

await cenario('POST valor com fração de centavo (10000.001) → 400 (T-13: o FinOps recusa 3 casas)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(2), valor: 10000.001 });
  assert.equal(r.status, 400, JSON.stringify(r.json));
  assert.deepEqual(r.json.erro.detalhes, ['valor deve ter no máximo 2 casas decimais']);
  const ok = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(2), valor: 10000.5 });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.entrada.valor, 10000.5);
});

await cenario('POST modalidade inexistente no banco → 400 citando "não existe"', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(3), modalidade: 'CHEQUE_ESPECIAL' });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /CHEQUE_ESPECIAL.*não existe/);
  return r.json.erro.detalhes[0];
});

await cenario('POST INSS prazo 3 → 400 citando "entre 6 e 84" (limites lidos da tabela modalidades)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(3), prazoMeses: 3 });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /entre 6 e 84/);
  return r.json.erro.detalhes[0];
});

await cenario('POST score 150 → 422 SCORE_INSUFICIENTE (faixa E, taxa_mes NULL) e NADA gravado', async () => {
  const identificador = ident(4);
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador, score: 150 });
  assert.equal(r.status, 422);
  assert.equal(r.json.erro.codigo, 'SCORE_INSUFICIENTE');
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [identificador]);
  assert.equal(linhas.length, 0, 'operação recusada foi gravada!');
});

await cenario('POST sem dataLiberacao → 201 com data de hoje', async () => {
  const { dataLiberacao, ...semData } = corpoA5;
  const r = await chama('POST', '/operacoes', { ...semData, identificador: ident(5), primeiroRelacionamento: false });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  assert.equal(r.json.entrada.dataLiberacao, hoje);
  assert.equal(r.json.simulacoes.PRICE.encargos.tarifaCadastro, 0);
  return `dataLiberacao=${r.json.entrada.dataLiberacao}`;
});

await cenario('POST CREDITO_PESSOAL score 720 → taxa 5,00 (faixa B da tabela), sem teto', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(6), modalidade: 'CREDITO_PESSOAL', score: 720 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.taxa.taxaFinalMes, 5);
  assert.equal(r.json.taxa.taxaBaseMes, 4.5);
  assert.equal(r.json.taxa.taxaFinalAno, 79.59);
  assert.equal(r.json.taxa.tetoAplicado, false);
  assert.equal(r.json.simulacoes.PRICE.cronograma[0].juros, 500);
});

await cenario('POST CONSIGNADO_PUBLICO score 450 → 2,50 (faixa C achatada no teto)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(7), modalidade: 'CONSIGNADO_PUBLICO', score: 450 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.taxa.faixaRisco, 'C');
  assert.equal(r.json.taxa.taxaFinalMes, 2.5);
  assert.equal(r.json.taxa.tetoAplicado, true);
});

// ---------- T-08 ----------
let total;
await cenario('GET /operacoes → 200 paginado, mais recente primeiro, só resumo (com estado, definicao e cliente)', async () => {
  const r = await chama('GET', '/operacoes');
  assert.equal(r.status, 200);
  assert.equal(r.json.pagina, 1);
  assert.equal(r.json.tamanho, 10);
  total = r.json.total;
  assert.ok(total >= 4, `total=${total}`);
  assert.equal(r.json.totalPaginas, Math.ceil(total / 10));
  assert.equal(r.json.itens.length, Math.min(total, 10));
  const primeiro = r.json.itens[0];
  assert.equal(primeiro.identificador, ident(7));
  assert.equal('simulacoes' in primeiro, false);
  assert.deepEqual(Object.keys(primeiro).sort(), [
    'cetPriceAno', 'cetSacAno', 'cliente', 'criadoEm', 'dataLiberacao', 'definicao', 'estado', 'faixaRisco',
    'finops', 'id', 'identificador', 'modalidade', 'prazoMeses', 'score', 'taxaFinalMes', 'valor',
  ]);
  // T-14: toda operação nova já aparece DEFINIDA na listagem, com o FinOps PENDENTE.
  assert.equal(primeiro.estado, 'DEFINIDA');
  assert.equal(primeiro.definicao.sistema, 'PRICE');
  assert.equal(primeiro.finops.status, 'PENDENTE');
  assert.deepEqual(primeiro.cliente, { tipoPessoa: 'PF', documento: '52998224725' });
  return `total=${total}`;
});

await cenario('GET ?pagina=1&tamanho=1 e ?pagina=2&tamanho=1 não repetem item', async () => {
  const p1 = await chama('GET', '/operacoes?pagina=1&tamanho=1');
  const p2 = await chama('GET', '/operacoes?pagina=2&tamanho=1');
  assert.notEqual(p1.json.itens[0].id, p2.json.itens[0].id);
  assert.ok(p1.json.itens[0].id > p2.json.itens[0].id, 'ordem DESC');
});

await cenario('GET ?pagina=999 → 200 com itens []', async () => {
  const r = await chama('GET', '/operacoes?pagina=999');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.itens, []);
});

for (const q of ['pagina=0', 'tamanho=500', 'pagina=abc']) {
  await cenario(`GET ?${q} → 400 DADOS_INVALIDOS`, async () => {
    const r = await chama('GET', `/operacoes?${q}`);
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.equal(r.json.erro.codigo, 'DADOS_INVALIDOS');
  });
}

await cenario('GET /operacoes/:id → 200 idêntico à resposta do POST', async () => {
  const r = await chama('GET', `/operacoes/${criada.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, criada);
});

await cenario('GET /operacoes/999999 → 404; /abc → 400', async () => {
  assert.equal((await chama('GET', '/operacoes/999999')).status, 404);
  assert.equal((await chama('GET', '/operacoes/abc')).status, 400);
});

// ---------- T-09: cliente (CPF/CNPJ) ----------
await cenario('POST sem cliente → 400 com UMA mensagem do objeto cliente', async () => {
  const { cliente, ...semCliente } = corpoA5;
  const r = await chama('POST', '/operacoes', { ...semCliente, identificador: ident(8) });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /cliente é obrigatório/);
});

await cenario('POST cliente {} → 400 com 2 mensagens (tipoPessoa e documento)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(9), cliente: {} });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.erro.detalhes, [
    'cliente.tipoPessoa deve ser PF ou PJ',
    'cliente.documento deve ser um CPF ou CNPJ válido',
  ]);
});

await cenario('POST CPF com DV errado → 400 e NADA gravado', async () => {
  const identificador = ident(10);
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador, cliente: { tipoPessoa: 'PF', documento: '529.982.247-26' } });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.erro.detalhes, ['cliente.documento deve ser um CPF válido (11 dígitos)']);
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [identificador]);
  assert.equal(linhas.length, 0, 'operação inválida foi gravada!');
});

await cenario('POST PF com CNPJ e PJ com CPF → 400 (tamanho incompatível com o tipo)', async () => {
  const a = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(11), cliente: { tipoPessoa: 'PF', documento: '11222333000181' } });
  const b = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident(12), cliente: { tipoPessoa: 'PJ', documento: '52998224725' } });
  assert.equal(a.status, 400);
  assert.match(a.json.erro.detalhes[0], /CPF válido \(11 dígitos\)/);
  assert.equal(b.status, 400);
  assert.match(b.json.erro.detalhes[0], /CNPJ válido \(14 dígitos\)/);
});

let pj;
await cenario('POST PJ (CNPJ 11.222.333/0001-81, A.5) → 201: IOF adicional 95,00; CET 32,38 (Price) / 32,49 (SAC); parcelas iguais', async () => {
  // T-14: a PJ já nasce definida em SAC — é a operação usada nos cenários de consolidado SAC.
  const r = await chama('POST', '/operacoes', {
    ...corpoA5, identificador: ident(13), cliente: CLIENTE_PJ, amortizacao: 'SAC',
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  pj = r.json;
  assert.deepEqual(pj.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  assert.equal(pj.estado, 'DEFINIDA');
  assert.equal(pj.definicao.sistema, 'SAC');
  assert.deepEqual(pj.simulacoes.PRICE.encargos, { iof: { diario: 167.65, adicional: 95, total: 262.65 }, tarifaCadastro: 50, total: 312.65 });
  assert.equal(pj.simulacoes.PRICE.valorLiberado, 9687.35);
  assert.equal(pj.simulacoes.PRICE.cet.anualPercentual, 32.38);
  assert.equal(pj.simulacoes.PRICE.demonstrativo.totalDevido, 11555.53);
  assert.equal(pj.simulacoes.SAC.encargos.total, 307.22);
  assert.equal(pj.simulacoes.SAC.valorLiberado, 9692.78);
  assert.equal(pj.simulacoes.SAC.cet.anualPercentual, 32.49);
  assert.deepEqual(pj.simulacoes.PRICE.cronograma, criada.simulacoes.PRICE.cronograma);
  assert.deepEqual(pj.simulacoes.SAC.cronograma, criada.simulacoes.SAC.cronograma);
  const [[l]] = await pool.query('SELECT tipo_pessoa, documento, cet_price_ano FROM operacoes WHERE id = ?', [pj.id]);
  assert.equal(l.tipo_pessoa, 'PJ');
  assert.equal(l.documento, '11222333000181');
  assert.equal(l.cet_price_ano, 32.38);
  return `id=${pj.id}`;
});

// ---------- T-10: definição (rota LEGADO desde a T-14) ----------
// Desde a T-14 o POST /operacoes não cria mais nenhuma operação SIMULADA, então os cenários da
// rota de definição precisam de uma linha no formato ANTIGO. Inserimos direto no banco, copiando
// a operação A.5 e zerando as colunas de definição — é exatamente o que ficou gravado antes da
// T-14. Assim a rota continua coberta para as operações que a equipe ainda tem para definir.
async function criaSimuladaLegado(identificador) {
  const [r] = await pool.query(
    `INSERT INTO operacoes (identificador, tipo_pessoa, documento, modalidade_codigo, valor, score,
         prazo_meses, data_liberacao, primeiro_relacionamento, faixa_risco, taxa_final_mes,
         cet_price_ano, cet_sac_ano, resultado, estado)
       SELECT ?, tipo_pessoa, documento, modalidade_codigo, valor, score, prazo_meses, data_liberacao,
              primeiro_relacionamento, faixa_risco, taxa_final_mes, cet_price_ano, cet_sac_ano,
              resultado, 'SIMULADA'
         FROM operacoes WHERE id = ?`,
    [identificador, criada.id],
  );
  return r.insertId;
}

// Uma para percorrer o fluxo de definição; outra que PERMANECE SIMULADA, para os cenários que
// precisam de uma operação sem definição (consolidado 422, reenvio ao FinOps 422).
const IDENT_SIMULADA = ident(20);
const IDENT_SIMULADA_INTACTA = ident(21);
let idSimuladaLegado;
let idSimuladaIntacta;
await cenario('apoio: cria no banco duas operações SIMULADA no formato anterior à T-14', async () => {
  idSimuladaLegado = await criaSimuladaLegado(IDENT_SIMULADA);
  idSimuladaIntacta = await criaSimuladaLegado(IDENT_SIMULADA_INTACTA);
  for (const id of [idSimuladaLegado, idSimuladaIntacta]) {
    const g = await chama('GET', `/operacoes/${id}`);
    assert.equal(g.status, 200, JSON.stringify(g.json));
    assert.equal(g.json.estado, 'SIMULADA');
    assert.equal(g.json.definicao, null);
    assert.equal(g.json.finops, null); // só DEFINIDA tem registro no FinOps
  }
  return `ids=${idSimuladaLegado},${idSimuladaIntacta}`;
});

await cenario('GET /:id/consolidado de operação SIMULADA → 422 OPERACAO_NAO_DEFINIDA (não 404)', async () => {
  const r = await chama('GET', `/operacoes/${idSimuladaLegado}/consolidado`);
  assert.equal(r.status, 422, JSON.stringify(r.json));
  assert.equal(r.json.erro.codigo, 'OPERACAO_NAO_DEFINIDA');
  assert.match(r.json.erro.mensagem, new RegExp(`Operação ${idSimuladaLegado} ainda não tem`));
});

await cenario('POST /:id/definicao {sistema: "price"} / sem corpo → 400 e continua SIMULADA', async () => {
  const a = await chama('POST', `/operacoes/${idSimuladaLegado}/definicao`, { sistema: 'price' });
  assert.equal(a.status, 400, JSON.stringify(a.json));
  assert.deepEqual(a.json.erro.detalhes, ['sistema deve ser PRICE ou SAC']);
  const b = await fetch(`${base}/operacoes/${idSimuladaLegado}/definicao`, { method: 'POST' });
  assert.equal(b.status, 400);
  const depois = await chama('GET', `/operacoes/${idSimuladaLegado}`);
  assert.equal(depois.json.estado, 'SIMULADA');
});

await cenario('POST /:id/definicao numa operação criada já DEFINIDA (T-14) → 409 AMORTIZACAO_JA_DEFINIDA', async () => {
  const r = await chama('POST', `/operacoes/${criada.id}/definicao`, { sistema: 'SAC' });
  assert.equal(r.status, 409, JSON.stringify(r.json));
  assert.equal(r.json.erro.codigo, 'AMORTIZACAO_JA_DEFINIDA');
  assert.match(r.json.erro.mensagem, /já está definida como PRICE/);
});

await cenario('POST /99999999/definicao → 404; /abc/definicao → 400', async () => {
  const a = await chama('POST', '/operacoes/99999999/definicao', { sistema: 'PRICE' });
  assert.equal(a.status, 404);
  assert.equal(a.json.erro.codigo, 'OPERACAO_NAO_ENCONTRADA');
  const b = await chama('POST', '/operacoes/abc/definicao', { sistema: 'PRICE' });
  assert.equal(b.status, 400);
});

// T-13: o que se espera de `finops` logo depois de uma definição, conforme o ambiente.
const statusFinopsEsperado = !finops.habilitado ? 'PENDENTE' : finopsOnline ? 'REGISTRADA' : 'FALHOU';
function confereFinopsAposDefinicao(f) {
  assert.ok(f, 'finops ausente na operação DEFINIDA');
  assert.equal(f.status, statusFinopsEsperado, JSON.stringify(f));
  if (statusFinopsEsperado === 'REGISTRADA') {
    assert.ok(Number.isInteger(f.id) && f.id >= 1, `finops.id=${f.id}`);
    assert.equal(f.erro, null);
    assert.match(String(f.tentativaEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  } else if (statusFinopsEsperado === 'FALHOU') {
    assert.equal(f.id, null);
    assert.match(f.erro, /sem resposta do FinOps/);
  } else {
    assert.deepEqual(f, { status: 'PENDENTE', id: null, erro: null, tentativaEm: null });
  }
}

let definida;
await cenario(`POST /:id/definicao {sistema: "PRICE"} numa SIMULADA legado → 200 DEFINIDA com definicao, cronograma intacto e finops ${statusFinopsEsperado}`, async () => {
  const r = await chama('POST', `/operacoes/${idSimuladaLegado}/definicao`, { sistema: 'PRICE' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  definida = r.json;
  assert.equal(definida.id, idSimuladaLegado);
  assert.equal(definida.estado, 'DEFINIDA');
  assert.equal(definida.definicao.sistema, 'PRICE');
  assert.match(String(definida.definicao.definidoEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.deepEqual(definida.cliente, criada.cliente);
  assert.deepEqual(definida.simulacoes, criada.simulacoes); // resultado não muda
  confereFinopsAposDefinicao(definida.finops);
  const [[l]] = await pool.query('SELECT estado, sistema_definido, definido_em, finops_status, finops_id FROM operacoes WHERE id = ?', [idSimuladaLegado]);
  assert.equal(l.estado, 'DEFINIDA');
  assert.equal(l.sistema_definido, 'PRICE');
  assert.ok(l.definido_em);
  assert.equal(l.finops_status, definida.finops.status);
  assert.equal(l.finops_id, definida.finops.id);
  return `definidoEm=${definida.definicao.definidoEm} finops=${JSON.stringify(definida.finops)}`;
});

await cenario('definidoEm está em GMT-03:00 (DB_TIMEZONE), o fuso que o FinOps assume para data/hora sem fuso', async () => {
  const [[{ tz }]] = await pool.query('SELECT @@session.time_zone AS tz');
  assert.equal(tz, process.env.DB_TIMEZONE?.trim() || '-03:00');
  if (tz !== '-03:00') return `DB_TIMEZONE=${tz}: conferência de horário pulada`;
  // lida como -03:00, a hora da definição tem de ser "agora" (tolerância de 2 min)
  const momento = new Date(`${definida.definicao.definidoEm.replace(' ', 'T')}-03:00`);
  const desvioMs = Math.abs(Date.now() - momento.getTime());
  assert.ok(desvioMs < 2 * 60 * 1000, `definidoEm=${definida.definicao.definidoEm} desvia ${Math.round(desvioMs / 1000)}s de agora`);
  return `desvio ${Math.round(desvioMs / 1000)}s`;
});

await cenario('POST /:id/definicao de novo (SAC e PRICE) → 409 AMORTIZACAO_JA_DEFINIDA citando PRICE', async () => {
  for (const sistema of ['SAC', 'PRICE']) {
    const r = await chama('POST', `/operacoes/${idSimuladaLegado}/definicao`, { sistema });
    assert.equal(r.status, 409, JSON.stringify(r.json));
    assert.equal(r.json.erro.codigo, 'AMORTIZACAO_JA_DEFINIDA');
    assert.match(r.json.erro.mensagem, /já está definida como PRICE/);
  }
  const depois = await chama('GET', `/operacoes/${idSimuladaLegado}`);
  assert.equal(depois.json.definicao.sistema, 'PRICE');
});

// Antes da T-14 a corrida que importava era entre duas definições da MESMA operação. Agora a
// definição vem no POST, então a corrida que vale é entre dois POSTs com o mesmo identificador:
// a UNIQUE KEY do banco decide, e a perdedora recebe o mesmo 409 (não um 500).
await cenario('dois POSTs em paralelo com o mesmo identificador → exatamente um 201 e um 409', async () => {
  const corpo = { ...corpoA5, identificador: ident(22), cliente: CLIENTE_PJ, amortizacao: 'SAC' };
  const [a, b] = await Promise.all([
    chama('POST', '/operacoes', corpo),
    chama('POST', '/operacoes', corpo),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409], JSON.stringify([a.json, b.json]));
  const perdedora = [a, b].find((r) => r.status === 409);
  assert.equal(perdedora.json.erro.codigo, 'IDENTIFICADOR_DUPLICADO');
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [corpo.identificador]);
  assert.equal(linhas.length, 1, 'a corrida gravou duas linhas!');
  const vencedora = [a, b].find((r) => r.status === 201);
  assert.equal(vencedora.json.definicao.sistema, 'SAC');
});

// ---------- T-13: registro no FinOps ----------
await cenario('POST /:id/finops em operação SIMULADA → 422; inexistente → 404; id inválido → 400', async () => {
  const a = await chama('POST', `/operacoes/${idSimuladaIntacta}/finops`);
  assert.equal(a.status, 422, JSON.stringify(a.json));
  assert.equal(a.json.erro.codigo, 'OPERACAO_NAO_DEFINIDA');
  assert.equal((await chama('POST', '/operacoes/99999999/finops')).status, 404);
  assert.equal((await chama('POST', '/operacoes/abc/finops')).status, 400);
});

if (finopsOnline) {
  await cenario('FinOps tem a operação PF (PRICE) com os mesmos números: GET {FINOPS_URL}/operacoes/{identificador}', async () => {
    const r = await fetch(`${finops.url}/operacoes/${criada.identificador}`);
    assert.equal(r.status, 200);
    const op = await r.json();
    assert.equal(op.id, definida.finops.id);
    assert.equal(op.numeroOperacao, criada.identificador);
    assert.equal(op.clienteId, '52998224725');
    assert.equal(op.tipoPessoa, 'PF');
    assert.equal(op.status, 'ATIVA');
    assert.equal(op.dataLiberacao, '2026-10-30');
    assert.equal(op.saldoDevedor, 10000);
    assert.deepEqual(op.produto, { codigo: 'CONSIGNADO_INSS', nome: 'Crédito pessoal consignado INSS', modalidadeBcb: 'Crédito pessoal consignado INSS - Prefixado' });
    // lá as taxas ficam em fração: 1.85% → 0.0185; CET 30.89% → 0.3089
    assert.equal(op.condicoesFinanceiras.valorAprovado, 10000);
    assert.equal(op.condicoesFinanceiras.prazoMeses, 12);
    assert.equal(op.condicoesFinanceiras.quantidadeParcelas, 12);
    assert.equal(op.condicoesFinanceiras.taxaJuros, 0.0185);
    assert.equal(op.condicoesFinanceiras.taxaJurosAnual, 0.246);
    assert.equal(op.condicoesFinanceiras.faixaRisco, 'B');
    assert.equal(op.condicoesFinanceiras.sistemaAmortizacao, 'PRICE');
    assert.equal(op.condicoesFinanceiras.primeiroVencimento, '2026-11-30');
    assert.deepEqual(op.encargos, { iof: { diario: 167.65, adicional: 38, total: 205.65 }, tarifaCadastro: 50, total: 255.65 });
    assert.equal(op.valorLiberado, 9744.35);
    assert.deepEqual(op.cet, { mensal: 0.0227, anual: 0.3089 });
    // definidoEm sem fuso foi lido como GMT-03:00 e sai em UTC: +3h
    const nosso = new Date(`${definida.definicao.definidoEm.replace(' ', 'T')}-03:00`).toISOString().replace('.000Z', 'Z');
    assert.equal(op.definidoEm, nosso);
    return `finops id=${op.id} status=${op.status} definidoEm=${op.definidoEm}`;
  });

  await cenario('FinOps gravou o calendário como enviado: 12 parcelas PENDENTE iguais ao cronograma PRICE', async () => {
    const r = await fetch(`${finops.url}/operacoes/${criada.identificador}/parcelas`);
    assert.equal(r.status, 200);
    const parcelas = await r.json();
    assert.equal(parcelas.length, 12);
    const nossas = criada.simulacoes.PRICE.cronograma;
    parcelas.forEach((p, i) => {
      assert.equal(p.numero, nossas[i].numero);
      assert.equal(p.vencimento, nossas[i].vencimento);
      assert.equal(p.valorParcela, nossas[i].valor);
      assert.equal(p.amortizacao, nossas[i].amortizacao);
      assert.equal(p.juros, nossas[i].juros);
      assert.equal(p.saldoDevedor, nossas[i].saldoDevedor);
      assert.equal(p.status, 'PENDENTE');
    });
    return `parcela 1: ${parcelas[0].vencimento} ${parcelas[0].valorParcela}; parcela 12: ${parcelas[11].valorParcela}`;
  });

  await cenario('FinOps tem a PJ (SAC): sistema SAC, IOF adicional 95, CET 32,49% → 0.3249', async () => {
    const r = await fetch(`${finops.url}/operacoes/${pj.identificador}`);
    assert.equal(r.status, 200);
    const op = await r.json();
    assert.equal(op.id, pj.finops.id);
    assert.equal(op.tipoPessoa, 'PJ');
    assert.equal(op.clienteId, '11222333000181');
    assert.equal(op.condicoesFinanceiras.sistemaAmortizacao, 'SAC');
    assert.equal(op.encargos.iof.adicional, 95);
    assert.equal(op.valorLiberado, 9692.78);
    assert.equal(op.cet.anual, 0.3249);
  });

  await cenario('POST /:id/finops em operação já REGISTRADA → 200 com a operação como está (não chama o FinOps de novo)', async () => {
    const r = await chama('POST', `/operacoes/${criada.id}/finops`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json, definida);
  });

  await cenario('reenvio: marcando a PJ como FALHOU no banco, POST /:id/finops volta a REGISTRADA (FinOps responde 200: já existia)', async () => {
    await pool.query("UPDATE operacoes SET finops_status = 'FALHOU', finops_id = NULL, finops_erro = 'simulado pelo verifica' WHERE id = ?", [pj.id]);
    const antes = await chama('GET', `/operacoes/${pj.id}`);
    assert.equal(antes.json.finops.status, 'FALHOU');
    const r = await chama('POST', `/operacoes/${pj.id}/finops`);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.finops.status, 'REGISTRADA');
    assert.equal(r.json.finops.id, pj.finops.id); // o mesmo id de antes: o FinOps não duplicou
    assert.equal(r.json.finops.erro, null);
    assert.deepEqual(r.json.simulacoes, pj.simulacoes);
    const [[l]] = await pool.query('SELECT finops_status, finops_id, finops_erro FROM operacoes WHERE id = ?', [pj.id]);
    assert.deepEqual(l, { finops_status: 'REGISTRADA', finops_id: pj.finops.id, finops_erro: null });
    return `finops id=${r.json.finops.id}`;
  });
} else if (finops.habilitado) {
  await cenario('FinOps fora do ar: POST /:id/finops → 503 FINOPS_INDISPONIVEL e a operação continua FALHOU', async () => {
    const r = await chama('POST', `/operacoes/${criada.id}/finops`);
    assert.equal(r.status, 503, JSON.stringify(r.json));
    assert.equal(r.json.erro.codigo, 'FINOPS_INDISPONIVEL');
    assert.match(r.json.erro.detalhes[0], /sem resposta do FinOps/);
    const depois = await chama('GET', `/operacoes/${criada.id}`);
    assert.equal(depois.json.finops.status, 'FALHOU');
    assert.equal(depois.json.estado, 'DEFINIDA'); // a definição não depende do FinOps
  });
} else {
  await cenario('FINOPS_URL vazia: POST /:id/finops → 503 FINOPS_INDISPONIVEL e a operação continua PENDENTE', async () => {
    const r = await chama('POST', `/operacoes/${criada.id}/finops`);
    assert.equal(r.status, 503, JSON.stringify(r.json));
    assert.equal(r.json.erro.codigo, 'FINOPS_INDISPONIVEL');
    assert.match(r.json.erro.mensagem, /FINOPS_URL/);
    const depois = await chama('GET', `/operacoes/${criada.id}`);
    assert.equal(depois.json.finops.status, 'PENDENTE');
  });
}

// ---------- T-11: consolidado ----------
let consolidado;
await cenario('GET /:id/consolidado (PF, PRICE) → documento só do sistema escolhido, calendário = cronograma simulado', async () => {
  const r = await chama('GET', `/operacoes/${criada.id}/consolidado`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  consolidado = r.json;
  assert.deepEqual(Object.keys(consolidado), [
    'operacao', 'cliente', 'produto', 'condicoes', 'taxa', 'sistema', 'resumo',
    'encargos', 'valorLiberado', 'cet', 'demonstrativo', 'calendario',
  ]);
  assert.deepEqual(consolidado.operacao, {
    id: criada.id, identificador: criada.identificador, estado: 'DEFINIDA',
    criadoEm: criada.criadoEm, definidoEm: criada.definicao.definidoEm, // definida no próprio POST
  });
  assert.deepEqual(consolidado.cliente, { tipoPessoa: 'PF', documento: '52998224725' });
  assert.deepEqual(consolidado.produto, {
    codigo: 'CONSIGNADO_INSS', nome: 'Crédito pessoal consignado INSS',
    modalidadeBcb: 'Crédito pessoal consignado INSS - Prefixado',
  });
  assert.deepEqual(consolidado.condicoes, { valor: 10000, prazoMeses: 12, dataLiberacao: '2026-10-30', primeiroRelacionamento: true });
  assert.deepEqual(consolidado.taxa, { faixaRisco: 'B', taxaFinalMes: 1.85, taxaFinalAno: 24.6, tetoAplicado: true });
  assert.equal(consolidado.sistema, 'PRICE');
  assert.deepEqual(consolidado.resumo, { parcelaFixa: 936.91, totalJuros: 1242.88, totalPago: 11242.88 });
  assert.equal(consolidado.encargos.total, 255.65);
  assert.equal(consolidado.valorLiberado, 9744.35);
  assert.deepEqual(consolidado.cet, { anualPercentual: 30.89, mensalPercentual: 2.27 });
  assert.equal(consolidado.demonstrativo.componentes.length, 4);
  assert.equal(consolidado.demonstrativo.totalDevido, 11498.53);
  assert.equal(consolidado.calendario.length, 12);
  assert.deepEqual(consolidado.calendario, criada.simulacoes.PRICE.cronograma);
  assert.equal(JSON.stringify(consolidado).includes('SAC'), false);
  return `calendario[0]=${consolidado.calendario[0].vencimento} ${consolidado.calendario[0].valor}`;
});

await cenario('GET /por-identificador/:identificador/consolidado → exatamente o mesmo documento (também em minúsculas)', async () => {
  const r = await chama('GET', `/operacoes/por-identificador/${encodeURIComponent(criada.identificador)}/consolidado`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, consolidado);
  const minusculo = await chama('GET', `/operacoes/por-identificador/${encodeURIComponent(criada.identificador.toLowerCase())}/consolidado`);
  assert.equal(minusculo.status, 200);
  assert.deepEqual(minusculo.json, consolidado);
});

await cenario('GET consolidado da PJ (SAC) → resumo com amortizacaoBase, encargos 307,22, CET 32,49; sem PRICE', async () => {
  const r = await chama('GET', `/operacoes/${pj.id}/consolidado`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.sistema, 'SAC');
  assert.deepEqual(r.json.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  assert.deepEqual(r.json.resumo, { amortizacaoBase: 833.33, totalJuros: 1202.5, totalPago: 11202.5 });
  assert.equal(r.json.encargos.iof.adicional, 95);
  assert.equal(r.json.encargos.total, 307.22);
  assert.equal(r.json.valorLiberado, 9692.78);
  assert.equal(r.json.cet.anualPercentual, 32.49);
  assert.equal(r.json.demonstrativo.totalDevido, 11509.72);
  assert.deepEqual(r.json.calendario, pj.simulacoes.SAC.cronograma);
  assert.equal(JSON.stringify(r.json).includes('PRICE'), false);
});

await cenario('GET consolidado repetido → conteúdo idêntico (nada é recalculado)', async () => {
  const a = await chama('GET', `/operacoes/${criada.id}/consolidado`);
  const b = await chama('GET', `/operacoes/${criada.id}/consolidado`);
  assert.deepEqual(a.json, b.json);
  assert.deepEqual(a.json, consolidado);
});

await cenario('GET /por-identificador/NAO-EXISTE/consolidado → 404; de operação SIMULADA → 422; /abc/consolidado → 400', async () => {
  const a = await chama('GET', '/operacoes/por-identificador/NAO-EXISTE/consolidado');
  assert.equal(a.status, 404);
  assert.equal(a.json.erro.codigo, 'OPERACAO_NAO_ENCONTRADA');
  const b = await chama('GET', `/operacoes/por-identificador/${encodeURIComponent(IDENT_SIMULADA_INTACTA)}/consolidado`);
  assert.equal(b.status, 422);
  assert.equal(b.json.erro.codigo, 'OPERACAO_NAO_DEFINIDA');
  const c = await chama('GET', '/operacoes/abc/consolidado');
  assert.equal(c.status, 400);
});

await cenario('GET /:id depois de consultar o consolidado → resposta idêntica à do POST (resultado nunca muda)', async () => {
  const r = await chama('GET', `/operacoes/${criada.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.estado, 'DEFINIDA');
  assert.deepEqual(r.json.simulacoes.PRICE.cronograma, criada.simulacoes.PRICE.cronograma);
  assert.deepEqual(r.json.simulacoes, criada.simulacoes);
  assert.deepEqual(r.json.definicao, criada.definicao);
  assert.deepEqual(r.json.finops, criada.finops);
  assert.deepEqual(r.json, criada); // nada mudou desde o 201
});

await cenario('GET /:id da SIMULADA legado que foi definida → simulacoes intactas e definicao preenchida', async () => {
  const r = await chama('GET', `/operacoes/${idSimuladaLegado}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.estado, 'DEFINIDA');
  assert.deepEqual(r.json.definicao, definida.definicao);
  assert.deepEqual(r.json.finops, definida.finops);
  assert.deepEqual(r.json.simulacoes, criada.simulacoes); // é cópia da A.5
});

// ---------- T-12: listagem com estado ----------
await cenario('GET /?estado=DEFINIDA → só definidas (PF e PJ), total respeita o filtro, itens com definicao preenchida', async () => {
  const r = await chama('GET', '/operacoes?estado=DEFINIDA&tamanho=100');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.itens.every((i) => i.estado === 'DEFINIDA' && i.definicao !== null));
  assert.equal(r.json.total, r.json.itens.length);
  const ids = r.json.itens.map((i) => i.id);
  assert.ok(ids.includes(criada.id) && ids.includes(pj.id), `ids=${ids}`);
  const itemPj = r.json.itens.find((i) => i.id === pj.id);
  assert.equal(itemPj.definicao.sistema, 'SAC');
  assert.deepEqual(itemPj.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  // A listagem também mostra o registro no FinOps. Operação criada pelo POST (T-14) nasce
  // PENDENTE: quem muda esse status é a rota de registro no FinOps, não o POST.
  assert.equal(itemPj.finops.status, 'PENDENTE');
  return `definidas=${r.json.total}`;
});

await cenario('GET /?estado=SIMULADA → nenhuma das definidas aparece; sem filtro aparecem todas', async () => {
  const simuladas = await chama('GET', '/operacoes?estado=SIMULADA&tamanho=100');
  assert.equal(simuladas.status, 200);
  const ids = simuladas.json.itens.map((i) => i.id);
  assert.ok(!ids.includes(criada.id) && !ids.includes(pj.id));
  assert.ok(simuladas.json.itens.every((i) => i.estado === 'SIMULADA' && i.definicao === null && i.finops === null));
  const todas = await chama('GET', '/operacoes?tamanho=100');
  const definidas = await chama('GET', '/operacoes?estado=DEFINIDA&tamanho=100');
  assert.equal(todas.json.total, simuladas.json.total + definidas.json.total);
});

await cenario('GET /?estado=X → 400; ?estado=X&tamanho=0 → 400 com 2 detalhes', async () => {
  const a = await chama('GET', '/operacoes?estado=X');
  assert.equal(a.status, 400);
  assert.deepEqual(a.json.erro.detalhes, ['estado deve ser SIMULADA ou DEFINIDA']);
  const b = await chama('GET', '/operacoes?estado=X&tamanho=0');
  assert.equal(b.status, 400);
  assert.equal(b.json.erro.detalhes.length, 2);
});

// ---------- legado /api/juros (não deve ter quebrado) ----------
await cenario('legado POST /juros/simples e /juros/composto continuam respondendo', async () => {
  const s = await chama('POST', '/juros/simples', { capital: 1000, taxa: 2, periodos: 12 });
  assert.equal(s.status, 200);
  assert.equal(s.json.montante, 1240);
  const c = await chama('POST', '/juros/composto', { capital: 1000, taxa: 2, periodos: 12 });
  assert.equal(c.status, 200);
  assert.equal(c.json.montante, 1268.24);
});

await cenario('legado GET /juros/faixas?modalidadeCodigo=VEICULOS&score=750 → faixa B (agora camelCase)', async () => {
  const r = await chama('GET', '/juros/faixas?modalidadeCodigo=VEICULOS&score=750');
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].faixa, 'B');
  assert.equal(r.json[0].taxaMes, 2);
  const todas = await chama('GET', '/juros/faixas');
  assert.equal(todas.json.length, 30);
  return JSON.stringify(r.json[0]);
});

// ---------- limpeza ----------
const [del] = await pool.query('DELETE FROM operacoes WHERE identificador LIKE ?', [`${PREFIXO}%`]);
const [[{ restantes }]] = await pool.query('SELECT COUNT(*) AS restantes FROM operacoes');
console.log(`\nlimpeza: ${del.affectedRows} linha(s) de teste apagadas; operacoes restantes na tabela: ${restantes}`);

await pool.end();
servidor.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} cenários OK`);
process.exit(falhas.length ? 1 : 0);
