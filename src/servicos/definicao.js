import { ErroDeNegocio } from '../lib/erros.js';

// Regras da DEFINIÇÃO do sistema de amortização (T-10): o outro grupo escolhe PRICE ou SAC para
// uma operação ainda SIMULADA. Funções PURAS: a rota busca a operação no banco, chama
// `avaliaDefinicao` e, se passar, pede ao repositório para gravar (`definir`).
//
// Estados possíveis da operação (docs/design-definicao-cliente-contrato.md, §2.1):
//   SIMULADA  → estado histórico: era como a operação nascia até 15/11/2026.
//   DEFINIDA  → `definicao = { sistema, definidoEm }` e a escolha é imutável.
//
// Desde 16/11/2026 (T-14) o POST /api/operacoes exige `amortizacao`, então a operação JÁ NASCE
// DEFINIDA e nenhuma operação nova fica SIMULADA. `SIMULADA` continua no enum porque ainda
// existem operações antigas gravadas nesse estado (e o filtro ?estado=SIMULADA deve achá-las).

export const SISTEMAS = ['PRICE', 'SAC'];
export const ESTADOS = ['SIMULADA', 'DEFINIDA'];

// Único valor de `decisao` que autoriza criar a operação (T-14).
export const DECISAO_APROVADA = 'APROVADO';

// Erro de quem tenta definir uma operação que já está DEFINIDA (inclusive na corrida: o UPDATE
// do repositório não afetou nenhuma linha porque outra requisição definiu antes).
export function erroJaDefinida(operacao) {
  return new ErroDeNegocio(
    409,
    'AMORTIZACAO_JA_DEFINIDA',
    `Operação ${operacao.id} já está definida como ${operacao.definicao?.sistema}`,
  );
}

// Recusa criar a operação quando o grupo de decisão não aprovou o crédito (T-14).
// `decisao` vem NORMALIZADA de validaEntrada (sem espaços, maiúscula) e pode ser null quando o
// campo não foi enviado — nesse caso não bloqueamos, por compatibilidade com quem ainda não manda.
// É 422 (e não 400) pela mesma razão do SCORE_INSUFICIENTE: o corpo está correto, o pedido é que
// não pode ser atendido. Nada é gravado, então não geramos cronograma, CET nem PDF de contrato
// para um crédito negado.
export function exigeDecisaoAprovada(decisao) {
  if (decisao === null || decisao === undefined) return;
  if (decisao !== DECISAO_APROVADA) {
    throw new ErroDeNegocio(
      422,
      'DECISAO_NAO_APROVADA',
      `Operação não pode ser criada: a decisão recebida foi "${decisao}" (esperado ${DECISAO_APROVADA})`,
    );
  }
}

// Lança ErroDeNegocio se a definição não pode acontecer; não devolve nada se pode.
// Ordem (contrato §3.2 do desenho): sistema inválido (400) antes de já definida (409).
export function avaliaDefinicao(operacao, sistema) {
  if (!SISTEMAS.includes(sistema)) {
    throw new ErroDeNegocio(400, 'DADOS_INVALIDOS', 'Há campos inválidos na requisição', [
      'sistema deve ser PRICE ou SAC',
    ]);
  }
  if (operacao.estado !== 'SIMULADA') {
    throw erroJaDefinida(operacao);
  }
}
