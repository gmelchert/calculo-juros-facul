// Validação do documento do cliente: CPF (pessoa física) e CNPJ (pessoa jurídica).
// Funções PURAS: sem banco, sem HTTP. Testes em documento.test.js (tabela §7.1 dos requisitos).
//
// Regra dos dígitos verificadores (módulo 11, a mesma da Receita Federal):
//   soma = Σ dígito × peso; resto = soma % 11; DV = 0 se resto < 2, senão 11 − resto.
//   CPF: 9 dígitos + 2 DVs, pesos 10..2 e 11..2.
//   CNPJ: 12 dígitos + 2 DVs, pesos 5 4 3 2 9 8 7 6 5 4 3 2 e 6 5 4 3 2 9 8 7 6 5 4 3 2.
// Documento com todos os dígitos iguais (111.111.111-11) PASSA no módulo 11, por isso tem regra própria.
// Só dígitos: o CNPJ alfanumérico (Receita, desde 07/2026) fica fora nesta versão (decisão Q9).

// Caracteres de máscara aceitos: ponto, hífen, barra e espaço. Qualquer outro invalida.
const MASCARA = /[.\-/ ]/g;

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

// Tira a máscara e devolve { digitos } ('52998224725') ou { digitos: null } se sobrou algo que
// não é dígito (letra, símbolo) ou se a entrada não é texto.
export function limpaDocumento(texto) {
  if (typeof texto !== 'string') return { digitos: null };
  const semMascara = texto.replace(MASCARA, '');
  return /^[0-9]+$/.test(semMascara) ? { digitos: semMascara } : { digitos: null };
}

function digitoVerificador(digitos, pesos) {
  const soma = digitos.reduce((acumulado, digito, i) => acumulado + digito * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function todosIguais(digitos) {
  return digitos.every((d) => d === digitos[0]);
}

// `digitos`: string só com números. Devolve true se é um CPF válido (11 dígitos, DVs corretos).
export function ehCpfValido(digitos) {
  if (typeof digitos !== 'string' || !/^[0-9]{11}$/.test(digitos)) return false;
  const d = digitos.split('').map(Number);
  if (todosIguais(d)) return false;
  return digitoVerificador(d.slice(0, 9), PESOS_CPF_1) === d[9]
    && digitoVerificador(d.slice(0, 10), PESOS_CPF_2) === d[10];
}

// `digitos`: string só com números. Devolve true se é um CNPJ válido (14 dígitos, DVs corretos).
export function ehCnpjValido(digitos) {
  if (typeof digitos !== 'string' || !/^[0-9]{14}$/.test(digitos)) return false;
  const d = digitos.split('').map(Number);
  if (todosIguais(d)) return false;
  return digitoVerificador(d.slice(0, 12), PESOS_CNPJ_1) === d[12]
    && digitoVerificador(d.slice(0, 13), PESOS_CNPJ_2) === d[13];
}

// O que cada tipo de pessoa exige do documento.
const TIPOS = {
  PF: { nome: 'CPF', tamanho: 11, ehValido: ehCpfValido },
  PJ: { nome: 'CNPJ', tamanho: 14, ehValido: ehCnpjValido },
};

export const TIPOS_PESSOA = Object.keys(TIPOS);

// Valida o objeto `cliente` do corpo do POST /api/operacoes.
// Devolve { erros: [] , cliente: { tipoPessoa, documento } } com o documento SÓ COM DÍGITOS,
// ou { erros: ['mensagem', ...] } — as mensagens entram em `detalhes` do 400, junto com as dos
// outros campos (validaEntrada). Não para no primeiro problema: tipo e documento são avaliados
// separadamente, então `{}` gera duas mensagens e `cliente` ausente gera uma só.
export function validaCliente(cliente) {
  if (cliente === undefined || cliente === null || typeof cliente !== 'object' || Array.isArray(cliente)) {
    return { erros: ['cliente é obrigatório (objeto com tipoPessoa e documento)'] };
  }

  const { tipoPessoa, documento } = cliente;
  const erros = [];

  // Object.hasOwn: 'constructor' ou 'toString' não podem passar como tipo válido.
  const tipo = typeof tipoPessoa === 'string' && Object.hasOwn(TIPOS, tipoPessoa) ? TIPOS[tipoPessoa] : undefined;
  if (!tipo) {
    erros.push('cliente.tipoPessoa deve ser PF ou PJ');
  }

  const { digitos } = limpaDocumento(documento);
  if (tipo) {
    if (!digitos || !tipo.ehValido(digitos)) {
      erros.push(`cliente.documento deve ser um ${tipo.nome} válido (${tipo.tamanho} dígitos)`);
    }
  } else if (!digitos || !(ehCpfValido(digitos) || ehCnpjValido(digitos))) {
    // Sem tipo válido não dá para dizer qual documento era esperado; ainda assim avisa se o
    // documento é inválido, para o cliente da API corrigir tudo de uma vez.
    erros.push('cliente.documento deve ser um CPF ou CNPJ válido');
  }

  if (erros.length > 0) return { erros };
  return { erros: [], cliente: { tipoPessoa, documento: digitos } };
}
