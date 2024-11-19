const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const { pool } = require('../config/database');

/**
 * Obtener todos los comentarios de una publicación
 * GET /api/comentarios/publicacion/:id_publicacion
 */
router.get('/publicacion/:id_publicacion', async (req, res) => {
    try {
        const { id_publicacion } = req.params;
        const [comentarios] = await pool.query(
            'SELECT c.id_comentario, c.contenido, c.fecha_creacion, u.nombre AS autor, c.id_usuario ' +
            'FROM comentarios c ' +
            'JOIN usuarios u ON c.id_usuario = u.id_usuario ' +
            'WHERE c.id_publicacion = ?',
            [id_publicacion]
        );

        if (comentarios.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron comentarios para esta publicación' });
        }

        res.json(comentarios);
    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        res.status(500).json({ mensaje: 'Error al obtener comentarios' });
    }
});

/**
 * Crear un nuevo comentario
 * POST /api/comentarios
 */
router.post('/', verificarToken, async (req, res) => {
    try {
        const { id: id_usuario } = req.usuario; // Obtener ID del usuario autenticado
        const { id_publicacion, contenido } = req.body;

        if (!id_publicacion || !contenido) {
            return res.status(400).json({ mensaje: 'El ID de la publicación y el contenido son obligatorios' });
        }

        const [resultado] = await pool.query(
            'INSERT INTO comentarios (id_usuario, id_publicacion, contenido) VALUES (?, ?, ?)',
            [id_usuario, id_publicacion, contenido]
        );

        res.status(201).json({
            mensaje: 'Comentario creado exitosamente',
            id_comentario: resultado.insertId,
            contenido,
            fecha_creacion: new Date()
        });
    } catch (error) {
        console.error('Error al crear comentario:', error);
        res.status(500).json({ mensaje: 'Error al crear comentario' });
    }
});

/**
 * Eliminar un comentario
 * DELETE /api/comentarios/:id_comentario
 */
router.delete('/:id_comentario', verificarToken, async (req, res) => {
    try {
        const { id: id_usuario } = req.usuario; // Obtener ID del usuario autenticado
        const { id_comentario } = req.params;

        // Verificar si el comentario existe y pertenece al usuario
        const [comentario] = await pool.query(
            'SELECT id_usuario FROM comentarios WHERE id_comentario = ?',
            [id_comentario]
        );

        if (comentario.length === 0) {
            return res.status(404).json({ mensaje: 'Comentario no encontrado' });
        }

        if (comentario[0].id_usuario !== id_usuario) {
            return res.status(403).json({ mensaje: 'No tienes permiso para eliminar este comentario' });
        }

        await pool.query('DELETE FROM comentarios WHERE id_comentario = ?', [id_comentario]);

        res.json({ mensaje: 'Comentario eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar comentario:', error);
        res.status(500).json({ mensaje: 'Error al eliminar comentario' });
    }
});

module.exports = router;
