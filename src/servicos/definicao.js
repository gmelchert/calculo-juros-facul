import { ErroDeNegocio } from '../lib/erros.js';

// Regras da DEFINIÇÃO do sistema de amortização (T-10): o outro grupo escolhe PRICE ou SAC para
// uma operação ainda SIMULADA. Funções PURAS: a rota busca a operação no banco, chama
// `avaliaDefinicao` e, se passar, pede ao repositório para gravar (`definir`).
//
// Estados possíveis da operação (docs/design-definicao-cliente-contrato.md, §2.1):
//   SIMULADA  → nasce assim no POST; as duas simulações estão em `simulacoes`.
//   DEFINIDA  → depois da definição; `definicao = { sistema, definidoEm }` e a escolha é imutável.

export const SISTEMAS = ['PRICE', 'SAC'];
export const ESTADOS = ['SIMULADA', 'DEFINIDA'];

// Erro de quem tenta definir uma operação que já está DEFINIDA (inclusive na corrida: o UPDATE
// do repositório não afetou nenhuma linha porque outra requisição definiu antes).
export function erroJaDefinida(operacao) {
  return new ErroDeNegocio(
    409,
    'AMORTIZACAO_JA_DEFINIDA',
    `Operação ${operacao.id} já está definida como ${operacao.definicao?.sistema}`,
  );
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
