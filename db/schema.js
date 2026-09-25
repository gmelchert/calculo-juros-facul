// Roda o db/schema.sql: cria o banco calculo_juros e as 3 tabelas, se ainda não existirem.
// Uso: npm run schema   (precisa do MySQL ligado). Pode rodar várias vezes sem erro.
import { abreConexao, leArquivoSql, mostraErro } from './scriptSql.js';

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
    } finally {
        await conexao.end();
    }
}

try {
    await rodaSchema();
} catch (erro) {
    mostraErro('schema', erro);
}
