// routes/ping.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

/**
 * Ruta de ping para verificar el estado del servidor y la base de datos
 * GET /api/ping
 */
router.get('/', async (req, res) => {
    try {
        // Verificar conexión a la base de datos
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        res.json({
            status: 'success',
            message: 'Servidor funcionando correctamente',
            timestamp: new Date(),
            database: 'conectada'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Error en el servidor',
            timestamp: new Date(),
            database: 'error de conexión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
