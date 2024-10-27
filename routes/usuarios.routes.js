const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

/**
 * Obtener perfil de usuario por ID
 * GET /api/usuarios/:id
 */
router.get('/:id', async (req, res) => {
    try {
        // Obtener ID del usuario de los parámetros
        const userId = req.params.id;

        // Consulta para obtener información del usuario
        const [usuarios] = await pool.query(
            `SELECT 
                id_usuario,
                nombre,
                nombramiento,
                fecha_creacion,
                ultimo_acceso,
                foto_perfil,
                rol
            FROM usuarios 
            WHERE id_usuario = ?`,
            [userId]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'Usuario no encontrado'
            });
        }

        // Consulta para obtener el conteo de publicaciones
        const [publicaciones] = await pool.query(
            `SELECT COUNT(*) as total_publicaciones
            FROM publicaciones
            WHERE id_usuario = ? 
            AND eliminado = 0 
            AND estado = 'publicado'`,
            [userId]
        );

        // Preparar respuesta
        const perfilUsuario = {
            ...usuarios[0],
            total_publicaciones: publicaciones[0].total_publicaciones
        };

        // Eliminar campos sensibles
        delete perfilUsuario.contrasena_hash;

        res.json({
            status: 'success',
            mensaje: 'Perfil recuperado exitosamente',
            datos: perfilUsuario
        });

    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener el perfil del usuario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
