const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const { pool } = require('../config/database');

/**
 * Obtener el número de favoritos de una publicación
 * GET /api/favoritos/publicacion/:id_publicacion
 */
router.get('/publicacion/:id_publicacion', async (req, res) => {
    try {
        const { id_publicacion } = req.params;
        const [resultado] = await pool.query(
            'SELECT COUNT(*) AS total_favoritos FROM favoritos WHERE id_publicacion = ?',
            [id_publicacion]
        );

        res.json({ total_favoritos: resultado[0].total_favoritos });
    } catch (error) {
        console.error('Error al obtener el número de favoritos:', error);
        res.status(500).json({ mensaje: 'Error al obtener el número de favoritos' });
    }
});

/**
 * Verificar si un usuario ha marcado una publicación como favorita
 * GET /api/favoritos/publicacion/:id_publicacion/usuario
 */
router.get('/publicacion/:id_publicacion/usuario', verificarToken, async (req, res) => {
    try {
        const { id: id_usuario } = req.usuario; // Obtener ID del usuario autenticado
        const { id_publicacion } = req.params;

        const [resultado] = await pool.query(
            'SELECT COUNT(*) AS es_favorito FROM favoritos WHERE id_publicacion = ? AND id_usuario = ?',
            [id_publicacion, id_usuario]
        );

        res.json({ es_favorito: resultado[0].es_favorito > 0 });
    } catch (error) {
        console.error('Error al verificar si el usuario ha marcado como favorito:', error);
        res.status(500).json({ mensaje: 'Error al verificar el estado de favorito' });
    }
});

/**
 * Marcar o desmarcar una publicación como favorita
 * POST /api/favoritos
 */
router.post('/', verificarToken, async (req, res) => {
    try {
        const { id: id_usuario } = req.usuario; // Obtener ID del usuario autenticado
        const { id_publicacion } = req.body;

        if (!id_publicacion) {
            return res.status(400).json({ mensaje: 'El ID de la publicación es obligatorio' });
        }

        // Verificar si el favorito ya existe
        const [favoritoExistente] = await pool.query(
            'SELECT id_favorito FROM favoritos WHERE id_publicacion = ? AND id_usuario = ?',
            [id_publicacion, id_usuario]
        );

        if (favoritoExistente.length > 0) {
            // Si ya existe, eliminar el favorito
            await pool.query('DELETE FROM favoritos WHERE id_favorito = ?', [favoritoExistente[0].id_favorito]);
            return res.json({ mensaje: 'Favorito eliminado exitosamente', es_favorito: false });
        } else {
            // Si no existe, agregar el favorito
            const [resultado] = await pool.query(
                'INSERT INTO favoritos (id_usuario, id_publicacion) VALUES (?, ?)',
                [id_usuario, id_publicacion]
            );

            res.status(201).json({
                mensaje: 'Favorito agregado exitosamente',
                id_favorito: resultado.insertId,
                es_favorito: true,
                fecha_creacion: new Date()
            });
        }
    } catch (error) {
        console.error('Error al marcar o desmarcar favorito:', error);
        res.status(500).json({ mensaje: 'Error al marcar o desmarcar favorito' });
    }
});

module.exports = router;
