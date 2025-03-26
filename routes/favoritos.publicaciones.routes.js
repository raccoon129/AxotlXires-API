const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const NotificacionesService = require('../utils/notificaciones.util');

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

            // Generar notificación solo cuando se añade como favorito
            await NotificacionesService.notificarNuevoFavorito(
                id_publicacion, 
                id_usuario
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

/**
 * Obtener top 5 publicaciones más favoritas
 * GET /api/favoritos/top
 */
router.get('/top', async (req, res) => {
    try {
        const [publicaciones] = await pool.query(
            `SELECT 
                p.id_publicacion,
                p.titulo,
                p.resumen,
                p.imagen_portada,
                p.fecha_publicacion,
                u.nombre as autor,
                COALESCE(u.foto_perfil, 'thumb_who.jpg') as autor_foto,
                tp.nombre as categoria,
                COUNT(f.id_publicacion) as total_favoritos
            FROM publicaciones p
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            JOIN tipos_publicacion tp ON p.id_tipo = tp.id_tipo
            LEFT JOIN favoritos f ON p.id_publicacion = f.id_publicacion
            WHERE p.estado = 'publicado'
            AND p.eliminado = 0
            AND p.es_privada = 0  /* Asegura que solo se muestren publicaciones públicas */
            GROUP BY 
                p.id_publicacion,
                p.titulo,
                p.resumen,
                p.imagen_portada,
                p.fecha_publicacion,
                u.nombre,
                u.foto_perfil,
                tp.nombre
            ORDER BY total_favoritos DESC, p.fecha_publicacion DESC
            LIMIT 5`
        );

        console.log('Publicaciones favoritas públicas encontradas:', publicaciones.length);

        return res.json({
            status: 'success',
            mensaje: publicaciones.length > 0 
                ? 'Top 5 publicaciones públicas más favoritas obtenidas exitosamente'
                : 'No hay publicaciones públicas favoritas disponibles',
            datos: publicaciones
        });

    } catch (error) {
        console.error('Error al obtener top publicaciones:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener las publicaciones más favoritas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
