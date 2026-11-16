import { documentosApi } from '../lib/api.js';
import { configuracaoFinops, registraOperacaoDefinida } from './finops.js';

// Avisa os outros grupos que uma operação acabou de ser DEFINIDA (PRICE ou SAC). É chamado nas duas
// rotas que definem: o POST /api/operacoes (T-14, a operação já nasce DEFINIDA) e a /definicao legada.
//
// Regra importante: a definição JÁ FOI GRAVADA no nosso banco quando isto roda. Por isso uma falha
// aqui NUNCA pode virar erro 500 para quem chamou a nossa API: só registramos no terminal e seguimos.
//
// Cada grupo tem o SEU contrato — não existe "um JSON para todos" (lição do merge 394a2e6, que mandou
// a operação completa ao FinOps e recebeu 400 "operacao.identificador não pode ser vazio"):
//   - FinOps recebe o CONSOLIDADO, pelo cliente dedicado em servicos/finops.js (registraOperacaoDefinida).
//     O serviço Go deles lê `operacao.identificador`, `operacao.estado`, `calendario`... — campos que
//     na operação completa não existem ou estão na raiz. O resultado da tentativa fica gravado em
//     operacoes.finops_* e aparece em operacao.finops (REGISTRADA / FALHOU); reenvio: POST /:id/finops.
//   - Documentos recebe a operação completa, exatamente como o GET /operacoes/:id devolve
//     (identificador, estado, definicao, cliente, entrada, taxa e as DUAS simulações), como texto JSON
//     no corpo do POST (Content-Type: application/json), não como arquivo.
//
// Devolve um item por destino configurado: { destino, ok: true, resposta } ou { destino, ok: false, erro }.
// Variável do grupo vazia no .env = grupo ainda não integrado → pulado.
// `deps` só é passado pelos testes.
export async function notificaDefinicao(operacao, {
  finops = configuracaoFinops(),
  registraFinops = registraOperacaoDefinida,
  documentos = documentosApi('api/documentos/juros'),
} = {}) {
  const destinos = [];
  if (finops.habilitado) {
    destinos.push({ nome: 'FinOps', envia: () => enviaAoFinops(operacao, registraFinops, finops) });
  }
  if (documentos.configurada) {
    destinos.push({ nome: 'Documentos', envia: () => documentos.post(operacao) });
  }

  // allSettled: espera todos terminarem, mesmo que um falhe (Promise.all pararia no primeiro erro).
  const resultados = await Promise.allSettled(destinos.map((d) => d.envia()));

  return destinos.map((d, i) => {
    const r = resultados[i];
    if (r.status === 'fulfilled') {
      console.log(`[integração] ${d.nome}: operação ${operacao.identificador} enviada`, r.value);
      return { destino: d.nome, ok: true, resposta: r.value };
    }
    console.error(`[integração] ${d.nome}: falha ao enviar ${operacao.identificador} → ${r.reason.message}`);
    return { destino: d.nome, ok: false, erro: r.reason.message };
  });
}

// registraOperacaoDefinida já grava FALHOU e NÃO lança quando o FinOps recusa ou não responde; aqui
// a falha vira rejeição para cair no mesmo tratamento (e no mesmo log) dos outros destinos. O aviso
// próprio dele fica mudo para o motivo não sair duas vezes no terminal.
async function enviaAoFinops(operacao, registraFinops, config) {
  const resultado = await registraFinops(operacao, { config, avisa: () => {} });
  if (resultado.status !== 'REGISTRADA') {
    throw new Error(resultado.erro ?? `finops.status ${resultado.status}`);
  }
  return { id: resultado.id, status: resultado.status, tipo: resultado.tipo };
}
