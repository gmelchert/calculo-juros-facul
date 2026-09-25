// Roda o db/seed.sql no banco configurado no .env e confere o resultado.
// Uso: npm run seed   (precisa do MySQL ligado e do db/schema.sql já executado)
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

// O seed.sql fica na mesma pasta deste arquivo; ele continua sendo a única fonte dos dados.
const caminhoSeed = new URL('./seed.sql', import.meta.url);

async function rodaSeed() {
    const sql = await readFile(caminhoSeed, 'utf8');

    // Conexão própria (e não o pool de src/db.js) porque o seed.sql tem vários comandos
    // separados por ";" e isso só é aceito com multipleStatements ligado.
    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });

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
    console.error('Falha ao rodar o seed:', erro.message || erro.code);

    if (erro.code === 'ECONNREFUSED') {
        console.error('Dica: o MySQL não está rodando ou DB_HOST/DB_PORT no .env estão errados.');
    } else if (erro.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('Dica: confira DB_USER e DB_PASSWORD no .env.');
    } else if (erro.code === 'ER_BAD_DB_ERROR' || erro.code === 'ER_NO_SUCH_TABLE') {
        console.error('Dica: rode o db/schema.sql antes do seed.');
    }

    process.exitCode = 1;
}
