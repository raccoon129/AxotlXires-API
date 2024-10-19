// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const upload = require('../middleware/multer');

/**
 * Validación de formato de correo electrónico
 * @param {string} correo - Correo electrónico a validar
 * @returns {boolean} - true si el formato es válido
 */
const validarCorreo = (correo) => {
    const regexCorreo = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regexCorreo.test(correo);
};

/**
 * Validación de contraseña
 * Debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número
 * @param {string} contrasena - Contraseña a validar
 * @returns {boolean} - true si cumple con los requisitos
 */
const validarContrasena = (contrasena) => {
    const regexContrasena = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    return regexContrasena.test(contrasena);
};

/**
 * Ruta para registrar un nuevo usuario
 */
router.post('/registro', upload.single('foto_perfil'), async (req, res) => {
    try {
        console.log('Datos recibidos:', req.body); // Para debugging

        const { correo, contrasena, nombre } = req.body;

        // Validar que se proporcionaron todos los campos requeridos
        if (!correo || !contrasena || !nombre) {
            return res.status(400).json({ 
                mensaje: 'Todos los campos son obligatorios',
                campos_faltantes: {
                    correo: !correo,
                    contrasena: !contrasena,
                    nombre: !nombre
                }
            });
        }

        // Validar formato de correo
        if (!validarCorreo(correo)) {
            return res.status(400).json({ 
                mensaje: 'El formato del correo electrónico no es válido' 
            });
        }

        // Validar requisitos de contraseña
        if (!validarContrasena(contrasena)) {
            return res.status(400).json({ 
                mensaje: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número' 
            });
        }

        // Verificar si el correo ya está registrado
        const [usuariosExistentes] = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuariosExistentes.length > 0) {
            return res.status(409).json({ 
                mensaje: 'El correo electrónico ya está registrado' 
            });
        }

        // Procesar la foto de perfil si se proporcionó
        const foto_perfil = req.file ? req.file.path : null;

        // Encriptar la contraseña
        const saltRounds = 10;
        const contrasenaHash = await bcrypt.hash(contrasena, saltRounds);

        // Insertar el nuevo usuario en la base de datos
        const [resultado] = await pool.query(
            'INSERT INTO usuarios (correo, contrasena_hash, nombre, rol, foto_perfil, fecha_creacion) VALUES (?, ?, ?, ?, ?, NOW())',
            [correo, contrasenaHash, nombre, 'registrado', foto_perfil]
        );

        // Generar token JWT para el nuevo usuario
        const token = jwt.sign(
            { 
                id: resultado.insertId,
                rol: 'registrado'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Actualizar último acceso
        await pool.query(
            'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [resultado.insertId]
        );

        // Enviar respuesta exitosa
        res.status(201).json({
            mensaje: 'Usuario registrado exitosamente',
            token,
            usuario: {
                id: resultado.insertId,
                correo,
                nombre,
                rol: 'registrado',
                foto_perfil
            }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ 
            mensaje: 'Error al registrar usuario',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



/**
 * Ruta para iniciar sesión
 * Espera recibir:
 * - correo: string
 * - contrasena: string
 */
router.post('/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        // Validar campos requeridos
        if (!correo || !contrasena) {
            return res.status(400).json({ 
                mensaje: 'Correo y contraseña son requeridos' 
            });
        }

        // Buscar usuario por correo
        const [usuarios] = await pool.query(
            'SELECT * FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ 
                mensaje: 'Credenciales inválidas' 
            });
        }

        const usuario = usuarios[0];

        // Verificar contraseña
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!contrasenaValida) {
            return res.status(401).json({ 
                mensaje: 'Credenciales inválidas' 
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: usuario.id_usuario, 
                rol: usuario.rol 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Actualizar último acceso
        await pool.query(
            'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [usuario.id_usuario]
        );

        // Enviar respuesta exitosa
        res.json({
            token,
            usuario: {
                id: usuario.id_usuario,
                correo: usuario.correo,
                nombre: usuario.nombre,
                rol: usuario.rol,
                foto_perfil: usuario.foto_perfil
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            mensaje: 'Error al iniciar sesión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;