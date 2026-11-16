import { montaConsolidado } from './consolidado.js';
import * as repositorioOperacoes from '../repositorios/operacoes.js';
import * as repositorioModalidades from '../repositorios/modalidades.js';

// Integração com o financial-operations-service ("FinOps", o serviço Go da esteira, porta 8083).
// Quando uma operação é DEFINIDA, enviamos o consolidado dela (montaConsolidado — o MESMO documento
// de GET /operacoes/:id/consolidado) em POST {FINOPS_URL}/operacoes. Lá ela vira o contrato: eles
// conferem o calendário ao centavo, gravam como veio e passam a controlar parcelas e pagamentos.
//
// Regras do lado deles que importam aqui (ADR-009 e docs/architecture/integracoes.md do FinOps):
//   - só aceitam operacao.estado = DEFINIDA; o identificador vira o numeroOperacao e precisa estar
//     no formato OP-AAAA-NNNN com até 20 caracteres (validaEntrada garante isso na criação);
//   - são IDEMPOTENTES pelo identificador: 201 quando criam, 200 quando já existia — reenviar é seguro;
//   - 400 = payload recusado (não adianta reenviar igual); timeout/sem resposta = reenviar o mesmo.
//   - campos que não usam (demonstrativo, diasCorridos, primeiroRelacionamento...) são ignorados.
//
// Situação do registro, gravada em `operacoes.finops_*` e devolvida em `operacao.finops`:
//   PENDENTE   DEFINIDA mas ainda não enviada (integração desligada ou processo caiu antes de enviar)
//   REGISTRADA aceita pelo FinOps; `id` é o id da operação lá (o numeroOperacao é o nosso identificador)
//   FALHOU     a última tentativa falhou; `erro` diz por quê. Reenvio: POST /api/operacoes/:id/finops
//
// A definição NUNCA depende do FinOps: ela é gravada antes, e se o envio falhar a operação fica
// FALHOU para ser reenviada depois. É o mesmo desenho de "reenvio seguro" que eles recomendam.

export const STATUS_FINOPS = ['PENDENTE', 'REGISTRADA', 'FALHOU'];

const TIMEOUT_PADRAO_MS = 5000;
const ERRO_MAX = 255; // tamanho da coluna operacoes.finops_erro

// Lê FINOPS_URL e FINOPS_TIMEOUT_MS. `env` só é passado pelos testes.
export function configuracaoFinops(env = process.env) {
  const url = String(env.FINOPS_URL ?? '').trim().replace(/\/+$/, ''); // sem barra no fim
  const timeout = Number(env.FINOPS_TIMEOUT_MS);
  return {
    url,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : TIMEOUT_PADRAO_MS,
    habilitado: url !== '',
  };
}

// Falha "esperada" da integração: o FinOps não respondeu ou recusou. Qualquer outro erro é bug.
//   tipo COMUNICACAO: sem resposta (conexão recusada, DNS, timeout) — não se sabe se gravou; reenviar é seguro.
//   tipo RECUSADO:    respondeu 400 — o payload foi rejeitado; `message` traz o motivo que eles deram.
//   tipo INESPERADO:  qualquer outro status (404 de rota errada, 500...).
export class ErroFinops extends Error {
  constructor(mensagem, { tipo, status, causa } = {}) {
    super(mensagem, causa === undefined ? undefined : { cause: causa });
    this.tipo = tipo;
    this.status = status;
  }
}

