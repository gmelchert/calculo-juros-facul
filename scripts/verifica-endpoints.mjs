// Verificação ponta a ponta de TODOS os endpoints contra o MySQL local (npm run verifica).
// Sobe o app numa porta efêmera, roda os cenários do docs/backlog-api.md (T-01, T-07, T-08, a
// rota legada /api/juros) e os de docs/design-definicao-cliente-contrato.md §5.7 (T-09 a T-12),
// e apaga as operações que criou (identificador OP-E2E-<timestamp>-*).
// Precisa do .env, do MySQL ligado e de npm run schema + npm run seed (ou npm run reset) já executados.
// Sai com código 1 se algum cenário falhar — serve de checagem antes de abrir um PR.
import assert from 'node:assert/strict';

// Caminhos relativos a este arquivo: funciona de qualquer pasta (npm run verifica).
const { default: app } = await import(new URL('../src/app.js', import.meta.url));
const { pool } = await import(new URL('../src/db.js', import.meta.url));

const servidor = await new Promise((ok) => {
  const s = app.listen(0, () => ok(s));
});
const base = `http://127.0.0.1:${servidor.address().port}/api`;
const PREFIXO = `OP-E2E-${Date.now()}`;
const resultados = [];

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

const corpoA5 = {
  identificador: `${PREFIXO}-0001`,
  cliente: CLIENTE_PF,
  valor: 10000,
  modalidade: 'CONSIGNADO_INSS',
  score: 650,
  prazoMeses: 12,
  dataLiberacao: '2026-10-30',
  primeiroRelacionamento: true,
};

const CAMINHOS_ESPERADOS = [
  '/health', '/juros/composto', '/juros/faixas', '/juros/simples',
  '/modalidades', '/modalidades/{codigo}', '/operacoes',
  '/operacoes/por-identificador/{identificador}/consolidado',
  '/operacoes/{id}', '/operacoes/{id}/consolidado', '/operacoes/{id}/definicao',
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

// ---------- T-07 (+ T-09: cliente) ----------
await cenario('POST feliz (A.5, PF) → 201 SIMULADA com valores de referência e cliente só com dígitos', async () => {
  const r = await chama('POST', '/operacoes', corpoA5);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  criada = r.json;
  assert.ok(Number.isInteger(criada.id) && criada.id >= 1);
  assert.equal(criada.identificador, corpoA5.identificador);
  assert.match(String(criada.criadoEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(criada.estado, 'SIMULADA');
  assert.equal(criada.definicao, null);
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
            estado, sistema_definido, definido_em
       FROM operacoes WHERE identificador = ?`,
    [corpoA5.identificador],
  );
  assert.ok(l, 'linha não encontrada');
  assert.equal(l.tipo_pessoa, 'PF');
  assert.equal(l.documento, '52998224725');
  assert.equal(l.modalidade_codigo, 'CONSIGNADO_INSS');
  assert.equal(l.valor, 10000);
  assert.equal(l.faixa_risco, 'B');
  assert.equal(l.taxa_final_mes, 1.85);
  assert.equal(l.cet_price_ano, 30.89);
  assert.equal(l.cet_sac_ano, 30.96);
  assert.equal(l.estado, 'SIMULADA');
  assert.equal(l.sistema_definido, null);
  assert.equal(l.definido_em, null);
});

await cenario('POST repetido → 409 IDENTIFICADOR_DUPLICADO', async () => {
  const r = await chama('POST', '/operacoes', corpoA5);
  assert.equal(r.status, 409);
  assert.equal(r.json.erro.codigo, 'IDENTIFICADOR_DUPLICADO');
});

await cenario('POST {} → 400 DADOS_INVALIDOS com 6 detalhes (identificador, cliente, valor, modalidade, score, prazoMeses)', async () => {
  const r = await chama('POST', '/operacoes', {});
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.codigo, 'DADOS_INVALIDOS');
  assert.equal(r.json.erro.detalhes.length, 6);
  assert.match(r.json.erro.detalhes[1], /cliente é obrigatório/);
});

await cenario('POST sem corpo/JSON → 400 com 6 detalhes', async () => {
  const resp = await fetch(base + '/operacoes', { method: 'POST' });
  const json = await resp.json();
  assert.equal(resp.status, 400);
  assert.equal(json.erro.detalhes.length, 6);
});

await cenario('POST JSON malformado → 400 DADOS_INVALIDOS (não 500)', async () => {
  const r = await chama('POST', '/operacoes', '{"valor": 10000,}', true);
  assert.equal(r.status, 400, JSON.stringify(r.json));
  assert.equal(r.json.erro.codigo, 'DADOS_INVALIDOS');
});

await cenario('POST modalidade inexistente no banco → 400 citando "não existe"', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-mod`, modalidade: 'CHEQUE_ESPECIAL' });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /CHEQUE_ESPECIAL.*não existe/);
  return r.json.erro.detalhes[0];
});

