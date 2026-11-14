import express from 'express';

import rotas from './routes/index.js';
import { ErroDeNegocio } from './lib/erros.js';

const app = express();

// CORS: libera a API para qualquer origem (*). Vem antes de tudo para que até as
// respostas de erro (ex.: JSON inválido) saiam com os cabeçalhos e o navegador não as bloqueie.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  // Aceita os cabeçalhos que o navegador disser que vai mandar (Content-Type, Authorization...).
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ?? 'Content-Type, Authorization',
  );
  // Preflight: o navegador pergunta antes com OPTIONS; respondemos 204 sem passar pelas rotas.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Middlewares globais
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Todas as rotas da aplicação ficam sob /api
app.use('/api', rotas);

// Tratador de erros: precisa ter EXATAMENTE 4 parâmetros para o Express reconhecer.
// No Express 5, erros lançados dentro das rotas (inclusive async) caem aqui sozinhos.
app.use((err, req, res, next) => {
  if (err instanceof ErroDeNegocio) {
    return res.status(err.status).json({
      erro: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes },
    });
  }
  // Corpo que não é JSON válido (ex.: vírgula sobrando): o express.json() lança este erro
  // antes de a rota rodar. É culpa do cliente, então responde 400 no formato padrão.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Corpo da requisição não é um JSON válido' },
    });
  }
  console.error(err); // erro inesperado: registra no terminal para investigar
  res.status(500).json({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor' } });
});

export default app;
