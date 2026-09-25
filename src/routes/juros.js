import { Router } from 'express';
import { calculaParcela } from '../lib/calculaParcela.js';
import { listarFaixas } from '../repositorios/faixasJuros.js';
import { faixas_score } from '../dados/score.js';

const router = Router();

router.post('/simples', (req, res) => {
	const { capital, taxa, periodos } = req.body ?? {};

	if (![capital, taxa, periodos].every((v) => typeof v === 'number' && Number.isFinite(v))) {
		return res
			.status(400)
			.json({ erro: 'Campos "capital", "taxa" e "periodos" devem ser números' });
	}

	const i = taxa / 100;
	const montante = capital * (1 + i * periodos);

	res.json({
		tipo: 'simples',
		capital,
		taxa,
		periodos,
		juros: Number((montante - capital).toFixed(2)),
		montante: Number(montante.toFixed(2)),
		parcelas: calculaParcela(montante, periodos),
	});
});

router.post('/composto', (req, res) => {
	const { capital, taxa, periodos } = req.body ?? {};

	if (![capital, taxa, periodos].every((v) => typeof v === 'number' && Number.isFinite(v))) {
		return res
			.status(400)
			.json({ erro: 'Campos "capital", "taxa" e "periodos" devem ser números' });
	}

	const i = taxa / 100;
	const montante = capital * (1 + i) ** periodos;

	res.json({
		tipo: 'composto',
		capital,
		taxa,
		periodos,
		juros: Number((montante - capital).toFixed(2)),
		montante: Number(montante.toFixed(2)),
		parcelas: calculaParcela(montante, periodos),
	});
});

router.get('/faixas', async (req, res) => {
	const { modalidadeCodigo, score } = req.query;

	const faixa = faixas_score(score);

	const faixasJuros = await listarFaixas(modalidadeCodigo, faixa);
	res.json(faixasJuros);
});

export default router;