async function leCorpo(resposta) {
  const texto = await resposta.text();
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

// AbortSignal.timeout rejeita com TimeoutError; conexão recusada vem como TypeError "fetch failed"
// com a causa de verdade (ECONNREFUSED...) em `cause`.
function descreveFalhaDeRede(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'tempo de resposta esgotado';
  const codigo = err?.cause?.code ?? err?.code;
  const detalhe = err?.cause?.message ?? err?.message ?? String(err);
  return codigo ? `${codigo}: ${detalhe}` : detalhe;
}

// POST {FINOPS_URL}/operacoes com o consolidado. Devolve a confirmação deles:
//   { criada (true no 201, false no 200 = já existia), id, numeroOperacao, status, criadoEm }
// Lança ErroFinops em qualquer outra situação. `fetch` e `config` só são passados pelos testes.
export async function registraOperacao(consolidado, { config = configuracaoFinops(), fetch = globalThis.fetch } = {}) {
  if (!config.habilitado) {
    throw new Error('registraOperacao: FINOPS_URL não configurada'); // bug de quem chamou (vira 500)
  }
  const url = `${config.url}/operacoes`;

  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(consolidado),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (err) {
    throw new ErroFinops(`sem resposta do FinOps em ${url} (${descreveFalhaDeRede(err)})`, {
      tipo: 'COMUNICACAO', causa: err,
    });
  }

  const corpo = await leCorpo(resposta);

  if (resposta.status === 201 || resposta.status === 200) {
    return {
      criada: resposta.status === 201,
      id: corpo.id,
      numeroOperacao: corpo.numeroOperacao,
      status: corpo.status,
      criadoEm: corpo.criadoEm,
    };
  }

  // O formato de erro deles é { "erro": "mensagem" }; se vier outra coisa, mostra o status.
  const motivo = typeof corpo?.erro === 'string' ? corpo.erro : `resposta inesperada (HTTP ${resposta.status})`;
  throw new ErroFinops(`FinOps respondeu ${resposta.status}: ${motivo}`, {
    tipo: resposta.status === 400 ? 'RECUSADO' : 'INESPERADO',
    status: resposta.status,
  });
}

// Envia uma operação DEFINIDA ao FinOps e grava o resultado da tentativa em `operacoes.finops_*`.
// Devolve { status, id, erro, tipo }: `status` é o novo finops.status (REGISTRADA ou FALHOU);
// com a integração desligada não chama nada, não grava nada e devolve a situação atual com tipo DESLIGADO.
//
// operacao: saída de buscarPorId, com estado 'DEFINIDA' (a rota já garantiu).
// deps: só os testes passam; na API são os módulos reais.
export async function registraOperacaoDefinida(operacao, {
  config = configuracaoFinops(),
  repositorio = repositorioOperacoes,
  modalidades = repositorioModalidades,
  registra = registraOperacao,
  avisa = console.warn,
} = {}) {
  if (operacao.estado !== 'DEFINIDA' || !operacao.finops) {
    throw new Error(`registraOperacaoDefinida: operação ${operacao.id} não está DEFINIDA`);
  }

  if (!config.habilitado) {
    return { ...operacao.finops, tipo: 'DESLIGADO' };
  }

  // O payload é o consolidado, sem adaptação: é o contrato combinado com a equipe do FinOps.
  const modalidade = await modalidades.buscarModalidade(operacao.entrada.modalidade);
  const payload = montaConsolidado(operacao, modalidade);

  try {
    const confirmacao = await registra(payload, { config });
    await repositorio.registraTentativaFinops({
      id: operacao.id, status: 'REGISTRADA', finopsId: confirmacao.id, erro: null,
    });
    return { status: 'REGISTRADA', id: confirmacao.id, erro: null, tipo: confirmacao.criada ? 'CRIADA' : 'JA_EXISTIA' };
  } catch (err) {
    if (!(err instanceof ErroFinops)) throw err; // bug ou banco fora: vira 500 como qualquer outro

    const erro = err.message.slice(0, ERRO_MAX);
    // Mantém o finops_id de um registro anterior, se houver: a falha é desta tentativa.
    await repositorio.registraTentativaFinops({ id: operacao.id, status: 'FALHOU', finopsId: null, erro });
    avisa(`[finops] operação ${operacao.id} (${operacao.identificador}) não registrada: ${erro}`);
    return { status: 'FALHOU', id: operacao.finops.id ?? null, erro, tipo: err.tipo };
  }
}
