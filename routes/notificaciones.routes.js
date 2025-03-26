const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verificarToken } = require('../middleware/auth');
const NotificacionesService = require('../utils/notificaciones.util');

/**
 * Obtener todas las notificaciones de un usuario
 * GET /api/notificaciones/:idUsuario
 */
router.get('/:idUsuario', verificarToken, async (req, res) => {
    try {
        const { idUsuario } = req.params;
        const { page = 1, limit = 20, leidas = 'all' } = req.query;
        
        // Verificar que el usuario autenticado es el mismo que solicita las notificaciones
        if (parseInt(idUsuario) !== req.usuario.id) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para ver estas notificaciones'
            });
        }

        const offset = (page - 1) * limit;
        
        // Construir la consulta base
        let query = `
            SELECT n.*, 
                   u.nombre as nombre_origen, 
                   u.foto_perfil as foto_origen
            FROM notificaciones n
            LEFT JOIN usuarios u ON n.id_origen = u.id_usuario
            WHERE n.id_usuario = ?
        `;
        
        // Filtrar por leídas/no leídas si se especifica
        if (leidas !== 'all') {
            const leidasValue = leidas === 'true' ? 1 : 0;
            query += ` AND n.leida = ${leidasValue}`;
        }
        
        // Ordenar y paginar
        query += ` ORDER BY n.fecha_creacion DESC LIMIT ? OFFSET ?`;
        
        const [notificaciones] = await pool.query(query, [idUsuario, parseInt(limit), parseInt(offset)]);
        
        // Obtener el total de notificaciones (para paginación)
        let countQuery = `SELECT COUNT(*) as total FROM notificaciones WHERE id_usuario = ?`;
        if (leidas !== 'all') {
            const leidasValue = leidas === 'true' ? 1 : 0;
            countQuery += ` AND leida = ${leidasValue}`;
        }
        
        const [countResult] = await pool.query(countQuery, [idUsuario]);
        const totalNotificaciones = countResult[0].total;
        
        // Obtener el total de notificaciones no leídas (para badge en UI)
        const [noLeidasResult] = await pool.query(
            'SELECT COUNT(*) as no_leidas FROM notificaciones WHERE id_usuario = ? AND leida = 0',
            [idUsuario]
        );
        
        return res.json({
            status: 'success',
            mensaje: notificaciones.length > 0 
                ? 'Notificaciones obtenidas exitosamente'
                : 'No hay notificaciones disponibles',
            datos: {
                notificaciones,
                paginacion: {
                    total: totalNotificaciones,
                    pagina_actual: parseInt(page),
                    total_paginas: Math.ceil(totalNotificaciones / limit),
                    limite: parseInt(limit)
                },
                no_leidas: noLeidasResult[0].no_leidas
            }
        });
    } catch (error) {
        console.error('Error al obtener notificaciones:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener las notificaciones',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Marcar una notificación como leída
 * PUT /api/notificaciones/:idUsuario/:idNotificacion
 */
router.put('/:idUsuario/:idNotificacion', verificarToken, async (req, res) => {
    try {
        const { idUsuario, idNotificacion } = req.params;
        
        // Verificar que el usuario autenticado es el mismo que solicita marcar como leída
        if (parseInt(idUsuario) !== req.usuario.id) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para modificar estas notificaciones'
            });
        }
        
        const resultado = await NotificacionesService.marcarComoLeida(idNotificacion, idUsuario);
        
        if (!resultado.success) {
            return res.status(404).json({
                status: 'error',
                mensaje: resultado.error
            });
        }
        
        return res.json({
            status: 'success',
            mensaje: 'Notificación marcada como leída exitosamente'
        });
    } catch (error) {
        console.error('Error al marcar notificación como leída:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al marcar la notificación como leída',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Marcar todas las notificaciones como leídas
 * PUT /api/notificaciones/:idUsuario/todas/leidas
 */
router.put('/:idUsuario/todas/leidas', verificarToken, async (req, res) => {
    try {
        const { idUsuario } = req.params;
        
        // Verificar que el usuario autenticado es el mismo que solicita marcar como leídas
        if (parseInt(idUsuario) !== req.usuario.id) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para modificar estas notificaciones'
            });
        }
        
        const resultado = await NotificacionesService.marcarTodasComoLeidas(idUsuario);
        
        if (!resultado.success) {
            return res.status(500).json({
                status: 'error',
                mensaje: resultado.error
            });
        }
        
        return res.json({
            status: 'success',
            mensaje: `${resultado.cantidad} notificaciones marcadas como leídas`
        });
    } catch (error) {
        console.error('Error al marcar todas las notificaciones como leídas:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al marcar las notificaciones como leídas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Eliminar una notificación
 * DELETE /api/notificaciones/:idUsuario/:idNotificacion
 */
router.delete('/:idUsuario/:idNotificacion', verificarToken, async (req, res) => {
    try {
        const { idUsuario, idNotificacion } = req.params;
        
        // Verificar que el usuario autenticado es el mismo que solicita eliminar
        if (parseInt(idUsuario) !== req.usuario.id) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para eliminar estas notificaciones'
            });
        }
        
        const [resultado] = await pool.query(
            'DELETE FROM notificaciones WHERE id_notificacion = ? AND id_usuario = ?',
            [idNotificacion, idUsuario]
        );
        
        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'Notificación no encontrada o sin permisos para eliminarla'
            });
        }
        
        return res.json({
            status: 'success',
            mensaje: 'Notificación eliminada exitosamente'
        });
    } catch (error) {
        console.error('Error al eliminar notificación:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al eliminar la notificación',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
/**
 * Obtener cantidad de notificaciones no leídas de un usuario
 * GET /api/notificaciones/:idUsuario/no-leidas
 * Esta ruta es optimizada para consultas rápidas desde el frontend para actualizar badges
 */
router.get('/:idUsuario/no-leidas', verificarToken, async (req, res) => {
    try {
        const { idUsuario } = req.params;
        
        // Verificar que el usuario autenticado es el mismo que solicita las notificaciones
        if (parseInt(idUsuario) !== req.usuario.id) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para ver estas notificaciones'
            });
        }
        
        // Obtener el total de notificaciones no leídas
        const [resultado] = await pool.query(
            'SELECT COUNT(*) as no_leidas FROM notificaciones WHERE id_usuario = ? AND leida = 0',
            [idUsuario]
        );
        
        return res.json({
            status: 'success',
            //mensaje: 'Conteo de notificaciones no leídas obtenido exitosamente',
            datos: {
                no_leidas: resultado[0].no_leidas
            }
        });
    } catch (error) {
        console.error('Error al obtener conteo de notificaciones no leídas:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener el conteo de notificaciones no leídas',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
module.exports = router;