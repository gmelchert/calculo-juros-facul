// Funções usadas pelos scripts que rodam arquivos .sql desta pasta (schema.js e seed.js).
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

export function leArquivoSql(nomeArquivo) {
    return readFile(new URL(`./${nomeArquivo}`, import.meta.url), 'utf8');
}

// Conexão própria (e não o pool de src/db.js) porque os arquivos .sql têm vários comandos
// separados por ";" e isso só é aceito com multipleStatements ligado.
// comBanco: false serve para o schema, que roda antes de o banco existir.
export function abreConexao({ comBanco = true } = {}) {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: comBanco ? process.env.DB_NAME : undefined,
        multipleStatements: true,
    });
}

export function mostraErro(nomeScript, erro) {
    console.error(`Falha ao rodar o ${nomeScript}:`, erro.message || erro.code);

    if (erro.code === 'ECONNREFUSED') {
        console.error('Dica: o MySQL não está rodando ou DB_HOST/DB_PORT no .env estão errados.');
    } else if (erro.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('Dica: confira DB_USER e DB_PASSWORD no .env.');
    } else if (erro.code === 'ER_BAD_DB_ERROR' || erro.code === 'ER_NO_SUCH_TABLE') {
        console.error('Dica: rode "npm run schema" antes do seed.');
    }

    process.exitCode = 1;
}
