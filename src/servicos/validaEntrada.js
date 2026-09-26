import * as repositorioModalidades from '../repositorios/modalidades.js';
import { ErroDeNegocio } from '../lib/erros.js';
import { ehDataValida } from '../lib/datas.js';

const IDENTIFICADOR_MAX = 60; // mesmo tamanho da coluna operacoes.identificador (VARCHAR(60))
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
//   { identificador, valor, modalidade (LINHA da tabela modalidades), score, prazoMeses,
//     dataLiberacao (hoje se ausente), primeiroRelacionamento (false se ausente) }
//
// A modalidade é conferida no banco (tabela modalidades, via repositório) — por isso a função
// é async. `repositorio` só é passado pelos testes, que usam um "banco falso".
//
// Não para no primeiro problema: acumula todos em `erros` e lança um único
// ErroDeNegocio 400 DADOS_INVALIDOS com a lista completa em `detalhes`.
export async function validaEntrada(body, repositorio = repositorioModalidades) {
  const dados = body ?? {}; // corpo vazio / sem JSON não pode derrubar o servidor
  const {
    identificador, valor, modalidade, score, prazoMeses, dataLiberacao, primeiroRelacionamento,
  } = dados;

  const erros = [];

  // identificador: string, 1 a 60 caracteres (a unicidade é checada na rota, contra o banco)
  if (typeof identificador !== 'string' || identificador.trim().length === 0) {
    erros.push('identificador é obrigatório (texto de 1 a 60 caracteres)');
  } else if (identificador.length > IDENTIFICADOR_MAX) {
    erros.push(`identificador deve ter no máximo ${IDENTIFICADOR_MAX} caracteres`);
  }

  // valor: número finito, > 0 e <= 10.000.000
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    erros.push('valor deve ser um número maior que zero');
  } else if (valor > VALOR_MAXIMO) {
    erros.push(`valor deve ser no máximo ${VALOR_MAXIMO}`);
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
    identificador: identificador.trim(),
    valor,
    modalidade: modalidadeBanco,
    score,
    prazoMeses,
    dataLiberacao: ausente(dataLiberacao) ? hojeIso() : dataLiberacao,
    primeiroRelacionamento: ausente(primeiroRelacionamento) ? false : primeiroRelacionamento,
  };
}
