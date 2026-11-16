import app from './src/app.js';
import { configuracaoFinops } from './src/servicos/finops.js';

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);

    // Integração com o FinOps (T-13): avisa já na subida se as operações definidas vão ser enviadas.
    const finops = configuracaoFinops();
    console.log(finops.habilitado
        ? `FinOps: operações DEFINIDAS serão registradas em ${finops.url} (timeout ${finops.timeoutMs} ms)`
        : 'FinOps: FINOPS_URL não configurada — operações DEFINIDAS ficam PENDENTE; reenvio: POST /api/operacoes/:id/finops');
});
