import express from 'express';

import rotas from './routes/index.js';
import { ErroDeNegocio } from './lib/erros.js';

const app = express();

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
