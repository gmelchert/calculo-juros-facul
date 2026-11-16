import * as repositorioModalidades from '../repositorios/modalidades.js';
import { ErroDeNegocio } from '../lib/erros.js';
import { ehDataValida } from '../lib/datas.js';
import { validaCliente } from '../lib/documento.js';
import { arredonda2 } from '../lib/util.js';

// Identificador da operação na esteira (T-13): o FinOps usa ele como `numeroOperacao`, exige o
// formato OP-AAAA-NNNN (4 dígitos ou mais na sequência; ADR-009 deles) e a coluna lá é VARCHAR(20).
// A nossa coluna é VARCHAR(60), mas um identificador que o FinOps recusa só daria erro na definição.
const FORMATO_IDENTIFICADOR = /^OP-\d{4}-\d{4,}$/;
const IDENTIFICADOR_MAX = 20;
const VALOR_MAXIMO = 10_000_000;
const SCORE_MIN = 0;
const SCORE_MAX = 1000;

// Campo opcional que não veio no corpo (undefined) ou veio como null: tratamos igual.
function ausente(v) {
  return v === undefined || v === null;
}

// Data de hoje em 'AAAA-MM-DD' no fuso LOCAL do servidor.
// (toISOString() daria a data em UTC: no Brasil, depois das 21h, já seria "amanhã".)
function hojeIso() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Valida o corpo do POST /api/operacoes e devolve a entrada NORMALIZADA:
//   { identificador, cliente ({ tipoPessoa, documento só com dígitos }), valor,
//     modalidade (LINHA da tabela modalidades), score, prazoMeses,
//     dataLiberacao (hoje se ausente), primeiroRelacionamento (false se ausente) }
//
// A modalidade é conferida no banco (tabela modalidades, via repositório) — por isso a função
// é async. `repositorio` só é passado pelos testes, que usam um "banco falso".
//
// Desde 08/10/2026 (T-09) o `cliente` é obrigatório: tipoPessoa PF/PJ e CPF/CNPJ válido
// (src/lib/documento.js). PJ pode usar qualquer modalidade do catálogo (decisão Q3).
//
// Não para no primeiro problema: acumula todos em `erros` e lança um único
// ErroDeNegocio 400 DADOS_INVALIDOS com a lista completa em `detalhes`.
export async function validaEntrada(body, repositorio = repositorioModalidades) {
  const dados = body ?? {}; // corpo vazio / sem JSON não pode derrubar o servidor
  const {
    identificador, cliente, valor, modalidade, score, prazoMeses, dataLiberacao, primeiroRelacionamento,
  } = dados;

  const erros = [];

  // identificador: OP-AAAA-NNNN, até 20 caracteres (a unicidade é checada na rota, contra o banco).
  // Espaços nas pontas são tolerados e removidos; maiúsculas são exigidas (é como fica gravado lá).
  const identificadorLimpo = typeof identificador === 'string' ? identificador.trim() : '';
  if (!FORMATO_IDENTIFICADOR.test(identificadorLimpo) || identificadorLimpo.length > IDENTIFICADOR_MAX) {
    erros.push(
      `identificador é obrigatório no formato OP-AAAA-NNNN (ex.: OP-2026-0001), com até ${IDENTIFICADOR_MAX} caracteres`,
    );
  }

  // cliente: { tipoPessoa, documento } — uma mensagem se ausente, uma por campo se inválido
  const resultadoCliente = validaCliente(cliente);
  erros.push(...resultadoCliente.erros);

  // valor: número finito, > 0, <= 10.000.000 e sem fração de centavo (o FinOps recusa 3 casas, e o
  // encadeamento do saldo devedor no cronograma só fecha ao centavo se o principal já estiver em centavos)
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    erros.push('valor deve ser um número maior que zero');
  } else if (valor > VALOR_MAXIMO) {
    erros.push(`valor deve ser no máximo ${VALOR_MAXIMO}`);
  } else if (arredonda2(valor) !== valor) {
    erros.push('valor deve ter no máximo 2 casas decimais');
  }

  // modalidade: string que exista (e esteja ativa) na tabela modalidades
  let modalidadeBanco;
  if (typeof modalidade !== 'string' || modalidade.length === 0) {
    erros.push('modalidade é obrigatória');
  } else {
    modalidadeBanco = await repositorio.buscarModalidade(modalidade);
    if (!modalidadeBanco) {
      erros.push(`modalidade "${modalidade}" não existe`);
    } else if (!modalidadeBanco.ativo) {
      erros.push(`modalidade "${modalidade}" não está ativa`);
      modalidadeBanco = undefined; // não faz sentido checar o prazo de uma modalidade inativa
    }
  }

  // score: inteiro 0..1000
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
    erros.push(`score deve ser um inteiro entre ${SCORE_MIN} e ${SCORE_MAX}`);
  }

  // prazoMeses: checagem básica SEMPRE; a de faixa só se a modalidade foi encontrada
  if (!Number.isInteger(prazoMeses) || prazoMeses < 1) {
    erros.push('prazoMeses deve ser um inteiro maior ou igual a 1');
  } else if (
    modalidadeBanco &&
    (prazoMeses < modalidadeBanco.prazoMinMeses || prazoMeses > modalidadeBanco.prazoMaxMeses)
  ) {
    erros.push(
      `prazoMeses deve estar entre ${modalidadeBanco.prazoMinMeses} e ` +
        `${modalidadeBanco.prazoMaxMeses} para ${modalidadeBanco.codigo}`,
    );
  }

  // dataLiberacao: opcional; se vier, precisa ser 'AAAA-MM-DD' e existir no calendário
  if (!ausente(dataLiberacao) && !ehDataValida(dataLiberacao)) {
    erros.push('dataLiberacao deve ser uma data válida no formato AAAA-MM-DD');
  }

  // primeiroRelacionamento: opcional; se vier, tem de ser boolean
  if (!ausente(primeiroRelacionamento) && typeof primeiroRelacionamento !== 'boolean') {
    erros.push('primeiroRelacionamento deve ser true ou false');
  }

  if (erros.length > 0) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há campos inválidos na requisição', erros);
  }

  return {
    identificador: identificadorLimpo,
    cliente: resultadoCliente.cliente,
    valor,
    modalidade: modalidadeBanco,
    score,
    prazoMeses,
    dataLiberacao: ausente(dataLiberacao) ? hojeIso() : dataLiberacao,
    primeiroRelacionamento: ausente(primeiroRelacionamento) ? false : primeiroRelacionamento,
  };
}
