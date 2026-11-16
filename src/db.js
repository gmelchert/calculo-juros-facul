import mysql from 'mysql2/promise';

// Fuso da sessão MySQL: vale para NOW() e CURRENT_TIMESTAMP, ou seja, para criado_em, definido_em e
// finops_tentativa_em. O padrão é GMT-03:00 FIXO (não "horário de Brasília"): é o que o FinOps assume
// ao receber `definidoEm` sem fuso (ADR-009 deles). Sem isso, um MySQL em UTC — o caso comum em
// Docker — gravaria horários que chegariam lá 3h adiantados. 'SYSTEM' usa o fuso do servidor MySQL.
const DB_TIMEZONE = (process.env.DB_TIMEZONE ?? '').trim() || '-03:00';

export const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    dateStrings: true,
});

// Roda em TODA conexão nova do pool (o evento dispara antes de a conexão ser entregue a quem pediu,
// e os comandos de uma conexão executam em ordem, então o SET sempre vem antes da primeira query).
pool.on('connection', (conexao) => {
    conexao.query('SET time_zone = ?', [DB_TIMEZONE], (erro) => {
        if (erro) {
            console.error(`Não foi possível aplicar DB_TIMEZONE=${DB_TIMEZONE} na sessão MySQL: ${erro.message}`);
        }
    });
});