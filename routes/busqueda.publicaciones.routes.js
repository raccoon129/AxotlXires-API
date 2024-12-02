const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Búsqueda dinámica de publicaciones con múltiples coincidencias
router.get('/buscar', async (req, res) => {
    try {
        const { q } = req.query;
        const limit = req.query.limit || 20;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Debe proporcionar un término de búsqueda'
            });
        }

        const searchTerm = `%${q}%`;

        const [publicaciones] = await pool.query(
            `SELECT DISTINCT
                p.id_publicacion,
                p.titulo,
                p.resumen,
                p.imagen_portada,
                p.fecha_publicacion,
                u.nombre as autor,
                COALESCE(u.foto_perfil, 'thumb_who.jpg') as autor_foto,
                tp.nombre as categoria,
                CASE 
                    WHEN p.titulo LIKE ? THEN 'título'
                    WHEN p.resumen LIKE ? THEN 'resumen'
                    ELSE 'ambos'
                END as coincidencia_en
            FROM publicaciones p
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            JOIN tipos_publicacion tp ON p.id_tipo = tp.id_tipo
            WHERE (p.titulo LIKE ? OR p.resumen LIKE ?)
            AND p.estado = 'publicado'
            AND p.eliminado = 0
            AND p.es_privada = 0
            ORDER BY 
                CASE 
                    WHEN p.titulo LIKE ? THEN 1
                    WHEN p.resumen LIKE ? THEN 2
                    ELSE 3
                END,
                p.fecha_publicacion DESC
            LIMIT ?`,
            [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit]
        );

        res.json({
            status: 'success',
            mensaje: publicaciones.length > 0 ? 
                `Se encontraron ${publicaciones.length} resultados` : 
                'No se encontraron resultados',
            datos: publicaciones,
            termino_busqueda: q
        });

    } catch (error) {
        console.error('Error en búsqueda de publicaciones:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al realizar la búsqueda',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;