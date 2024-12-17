const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { verificarToken } = require('../../middleware/auth');

// Middleware para verificar roles administrativos
const verificarRolAdmin = (roles = []) => {
    return async (req, res, next) => {
        try {
            if (!req.usuario) {
                return res.status(401).json({
                    status: 'error',
                    mensaje: 'No autorizado'
                });
            }

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

// Ruta de login para el panel administrativo
router.post('/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        // Validar campos
        if (!correo || !contrasena) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Correo y contraseña son requeridos'
            });
        }

        // Buscar usuario
        const [usuarios] = await pool.query(
            'SELECT id_usuario, nombre, correo, contrasena_hash, rol FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({
                status: 'error',
                mensaje: 'Credenciales inválidas'
            });
        }

        const usuario = usuarios[0];

        // Verificar que el usuario tenga rol administrativo
        if (!['moderador', 'administrador'].includes(usuario.rol)) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permisos para acceder al panel administrativo'
            });
        }

        // Verificar contraseña
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);
        if (!contrasenaValida) {
            return res.status(401).json({
                status: 'error',
                mensaje: 'Credenciales inválidas'
            });
        }

        // Generar token
        const token = jwt.sign(
            { 
                id: usuario.id_usuario,
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Actualizar último acceso
        await pool.query(
            'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [usuario.id_usuario]
        );

        res.json({
            status: 'success',
            mensaje: 'Inicio de sesión exitoso',
            datos: {
                usuario: {
                    id: usuario.id_usuario,
                    nombre: usuario.nombre,
                    correo: usuario.correo,
                    rol: usuario.rol
                },
                token
            }
        });

    } catch (error) {
        console.error('Error en login administrativo:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error en el servidor'
        });
    }
});

// Ruta para verificar acceso al dashboard (requiere token)
router.get('/verify-access', verificarToken, verificarRolAdmin(['moderador', 'administrador']), async (req, res) => {
    try {
        const [usuario] = await pool.query(
            'SELECT id_usuario, nombre, rol FROM usuarios WHERE id_usuario = ?',
            [req.usuario.id]
        );

        res.json({
            status: 'success',
            mensaje: 'Acceso verificado',
            datos: {
                usuario: usuario[0],
                dashboardType: usuario[0].rol
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al verificar acceso'
        });
    }
});

module.exports = router; 