await cenario('POST INSS prazo 3 → 400 citando "entre 6 e 84" (limites lidos da tabela modalidades)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-prazo`, prazoMeses: 3 });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /entre 6 e 84/);
  return r.json.erro.detalhes[0];
});

await cenario('POST score 150 → 422 SCORE_INSUFICIENTE (faixa E, taxa_mes NULL) e NADA gravado', async () => {
  const ident = `${PREFIXO}-score`;
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident, score: 150 });
  assert.equal(r.status, 422);
  assert.equal(r.json.erro.codigo, 'SCORE_INSUFICIENTE');
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [ident]);
  assert.equal(linhas.length, 0, 'operação recusada foi gravada!');
});

await cenario('POST sem dataLiberacao → 201 com data de hoje', async () => {
  const { dataLiberacao, ...semData } = corpoA5;
  const r = await chama('POST', '/operacoes', { ...semData, identificador: `${PREFIXO}-hoje`, primeiroRelacionamento: false });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  assert.equal(r.json.entrada.dataLiberacao, hoje);
  assert.equal(r.json.simulacoes.PRICE.encargos.tarifaCadastro, 0);
  return `dataLiberacao=${r.json.entrada.dataLiberacao}`;
});

await cenario('POST CREDITO_PESSOAL score 720 → taxa 5,00 (faixa B da tabela), sem teto', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-cp`, modalidade: 'CREDITO_PESSOAL', score: 720 });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.taxa.taxaFinalMes, 5);
  assert.equal(r.json.taxa.taxaBaseMes, 4.5);
  assert.equal(r.json.taxa.taxaFinalAno, 79.59);
  assert.equal(r.json.taxa.tetoAplicado, false);
  assert.equal(r.json.simulacoes.PRICE.cronograma[0].juros, 500);
});

await cenario('POST CONSIGNADO_PUBLICO score 450 → 2,50 (faixa C achatada no teto)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-pub`, modalidade: 'CONSIGNADO_PUBLICO', score: 450 });
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
  assert.equal(primeiro.identificador, `${PREFIXO}-pub`);
  assert.equal('simulacoes' in primeiro, false);
  assert.deepEqual(Object.keys(primeiro).sort(), [
    'cetPriceAno', 'cetSacAno', 'cliente', 'criadoEm', 'dataLiberacao', 'definicao', 'estado', 'faixaRisco',
    'id', 'identificador', 'modalidade', 'prazoMeses', 'score', 'taxaFinalMes', 'valor',
  ]);
  assert.equal(primeiro.estado, 'SIMULADA');
  assert.equal(primeiro.definicao, null);
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
  const r = await chama('POST', '/operacoes', { ...semCliente, identificador: `${PREFIXO}-semcli` });
  assert.equal(r.status, 400);
  assert.equal(r.json.erro.detalhes.length, 1);
  assert.match(r.json.erro.detalhes[0], /cliente é obrigatório/);
});

