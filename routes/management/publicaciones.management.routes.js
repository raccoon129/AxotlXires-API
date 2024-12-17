const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { verificarToken } = require('../../middleware/auth');

// Middleware para verificar roles administrativos
const verificarRolAdmin = (roles = []) => {
    return async (req, res, next) => {
        try {
            const [usuario] = await pool.query(
                'SELECT rol FROM usuarios WHERE id_usuario = ?',
                [req.usuario.id]
            );

            if (!usuario.length || !roles.includes(usuario[0].rol)) {
                return res.status(403).json({
                    status: 'error',
                    mensaje: 'No tienes los permisos necesarios'
                });
            }

            next();
        } catch (error) {
            res.status(500).json({
                status: 'error',
                mensaje: 'Error al verificar permisos'
            });
        }
    };
};

// Obtener publicaciones pendientes de revisión
router.get('/pendientes', verificarToken, verificarRolAdmin(['moderador', 'administrador']), async (req, res) => {
    try {
        const [publicaciones] = await pool.query(
            `SELECT p.*, u.nombre as autor 
             FROM publicaciones p 
             JOIN usuarios u ON p.id_usuario = u.id_usuario 
             WHERE p.estado = 'en_revision' 
             ORDER BY p.fecha_creacion DESC`
        );

        res.json({
            status: 'success',
            datos: publicaciones
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener publicaciones pendientes'
        });
    }
});

// Aprobar/Rechazar publicación
router.put('/:id/revision', verificarToken, verificarRolAdmin(['moderador', 'administrador']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { estado, comentario_revision } = req.body;
        const publicacionId = req.params.id;

        if (!['publicado', 'rechazado'].includes(estado)) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Estado no válido'
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `UPDATE publicaciones 
             SET estado = ?, 
                 comentario_revision = ?,
                 fecha_publicacion = ?,
                 revisor_id = ?
             WHERE id_publicacion = ?`,
            [estado, comentario_revision, estado === 'publicado' ? new Date() : null, req.usuario.id, publicacionId]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: `Publicación ${estado === 'publicado' ? 'aprobada' : 'rechazada'} exitosamente`
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al procesar la revisión'
        });
    } finally {
        connection.release();
    }
});

module.exports = router; 