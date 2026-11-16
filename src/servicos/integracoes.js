import { finOpsApi, documentosApi } from '../lib/api.js';

// Avisa os outros grupos que uma operação acabou de ser DEFINIDA (PRICE ou SAC).
//
// Regra importante: a definição JÁ FOI GRAVADA no nosso banco quando isto roda. Por isso uma falha
// aqui NUNCA pode virar erro 500 para quem chamou a nossa API: só registramos no terminal e seguimos.
//
// O que vai para cada grupo é o JSON da operação completa, exatamente como o GET /operacoes/:id
// devolve (identificador, estado, definicao, cliente, entrada, taxa e as DUAS simulações).
// Vai como texto JSON no corpo do POST (Content-Type: application/json), não como arquivo.
export async function notificaDefinicao(operacao) {
  const destinos = [
    { nome: 'FinOps', api: finOpsApi('operacoes') },
    { nome: 'Documentos', api: documentosApi('api/documentos/juros') },
  ].filter((d) => d.api.configurada); // variável vazia no .env → grupo ainda não integrado, pula

  // allSettled: espera todos terminarem, mesmo que um falhe (Promise.all pararia no primeiro erro).
  const resultados = await Promise.allSettled(destinos.map((d) => d.api.post(operacao)));

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
