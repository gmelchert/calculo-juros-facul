import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');

        res.json({
            status: 'ok',
            mensagem: 'API está ok',
            banco: 'ok'
        });
    } catch (err) {
        console.error(err);

        res.status(503).json({
            status: 'erro',
            mensagem: 'API está ok, mas o banco não respondeu',
            banco: 'erro'
        });
    }
});

export default router;