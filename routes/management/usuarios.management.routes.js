const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { verificarToken } = require('../../middleware/auth');

// Middleware para verificar rol de administrador
const verificarAdmin = async (req, res, next) => {
    try {
        const [usuario] = await pool.query(
            'SELECT rol FROM usuarios WHERE id_usuario = ?',
            [req.usuario.id]
        );

        if (!usuario.length || usuario[0].rol !== 'administrador') {
            return res.status(403).json({
                status: 'error',
                mensaje: 'Acceso restringido a administradores'
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

// Obtener lista de usuarios (solo admin)
router.get('/', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT id_usuario, nombre, correo, rol, fecha_creacion, ultimo_acceso 
             FROM usuarios 
             ORDER BY fecha_creacion DESC`
        );

        res.json({
            status: 'success',
            datos: usuarios
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener usuarios'
        });
    }
});

// Cambiar rol de usuario (solo admin)
router.put('/:id/rol', verificarToken, verificarAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { rol } = req.body;
        const userId = req.params.id;

        if (!['usuario', 'moderador', 'administrador'].includes(rol)) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Rol no válido'
            });
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE usuarios SET rol = ? WHERE id_usuario = ?',
            [rol, userId]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Rol actualizado exitosamente'
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al actualizar rol'
        });
    } finally {
        connection.release();
    }
});

module.exports = router; 