await cenario('POST cliente {} → 400 com 2 mensagens (tipoPessoa e documento)', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-clivazio`, cliente: {} });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.erro.detalhes, [
    'cliente.tipoPessoa deve ser PF ou PJ',
    'cliente.documento deve ser um CPF ou CNPJ válido',
  ]);
});

await cenario('POST CPF com DV errado → 400 e NADA gravado', async () => {
  const ident = `${PREFIXO}-dv`;
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident, cliente: { tipoPessoa: 'PF', documento: '529.982.247-26' } });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json.erro.detalhes, ['cliente.documento deve ser um CPF válido (11 dígitos)']);
  const [linhas] = await pool.query('SELECT id FROM operacoes WHERE identificador = ?', [ident]);
  assert.equal(linhas.length, 0, 'operação inválida foi gravada!');
});

await cenario('POST PF com CNPJ e PJ com CPF → 400 (tamanho incompatível com o tipo)', async () => {
  const a = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-x1`, cliente: { tipoPessoa: 'PF', documento: '11222333000181' } });
  const b = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-x2`, cliente: { tipoPessoa: 'PJ', documento: '52998224725' } });
  assert.equal(a.status, 400);
  assert.match(a.json.erro.detalhes[0], /CPF válido \(11 dígitos\)/);
  assert.equal(b.status, 400);
  assert.match(b.json.erro.detalhes[0], /CNPJ válido \(14 dígitos\)/);
});

let pj;
await cenario('POST PJ (CNPJ 11.222.333/0001-81, A.5) → 201: IOF adicional 95,00; CET 32,38 (Price) / 32,49 (SAC); parcelas iguais', async () => {
  const r = await chama('POST', '/operacoes', { ...corpoA5, identificador: `${PREFIXO}-pj`, cliente: CLIENTE_PJ });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  pj = r.json;
  assert.deepEqual(pj.cliente, { tipoPessoa: 'PJ', documento: '11222333000181' });
  assert.equal(pj.estado, 'SIMULADA');
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

// ---------- T-10: definição ----------
await cenario('GET /:id/consolidado antes de definir → 422 OPERACAO_NAO_DEFINIDA (não 404)', async () => {
  const r = await chama('GET', `/operacoes/${criada.id}/consolidado`);
  assert.equal(r.status, 422, JSON.stringify(r.json));
  assert.equal(r.json.erro.codigo, 'OPERACAO_NAO_DEFINIDA');
  assert.match(r.json.erro.mensagem, new RegExp(`Operação ${criada.id} ainda não tem`));
});

await cenario('POST /:id/definicao {sistema: "price"} / sem corpo → 400 e continua SIMULADA', async () => {
  const a = await chama('POST', `/operacoes/${criada.id}/definicao`, { sistema: 'price' });
  assert.equal(a.status, 400, JSON.stringify(a.json));
  assert.deepEqual(a.json.erro.detalhes, ['sistema deve ser PRICE ou SAC']);
  const b = await fetch(`${base}/operacoes/${criada.id}/definicao`, { method: 'POST' });
  assert.equal(b.status, 400);
  const depois = await chama('GET', `/operacoes/${criada.id}`);
  assert.equal(depois.json.estado, 'SIMULADA');
});

await cenario('POST /99999999/definicao → 404; /abc/definicao → 400', async () => {
  const a = await chama('POST', '/operacoes/99999999/definicao', { sistema: 'PRICE' });
  assert.equal(a.status, 404);
  assert.equal(a.json.erro.codigo, 'OPERACAO_NAO_ENCONTRADA');
  const b = await chama('POST', '/operacoes/abc/definicao', { sistema: 'PRICE' });
  assert.equal(b.status, 400);
});

let definida;
await cenario('POST /:id/definicao {sistema: "PRICE"} (PF) → 200 DEFINIDA com definicao e cronograma intacto', async () => {
  const r = await chama('POST', `/operacoes/${criada.id}/definicao`, { sistema: 'PRICE' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  definida = r.json;
  assert.equal(definida.id, criada.id);
  assert.equal(definida.estado, 'DEFINIDA');
  assert.equal(definida.definicao.sistema, 'PRICE');
  assert.match(String(definida.definicao.definidoEm), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.deepEqual(definida.cliente, criada.cliente);
  assert.deepEqual(definida.simulacoes, criada.simulacoes); // resultado não muda
  const [[l]] = await pool.query('SELECT estado, sistema_definido, definido_em FROM operacoes WHERE id = ?', [criada.id]);
  assert.equal(l.estado, 'DEFINIDA');
  assert.equal(l.sistema_definido, 'PRICE');
  assert.ok(l.definido_em);
  return `definidoEm=${definida.definicao.definidoEm}`;
});

await cenario('POST /:id/definicao de novo (SAC e PRICE) → 409 AMORTIZACAO_JA_DEFINIDA citando PRICE', async () => {
  for (const sistema of ['SAC', 'PRICE']) {
    const r = await chama('POST', `/operacoes/${criada.id}/definicao`, { sistema });
    assert.equal(r.status, 409, JSON.stringify(r.json));
    assert.equal(r.json.erro.codigo, 'AMORTIZACAO_JA_DEFINIDA');
    assert.match(r.json.erro.mensagem, /já está definida como PRICE/);
  }
  const depois = await chama('GET', `/operacoes/${criada.id}`);
  assert.equal(depois.json.definicao.sistema, 'PRICE');
});

await cenario('duas definições em paralelo na PJ (SAC) → exatamente uma 200 e uma 409', async () => {
  const [a, b] = await Promise.all([
    chama('POST', `/operacoes/${pj.id}/definicao`, { sistema: 'SAC' }),
    chama('POST', `/operacoes/${pj.id}/definicao`, { sistema: 'SAC' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const depois = await chama('GET', `/operacoes/${pj.id}`);
  assert.equal(depois.json.estado, 'DEFINIDA');
  assert.equal(depois.json.definicao.sistema, 'SAC');
});

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
    criadoEm: criada.criadoEm, definidoEm: definida.definicao.definidoEm,
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
  const b = await chama('GET', `/operacoes/por-identificador/${encodeURIComponent(`${PREFIXO}-cp`)}/consolidado`);
  assert.equal(b.status, 422);
  assert.equal(b.json.erro.codigo, 'OPERACAO_NAO_DEFINIDA');
  const c = await chama('GET', '/operacoes/abc/consolidado');
  assert.equal(c.status, 400);
});

await cenario('identificador com espaço e barra: POST aceita e a rota por identificador acha com URL-encoding', async () => {
  const ident = `${PREFIXO}-A B/C`;
  const criadaEsp = await chama('POST', '/operacoes', { ...corpoA5, identificador: ident });
  assert.equal(criadaEsp.status, 201, JSON.stringify(criadaEsp.json));
  const r = await chama('GET', `/operacoes/por-identificador/${encodeURIComponent(ident)}/consolidado`);
  assert.equal(r.status, 422, JSON.stringify(r.json)); // existe (achou) mas está SIMULADA
  assert.match(r.json.erro.mensagem, new RegExp(`Operação ${criadaEsp.json.id} ainda`));
});

await cenario('GET /:id depois da definição → simulacoes idênticas às de antes (coluna resultado nunca muda)', async () => {
  const r = await chama('GET', `/operacoes/${criada.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.estado, 'DEFINIDA');
  assert.deepEqual(r.json.simulacoes.PRICE.cronograma, criada.simulacoes.PRICE.cronograma);
  assert.deepEqual(r.json.simulacoes, criada.simulacoes);
  assert.deepEqual(r.json.definicao, definida.definicao);
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
  return `definidas=${r.json.total}`;
});

await cenario('GET /?estado=SIMULADA → nenhuma das definidas aparece; sem filtro aparecem todas', async () => {
  const simuladas = await chama('GET', '/operacoes?estado=SIMULADA&tamanho=100');
  assert.equal(simuladas.status, 200);
  const ids = simuladas.json.itens.map((i) => i.id);
  assert.ok(!ids.includes(criada.id) && !ids.includes(pj.id));
  assert.ok(simuladas.json.itens.every((i) => i.estado === 'SIMULADA' && i.definicao === null));
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
const [del] = await pool.query('DELETE FROM operacoes WHERE identificador LIKE ?', [`${PREFIXO}-%`]);
const [[{ restantes }]] = await pool.query('SELECT COUNT(*) AS restantes FROM operacoes');
console.log(`\nlimpeza: ${del.affectedRows} linha(s) de teste apagadas; operacoes restantes na tabela: ${restantes}`);

await pool.end();
servidor.close();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} cenários OK`);
process.exit(falhas.length ? 1 : 0);
