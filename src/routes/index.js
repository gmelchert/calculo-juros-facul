import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import healthRoutes from './health.js';
import jurosRoutes from './juros.js';
import modalidadesRoutes from './modalidades.js';
import operacoesRoutes from './operacoes.js';
import { openapi } from '../openapi.js';

const router = Router();

// Registro central das rotas: para adicionar uma nova,
// crie o arquivo em ./routes e faça o router.use aqui — e descreva o endpoint em src/openapi.js.
router.use('/health', healthRoutes);
router.use('/juros', jurosRoutes);
router.use('/modalidades', modalidadesRoutes);
router.use('/operacoes', operacoesRoutes);

// Documentação: Swagger UI em /api/docs e a especificação OpenAPI crua em /api/docs.json
// (útil para importar no Postman/Insomnia ou gerar um cliente).
router.get('/docs.json', (req, res) => res.json(openapi));
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'API de Simulação de Crédito — documentação',
}));

export default router;
