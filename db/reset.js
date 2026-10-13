// Recria o banco calculo_juros DO ZERO: reset.sql (DROP DATABASE) → schema.sql → seed.sql.
// Uso: npm run reset   (precisa do MySQL ligado e do .env)
//
// CUIDADO: apaga todas as operações gravadas. É o caminho oficial para atualizar um banco antigo
// para a versão atual do schema (decisão fechada: sem ferramenta de migrations — ver
// docs/design-definicao-cliente-contrato.md, D6).
import { abreConexao, leArquivoSql, mostraErro } from './scriptSql.js';

async function recriaBanco() {
    // Sem banco na conexão: o reset.sql apaga o banco e o schema.sql cria de novo (CREATE + USE).
    const conexao = await abreConexao({ comBanco: false });

    try {
        await conexao.query(await leArquivoSql('reset.sql'));
        console.log('1/3 banco apagado (db/reset.sql)');

        await conexao.query(await leArquivoSql('schema.sql'));
        console.log('2/3 schema criado (db/schema.sql)');

        // O USE do schema.sql continua valendo nesta conexão; o seed.sql também tem o seu USE.
        await conexao.query(await leArquivoSql('seed.sql'));
        const [[{ modalidades }]] = await conexao.query('SELECT COUNT(*) AS modalidades FROM modalidades');
        const [[{ faixas }]] = await conexao.query('SELECT COUNT(*) AS faixas FROM faixas_juros');
        const [[{ operacoes }]] = await conexao.query('SELECT COUNT(*) AS operacoes FROM operacoes');
        console.log('3/3 seed carregado (db/seed.sql)');
        console.log(`  modalidades: ${modalidades} (esperado: 6) | faixas_juros: ${faixas} (esperado: 30) | operacoes: ${operacoes} (esperado: 0)`);
        console.log('Banco recriado com sucesso.');
    } finally {
        await conexao.end();
    }
}

try {
    await recriaBanco();
} catch (erro) {
    mostraErro('reset', erro);
}
