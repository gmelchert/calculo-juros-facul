// Roda o db/seed.sql no banco configurado no .env e confere o resultado.
// Uso: npm run seed   (precisa do MySQL ligado e do "npm run schema" já executado)
import { abreConexao, leArquivoSql, mostraErro } from './scriptSql.js';

async function rodaSeed() {
    // O seed.sql continua sendo a única fonte dos dados.
    const sql = await leArquivoSql('seed.sql');
    const conexao = await abreConexao();

    try {
        await conexao.query(sql);

        const [[{ modalidades }]] = await conexao.query('SELECT COUNT(*) AS modalidades FROM modalidades');
        const [[{ faixas }]] = await conexao.query('SELECT COUNT(*) AS faixas FROM faixas_juros');

        console.log('Seed executado com sucesso.');
        console.log(`  modalidades:  ${modalidades} (esperado: 6)`);
        console.log(`  faixas_juros: ${faixas} (esperado: 30)`);
    } finally {
        await conexao.end();
    }
}

try {
    await rodaSeed();
} catch (erro) {
    mostraErro('seed', erro);
}
