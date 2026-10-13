import { test } from 'node:test';
import assert from 'node:assert/strict';

import { limpaDocumento, ehCpfValido, ehCnpjValido, validaCliente } from './documento.js';

// Tabela §7.1 de docs/requisitos-definicao-cliente-contrato.md. DVs conferidos por código em 08/10/2026:
// CPF 529982247 → 2 e 5; CNPJ 112223330001 → 8 e 1.

test('limpaDocumento: tira ponto, hífen, barra e espaço; qualquer outro caractere invalida', () => {
  assert.deepEqual(limpaDocumento('529.982.247-25'), { digitos: '52998224725' });
  assert.deepEqual(limpaDocumento('11.222.333/0001-81'), { digitos: '11222333000181' });
  assert.deepEqual(limpaDocumento(' 529 982 247 25 '), { digitos: '52998224725' });
  assert.deepEqual(limpaDocumento('12.ABC.345/01DE-35'), { digitos: null }); // CNPJ alfanumérico: fora (Q9)
  assert.deepEqual(limpaDocumento('529x982x247x25'), { digitos: null });
  assert.deepEqual(limpaDocumento(''), { digitos: null });
  assert.deepEqual(limpaDocumento(52998224725), { digitos: null }); // número, não texto
  assert.deepEqual(limpaDocumento(undefined), { digitos: null });
});

test('ehCpfValido: DVs corretos passam; DV errado, todos iguais e tamanho errado falham', () => {
  assert.equal(ehCpfValido('52998224725'), true);
  assert.equal(ehCpfValido('52998224726'), false); // DV errado
  assert.equal(ehCpfValido('11111111111'), false); // passa no módulo 11, mas é inválido por regra
  assert.equal(ehCpfValido('00000000000'), false);
  assert.equal(ehCpfValido('5299822472'), false);  // 10 dígitos
  assert.equal(ehCpfValido('529982247250'), false); // 12 dígitos
  assert.equal(ehCpfValido('529.982.247-25'), false); // com máscara: limpe antes
  assert.equal(ehCpfValido(undefined), false);
});

test('ehCnpjValido: DVs corretos passam; DV errado, todos iguais e tamanho errado falham', () => {
  assert.equal(ehCnpjValido('11222333000181'), true);
  assert.equal(ehCnpjValido('11222333000182'), false); // DV errado
  assert.equal(ehCnpjValido('11111111111111'), false);
  assert.equal(ehCnpjValido('52998224725'), false); // é um CPF
  assert.equal(ehCnpjValido('11.222.333/0001-81'), false); // com máscara: limpe antes
});

test('validaCliente: PF com CPF válido (com ou sem máscara) devolve o documento só com dígitos', () => {
  assert.deepEqual(validaCliente({ tipoPessoa: 'PF', documento: '529.982.247-25' }), {
    erros: [], cliente: { tipoPessoa: 'PF', documento: '52998224725' },
  });
  assert.deepEqual(validaCliente({ tipoPessoa: 'PF', documento: '52998224725' }).cliente,
    { tipoPessoa: 'PF', documento: '52998224725' });
});

test('validaCliente: PJ com CNPJ válido devolve o documento só com dígitos', () => {
  assert.deepEqual(validaCliente({ tipoPessoa: 'PJ', documento: '11.222.333/0001-81' }), {
    erros: [], cliente: { tipoPessoa: 'PJ', documento: '11222333000181' },
  });
});

test('validaCliente: cliente ausente ou de tipo errado → UMA mensagem (a do objeto)', () => {
  for (const cliente of [undefined, null, 'PF', 42, ['PF', '52998224725']]) {
    const r = validaCliente(cliente);
    assert.equal(r.erros.length, 1, `cliente ${JSON.stringify(cliente)}`);
    assert.match(r.erros[0], /cliente é obrigatório/);
    assert.equal('cliente' in r, false);
  }
});

test('validaCliente: {} → DUAS mensagens (tipo e documento), para corrigir tudo de uma vez', () => {
  const r = validaCliente({});
  assert.equal(r.erros.length, 2);
  assert.match(r.erros[0], /cliente\.tipoPessoa deve ser PF ou PJ/);
  assert.match(r.erros[1], /cliente\.documento deve ser um CPF ou CNPJ válido/);
});

test('validaCliente: tipo inválido (pf minúsculo, PESSOA, vazio, constructor) é recusado mesmo com documento válido', () => {
  for (const tipoPessoa of ['pf', 'PESSOA', '', 'constructor', 'toString', 1]) {
    const r = validaCliente({ tipoPessoa, documento: '529.982.247-25' });
    assert.equal(r.erros.length, 1, `tipoPessoa ${tipoPessoa}`);
    assert.match(r.erros[0], /tipoPessoa/);
  }
});

test('validaCliente: documento incompatível com o tipo ou com DV errado → mensagem citando CPF/CNPJ e o tamanho', () => {
  const casos = [
    [{ tipoPessoa: 'PF', documento: '529.982.247-26' }, /CPF válido \(11 dígitos\)/],  // DV errado
    [{ tipoPessoa: 'PF', documento: '111.111.111-11' }, /CPF válido/],                 // todos iguais
    [{ tipoPessoa: 'PF', documento: '5299822472' }, /CPF válido/],                     // 10 dígitos
    [{ tipoPessoa: 'PF', documento: '11222333000181' }, /CPF válido/],                 // CNPJ em PF
    [{ tipoPessoa: 'PJ', documento: '52998224725' }, /CNPJ válido \(14 dígitos\)/],    // CPF em PJ
    [{ tipoPessoa: 'PJ', documento: '11.222.333/0001-82' }, /CNPJ válido/],            // DV errado
    [{ tipoPessoa: 'PJ', documento: '12.ABC.345/01DE-35' }, /CNPJ válido/],            // alfanumérico
    [{ tipoPessoa: 'PF' }, /CPF válido/],                                              // sem documento
    [{ tipoPessoa: 'PF', documento: 52998224725 }, /CPF válido/],                      // número, não texto
  ];
  for (const [cliente, esperado] of casos) {
    const r = validaCliente(cliente);
    assert.equal(r.erros.length, 1, JSON.stringify(cliente));
    assert.match(r.erros[0], esperado, JSON.stringify(cliente));
  }
});
