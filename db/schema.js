// Roda o db/schema.sql: cria o banco calculo_juros e as 3 tabelas, se ainda não existirem.
// Uso: npm run schema   (precisa do MySQL ligado). Pode rodar várias vezes sem erro.
//
// Depois de rodar, confere se a tabela `operacoes` está na versão atual. O CREATE TABLE IF NOT
// EXISTS não altera uma tabela que já existe, então um banco criado antes de 08/10/2026 continua
// sem as colunas de cliente e de definição — e a API quebraria com "Unknown column". Nesse caso
// o script avisa e pede para rodar "npm run reset" (apaga o banco e recria do zero).
import { abreConexao, leArquivoSql, mostraErro } from './scriptSql.js';

// Colunas de `operacoes` que só existem na versão 2 do schema (D-06).
const COLUNAS_V2_OPERACOES = ['tipo_pessoa', 'documento', 'estado', 'sistema_definido', 'definido_em'];

export async function colunasFaltandoEmOperacoes(conexao) {
    // DATABASE() é o banco escolhido pelo USE do schema.sql nesta mesma conexão.
    const [linhas] = await conexao.query(
        `SELECT COLUMN_NAME AS coluna
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes'`,
    );
    const existentes = new Set(linhas.map((l) => l.coluna));
    return COLUNAS_V2_OPERACOES.filter((coluna) => !existentes.has(coluna));
}

async function rodaSchema() {
    const sql = await leArquivoSql('schema.sql');
    // Sem banco na conexão: quem cria o banco é o próprio schema.sql (CREATE DATABASE + USE).
    const conexao = await abreConexao({ comBanco: false });

    try {
        await conexao.query(sql);

        // O USE do schema.sql vale para esta conexão, então o SHOW TABLES olha o banco certo.
        const [tabelas] = await conexao.query('SHOW TABLES');
        const nomes = tabelas.map((linha) => Object.values(linha)[0]);

        console.log('Schema executado com sucesso.');
        console.log(`  tabelas: ${nomes.join(', ')} (esperado: faixas_juros, modalidades, operacoes)`);

        const faltando = await colunasFaltandoEmOperacoes(conexao);
        if (faltando.length > 0) {
            console.error(
                `\nTabela operacoes está na versão antiga (faltam: ${faltando.join(', ')}).\n` +
                'Rode "npm run reset" para recriar o banco do zero — isso apaga as operações gravadas.',
            );
            process.exitCode = 1;
        }
    } finally {
        await conexao.end();
    }
}

try {
    await rodaSchema();
} catch (erro) {
    mostraErro('schema', erro);
}
